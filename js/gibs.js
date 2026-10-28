// Mosaicos de NASA GIBS con respaldo. Cuando GIBS responde con error (500 o 404, frecuentes fuera de la cobertura de
// un producto o cuando el servidor está saturado) o con un mosaico vacío, MapLibre 5 dejaba la textura del mosaico sin
// inicializar y se veían rectángulos de «estática» donde no debería haber nada (por ejemplo, hielo marino en el
// ecuador). Con este protocolo el mapa recibe un mosaico casi transparente y, si hubo error, se avisa del fallo para
// que los bucles animados lo sigan contando.

// PNG de 256×256 casi transparente (alfa 1/255 en todos los píxeles, 660 bytes): no se nota sobre el mapa.
// No es 100 % transparente a propósito: con mosaicos totalmente transparentes (los que GIBS devuelve con 200 OK fuera
// de la cobertura de un producto, o el que se daba aquí ante un error) el sitio seguía mostrando rectángulos con
// restos de otras imágenes, porque la memoria de la textura no se llegaba a limpiar (medido en oct 2026 con TEMPO y
// hielo marino; en una página de prueba aislada no pasaba).
const VACIO = "iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAACW0lEQVR42u3UMQEAAAjDsA3/ojGAAxIJPdokDfDSSAAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAYABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAGAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAYABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABAAYAGABgAIABgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAEABgAYAGAAgAGAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQAGABgAYACAAQCXBT6DAgEIZpjvAAAAAElFTkSuQmCC";
const PNG_VACIO = Uint8Array.from(atob(VACIO), (c) => c.charCodeAt(0)).buffer;
export const PROTOCOLO = "gibsr";

/** «https://gibs…» → «gibsr://gibs…» (para las fuentes del mapa; las consultas propias siguen usando https). */
export const conRespaldo = (url) => url.replace(/^https:\/\//, `${PROTOCOLO}://`);
export const sinRespaldo = (url) => url.replace(new RegExp(`^${PROTOCOLO}://`), "https://");

const CANALES = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
/** ¿PNG de 8 bits sin un solo píxel visible? Se revisa sin dibujarlo: si los bytes de la imagen (fuera del byte de
 *  filtro de cada fila) son 0, cada píxel vale 0 con cualquier filtro. El 0 es transparente en el canal alfa de
 *  RGBA y gris+alfa, y en paleta y gris cuando tRNS lo marca así. Solo se descomprimen IDAT chicos (≤ 8 KB): un
 *  mosaico vacío de 256×256 pesa menos de 1 KB y uno con datos casi siempre más. */
export async function esPngVacio(buf) {
  const u8 = new Uint8Array(buf), v = new DataView(buf);
  if (u8.length < 33 || v.getUint32(0) !== 0x89504e47 || u8[24] !== 8) return false;
  const ancho = v.getUint32(16), alto = v.getUint32(20), tipo = u8[25], canales = CANALES[tipo];
  if (!canales || tipo === 2) return false;
  let trns = null, total = 0;
  const idat = [];
  for (let i = 8; i + 8 <= u8.length;) {
    const n = v.getUint32(i), t = String.fromCharCode(...u8.subarray(i + 4, i + 8));
    if (t === "tRNS") trns = u8.subarray(i + 8, i + 8 + n);
    else if (t === "IDAT") { idat.push(u8.subarray(i + 8, i + 8 + n)); total += n; }
    else if (t === "IEND") break;
    i += 12 + n;
  }
  if (!idat.length || total > 8192) return false;
  if (tipo === 3 && !(trns?.length && trns[0] === 0)) return false;
  if (tipo === 0 && !(trns?.length >= 2 && trns[0] === 0 && trns[1] === 0)) return false;
  let datos;
  try {
    datos = new Uint8Array(await new Response(new Blob(idat).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer());
  } catch { return false; }
  const fila = 1 + ancho * canales;
  if (datos.length !== fila * alto) return false;
  // Con alfa (gris+alfa, RGBA) basta el canal alfa: cada filtro predice un byte con bytes del mismo canal.
  const paso = tipo >= 4 ? canales : 1, desde = tipo >= 4 ? canales : 1;
  for (let f = 0; f < datos.length; f += fila) for (let i = f + desde; i < f + fila; i += paso) if (datos[i]) return false;
  return true;
}

/** Descarga un mosaico; si falla o no es imagen, devuelve el PNG casi transparente y llama a `alFallar(url)`. */
export async function cargarMosaico(url, senal, pedir = fetch, alFallar = () => {}) {
  try {
    const r = await pedir(sinRespaldo(url), { signal: senal });
    if (r.ok && /^image\//.test(r.headers.get("content-type") || "")) {
      const data = await r.arrayBuffer();
      return { data: (await esPngVacio(data)) ? PNG_VACIO.slice(0) : data };
    }
  } catch (e) {
    if (senal?.aborted) throw e;  // MapLibre canceló el mosaico (ya no se ve): no es una falla
  }
  alFallar(sinRespaldo(url));
  return { data: PNG_VACIO.slice(0) };
}

let registrado = false;
/** Registra el protocolo una sola vez. Cada falla se anuncia con el evento «gibs-falla» (detail = url https). */
export function registrarProtocolo(gl = globalThis.maplibregl) {
  if (registrado || !gl?.addProtocol) return;
  registrado = true;
  gl.addProtocol(PROTOCOLO, (params, ctrl) => cargarMosaico(params.url, ctrl.signal, fetch,
    (url) => globalThis.dispatchEvent?.(new CustomEvent("gibs-falla", { detail: url }))));
}

const isoMin = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

/** <Domain> de GIBS («ini/fin/PT10M,ini/fin/PT10M» o momentos sueltos) → momentos ISO publicados, ordenados. */
export function leerDominio(xml) {
  const txt = /<Domain>([^<]*)<\/Domain>/.exec(xml || "")?.[1] || "";
  const out = new Set();
  for (const parte of txt.split(",").map((x) => x.trim()).filter(Boolean)) {
    const [a, b, per] = parte.split("/");
    const m = /^PT(\d+)([MH])$/.exec(per || "");
    const paso = m ? Number(m[1]) * (m[2] === "H" ? 3600000 : 60000) : 0;
    const ini = Date.parse(a), fin = b ? Date.parse(b) : ini;
    if (Number.isNaN(ini) || Number.isNaN(fin)) continue;
    for (let t = ini; t <= fin && out.size < 2000; t += paso || Infinity) out.add(isoMin(t));
  }
  return [...out].sort();
}

/** Lista de momentos publicados de una capa entre `ini` y `fin` (ISO), de la API de dominios de GIBS. */
export const urlDominios = (capa, matriz, ini, fin) => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/${capa}/default/${matriz}/all/${ini}--${fin}.xml`;
