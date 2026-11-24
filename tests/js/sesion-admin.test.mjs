// Sesión de Admin: se renueva con el uso (1 h sin uso la cierra) y nunca pasa de 12 h desde el ingreso.
import test from "node:test";
import assert from "node:assert/strict";
import { renovar, sessionId, MAX_SESION } from "../../cloudflare/huella/auth.js";
import { conSesionRenovada } from "../../cloudflare/huella/auth.js";

const env = { OSINT_SESSION_SECRET: "x".repeat(40), OSINT_ADMIN_GITHUB_IDS: "123" };
const ahora = () => Math.floor(Date.now() / 1000);
const b64url = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
async function galleta(id, vence, inicio, modo = "admin") {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.OSINT_SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const payload = `${id}.${vence}.${inicio}`;
  const firma = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode((modo === "planes" ? "planes." : "") + payload));
  return `${modo === "planes" ? "__Host-dominus-planes" : "__Host-dominus-huella"}=${payload}.${b64url(firma)}`;
}
const pedir = (c) => new Request("https://admin.dominusosint.com/economia.html", { headers: { Cookie: c } });

test("una sesión usada se extiende otra hora", async () => {
  const c = await galleta(123, ahora() + 600, ahora() - 3000);
  assert.equal(await sessionId(pedir(c), env), "123");
  const nueva = await renovar(pedir(c), env);
  assert.match(nueva, /^__Host-dominus-huella=123\.\d+\.\d+\..+Max-Age=(3600|3599)$/);
});

test("recién renovada no se vuelve a enviar en cada petición", async () => {
  assert.equal(await renovar(pedir(await galleta(123, ahora() + 3500, ahora() - 100)), env), null);
});

test("nunca pasa de 12 h desde el ingreso", async () => {
  const inicio = ahora() - MAX_SESION + 1200;  // faltan 20 min para el tope
  const nueva = await renovar(pedir(await galleta(123, ahora() + 300, inicio)), env);
  const vence = Number(nueva.split("=")[1].split(".")[1]);
  assert.equal(vence, inicio + MAX_SESION);
  assert.equal(await sessionId(pedir(await galleta(123, ahora() + 600, ahora() - MAX_SESION)), env), null);
});

test("vencida o alterada no se renueva", async () => {
  assert.equal(await renovar(pedir(await galleta(123, ahora() - 1, ahora() - 4000)), env), null);
  const c = (await galleta(123, ahora() + 600, ahora() - 3000)).replace(/\.(\d)/, (_, d) => "." + (d === "1" ? "2" : "1"));
  assert.equal(await renovar(pedir(c), env), null);
});

test("el Worker agrega la renovación sin pisar la cookie de ingreso o salida", async () => {
  const c = await galleta(123, ahora() + 600, ahora() - 3000);
  const r = await conSesionRenovada(pedir(c), env, new Response("ok"));
  assert.ok(r.headers.getSetCookie().some((x) => x.startsWith("__Host-dominus-huella=123.")));
  const salida = new Response(null, { headers: { "Set-Cookie": "__Host-dominus-huella=; Path=/; Max-Age=0" } });
  const r2 = await conSesionRenovada(pedir(c), env, salida);
  assert.deepEqual(r2.headers.getSetCookie(), ["__Host-dominus-huella=; Path=/; Max-Age=0"]);
});
