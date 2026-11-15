import { test } from "node:test";
import assert from "node:assert/strict";
import { GRUPOS_SATNOGS, gruposSatelites, totalSatelites } from "../../js/satelites-grupos.js";

const ahora = Date.UTC(2026, 10, 14);
const iss = ["ISS (ZARYA)", "1 25544U 98067A   26318.30312735  .00009396  00000-0  17615-3 0  9994",
  "2 25544  51.6324 277.2306 0007380  24.2289 335.9045 15.49368089595028"];
test("grupos derivados: filtra órbitas antiguas, conserva la fuente y deduplica cada objeto", () => {
  const g = gruposSatelites({ satnogs: [iss, iss, ["VIEJO", iss[1].replace("26318", "26200"), iss[2]]] }, ahora);
  assert.equal(g.satnogs.length, 1);
  assert.equal(g["satnogs-stations"].length, 1);
  assert.equal(g["satnogs-leo"].length, 1);
  assert.equal(totalSatelites(g), 1);
  assert.equal(GRUPOS_SATNOGS.length, 10);
});
test("carga aparte de AMSAT o Starlink no borra los grupos derivados ya cargados", () => {
  assert.deepEqual(Object.keys(gruposSatelites({ amsat: [iss] }, ahora)), ["amsat"]);
});
test("NORAD con ceros iniciales y sin ellos es un solo objeto", () => {
  const t1 = iss.map(s => s.replace("25544", "07530"));
  const t2 = iss.map(s => s.replace("25544", " 7530"));
  assert.equal(totalSatelites({ a: [t1], b: [t2] }), 1);
});
