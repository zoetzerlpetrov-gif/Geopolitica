// Fichas de las áreas aproximadas del mapa: explican el fenómeno (qué es, qué implica) además de sus datos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fichaArea, CAPAS, DESCRIPCION_AREA } from "../../js/riesgos.js";

const capa = (id) => CAPAS.find((c) => c.id === id);
const filas = (f) => Object.fromEntries(f.filas);

test("anticiclón: el área reusa los datos del centro y explica qué implica", () => {
  const p = { es_area: true, kind: "alta", subtropical: true, altura500_dam: 592.9, anomalia_dam: 4.1, t850_c: 18, horizontes: 5, de_horizontes: 5, como: "Área aproximada: zona…" };
  const f = capa("anticiclones").ficha(p);
  assert.equal(f.titulo, "Anticiclón en altura");
  assert.equal(f.chip, "5 de 5 días");
  assert.equal(capa("anticiclones").ficha({ ...p, de_horizontes: undefined, horizontes: 1 }).chip, "1 día");
  const r = filas(f);
  assert.match(r["Qué es"], /5\.5 km/); assert.match(r["Qué implica"], /despejado/);
  assert.equal(r["Altura a 500 hPa (~5.5 km)"], "592.9 dam"); assert.ok(r["Cómo se dibuja"]);
  assert.match(filas(capa("anticiclones").ficha({ ...p, kind: "domo", domo_calor: true }))["Qué es"], /Domo de calor/);
  assert.match(filas(capa("anticiclones").ficha({ es_area: true, kind: "bloqueo", hemisferio: "norte", lon_ini: 10, lon_fin: 40, dias: 4, de_horizontes: 5 }))["Qué implica"], /estanca/);
});

test("calor, frío y niebla: nivel, ciudades y explicación; radiación con su sitio", () => {
  const fr = filas(capa("frio").ficha({ es_area: true, name: "Zona con frío extremo o heladas (3 ciudades)", frio_nivel: 3, ola_frio: true, ciudades: JSON.stringify(["Berlín", "Praga", "Viena"]) }));
  assert.match(fr["Qué es"], /heladas/); assert.match(fr["Nivel más alto dentro del área"], /ola de frío/); assert.equal(fr["Ciudades dentro (3)"], "Berlín, Praga, Viena");
  assert.match(filas(capa("calor").ficha({ es_area: true, calor_nivel: 2, ciudades: ["Mérida"] }))["Qué implica"], /golpe de calor/);
  assert.match(filas(capa("niebla").ficha({ es_area: true, niebla_pct: 80 }))["Nivel más alto dentro del área"], /80 %/);
  const rad = capa("radiacion").ficha({ es_area: true, k: "sitio", nombre: "Chernóbil", anio: 1986, tipo: "accidente", texto: "Explosión del reactor 4", pais: "UKR", radio_km: 30 });
  assert.match(rad.titulo, /Chernóbil/); assert.match(filas(rad)["Qué es"], /accidente nuclear/); assert.equal(filas(rad)["Radio aproximado"], "30 km");
  for (const k of ["calor", "frio", "niebla", "alta", "domo", "bloqueo", "sitio", "sensor"]) assert.equal(DESCRIPCION_AREA[k].length, 2, k);
  assert.equal(fichaArea({ es_area: true }, "x").titulo, "Área aproximada");
});
