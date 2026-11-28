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
// Nieve observada (VIIRS NDSI): se quitan los píxeles con poca fracción de nieve (1 a 40 %). En ciudades, suelo claro
// y bordes de nubes salen manchas de 1-20 % que no son nieve (medido en nov 2026 sobre el valle de México y Puebla).
export const PROTOCOLO_NIEVE = "gibsn";

/** «https://gibs…» → «gibsr://gibs…» (para las fuentes del mapa; las consultas propias siguen usando https).
 *  Con `paleta`, «gibsp://…»: solo se aceptan PNG con paleta (productos de GIBS con paleta oficial).
 *  Con `filtro: "nieve"`, «gibsn://…»: se dejan solo los píxeles con 41 % o más de nieve. */
export const conRespaldo = (url, { paleta = false, filtro = "" } = {}) =>
  url.replace(/^https:\/\//, `${filtro === "nieve" ? PROTOCOLO_NIEVE : paleta ? PROTOCOLO_PALETA : PROTOCOLO}://`);
export const sinRespaldo = (url) => url.replace(new RegExp(`^(${PROTOCOLO}|${PROTOCOLO_PALETA}|${PROTOCOLO_NIEVE})://`), "https://");

/** Paleta oficial de GIBS para la fracción de nieve: rojo 240 y el verde baja con la fracción (240 = 1-20 %,
 *  210 = 21-40 %, 180 = 41-60 %, 150 = 61-80 %, 132 = 81-100 %). Deja transparente lo que tenga menos de `minimo` %
 *  y vuelve a pintar el resto en azules (NIEVE_COLORES), que se distinguen mejor sobre el mapa claro que los naranjas pálidos. */
export const NIEVE_COLORES = [[120, 200, 255], [40, 140, 240], [20, 60, 200]];  // 41-60 %, 61-80 %, 81-100 %
export function filtrarNieve(rgba, minimo = 41) {
  const verdeMax = minimo > 80 ? 135 : minimo > 60 ? 155 : minimo > 40 ? 185 : minimo > 20 ? 215 : 255;
  for (let i = 0; i < rgba.length; i += 4) {
    if (!rgba[i + 3]) continue;
    if (!(rgba[i] >= 230 && rgba[i + 1] <= verdeMax)) { rgba[i + 3] = 0; continue; }
    const c = NIEVE_COLORES[rgba[i + 1] >= 165 ? 0 : rgba[i + 1] >= 141 ? 1 : 2];
    rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255;
  }
  return rgba;
}

// Relieve (AWS Terrain Tiles, formato terrarium, el mismo del modo 3D). En latitudes tropicales y subtropicales solo
// nieva en montañas altas: un píxel de «nieve» por debajo de esa altura es una falsa detección (suelo claro, techos,
// bordes de nubes). Medido en nov 2026: con solo el filtro de fracción quedaban puntos sueltos sobre Puebla y Tlaxcala.
export const DEM_NIEVE = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/";

/** Altura mínima (m) para aceptar nieve según la latitud: ±23° → 3,500 m; ±23° a ±33° → 1,500 m; más al norte o sur, sin mínimo. */
export const alturaMinimaNieve = (lat) => (Math.abs(lat) < 23 ? 3500 : Math.abs(lat) < 33 ? 1500 : 0);

/** Latitud del centro de un mosaico Web Mercator z/y. */
export const latMosaico = (z, y) => { const n = Math.PI - (2 * Math.PI * (y + 0.5)) / 2 ** z; return (180 / Math.PI) * Math.atan(Math.sinh(n)); };

/** Quita la nieve de los píxeles con altura (terrarium RGBA) menor que `minimo` metros. */
export function filtrarPorAltura(rgba, dem, minimo) {
  if (!minimo) return rgba;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] && dem[i] * 256 + dem[i + 1] + dem[i + 2] / 256 - 32768 < minimo) rgba[i + 3] = 0;
  }
  return rgba;
}

async function rgbaDe(blob, lado) {
  const bmp = await createImageBitmap(blob);
  const lienzo = new OffscreenCanvas(lado, lado), ctx = lienzo.getContext("2d");
  ctx.drawImage(bmp, 0, 0, lado, lado);
  return { lienzo, ctx, img: ctx.getImageData(0, 0, lado, lado) };
}

/** PNG → PNG con el filtro de nieve (en el navegador; sin OffscreenCanvas se deja igual). `url` = …/{z}/{y}/{x}.png */
async function conFiltroNieve(data, url = "") {
  if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap === "undefined") return data;
  try {
    const { lienzo, ctx, img } = await rgbaDe(new Blob([data], { type: "image/png" }), 256);
    filtrarNieve(img.data);
    const m = url.match(/\/(\d+)\/(\d+)\/(\d+)\.png/);
    const minimo = m ? alturaMinimaNieve(latMosaico(Number(m[1]), Number(m[2]))) : 0;
    if (minimo) {
      try {
        const r = await fetch(`${DEM_NIEVE}${m[1]}/${m[3]}/${m[2]}.png`);
        if (r.ok) filtrarPorAltura(img.data, (await rgbaDe(await r.blob(), 256)).img.data, minimo);
      } catch (e) { /* sin relieve: queda solo el filtro de fracción */ }
    }
    ctx.putImageData(img, 0, 0);
    return await (await lienzo.convertToBlob({ type: "image/png" })).arrayBuffer();
  } catch (e) {
    return data;
  }
}

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
      if (url.startsWith(`${PROTOCOLO_NIEVE}://`)) return { data: await conFiltroNieve(data, url) };
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
  for (const p of [PROTOCOLO, PROTOCOLO_PALETA, PROTOCOLO_NIEVE]) gl.addProtocol(p, (params, ctrl) => cargarMosaico(params.url, ctrl.signal, fetch,
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
