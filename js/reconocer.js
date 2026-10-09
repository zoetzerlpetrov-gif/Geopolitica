// Reconocimiento de lugares famosos en una foto, dentro del navegador (experimental).
//
// Cómo funciona: el modelo CLIP (OpenAI, versión «clip-vit-base-patch32» convertida por Xenova para el navegador)
// convierte la foto y frases de texto en vectores; cuanto más se parecen, más probable es que la frase describa
// la foto. Se compara la foto con frases como «a photo of the Statue of Liberty, New York» (unas 400, una por
// lugar de config/monumentos.json) y con frases de «réplica de recuerdo / figura en miniatura» para avisar
// si parece un souvenir y no el lugar real.
//
// Los vectores de las frases se calculan una vez en GitHub Actions (tools/monumentos/vectores.mjs →
// config/monumentos_vec.json), así el navegador solo descarga la mitad «visual» del modelo (~90 MB la primera
// vez, desde Hugging Face; luego queda guardada). Si la lista cambió y los vectores no coinciden, se calculan aquí.
//
// Privacidad: la foto no sale del navegador. Solo se descargan el modelo y la biblioteca Transformers.js (jsDelivr).
// Límites: reconoce sobre todo monumentos muy fotografiados; puede confundir lugares parecidos, no lee letreros
// y su respuesta es una sugerencia, no una prueba. Distingue réplicas por el contexto (mesa, escala, fondo), y una
// réplica gigante en exterior (p. ej. la Estatua de la Libertad de Las Vegas o de París) puede engañarlo.

export const TRANSFORMERS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2";
export const MODELO = "Xenova/clip-vit-base-patch32";
const ESCALA = 100;  // escala de logits de CLIP

// Varias frases por lugar y se promedian sus vectores («prompt ensembling», técnica del artículo original de CLIP).
export const PLANTILLAS = [
  (m) => `a photo of the ${m[0]}`,
  (m) => `a photo of the ${m[0]}, ${m[8] || m[2]}`,
  (m) => `a tourist photo of the ${m[0]}, a famous landmark`,
];
export const FRASES_REPLICA = ["a photo of a small souvenir replica figurine on a table", "a photo of a miniature model or toy of a famous monument",
  "a photo of a keychain or fridge magnet souvenir", "a close-up photo of a small decorative object held in a hand"];
export const FRASES_REAL = ["a photo of a real famous landmark outdoors", "a tourist photo of a real monument in a city",
  "a photo of a large building or statue under the sky", "a wide photo of a city street with a monument"];

/** Softmax de similitudes coseno escaladas. */
export function probabilidades(sims) {
  const m = Math.max(...sims), e = sims.map((s) => Math.exp((s - m) * ESCALA)), t = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / t);
}

export const norma = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
const punto = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

/** Todas las frases, en orden: las de cada lugar (PLANTILLAS.length por lugar), luego réplica y real. */
export const frasesDe = (lista) => [...lista.flatMap((m) => PLANTILLAS.map((p) => p(m))), ...FRASES_REPLICA, ...FRASES_REAL];

/** Promedia los vectores de cada lugar y separa los de réplica y real. */
export function agrupar(vecs, n) {
  const k = PLANTILLAS.length, lugares = [];
  for (let i = 0; i < n; i++) {
    const grupo = vecs.slice(i * k, (i + 1) * k);
    lugares.push(norma(grupo[0].map((_, d) => grupo.reduce((s, v) => s + v[d], 0))));
  }
  const r = n * k;
  return { lugares, replica: vecs.slice(r, r + FRASES_REPLICA.length), real: vecs.slice(r + FRASES_REPLICA.length) };
}

/** Huella (FNV-1a de 32 bits) del modelo y las frases: si cambia, los vectores precalculados ya no sirven. */
export function huella(frases) {
  let h = 0x811c9dc5;
  for (const c of `${MODELO}\n${frases.join("\n")}`) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

/** Vectores → {escalas, b64} en int8 (≈ 4 veces más chico que float32; el error no cambia el orden de los resultados). */
export function empacar(vecs) {
  const dim = vecs[0].length, q = new Int8Array(vecs.length * dim), escalas = [];
  vecs.forEach((v, i) => {
    const e = Math.max(...v.map(Math.abs)) / 127 || 1;
    escalas.push(Number(e.toPrecision(6)));
    v.forEach((x, d) => { q[i * dim + d] = Math.round(x / escalas[i]); });
  });
  return { dim, escalas, b64: Buffer.from(q.buffer).toString("base64") };
}

export function desempacar({ dim, escalas, b64 }) {
  const bin = atob(b64), q = new Int8Array(bin.length);
  for (let i = 0; i < bin.length; i++) q[i] = (bin.charCodeAt(i) << 24) >> 24;
  return escalas.map((e, i) => norma(Array.from(q.subarray(i * dim, (i + 1) * dim), (x) => x * e)));
}

/**
 * Vector de la imagen + vectores agrupados → resultado.
 * monumentos = [[en, es, iso3, lat, lon, sitelinks, qid, ciudad_es, ciudad_en], …]
 * Devuelve {candidatos: [{m, p}] (los 5 más probables), replica: probabilidad de que sea réplica o souvenir, total}.
 */
export function clasificar(img, textos, monumentos, txtReplica, txtReal) {
  const vi = norma(Array.from(img));
  const p = probabilidades(textos.map((t) => punto(vi, t)));
  const candidatos = p.map((x, i) => ({ m: monumentos[i], p: x })).sort((a, b) => b.p - a.p).slice(0, 5);
  const pr = probabilidades([...txtReplica, ...txtReal].map((t) => punto(vi, t)));
  const replica = pr.slice(0, txtReplica.length).reduce((a, b) => a + b, 0);
  return { candidatos, replica, total: monumentos.length };
}

let T = null;
const biblioteca = async () => {
  if (!T) { T = await import(/* @vite-ignore */ `${TRANSFORMERS}/+esm`); T.env.allowLocalModels = false; }
  return T;
};
const progreso = (avance) => (x) => { if (x.status === "progress" && x.total) avance(`Descargando el modelo (${x.file}): ${Math.round(x.progress)} %`); };

let vision = null;
function cargarVision(avance) {
  vision ??= (async () => {
    avance("Descargando la biblioteca…");
    const L = await biblioteca();
    const [procesador, modelo] = await Promise.all([L.AutoProcessor.from_pretrained(MODELO),
      L.CLIPVisionModelWithProjection.from_pretrained(MODELO, { dtype: "q8", progress_callback: progreso(avance) })]);
    return { procesador, modelo };
  })();
  vision.catch(() => { vision = null; });
  return vision;
}

/** Vectores de texto calculados aquí (solo si los precalculados no coinciden con la lista). */
export async function vectoresTexto(frases, avance = () => {}, lote = 32) {
  const L = await biblioteca();
  const [tok, modelo] = await Promise.all([L.AutoTokenizer.from_pretrained(MODELO),
    L.CLIPTextModelWithProjection.from_pretrained(MODELO, { dtype: "q8", progress_callback: progreso(avance) })]);
  const out = [];
  for (let i = 0; i < frases.length; i += lote) {
    const { text_embeds: e } = await modelo(tok(frases.slice(i, i + lote), { padding: true, truncation: true }));
    const [n, d] = e.dims;
    for (let k = 0; k < n; k++) out.push(norma(Array.from(e.data.slice(k * d, (k + 1) * d))));
    avance(`Preparando la lista de lugares: ${Math.min(frases.length, i + lote)} de ${frases.length}`);
    await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}

let textos = null;
async function cargarTextos(lista, avance) {
  const frases = frasesDe(lista), h = huella(frases);
  if (textos?.h === h) return textos;
  let vecs = null;
  try {
    const pre = await (await fetch("config/monumentos_vec.json")).json();
    if (pre.huella === h) vecs = desempacar(pre);
  } catch (e) { /* se calculan abajo */ }
  vecs ??= await vectoresTexto(frases, avance);
  textos = { h, ...agrupar(vecs, lista.length) };
  return textos;
}

/** Foto (Blob) → {candidatos, replica, total}. `avance(texto)` informa el progreso. */
export async function reconocer(foto, lista, avance = () => {}) {
  const [{ procesador, modelo }, t] = await Promise.all([cargarVision(avance), cargarTextos(lista, avance)]);
  avance("Analizando la foto…");
  const imagen = await T.RawImage.fromBlob(foto);
  const { image_embeds: e } = await modelo(await procesador(imagen));
  return clasificar(e.data, t.lugares, lista, t.replica, t.real);
}
