// Lector mínimo de metadatos EXIF de fotos JPEG, HEIC/HEIF (iPhone, Samsung, Huawei), AVIF, WebP, PNG, TIFF y DNG (RAW),
// sin bibliotecas externas.
//
// Privacidad: el archivo se lee en la memoria de tu navegador con FileReader; no se sube a ningún
// servidor ni se guarda. Al cerrar o recargar la página desaparece.
//
// Qué es EXIF: un bloque de datos que la cámara o el teléfono escribe dentro del JPEG (marca, modelo,
// fecha, y si el GPS estaba activo, latitud y longitud). Redes sociales como WhatsApp, Facebook o X
// suelen borrarlo al publicar; una foto descargada de ahí casi nunca trae ubicación.

const TIPOS = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }; // tamaño en bytes por tipo TIFF
const ETIQUETAS = { 0x010f: "marca", 0x0110: "modelo", 0x0132: "fecha_archivo", 0x9003: "fecha_toma", 0x8825: "_gps", 0x8769: "_exif", 0x0131: "software" };
const GPS = { 1: "lat_ref", 2: "lat", 3: "lon_ref", 4: "lon", 5: "alt_ref", 6: "alt", 7: "hora_gps", 0x10: "dir_ref", 0x11: "direccion", 0x1d: "fecha_gps" };

function leerValor(v, pos, tipo, n, le, base) {
  const tam = (TIPOS[tipo] || 1) * n;
  const off = tam > 4 ? base + v.getUint32(pos, le) : pos;
  if (off + tam > v.byteLength) return null;
  if (tipo === 2) { let s = ""; for (let i = 0; i < n; i++) { const c = v.getUint8(off + i); if (!c) break; s += String.fromCharCode(c); } return s.trim(); }
  const uno = (i) => {
    switch (tipo) {
      case 1: case 7: return v.getUint8(off + i);
      case 3: return v.getUint16(off + 2 * i, le);
      case 4: return v.getUint32(off + 4 * i, le);
      case 9: return v.getInt32(off + 4 * i, le);
      case 5: { const d = v.getUint32(off + 8 * i + 4, le); return d ? v.getUint32(off + 8 * i, le) / d : 0; }
      case 10: { const d = v.getInt32(off + 8 * i + 4, le); return d ? v.getInt32(off + 8 * i, le) / d : 0; }
      default: return null;
    }
  };
  return n === 1 ? uno(0) : Array.from({ length: n }, (_, i) => uno(i));
}

function leerIFD(v, base, off, le, nombres, out) {
  if (base + off + 2 > v.byteLength) return;
  const n = v.getUint16(base + off, le);
  for (let i = 0; i < n; i++) {
    const p = base + off + 2 + i * 12;
    if (p + 12 > v.byteLength) break;
    const etq = v.getUint16(p, le), clave = nombres[etq];
    if (!clave) continue;
    out[clave] = leerValor(v, p + 8, v.getUint16(p + 2, le), v.getUint32(p + 4, le), le, base);
  }
}

/** Bloque TIFF de EXIF que empieza en `base` → campos encontrados. */
function leerTiff(v, base) {
  if (base + 8 > v.byteLength) return {};
  const le = v.getUint16(base) === 0x4949;
  const out = {};
  leerIFD(v, base, v.getUint32(base + 4, le), le, ETIQUETAS, out);
  if (out._exif) leerIFD(v, base, out._exif, le, ETIQUETAS, out);
  const gps = {};
  if (out._gps) leerIFD(v, base, out._gps, le, GPS, gps);
  delete out._exif; delete out._gps;
  return { ...out, ...coordenadas(gps) };
}

const tipo4 = (v, p) => String.fromCharCode(v.getUint8(p), v.getUint8(p + 1), v.getUint8(p + 2), v.getUint8(p + 3));
const uint = (v, p, n) => (n === 0 ? 0 : n === 2 ? v.getUint16(p) : n === 4 ? v.getUint32(p) : n === 8 ? Number(v.getBigUint64(p)) : 0);

/** Cajas ISOBMFF entre `ini` y `fin` → [{tipo, ini (inicio del contenido), fin}]. */
function cajas(v, ini, fin) {
  const out = [];
  let p = ini;
  while (p + 8 <= fin) {
    let tam = v.getUint32(p), cab = 8;
    if (tam === 1) { tam = Number(v.getBigUint64(p + 8)); cab = 16; } else if (tam === 0) tam = fin - p;
    if (tam < cab || p + tam > fin) break;
    out.push({ tipo: tipo4(v, p + 4), ini: p + cab, fin: p + tam });
    p += tam;
  }
  return out;
}

/**
 * HEIC/HEIF (fotos de iPhone): el EXIF es un «item» de tipo «Exif» dentro de la caja «meta».
 * «iinf» dice qué item es el EXIF e «iloc» dónde está en el archivo. Al inicio del item van 4 bytes con
 * la distancia hasta la cabecera TIFF.
 */
function exifHeif(v) {
  const meta = cajas(v, 0, v.byteLength).find((c) => c.tipo === "meta");
  if (!meta) return null;
  const hijos = cajas(v, meta.ini + 4, meta.fin);  // «meta» es una full box: 4 bytes de versión y banderas
  const iinf = hijos.find((c) => c.tipo === "iinf"), iloc = hijos.find((c) => c.tipo === "iloc");
  if (!iinf || !iloc) return null;
  const vi = v.getUint8(iinf.ini);
  let idExif = null;
  for (const e of cajas(v, iinf.ini + 4 + (vi === 0 ? 2 : 4), iinf.fin)) {
    if (e.tipo !== "infe") continue;
    const ve = v.getUint8(e.ini);
    if (ve < 2) continue;
    const id = ve === 2 ? v.getUint16(e.ini + 4) : v.getUint32(e.ini + 4);
    if (tipo4(v, e.ini + 4 + (ve === 2 ? 2 : 4) + 2) === "Exif") { idExif = id; break; }
  }
  if (idExif == null) return null;
  const vl = v.getUint8(iloc.ini);
  let p = iloc.ini + 4;
  const tamOff = v.getUint8(p) >> 4, tamLar = v.getUint8(p) & 15, tamBase = v.getUint8(p + 1) >> 4, tamIdx = vl > 0 ? v.getUint8(p + 1) & 15 : 0;
  p += 2;
  const n = vl < 2 ? v.getUint16(p) : v.getUint32(p);
  p += vl < 2 ? 2 : 4;
  for (let i = 0; i < n; i++) {
    const id = vl < 2 ? v.getUint16(p) : v.getUint32(p);
    p += vl < 2 ? 2 : 4;
    if (vl > 0) p += 2;  // método de construcción
    p += 2;              // índice de referencia de datos
    const baseOff = uint(v, p, tamBase); p += tamBase;
    const ext = v.getUint16(p); p += 2;
    let primero = null;
    for (let k = 0; k < ext; k++) {
      p += tamIdx;
      const off = uint(v, p, tamOff); p += tamOff;
      p += tamLar;
      if (k === 0) primero = baseOff + off;
    }
    if (id === idExif && primero != null && primero + 4 <= v.byteLength) return primero + 4 + v.getUint32(primero);
  }
  return null;
}

/** WebP (contenedor RIFF): el EXIF va en el fragmento «EXIF», a veces precedido de «Exif\0\0». */
function exifWebp(v) {
  let p = 12;
  while (p + 8 <= v.byteLength) {
    const tipo = tipo4(v, p), tam = v.getUint32(p + 4, true);
    if (tipo === "EXIF") return p + 8 + (v.getUint32(p + 8) === 0x45786966 ? 6 : 0);
    p += 8 + tam + (tam % 2);
  }
  return null;
}

/** PNG: el EXIF va en el fragmento «eXIf» (estándar desde 2017; pocos programas lo escriben). */
function exifPng(v) {
  let p = 8;
  while (p + 12 <= v.byteLength) {
    const tam = v.getUint32(p), tipo = tipo4(v, p + 4);
    if (tipo === "eXIf") return p + 8;
    if (tipo === "IEND") break;
    p += 12 + tam;
  }
  return null;
}

/** Formato por los primeros bytes (no por la extensión, que puede mentir). */
export function formatoDe(buffer) {
  const v = new DataView(buffer);
  if (v.byteLength < 12) return "desconocido";
  if (v.getUint16(0) === 0xffd8) return "jpeg";
  if (tipo4(v, 4) === "ftyp") return tipo4(v, 8) === "avif" || tipo4(v, 8) === "avis" ? "avif" : "heic";
  if (tipo4(v, 0) === "RIFF" && tipo4(v, 8) === "WEBP") return "webp";
  if (v.getUint32(0) === 0x89504e47) return "png";
  if (v.getUint16(0) === 0x4949 && v.getUint16(2, true) === 42) return "tiff";  // también DNG (RAW de Android y ProRAW de iPhone)
  if (v.getUint16(0) === 0x4d4d && v.getUint16(2) === 42) return "tiff";
  if (tipo4(v, 0) === "GIF8") return "gif";
  if (v.getUint16(0) === 0x424d) return "bmp";
  return "desconocido";
}

export const NOMBRE_FORMATO = { jpeg: "JPEG", heic: "HEIC/HEIF", avif: "AVIF", webp: "WebP", png: "PNG", tiff: "TIFF o RAW (DNG)", gif: "GIF", bmp: "BMP", desconocido: "formato desconocido" };

/** ArrayBuffer de una foto (JPEG, HEIC/HEIF, AVIF, WebP, PNG, TIFF o DNG) → campos encontrados ({} si no hay EXIF). */
export function leerExif(buffer) {
  const v = new DataView(buffer);
  const f = formatoDe(buffer);
  try {
    if (f === "heic" || f === "avif") { const b = exifHeif(v); return b == null ? { formato: f } : { formato: f, ...leerTiff(v, b) }; }
    if (f === "webp") { const b = exifWebp(v); return b == null ? { formato: f } : { formato: f, ...leerTiff(v, b) }; }
    if (f === "png") { const b = exifPng(v); return b == null ? { formato: f } : { formato: f, ...leerTiff(v, b) }; }
    if (f === "tiff") return { formato: f, ...leerTiff(v, 0) };
  } catch (e) {
    return { formato: f, error: `No se pudo leer el ${NOMBRE_FORMATO[f]} (archivo incompleto o variante no soportada).` };
  }
  if (f === "gif" || f === "bmp") return { formato: f, error: `Los ${NOMBRE_FORMATO[f]} no guardan metadatos de ubicación.` };
  if (f !== "jpeg") return { formato: f, error: "No reconozco el formato. Prueba con JPEG, HEIC, AVIF, WebP, PNG, TIFF o DNG." };
  let p = 2;
  while (p + 4 < v.byteLength) {
    const marca = v.getUint16(p), largo = v.getUint16(p + 2);
    if (marca === 0xffe1 && v.getUint32(p + 4) === 0x45786966) return { formato: f, ...leerTiff(v, p + 10) }; // «Exif»
    if ((marca & 0xff00) !== 0xff00) break;
    p += 2 + largo;
  }
  return { formato: f };
}

/** [grados, minutos, segundos] + referencia (N/S/E/W) → grados decimales. */
export function decimal(dms, ref) {
  if (!Array.isArray(dms) || dms.length < 3 || dms.some((x) => !Number.isFinite(x))) return null;
  const g = dms[0] + dms[1] / 60 + dms[2] / 3600;
  return /[SW]/i.test(ref || "") ? -g : g;
}

function coordenadas(g) {
  const lat = decimal(g.lat, g.lat_ref), lon = decimal(g.lon, g.lon_ref);
  const out = {};
  if (lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0)) { out.lat = lat; out.lon = lon; }
  if (Number.isFinite(g.alt)) out.altitud = g.alt_ref === 1 ? -g.alt : g.alt;
  if (Number.isFinite(g.direccion)) out.direccion = g.direccion;
  if (g.fecha_gps) out.fecha_gps = g.fecha_gps;
  return out;
}
