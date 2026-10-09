import test from "node:test";
import assert from "node:assert/strict";
import { leerExif, decimal } from "../../js/exif.js";

/** JPEG mínimo con un bloque EXIF (big endian) que trae marca y GPS. */
function jpegConGps(lat, latRef, lon, lonRef) {
  const b = []; const u16 = (x) => b.push((x >> 8) & 255, x & 255); const u32 = (x) => { u16(x >>> 16); u16(x & 0xffff); };
  const tiff = [];
  const t16 = (x) => tiff.push((x >> 8) & 255, x & 255), t32 = (x) => { t16(x >>> 16); t16(x & 0xffff); };
  // Cabecera TIFF «MM», IFD0 en 8 con 2 entradas: Make (ASCII) y puntero GPS.
  tiff.push(0x4d, 0x4d); t16(42); t32(8);
  t16(2);
  t16(0x010f); t16(2); t32(4); tiff.push(...[..."Foo\0"].map((c) => c.charCodeAt(0)));
  const gpsOff = 8 + 2 + 2 * 12 + 4;
  t16(0x8825); t16(4); t32(1); t32(gpsOff);
  t32(0);
  // IFD GPS con 4 entradas; los racionales van después.
  const datos = gpsOff + 2 + 4 * 12 + 4;
  t16(4);
  t16(1); t16(2); t32(2); tiff.push(latRef.charCodeAt(0), 0, 0, 0);
  t16(2); t16(5); t32(3); t32(datos);
  t16(3); t16(2); t32(2); tiff.push(lonRef.charCodeAt(0), 0, 0, 0);
  t16(4); t16(5); t32(3); t32(datos + 24);
  t32(0);
  for (const [g, m, s] of [lat, lon]) { t32(g); t32(1); t32(m); t32(1); t32(Math.round(s * 100)); t32(100); }
  u16(0xffd8); u16(0xffe1); u16(2 + 6 + tiff.length);
  b.push(0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff); u16(0xffd9);
  return new Uint8Array(b).buffer;
}

test("lee coordenadas GPS y marca de un JPEG", () => {
  const d = leerExif(jpegConGps([19, 25, 57.6], "N", [99, 7, 58.8], "W"));
  assert.equal(d.marca, "Foo");
  assert.ok(Math.abs(d.lat - 19.4327) < 1e-4 && Math.abs(d.lon + 99.1330) < 1e-4);
});

test("sin EXIF o formato distinto", () => {
  assert.deepEqual(leerExif(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer), {});
  assert.ok(leerExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer).error);
  assert.equal(decimal([10, 30, 0], "S"), -10.5);
  assert.equal(decimal([1, 2], "N"), null);
});
