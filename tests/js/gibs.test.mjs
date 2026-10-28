import { test } from "node:test";
import assert from "node:assert/strict";
import { cargarMosaico, conRespaldo, sinRespaldo } from "../../js/gibs.js";

const resp = (ok, tipo, cuerpo = new Uint8Array([1, 2, 3]).buffer) => async () => ({ ok, headers: { get: () => tipo }, arrayBuffer: async () => cuerpo });

test("mosaico de GIBS con error → PNG transparente y aviso; con imagen → la imagen", async () => {
  const u = "https://gibs.earthdata.nasa.gov/wmts/x/1/2/3.png";
  assert.equal(sinRespaldo(conRespaldo(u)), u);
  assert.ok(conRespaldo(u).startsWith("gibsr://"));
  const fallas = [];
  const vacio = await cargarMosaico(conRespaldo(u), undefined, resp(false, "text/xml"), (x) => fallas.push(x));
  assert.equal(new Uint8Array(vacio.data)[1], 0x50);  // «PNG»
  assert.deepEqual(fallas, [u]);
  const bien = await cargarMosaico(conRespaldo(u), undefined, resp(true, "image/png"), (x) => fallas.push(x));
  assert.equal(bien.data.byteLength, 3);
  assert.equal(fallas.length, 1);
  await cargarMosaico(u, undefined, async () => { throw new Error("red"); }, (x) => fallas.push(x));
  assert.equal(fallas.length, 2);
  const ctrl = new AbortController(); ctrl.abort();
  await assert.rejects(cargarMosaico(u, ctrl.signal, async () => { throw new Error("abortado"); }));
});

test("Meteosat: cuadro más reciente que no pase del momento del bucle", async () => {
  const { cuadroMeteosat, esquinas } = await import("../../js/clima.js");
  const l = [{ t: "2026-10-28T10:00:00Z" }, { t: "2026-10-28T10:30:00Z" }, { t: "2026-10-28T11:00:00Z" }];
  assert.equal(cuadroMeteosat(l, "2026-10-28T10:50:00Z").t, "2026-10-28T10:30:00Z");
  assert.equal(cuadroMeteosat(l, "2026-10-28T09:00:00Z").t, "2026-10-28T10:00:00Z");
  assert.equal(cuadroMeteosat([], "x"), null);
  assert.deepEqual(esquinas([-80, -75, 150, 75]), [[-80, 75], [150, 75], [150, -75], [-80, -75]]);
});

test("TEMPO: se prueban las horas exactas publicadas (GIBS ya no acepta horas en punto)", async () => {
  const { mejorHora, horasPublicadas } = await import("../../js/imagenes.js");
  const xml = "<Domain>2026-10-28T13:52:41Z/2026-10-28T13:52:41Z/PT59M41S,2026-10-28T14:52:22Z/2026-10-28T14:52:22Z/PT59M41S</Domain>";
  const pub = await horasPublicadas({ capa: "T", matriz: "M" }, new Date("2026-10-28T16:00:00Z"), async () => xml);
  assert.deepEqual(pub, ["2026-10-28T13:52:41Z", "2026-10-28T14:52:22Z"]);
  const pedidas = [];
  const pedir = async (u) => { pedidas.push(u); return { ok: true, tipo: "image/png", bytes: u.includes("14:52:22") ? 18000 : 17000 }; };
  assert.equal(await mejorHora({ capa: "T", matriz: "M", ext: "png" }, pedir, new Date(), 30, pub), "2026-10-28T14:52:22Z");
  assert.ok(pedidas.every((u) => /T1[34]:52:/.test(u)));
  assert.deepEqual(await horasPublicadas({ capa: "T", matriz: "M" }, new Date(), async () => { throw new Error("red"); }), []);
});

test("mosaico vacío de GIBS (paleta, gris o RGBA sin píxeles visibles) → PNG casi transparente propio", async () => {
  const { esPngVacio } = await import("../../js/gibs.js");
  const zlib = await import("node:zlib");
  const crc = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const trozo = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length); b.write(t, 4); Buffer.from(d).copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
  const png = (tipo, canales, pix, trns) => {
    const ih = Buffer.alloc(13); ih.writeUInt32BE(256); ih.writeUInt32BE(256, 4); ih[8] = 8; ih[9] = tipo;
    const crudo = Buffer.alloc(256 * (1 + 256 * canales)); if (pix) crudo[1 + 300 + canales - 1] = pix;  // con alfa, en el canal alfa
    const partes = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), trozo("IHDR", ih)];
    if (tipo === 3) partes.push(trozo("PLTE", Buffer.alloc(768)));
    if (trns) partes.push(trozo("tRNS", Buffer.from(trns)));
    partes.push(trozo("IDAT", zlib.deflateSync(crudo)), trozo("IEND", Buffer.alloc(0)));
    const b = Buffer.concat(partes); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
  };
  assert.equal(await esPngVacio(png(3, 1, 0, [0])), true);
  assert.equal(await esPngVacio(png(3, 1, 5, [0])), false);      // un píxel con otro color de la paleta
  assert.equal(await esPngVacio(png(3, 1, 0, [255])), false);    // el color 0 es opaco
  assert.equal(await esPngVacio(png(3, 1, 0, null)), false);
  assert.equal(await esPngVacio(png(0, 1, 0, [0, 0])), true);
  assert.equal(await esPngVacio(png(6, 4, 0, null)), true);
  assert.equal(await esPngVacio(png(6, 4, 9, null)), false);    // un píxel con alfa 9
  assert.equal(await esPngVacio(new Uint8Array([0xff, 0xd8, 0xff]).buffer), false);  // JPEG
  const vacio = png(3, 1, 0, [0]);
  const r = await cargarMosaico("gibsr://gibs/x.png", undefined, resp(true, "image/png", vacio));
  assert.notEqual(r.data.byteLength, vacio.byteLength);
  assert.equal(await esPngVacio(r.data), false);  // el propio lleva alfa 1/255: la textura sí se escribe
});
