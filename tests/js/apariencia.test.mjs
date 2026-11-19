import { test } from "node:test";
import assert from "node:assert/strict";
import { css, sinEmoji } from "../../js/apariencia.js";
import { PRESETS, contraste, revisar } from "../../js/apariencia_admin.js";
import { validar } from "../../cloudflare/apariencia/service.js";

test("los temas predefinidos son válidos y accesibles", () => {
  for (const [k, p] of Object.entries(PRESETS)) {
    assert.ok(validar(p).datos, k);
    assert.deepEqual(revisar(p), [], k);
  }
  assert.equal(contraste("#000000", "#ffffff"), 21);
});

test("el Worker rechaza CSS libre y valores fuera de rango", () => {
  const p = structuredClone(PRESETS.tactico);
  assert.match(validar({ ...p, claro: { ...p.claro, bg: "red;}body{display:none" } }).error, /inválido/);
  assert.match(validar({ ...p, fuente: "Comic" }).error, /Tipografía/);
  assert.match(validar({ ...p, radio: 40 }).error, /esquinas/);
});

test("CSS generado e íconos", () => {
  const t = css(PRESETS.tactico);
  assert.match(t, /--accent:#7a5c12/);
  assert.match(t, /:root\[data-theme="dark"\]\{[^}]*--bg:#0a0f17/);
  assert.match(t, /Barlow Condensed/);
  assert.match(t, /--radius:3px/);
  assert.equal(css(null), "");
  assert.equal(sinEmoji("🛡️ Vigía de seguridad"), "Vigía de seguridad");
  assert.equal(sinEmoji("🇲🇽 Monitor México"), "Monitor México");
  assert.equal(sinEmoji("Sin ícono"), "Sin ícono");
});
