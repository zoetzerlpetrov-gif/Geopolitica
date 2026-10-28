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
