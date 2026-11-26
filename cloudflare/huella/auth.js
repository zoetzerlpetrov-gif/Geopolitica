// DESTINOS_FIJOS: este módulo solo llama a github.com/login/oauth/access_token y api.github.com/user (URLs literales); no sigue redirecciones.
// OAuth identifica la cuenta. El permiso se comprueba localmente por ID numérico de GitHub.
const STATE = "__Host-dominus-huella-oauth";
const SESSION = "__Host-dominus-huella";
const PLAN_SESSION = "__Host-dominus-planes";
// Sesión: se cierra tras TTL segundos sin usarse (cada petición la renueva) y nunca dura más de MAX_SESION desde el
// ingreso, aunque se siga usando. La cookie lleva id.vence.inicio.firma (HMAC de los tres primeros).
const TTL = 3600;
export const MAX_SESION = 12 * 3600;
const RENOVAR_SI_QUEDAN = TTL - 300;  // renueva como mucho cada 5 min para no reenviar la cookie en cada petición
const OAUTH_TTL = 600;
const UTF8 = new TextEncoder();
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const now = () => Math.floor(Date.now() / 1000);
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const random = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
const cookie = (name, value, age) => `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
const read = (request, name) => (request.headers.get("Cookie") || "").split(";")
  .map(item => item.trim()).find(item => item.startsWith(`${name}=`))?.slice(name.length + 1);
const key = (env) => crypto.subtle.importKey("raw", UTF8.encode(env.OSINT_SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

function admins(env) {
  return (env.OSINT_ADMIN_GITHUB_IDS || "").split(",").map(id => id.trim()).filter(id => /^[1-9][0-9]{0,19}$/.test(id));
}

export function configured(url, env) {
  // OSINT_ORIGIN admite varias direcciones separadas por comas (p. ej. https://admin.dominusosint.com y la de workers.dev).
  const origenes = String(env.OSINT_ORIGIN || "").split(",").map((o) => o.trim()).filter(Boolean);
  return url.protocol === "https:" && origenes.includes(url.origin) &&
    Boolean(env.OSINT_GITHUB_CLIENT_ID?.trim() && env.OSINT_GITHUB_CLIENT_SECRET?.trim() &&
      env.OSINT_SESSION_SECRET?.length >= 32 && admins(env).length);
}

/** Lee y verifica la cookie de sesión; devuelve { id, vence, inicio } o null. */
async function leerSesion(request, env, mode = "admin") {
  const value = read(request, mode === "planes" ? PLAN_SESSION : SESSION);
  if (!value || !/^[1-9][0-9]{0,19}\.[0-9]{1,12}\.[0-9]{1,12}\.[A-Za-z0-9_-]{43}$/.test(value)) return null;
  const [id, vence, inicio, signature] = value.split(".");
  const current = now();
  if (+vence <= current || +vence > current + TTL || +inicio > current || +vence > +inicio + MAX_SESION) return null;
  const bytes = Uint8Array.from(atob(signature.replaceAll("-", "+").replaceAll("_", "/") + "="), char => char.charCodeAt(0));
  const payload = (mode === "planes" ? "planes." : "") + `${id}.${vence}.${inicio}`;
  return await crypto.subtle.verify("HMAC", await key(env), bytes, UTF8.encode(payload)) ? { id, vence: +vence, inicio: +inicio } : null;
}

/** Cookie de sesión firmada para `id`, con vencimiento por inactividad y el tope desde `inicio`. */
async function cookieSesion(env, id, inicio, mode = "admin") {
  const vence = Math.min(now() + TTL, inicio + MAX_SESION);
  const payload = `${id}.${vence}.${inicio}`;
  const signature = await crypto.subtle.sign("HMAC", await key(env), UTF8.encode((mode === "planes" ? "planes." : "") + payload));
  return cookie(mode === "planes" ? PLAN_SESSION : SESSION, `${payload}.${b64url(signature)}`, vence - now());
}

export async function sessionId(request, env, mode = "admin") {
  return (await leerSesion(request, env, mode))?.id ?? null;
}

/** Set-Cookie que extiende una sesión válida (ventana de inactividad de TTL, sin pasar del tope), o null si no toca. */
export async function renovar(request, env, mode = "admin") {
  try {
    const s = await leerSesion(request, env, mode);
    if (!s || s.vence - now() > RENOVAR_SI_QUEDAN || s.vence >= s.inicio + MAX_SESION) return null;
    return await cookieSesion(env, s.id, s.inicio, mode);
  } catch {
    return null;
  }
}

export async function authorized(request, env) {
  return admins(env).includes(await sessionId(request, env));
}

function redirect(location, cookies = []) {
  const response = new Response(null, { status: 303, headers: { ...headers, Location: location } });
  for (const value of cookies) response.headers.append("Set-Cookie", value);
  return response;
}

const callback = (url, root) => `${url.origin}${root}oauth/callback`;

export async function begin(url, env, root, mode = "admin") {
  const state = random();
  const verifier = random();
  const challenge = b64url(await crypto.subtle.digest("SHA-256", UTF8.encode(verifier)));
  const params = new URLSearchParams({
    client_id: env.OSINT_GITHUB_CLIENT_ID.trim(), redirect_uri: callback(url, root), state,
    prompt: "select_account",
    code_challenge: challenge, code_challenge_method: "S256"
  });
  return redirect(`https://github.com/login/oauth/authorize?${params}`, [
    cookie(STATE, `${state}.${verifier}.${now() + OAUTH_TTL}.${mode}`, OAUTH_TTL)
  ]);
}

export async function complete(request, url, env, root, activePlan) {
  const cleared = cookie(STATE, "", 0);
  const stored = read(request, STATE);
  const mode = stored?.endsWith(".planes") ? "planes" : "admin";
  const destination = mode === "planes" ? "/cuenta/" : root;
  const deny = (reason) => redirect(
    `${destination}${mode === "planes" ? "?estado=sin-acceso" : "ingreso?estado=" + reason}`, [cleared]);
  if (!stored || !/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}\.[0-9]{1,12}\.(?:admin|planes)$/.test(stored)) return deny("intento-vencido");
  const [state, verifier, expires] = stored.split(".");
  const code = url.searchParams.get("code");
  if (url.searchParams.get("state") !== state || +expires <= now()) return deny("intento-vencido");
  if (url.searchParams.get("error") === "access_denied") return deny("autorizacion-cancelada");
  if (!code || code.length > 512) return deny("codigo-rechazado");

  const form = new URLSearchParams({
    client_id: env.OSINT_GITHUB_CLIENT_ID.trim(), client_secret: env.OSINT_GITHUB_CLIENT_SECRET.trim(),
    code, redirect_uri: callback(url, root), code_verifier: verifier
  });
  let token;
  try {
    token = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "DOMINUS-Huella" },
      body: form.toString(),
      redirect: "manual", signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    return deny(error?.name === "TimeoutError" ? "github-tiempo" : "github-conexion");
  }
  const credentials = await token.json().catch(() => null);
  if (credentials?.error === "incorrect_client_credentials") return deny("credenciales-oauth");
  if (credentials?.error === "redirect_uri_mismatch") return deny("retorno-oauth");
  if (credentials?.error === "bad_verification_code") return deny("codigo-rechazado");
  if (credentials?.error === "unverified_user_email") return deny("correo-sin-verificar");
  if (!credentials) return deny("github-respuesta-invalida");
  if (!token.ok || typeof credentials.access_token !== "string" || !credentials.access_token) return deny("intercambio-github");

  let profile;
  try {
    const user = await fetch("https://api.github.com/user", {
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${credentials.access_token}`, "User-Agent": "DOMINUS-Huella" },
      redirect: "manual", signal: AbortSignal.timeout(15000)
    });
    if (!user.ok) return deny("identidad-github");
    profile = await user.json();
  } catch {
    return deny("identidad-github");
  }
  const { id, type } = profile || {};
  if (type !== "User" || !Number.isSafeInteger(id) || id <= 0) return deny("identidad-github");
  try {
    const allowed = mode === "planes" ? await activePlan?.(String(id)) : admins(env).includes(String(id));
    if (!allowed) return deny("sin-acceso");
    return redirect(destination, [cleared, await cookieSesion(env, String(id), now(), mode)]);
  } catch {
    return deny("sesion-no-disponible");
  }
}

export function signOut(mode = "admin") {
  return new Response(null, { status: 204, headers: { ...headers, "Set-Cookie": cookie(mode === "planes" ? PLAN_SESSION : SESSION, "", 0) } });
}

/** Mientras se usa, la sesión (Admin o plan) se extiende: se cierra tras 1 h sin uso y a las 12 h del ingreso. */
export async function conSesionRenovada(request, env, respuesta, renovarCliente = null) {
  const puestas = respuesta.headers.getSetCookie?.() || [];
  const nuevas = [];
  for (const [modo, nombre] of [["admin", "__Host-dominus-huella="], ["planes", "__Host-dominus-planes="]]) {
    if (puestas.some((c) => c.startsWith(nombre))) continue;  // ingreso o salida: ya trae su propia cookie
    const c = await renovar(request, env, modo);
    if (c) nuevas.push(c);
  }
  // Sesión de cliente por correo (Google o cuenta propia de DOMINUS): también se extiende con el uso.
  if (renovarCliente && !puestas.some((c) => c.startsWith("__Host-dominus-planes-g="))) {
    const c = await renovarCliente(request, env);
    if (c) nuevas.push(c);
  }
  if (!nuevas.length) return respuesta;
  const r = new Response(respuesta.body, respuesta);
  for (const c of nuevas) r.headers.append("Set-Cookie", c);
  return r;
}
