// Fenómenos anómalos: van en su propio menú y nunca cuentan como amenaza.  Ejecutar:  node --test "tests/js/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.window = globalThis.window || {};
const R = await import("../../js/riesgos.js");
const { clasificar } = await import("../../js/amenazas.js");

test("las capas de anomalías están en su menú, sin amenaza y con aviso de que son reportes", () => {
  assert.ok(R.ANOMALIAS.length >= 8);
  for (const c of R.ANOMALIAS) {
    assert.equal(c.menu, "anomalias", c.id);
    assert.equal(c.noAmenaza, true, c.id);
    assert.match(c.pie, /no hechos confirmados/);
    assert.ok(R.CAPAS.includes(c), c.id);
  }
});

test("severidad fija 1 e ícono solo en noticias y casos históricos", () => {
  assert.deepEqual(clasificar("anom_recientes", { tipo: "ufo" }), { sev: 1, tipo: "Fenómeno anómalo (reporte)", ic: "🛸" });
  assert.equal(clasificar("anom_historicos", { tipo: "crop" }).ic, "🌾");
  assert.equal(clasificar("anom_lugar", { nivel: "oficial" }).ic, "");
});

test("cada capa filtra su clase y colorea por nivel de respaldo", () => {
  const fc = { features: [{ properties: { capa: "anom_lugar", nivel: "oficial", titulo: "A" } }, { properties: { capa: "anom_triangulo", nivel: "explicado", titulo: "B" } },
    { properties: { capa: "anom_orbe", nivel: "cientifico", titulo: "C" } }] };
  const lugar = R.ANOMALIAS.find((c) => c.id === "anom_lugar");
  assert.deepEqual(lugar.derivar(fc).features.map((f) => f.properties.titulo), ["A", "B"]);
  assert.equal(lugar.estilo({ nivel: "oficial" }).c, R.NIVELES_ANOM.oficial[0]);
  const f = lugar.ficha({ titulo: "A", nivel: "local", url: "https://x", fuente: "W" });
  assert.ok(f.filas.some(([k, v]) => k === "Nivel de respaldo" && /no verificado/.test(v)));
});

test("capas por tipo de fenómeno (TrackAlien): noticias, históricos y catálogo que corresponde", async () => {
  const { ANOMALIAS_POR_TIPO, TIPOS_ANOM } = await import("../../js/riesgos.js");
  assert.equal(ANOMALIAS_POR_TIPO.length, 9);
  assert.equal(TIPOS_ANOM.length, 9);
  const f = (capa, tipo, tipos) => ({ properties: { capa, tipo, ...(tipos ? { tipos } : {}) } });
  const fc = { type: "FeatureCollection", features: [f("anom_recientes", "lights_sky"), f("anom_historicos", "ufo"), f("anom_recientes", "ufo", ["ufo", "lights_sky"]),
    f("anom_orbe", "orbe"), f("anom_cultivo", "cultivo"), f("anom_nuforc", "densidad"), f("anom_lugar", "lugar")] };
  const n = (t) => ANOMALIAS_POR_TIPO.find((c) => c.id === `anom_t_${t}`).derivar(fc).features.length;
  assert.equal(n("lights_sky"), 2); // la nota + el grupo por país que la contiene
  assert.equal(n("ufo"), 2);
  assert.equal(n("lights_ground"), 1); // orbes del catálogo
  assert.equal(n("crop"), 1);
  assert.equal(n("sound"), 0);
  assert.ok(ANOMALIAS_POR_TIPO.every((c) => c.noAmenaza && c.menu === "anomalias" && c.subgrupo.startsWith("Por tipo")));
});
