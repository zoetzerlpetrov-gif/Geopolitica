import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlVigia } from "../../js/vigia_panel.js";

test("panel del vigía", () => {
  assert.match(htmlVigia(null), /Aún no hay revisiones/);
  const h = htmlVigia({ nivel: "ataque", proteccion: true, generado_utc: "2026-11-19T12:00:00Z", motivos: ["Pico de tráfico"], historial: [{ hora: "x", nivel: "normal" }, { hora: "y", nivel: "ataque" }],
    detalle: { sitios: [{ sitio: "GitHub Pages", ok: true, estado: 200, ms: 120, integro: true }], cloudflare: { solicitudes_15m: 9000, promedio_15m: 500, pct_5xx: 0, eventos_firewall: 40, paises: [["XX", 40]] } } });
  assert.match(h, /Ataque en curso/);
  assert.match(h, /modo de protección ACTIVO/);
  assert.match(h, /vg-ataque/);
  assert.match(h, /✅ íntegro/);
});
