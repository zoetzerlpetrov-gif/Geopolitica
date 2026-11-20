import test from "node:test";
import assert from "node:assert/strict";
import { completarGoogle, correoSesion, iniciarGoogle, planPorCorreo, SESSION_G } from "../../cloudflare/planes/google.js";

const env = { GOOGLE_CLIENT_ID: "cliente", GOOGLE_CLIENT_SECRET: "secreto", OSINT_SESSION_SECRET: "x".repeat(40) };
const ORDER = ["demo", "recon", "analyst", "command"];

test("Google: inicio con PKCE, solo «openid email» y retorno a /cuenta/google/callback", async () => {
  const r = await iniciarGoogle(new URL("https://w.example.workers.dev/cuenta/google"), env);
  const destino = new URL(r.headers.get("Location"));
  assert.equal(destino.origin, "https://accounts.google.com");
  assert.equal(destino.searchParams.get("scope"), "openid email");
  assert.equal(destino.searchParams.get("redirect_uri"), "https://w.example.workers.dev/cuenta/google/callback");
  assert.equal(destino.searchParams.get("code_challenge_method"), "S256");
});

test("Google: callback con correo verificado y plan vigente crea una sesión firmada; sin plan se niega", async (t) => {
  const url = new URL("https://w.example.workers.dev/cuenta/google");
  const ini = await iniciarGoogle(url, env);
  const estado = ini.headers.getSetCookie()[0].split(";")[0];
  const state = new URL(ini.headers.get("Location")).searchParams.get("state");
  t.mock.method(globalThis, "fetch", async (u) => {
    if (String(u).includes("oauth2.googleapis.com/token")) return Response.json({ access_token: "a" });
    return Response.json({ email: "Cliente@Ejemplo.com", email_verified: true });
  });
  const cb = new URL(`https://w.example.workers.dev/cuenta/google/callback?code=c&state=${state}`);
  const ok = await completarGoogle(new Request(cb, { headers: { Cookie: estado } }), cb, env, async (m) => (m === "cliente@ejemplo.com" ? "command" : null));
  const ses = ok.headers.getSetCookie().find((c) => c.startsWith(SESSION_G + "=")).split(";")[0];
  assert.equal(await correoSesion(new Request(cb, { headers: { Cookie: ses } }), env), "cliente@ejemplo.com");
  const no = await completarGoogle(new Request(cb, { headers: { Cookie: estado } }), cb, env, async () => null);
  assert.equal(no.headers.get("Location"), "/cuenta/?estado=sin-acceso");
  const alterada = ses.replace(/\.[^.]+$/, ".AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  assert.equal(await correoSesion(new Request(cb, { headers: { Cookie: alterada } }), env), null);
});

test("planPorCorreo crea la tabla y consulta en minúsculas", async () => {
  const sql = [];
  const db = { prepare(q) { sql.push(q); return { run: async () => ({}), bind: (m) => ({ first: async () => (m === "a@b.co" ? { plan: "analyst" } : null) }) }; } };
  assert.equal(await planPorCorreo(db, "A@B.co", ORDER), "analyst");
  assert.match(sql[0], /^CREATE TABLE IF NOT EXISTS dominus_memberships_email/);
  assert.equal(await planPorCorreo(db, null, ORDER), null);
});

test("Registro gratuito: entrar con Google sin plan registra el correo (Demo) con consulta parametrizada", async () => {
  const { registrar, registrado } = await import("../../cloudflare/planes/google.js");
  const sql = [], filas = new Set();
  const db = { prepare(q) { sql.push(q); return { run: async () => ({}), bind: (...v) => ({ run: async () => { filas.add(v[0]); return {}; }, first: async () => (filas.has(v[0]) ? { si: 1 } : null) }) }; } };
  assert.equal(await registrar(db, "Nuevo@Ejemplo.com"), true);
  assert.equal(await registrado(db, "nuevo@ejemplo.com"), true);
  assert.equal(await registrado(db, "otro@ejemplo.com"), false);
  assert.equal(await registrar(db, "x'); DROP TABLE dominus_registros;--"), false, "correo inválido: no se intenta");
  assert.ok(sql.every((q) => !/nuevo@|otro@|DROP/i.test(q)), "el correo nunca va dentro del SQL");
  assert.ok(sql.some((q) => q.includes("INSERT OR IGNORE INTO dominus_registros (email) VALUES (?)")));
});
