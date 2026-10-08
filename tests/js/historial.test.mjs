// Pruebas del historial de 90 días.  Ejecutar:  node --test "tests/js/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { aEvento, diasPorCargar, SEV_MIN_90 } from "../../js/historial.js";

test("un registro compacto se completa como evento con región y fuente", () => {
  const e = aEvento({ id: "gd-1", fecha_utc: "2026-09-01T10:00:00Z", titulo: "T", url: "https://x.org", fuente: "GDELT",
    pais_iso3: "MEX", lat: 19, lon: -99, area_principal: "seguridad", severidad: 4, nivel_alerta: "PRIORIDAD" }, { MEX: "norteamerica" });
  assert.equal(e.region, "norteamerica");
  assert.equal(e._t, Date.parse("2026-09-01T10:00:00Z"));
  assert.equal(e.tipo_fuente, "noticia");
  assert.deepEqual(e.fuentes, [{ fuente: "GDELT", url: "https://x.org", tipo_fuente: "noticia" }]);
  assert.equal(e.impacto_mexico, null);
  assert.ok(e.es_historial && e.areas_secundarias.length === 0);
});

test("solo se piden los últimos N días que faltan", () => {
  const indice = { dias: ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"].map((dia) => ({ dia, total: 1 })) };
  assert.deepEqual(diasPorCargar(indice, 2), ["2026-10-07", "2026-10-08"]);
  assert.deepEqual(diasPorCargar(indice, 3, new Set(["2026-10-07"])), ["2026-10-06", "2026-10-08"]);
  assert.equal(SEV_MIN_90, 3);
});
