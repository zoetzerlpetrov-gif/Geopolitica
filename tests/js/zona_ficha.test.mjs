import { test } from "node:test";
import assert from "node:assert/strict";
import { contiene, zonaDe, lugaresDe, videosPara, htmlZona, GRUPOS_ZONA } from "../../js/zona_ficha.js";

const cuadro = (x0, y0, x1, y1) => ({ type: "Polygon", coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
const ESTADOS = { features: [{ geometry: cuadro(-109, 22, -105, 27), properties: { nombre: "Sinaloa", iso3: "MEX" } }] };
const PAISES = { features: [{ geometry: cuadro(-118, 14, -86, 33), properties: { iso3: "MEX" } }, { geometry: cuadro(-5, 42, 8, 51), properties: { iso3: "FRA" } }] };
const nombrePais = (i) => ({ MEX: "México", FRA: "Francia" })[i] || i;

test("contiene: punto dentro, fuera y en el hueco", () => {
  const conHueco = { type: "Polygon", coordinates: [cuadro(0, 0, 10, 10).coordinates[0], cuadro(4, 4, 6, 6).coordinates[0]] };
  assert.ok(contiene(conHueco, [1, 1]));
  assert.ok(!contiene(conHueco, [5, 5]));
  assert.ok(!contiene(conHueco, [11, 1]));
  assert.ok(contiene({ type: "MultiPolygon", coordinates: [cuadro(20, 20, 21, 21).coordinates, cuadro(0, 0, 1, 1).coordinates] }, [0.5, 0.5]));
});

test("zonaDe: estado con ubicación fina; país si la nota solo trae el país", () => {
  const z = zonaDe([-107.4, 24.8], { precision: "ciudad", pais_iso3: "MEX" }, { estados: ESTADOS, paises: PAISES, nombrePais });
  assert.equal(z.nombre, "Sinaloa, México");
  assert.equal(z.nivel, "estado o provincia");
  assert.equal(zonaDe([-107.4, 24.8], { precision: "país", pais_iso3: "MEX" }, { estados: ESTADOS, paises: PAISES, nombrePais }).nivel, "país");
  assert.equal(zonaDe([2.35, 48.85], {}, { estados: ESTADOS, paises: PAISES, nombrePais }).nombre, "Francia");
  assert.equal(zonaDe(null, {}, {}), null);
});

test("videosPara: exige lugar y tema", () => {
  const recientes = [
    { v: "aaaaaaaaaaa", t: "Narcobloqueos en Culiacán tras detención", c: "N+", f: "2026-10-21T10:00:00Z" },
    { v: "bbbbbbbbbbb", t: "Festival de cine en Culiacán", c: "N+", f: "2026-10-21T11:00:00Z" },
    { v: "ccccccccccc", t: "Bloqueo de transportistas en Puebla", c: "N+", f: "2026-10-21T12:00:00Z" },
  ];
  const lugares = lugaresDe({ lugar: "Culiacán, Sinaloa", pais_iso3: "MEX" }, nombrePais);
  assert.deepEqual(lugares, ["culiacan", "sinaloa", "mexico"]);
  const vs = videosPara(recientes, lugares, "Carreteras y calles: robos, bloqueos y protestas");
  assert.deepEqual(vs.map((x) => x.video), ["aaaaaaaaaaa"]);
  assert.deepEqual(videosPara(recientes, lugares, "Grupo sin tema"), []);
  assert.ok(lugaresDe({ lugar: "México (sin lugar en el título)" }).every((l) => !l.includes("sin lugar")));
});

test("grupos y texto de la zona", () => {
  for (const g of ["Seguridad y ataques", "Red y ciberseguridad", "Salud: brotes y enfermedades", "Carreteras y calles: robos, bloqueos y protestas"]) assert.ok(GRUPOS_ZONA.has(g));
  assert.match(htmlZona({ nombre: "<b>x</b>", nivel: "país" }), /&lt;b&gt;/);
  assert.equal(htmlZona(null), "");
});
