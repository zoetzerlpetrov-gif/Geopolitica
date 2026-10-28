// Mosaicos de NASA GIBS con respaldo: cuando GIBS responde con error (500 o 404, frecuentes fuera de la cobertura de
// un producto o cuando el servidor está saturado), MapLibre 5 dejaba la textura del mosaico sin inicializar y se veían
// rectángulos de «estática» gris donde no debería haber nada. Con este protocolo el mapa recibe un mosaico
// transparente y avisa del fallo para que los bucles animados lo sigan contando.
//
// Además, fuera de la cobertura de algunos productos GIBS responde 200 OK con mosaicos de ruido (rayas y puntos de
// colores): medido en oct 2026 con TEMPO sobre Europa, África y Asia, y con hielo marino en latitudes medias del sur.
// Esos mosaicos llegan como PNG RGBA o gris+alfa de 50 a 175 KB, mientras que los buenos de esos productos son siempre
// PNG con paleta (tipo de color 3). Las fuentes que se piden con el protocolo «gibsp» descartan todo lo que no sea PNG
// con paleta y dibujan un mosaico transparente en su lugar.

// PNG transparente de 256×256 (334 bytes): del mismo tamaño que un mosaico, para que MapLibre no estire una imagen de
// 1×1 sobre una textura de 256×256 a medio inicializar (eso también se veía como estática, medido en oct 2026).
const VACIO = "iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAABFUlEQVR42u3BMQEAAADCoPVP7WsIoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAeAMBPAAB2ClDBAAAAABJRU5ErkJggg==";
const PNG_VACIO = Uint8Array.from(atob(VACIO), (c) => c.charCodeAt(0)).buffer;
export const PROTOCOLO = "gibsr";
export const PROTOCOLO_PALETA = "gibsp";

/** «https://gibs…» → «gibsr://gibs…» (para las fuentes del mapa; las consultas propias siguen usando https).
 *  Con `paleta`, «gibsp://…»: solo se aceptan PNG con paleta (productos de GIBS con paleta oficial). */
export const conRespaldo = (url, { paleta = false } = {}) => url.replace(/^https:\/\//, `${paleta ? PROTOCOLO_PALETA : PROTOCOLO}://`);
export const sinRespaldo = (url) => url.replace(new RegExp(`^(${PROTOCOLO}|${PROTOCOLO_PALETA})://`), "https://");

/** PNG con paleta: firma PNG y tipo de color 3 en la cabecera IHDR (byte 25). */
export const esPngPaleta = (buf) => {
  const u8 = new Uint8Array(buf);
  return u8.length > 25 && u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47 && u8[25] === 3;
};

/** Descarga un mosaico; si falla o no es imagen, devuelve el PNG transparente y llama a `alFallar(url)`. Si la URL
 *  usa el protocolo de paleta y GIBS manda otro tipo de PNG (ruido fuera de cobertura), devuelve el transparente sin
 *  contarlo como falla: GIBS sí respondió. */
export async function cargarMosaico(url, senal, pedir = fetch, alFallar = () => {}) {
  try {
    const r = await pedir(sinRespaldo(url), { signal: senal });
    if (r.ok && /^image\//.test(r.headers.get("content-type") || "")) {
      const data = await r.arrayBuffer();
      if (url.startsWith(`${PROTOCOLO_PALETA}://`) && !esPngPaleta(data)) return { data: PNG_VACIO.slice(0) };
      return { data };
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
  for (const p of [PROTOCOLO, PROTOCOLO_PALETA]) gl.addProtocol(p, (params, ctrl) => cargarMosaico(params.url, ctrl.signal, fetch,
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
