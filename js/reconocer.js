// Reconocimiento de lugares famosos en una foto, dentro del navegador (experimental).
//
// Cómo funciona: el modelo CLIP (OpenAI, versión «clip-vit-base-patch32» convertida por Xenova para el navegador)
// convierte la foto y frases de texto en vectores; cuanto más se parecen, más probable es que la frase describa
// la foto. Se compara la foto con «una foto de la Estatua de la Libertad en Nueva York» y ~1,000 frases más (una por
// monumento de config/monumentos.json), y con frases de «réplica de recuerdo / figura en miniatura» para avisar
// si parece un souvenir y no el lugar real.
//
// Privacidad: la foto no sale del navegador. Lo único que se descarga es el modelo (≈ 150 MB la primera vez,
// desde Hugging Face; luego queda guardado en el navegador) y la biblioteca Transformers.js (jsDelivr).
// Límites: reconoce sobre todo monumentos muy fotografiados; puede confundir lugares parecidos, no lee letreros
// y su respuesta es una sugerencia, no una prueba. Distingue réplicas por el contexto (mesa, escala, fondo), y una
// réplica gigante en exterior (p. ej. la Estatua de la Libertad de Las Vegas o de París) puede engañarlo.

export const TRANSFORMERS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2";
export const MODELO = "Xenova/clip-vit-base-patch32";
const ESCALA = 100;  // escala de logits de CLIP

export const frase = (m) => `a photo of the ${m[0]}`;
export const FRASES_REPLICA = ["a photo of a small souvenir replica figurine on a table", "a photo of a miniature model or toy of a famous monument",
  "a photo of a keychain or fridge magnet souvenir"];
export const FRASES_REAL = ["a photo of a real famous landmark outdoors", "a tourist photo of a real monument in a city"];

/** Softmax de similitudes coseno escaladas. */
export function probabilidades(sims) {
  const m = Math.max(...sims), e = sims.map((s) => Math.exp((s - m) * ESCALA)), t = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / t);
}

const norma = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
const punto = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

/**
 * Vector de la imagen y vectores de texto → resultado.
 * monumentos = [[en, es, iso3, lat, lon, sitelinks, qid, ciudad_es, ciudad_en], …]
 * Devuelve {candidatos: [{m, p}] (los 5 más probables), replica: probabilidad de que sea réplica o souvenir}.
 */
export function clasificar(img, textos, monumentos, txtReplica, txtReal) {
  const vi = norma(Array.from(img));
  const sims = textos.map((t) => punto(vi, t));
  const p = probabilidades(sims);
  const candidatos = p.map((x, i) => ({ m: monumentos[i], p: x })).sort((a, b) => b.p - a.p).slice(0, 5);
  const pr = probabilidades([...txtReplica, ...txtReal].map((t) => punto(vi, t)));
  const replica = pr.slice(0, txtReplica.length).reduce((a, b) => a + b, 0);
  return { candidatos, replica };
}

let cargado = null;
/** Descarga la biblioteca y el modelo una sola vez (el navegador los guarda). `avance(texto)` informa el progreso. */
export function cargar(avance = () => {}) {
  cargado ??= (async () => {
    avance("Descargando la biblioteca…");
    const T = await import(/* @vite-ignore */ TRANSFORMERS);
    T.env.allowLocalModels = false;
    const progreso = (x) => { if (x.status === "progress" && x.total) avance(`Descargando el modelo: ${x.file} ${Math.round(x.progress)} %`); };
    const [procesador, vision, tokenizador, texto] = await Promise.all([
      T.AutoProcessor.from_pretrained(MODELO),
      T.CLIPVisionModelWithProjection.from_pretrained(MODELO, { dtype: "q8", progress_callback: progreso }),
      T.AutoTokenizer.from_pretrained(MODELO),
      T.CLIPTextModelWithProjection.from_pretrained(MODELO, { dtype: "q8", progress_callback: progreso }),
    ]);
    return { T, procesador, vision, tokenizador, texto };
  })();
  cargado.catch(() => { cargado = null; });
  return cargado;
}

/** Vectores de texto normalizados, por lotes (para no congelar la página). */
export async function vectoresTexto(modelo, frases, avance = () => {}, lote = 64) {
  const out = [];
  for (let i = 0; i < frases.length; i += lote) {
    const ent = modelo.tokenizador(frases.slice(i, i + lote), { padding: true, truncation: true });
    const { text_embeds: e } = await modelo.texto(ent);
    const [n, d] = e.dims;
    for (let k = 0; k < n; k++) out.push(norma(Array.from(e.data.slice(k * d, (k + 1) * d))));
    avance(`Preparando la lista de lugares: ${Math.min(frases.length, i + lote)} de ${frases.length}`);
    await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}

/** Vector de la imagen (Blob o URL). */
export async function vectorImagen(modelo, imagen) {
  const raw = await modelo.T.RawImage.read(imagen);
  const ent = await modelo.procesador(raw);
  const { image_embeds: e } = await modelo.vision(ent);
  return e.data;
}
