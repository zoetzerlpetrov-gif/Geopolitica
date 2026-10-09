// Lector mínimo de metadatos EXIF de fotos JPEG, sin bibliotecas externas.
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

/** ArrayBuffer de un JPEG → objeto con los campos encontrados ({} si no hay EXIF). */
export function leerExif(buffer) {
  const v = new DataView(buffer);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return { error: "No es un JPEG (las fotos HEIC de iPhone o PNG no traen EXIF legible aquí)." };
  let p = 2;
  while (p + 4 < v.byteLength) {
    const marca = v.getUint16(p), largo = v.getUint16(p + 2);
    if (marca === 0xffe1 && v.getUint32(p + 4) === 0x45786966) { // «Exif»
      const base = p + 10, le = v.getUint16(base) === 0x4949;
      const out = {};
      leerIFD(v, base, v.getUint32(base + 4, le), le, ETIQUETAS, out);
      if (out._exif) leerIFD(v, base, out._exif, le, ETIQUETAS, out);
      const gps = {};
      if (out._gps) leerIFD(v, base, out._gps, le, GPS, gps);
      delete out._exif; delete out._gps;
      return { ...out, ...coordenadas(gps) };
    }
    if ((marca & 0xff00) !== 0xff00) break;
    p += 2 + largo;
  }
  return {};
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
