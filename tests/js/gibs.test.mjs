import { test } from "node:test";
import assert from "node:assert/strict";
import { cargarMosaico, conRespaldo, sinRespaldo, esPngPaleta } from "../../js/gibs.js";

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

test("productos con paleta: un PNG que no es de paleta (ruido de GIBS fuera de cobertura) se dibuja transparente", async () => {
  const u = "https://gibs.earthdata.nasa.gov/wmts/x/3/4/6.png";
  const p = conRespaldo(u, { paleta: true });
  assert.ok(p.startsWith("gibsp://"));
  assert.equal(sinRespaldo(p), u);
  const png = (tipo) => { const b = new Uint8Array(40); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); b[25] = tipo; return b.buffer; };
  assert.equal(esPngPaleta(png(3)), true);
  assert.equal(esPngPaleta(png(6)), false);
  assert.equal(esPngPaleta(new Uint8Array([0xff, 0xd8, 0xff]).buffer), false);
  const fallas = [];
  const ruido = await cargarMosaico(p, undefined, resp(true, "image/png", png(6)), (x) => fallas.push(x));
  assert.equal(ruido.data.byteLength, 334);  // el PNG transparente propio
  assert.deepEqual(fallas, []);             // GIBS sí respondió: no cuenta como falla
  const bueno = await cargarMosaico(p, undefined, resp(true, "image/png", png(3)));
  assert.equal(bueno.data.byteLength, 40);
  const sinFiltro = await cargarMosaico(conRespaldo(u), undefined, resp(true, "image/png", png(6)));
  assert.equal(sinFiltro.data.byteLength, 40);  // las demás capas no se filtran
});
