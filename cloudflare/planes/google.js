// Inicio de sesión con Google para los planes de clientes (/cuenta/). Solo pide «openid email» (permisos básicos, sin
// verificación especial de Google). El plan se busca por el correo verificado en D1 (dominus_memberships_email).
// Secretos del Worker: GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET (ID de cliente web de Google Cloud) y OSINT_SESSION_SECRET.
// Redirección autorizada en Google: <origen del Worker>/cuenta/google/callback
const STATE = "__Host-dominus-google-oauth";
export const SESSION_G = "__Host-dominus-planes-g";
const TTL = 3600, OAUTH_TTL = 600;
const UTF8 = new TextEncoder();
const now = () => Math.floor(Date.now() / 1000);
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const desdeB64 = (t) => Uint8Array.from(atob(t.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((t.length + 3) % 4)), (c) => c.charCodeAt(0));
const random = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
const cookie = (name, value, age) => `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
const read = (request, name) => (request.headers.get("Cookie") || "").split(";").map((x) => x.trim()).find((x) => x.startsWith(`${name}=`))?.slice(name.length + 1);
const key = (env) => crypto.subtle.importKey("raw", UTF8.encode(env.OSINT_SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const redirect = (location, cookies = []) => {
  const r = new Response(null, { status: 303, headers: { ...headers, Location: location } });
  for (const c of cookies) r.headers.append("Set-Cookie", c);
  return r;
};
const CORREO = /^[^\s@<>"']{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;

export const TABLA_EMAIL = "CREATE TABLE IF NOT EXISTS dominus_memberships_email (email TEXT PRIMARY KEY NOT NULL CHECK (length(email) BETWEEN 3 AND 254 AND email = lower(email) AND email LIKE '%_@_%._%'), plan TEXT NOT NULL CHECK (plan IN ('recon', 'analyst', 'command')), active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)), expires_at INTEGER CHECK (expires_at IS NULL OR expires_at > 0), updated_at INTEGER NOT NULL DEFAULT (unixepoch())) STRICT";
let tablaLista = false;

export const googleConfigurado = (env) => Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim() && env.OSINT_SESSION_SECRET?.length >= 32);

/** Plan vigente de un correo (o null). */
export async function planPorCorreo(db, email, orden) {
  if (!db || !email) return null;
  if (!tablaLista) { await db.prepare(TABLA_EMAIL).run(); tablaLista = true; }
  const row = await db.prepare("SELECT plan FROM dominus_memberships_email WHERE email = ? AND active = 1 AND (expires_at IS NULL OR expires_at > unixepoch())")
    .bind(String(email).toLowerCase()).first();
  return orden.indexOf(row?.plan) > 0 ? row.plan : null;
}

/** Correo de la sesión de Google (cookie firmada) o null. */
export async function correoSesion(request, env) {
  const v = read(request, SESSION_G);
  if (!v || !/^[A-Za-z0-9_-]{4,400}\.[0-9]{1,12}\.[A-Za-z0-9_-]{43}$/.test(v)) return null;
  const [mail, exp, firma] = v.split(".");
  if (+exp <= now() || +exp > now() + TTL) return null;
  const ok = await crypto.subtle.verify("HMAC", await key(env), desdeB64(firma), UTF8.encode(`google.${mail}.${exp}`));
  if (!ok) return null;
  const email = new TextDecoder().decode(desdeB64(mail));
  return CORREO.test(email) ? email : null;
}

const retorno = (url) => `${url.origin}/cuenta/google/callback`;

export async function iniciarGoogle(url, env) {
  const state = random(), verifier = random();
  const challenge = b64url(await crypto.subtle.digest("SHA-256", UTF8.encode(verifier)));
  const p = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID.trim(), redirect_uri: retorno(url), response_type: "code", scope: "openid email",
    state, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account" });
  return redirect(`https://accounts.google.com/o/oauth2/v2/auth?${p}`, [cookie(STATE, `${state}.${verifier}.${now() + OAUTH_TTL}`, OAUTH_TTL)]);
}

export async function completarGoogle(request, url, env, planDe) {
  const limpiar = cookie(STATE, "", 0);
  const negar = () => redirect("/cuenta/?estado=sin-acceso", [limpiar]);
  const guardado = read(request, STATE);
  if (!guardado || !/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}\.[0-9]{1,12}$/.test(guardado)) return negar();
  const [state, verifier, exp] = guardado.split(".");
  const code = url.searchParams.get("code");
  if (url.searchParams.get("state") !== state || +exp <= now() || !code || code.length > 2048) return negar();
  let token;
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID.trim(), client_secret: env.GOOGLE_CLIENT_SECRET.trim(), code, code_verifier: verifier,
        grant_type: "authorization_code", redirect_uri: retorno(url) }).toString(), redirect: "manual", signal: AbortSignal.timeout(15000) });
    token = r.ok ? await r.json() : null;
  } catch { return negar(); }
  if (typeof token?.access_token !== "string") return negar();
  let perfil;
  try {
    const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` }, redirect: "manual", signal: AbortSignal.timeout(15000) });
    perfil = r.ok ? await r.json() : null;
  } catch { return negar(); }
  const email = String(perfil?.email || "").toLowerCase();
  if (perfil?.email_verified !== true || !CORREO.test(email)) return negar();
  try {
    if (!await planDe(email)) return negar();
    const mail = b64url(UTF8.encode(email)), vence = now() + TTL;
    const firma = await crypto.subtle.sign("HMAC", await key(env), UTF8.encode(`google.${mail}.${vence}`));
    return redirect("/cuenta/", [limpiar, cookie(SESSION_G, `${mail}.${vence}.${b64url(firma)}`, TTL)]);
  } catch { return negar(); }
}

export const salirGoogle = () => cookie(SESSION_G, "", 0);
