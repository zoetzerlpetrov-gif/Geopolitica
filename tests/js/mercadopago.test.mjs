import test from "node:test";
import assert from "node:assert/strict";
import { firmaValida, planDeSuscripcion, aplicarSuscripcion, avisoMercadoPago } from "../../cloudflare/planes/mercadopago.js";

const SECRETO = "secreto-de-prueba";
async function firmar(id, reqId, ts) {
  const llave = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRETO), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const f = await crypto.subtle.sign("HMAC", llave, new TextEncoder().encode(`id:${id};request-id:${reqId};ts:${ts};`));
  return [...new Uint8Array(f)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const db = () => { const q = []; return { q, prepare: (s) => ({ run: async () => q.push([s]), bind: (...v) => ({ run: async () => q.push([s, v]) }) }) }; };

test("firma de Mercado Pago: válida, alterada y vencida", async () => {
  const ts = Math.floor(Date.now() / 1000), url = new URL("https://admin.dominusosint.com/cuenta/mercadopago/aviso?data.id=ABC123&type=subscription_preapproval");
  const v1 = await firmar("abc123", "req-1", ts);
  const req = (firma) => new Request(url, { method: "POST", headers: { "x-signature": firma, "x-request-id": "req-1" } });
  assert.equal(await firmaValida(req(`ts=${ts},v1=${v1}`), url, SECRETO), true);
  assert.equal(await firmaValida(req(`ts=${ts},v1=${"0".repeat(64)}`), url, SECRETO), false);
  assert.equal(await firmaValida(req(`ts=${ts - 3600},v1=${await firmar("abc123", "req-1", ts - 3600)}`), url, SECRETO), false, "aviso viejo: se rechaza");
  assert.equal(await firmaValida(req("basura"), url, SECRETO), false);
});

test("el plan se deduce del nombre del plan de Mercado Pago", () => {
  assert.equal(planDeSuscripcion({ reason: "DOMINUS OSINT · Recon" }), "recon");
  assert.equal(planDeSuscripcion({ reason: "dominus analyst mensual" }), "analyst");
  assert.equal(planDeSuscripcion({ reason: "Plan Command" }), "command");
  assert.equal(planDeSuscripcion({ reason: "Otro producto" }), null);
});

test("alta con autorizada, baja con cancelada, nada sin correo", async () => {
  const d = db();
  const alta = await aplicarSuscripcion(d, { status: "authorized", payer_email: "Cliente@Ejemplo.com", reason: "DOMINUS · Analyst", next_payment_date: "2026-12-20T00:00:00Z" });
  assert.deepEqual([alta.estado, alta.email, alta.plan], ["activado", "cliente@ejemplo.com", "analyst"]);
  assert.match(d.q[0][0], /ON CONFLICT\(email\) DO UPDATE/);
  assert.deepEqual(d.q[0][1].slice(0, 2), ["cliente@ejemplo.com", "analyst"], "valores como parámetros");
  const baja = await aplicarSuscripcion(d, { status: "cancelled", payer_email: "cliente@ejemplo.com", reason: "DOMINUS · Analyst" });
  assert.equal(baja.estado, "cancelado");
  assert.equal((await aplicarSuscripcion(d, { status: "authorized", payer_email: "", reason: "Recon" })).estado, "sin-correo");
});

test("el aviso sin firma válida se rechaza sin tocar la base", async () => {
  const d = db(), url = new URL("https://admin.dominusosint.com/cuenta/mercadopago/aviso?data.id=1");
  const r = await avisoMercadoPago(new Request(url, { method: "POST", body: "{}" }), url, { MP_ACCESS_TOKEN: "x", MP_WEBHOOK_SECRET: SECRETO, OSINT_PLANS_DB: d }, "CREATE");
  assert.equal(r.status, 401);
  assert.equal(d.q.length, 0);
  assert.equal((await avisoMercadoPago(new Request(url, { method: "POST" }), url, {}, "CREATE")).status, 503, "sin secretos: no disponible");
});
