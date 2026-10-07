// Pruebas de la cuenta regresiva.  Ejecutar:  node --test "tests/js/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { proximaCorrida } from "../../js/refresh.js";
import { mmss, esc, safeUrl } from "../../js/util.js";

const t = (iso) => new Date(iso).getTime();

test("antes del minuto 17 la próxima corrida es en la misma hora", () => {
  assert.equal(proximaCorrida(t("2026-10-07T10:05:00Z")).toISOString(), "2026-10-07T10:17:00.000Z");
});

test("después del minuto 17 la próxima corrida es la hora siguiente", () => {
  assert.equal(proximaCorrida(t("2026-10-07T10:30:00Z")).toISOString(), "2026-10-07T11:17:00.000Z");
});

test("exactamente en el minuto 17 se apunta a la hora siguiente", () => {
  assert.equal(proximaCorrida(t("2026-10-07T10:17:00Z")).toISOString(), "2026-10-07T11:17:00.000Z");
});

test("cambio de día", () => {
  assert.equal(proximaCorrida(t("2026-12-31T23:40:00Z")).toISOString(), "2027-01-01T00:17:00.000Z");
});

test("formato mm:ss", () => {
  assert.equal(mmss(0), "00:00");
  assert.equal(mmss(61000), "01:01");
  assert.equal(mmss(-5000), "00:00");
});

test("escape de HTML y enlaces seguros", () => {
  assert.equal(esc('<img src=x onerror="a">'), "&lt;img src=x onerror=&quot;a&quot;&gt;");
  assert.equal(safeUrl("javascript:alert(1)"), "#");
  assert.equal(safeUrl("https://example.org"), "https://example.org");
});
