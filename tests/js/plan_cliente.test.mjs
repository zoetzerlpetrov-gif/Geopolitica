import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planActual, vistaActual, esSitioAdmin, puedeDescargar } from "../../js/licencias.js";
import { htmlMejorar } from "../../js/plan_cliente.js";
import { corsMapa } from "../../cloudflare/planes/service.js";

const planes = JSON.parse(readFileSync(new URL("../../config/planes.json", import.meta.url), "utf8"));
const almacen = (plan) => ({ getItem: (k) => (k === "gp_plan_sesion" ? plan : null) });

test("el sitio público siempre muestra la vista de pago; administración, la completa", () => {
  assert.equal(esSitioAdmin("dominusosint.com", "/"), false);
  assert.equal(esSitioAdmin("dominus-osint.pages.dev", "/"), false);
  assert.equal(esSitioAdmin("dominusosint.com", "/ops/legal"), true, "/ops/ está detrás de Cloudflare Access");
  assert.equal(esSitioAdmin("admin.dominusosint.com", "/"), true);
  assert.equal(vistaActual("", undefined, false), "pago");
  assert.equal(vistaActual("", undefined, true), "completa");
  assert.equal(vistaActual("?vista=pago", undefined, true), "pago");
});

test("en el sitio público el plan sale de la sesión verificada, no del enlace", () => {
  const prev = globalThis.sessionStorage;
  globalThis.sessionStorage = almacen(null);
  assert.equal(planActual(planes, "?plan=command", undefined, false), "demo", "escribir ?plan=command no sube de plan");
  globalThis.sessionStorage = almacen("analyst");
  assert.equal(planActual(planes, "", undefined, false), "analyst");
  globalThis.sessionStorage = almacen("inventado");
  assert.equal(planActual(planes, "", undefined, false), "demo");
  globalThis.sessionStorage = prev;
  assert.equal(planActual(planes, "?plan=recon", undefined, true), "recon", "administración sí simula planes");
});

test("solo Command descarga, exporta e imprime", () => {
  assert.deepEqual(planes.planes.map((p) => puedeDescargar(planes, p.id)), [false, false, false, true]);
});

test("la ventana «Mejorar plan» muestra planes superiores en USD y escapa el texto", () => {
  const h = htmlMejorar(planes, "recon", (x) => x, "<b>motivo</b>");
  assert.ok(h.includes("USD 8.99 al mes") && h.includes("USD 12.99 al mes") && h.includes("<h3>Demo</h3>"), "4 columnas, con Demo");
  assert.equal((h.match(/💳 Comprar/g) || []).length, 2, "comprar en los planes superiores al actual (Analyst y Command)");
  assert.ok([...h.matchAll(/href="([^"]+)"/g)].some((m) => m[1] === planes.planes[2].compra_url) && h.includes("✓ Tu plan actual") && h.includes("Incluido en tu plan"));
  assert.ok(!h.includes("MXN") && h.includes("&lt;b&gt;motivo") && h.includes("Comparativo por sección"));
  const desdeDemo = htmlMejorar(planes, "demo", (x) => x);
  assert.equal((desdeDemo.match(/💳 Comprar/g) || []).length, 3, "desde Demo: comprar Recon, Analyst y Command");
  assert.ok(h.includes("planes.html#analyst"));
});

test("el Worker responde el plan solo al mapa público, con la cookie", () => {
  const req = (o) => ({ headers: new Headers(o ? { Origin: o } : {}) });
  assert.equal(corsMapa(req("https://dominusosint.com"))["Access-Control-Allow-Origin"], "https://dominusosint.com");
  assert.equal(corsMapa(req("https://dominusosint.com"))["Access-Control-Allow-Credentials"], "true");
  assert.equal(corsMapa(req("https://evil.example"))["Access-Control-Allow-Origin"], undefined);
  assert.equal(corsMapa(req(null))["Access-Control-Allow-Origin"], undefined);
});
