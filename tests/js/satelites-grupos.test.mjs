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

test("Starlink sigue siendo un subtipo disponible en todos los roles con los mismos permisos", async () => {
  const fs = await import("node:fs");
  const L = await import("../../js/licencias.js");
  const cat = JSON.parse(fs.readFileSync(new URL("../../config/entities.json", import.meta.url)));
  const lic = JSON.parse(fs.readFileSync(new URL("../../config/comercial_licencias.json", import.meta.url)));
  const planes = JSON.parse(fs.readFileSync(new URL("../../config/planes.json", import.meta.url)));
  const todos = cat.categorias.find(c => c.id === "satelites").subtipos;
  const r = L.restricciones(lic, cat, planes);
  for (const rol of ["demo", "recon", "analyst", "command", "admin"]) {
    const permitidos = rol === "admin" ? todos : L.subtiposPago(todos, r);
    const starlink = permitidos.filter(s => s.grupo === "satnogs-starlink");
    assert.equal(starlink.length, 1, rol);
    assert.equal(starlink[0].fuente, "satnogs", rol);
    if (rol !== "admin") assert.ok(!permitidos.some(s => s.fuente === "celestrak"));
  }
  const starlink = ["STARLINK-3100", iss[1], iss[2]];
  const g = gruposSatelites({satnogs: [starlink]}, ahora);
  assert.equal(g["satnogs-starlink"].length, 1);
  assert.equal(g["satnogs-starlink"][0][0], "STARLINK-3100");
});
