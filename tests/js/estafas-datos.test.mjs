import { test } from "node:test";
import assert from "node:assert/strict";
import { leerEstafas, ESTAFAS_LOCAL } from "../../js/estafas-datos.js";

const datos = (hora, version = 2) => ({ type: "FeatureCollection", version_esquema: version, generado_utc: `2026-11-17T${hora}:00:00Z`,
  features: [{ type: "Feature", geometry: { type: "Point", coordinates: [-102, 23] }, properties: { iso3: "MEX", n: 7 } }] });

test("una copia vieja publicada por datos-vivos no quita México", async () => {
  const fc = await leerEstafas(async (url) => url === ESTAFAS_LOCAL ? datos("14", 1) : datos("13"));
  assert.equal(fc.features[0].properties.iso3, "MEX");
  assert.equal(fc.generado_utc, datos("13").generado_utc);
});
test("la rama dedicada tiene prioridad aunque una instantánea parcial local declare una fecha posterior", async () => {
  const fc = await leerEstafas(async (url) => url === ESTAFAS_LOCAL ? datos("14") : datos("13"));
  assert.equal(fc.generado_utc, datos("13").generado_utc);
});
test("si falla la rama dedicada se usa la copia vigente de Pages", async () => {
  const fc = await leerEstafas(async (url) => { if (url !== ESTAFAS_LOCAL) throw new Error("sin red"); return datos("13"); });
  assert.equal(fc.features[0].properties.n, 7);
});
test("sin ninguna copia válida se informa un error; no se publica una capa vacía", async () => {
  await assert.rejects(leerEstafas(async () => datos("14", 1)), /publicación vigente/);
});
