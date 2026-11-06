// OAuth identifica la cuenta. El permiso se comprueba localmente por ID numérico de GitHub.
const STATE = "__Host-dominus-huella-oauth";
const SESSION = "__Host-dominus-huella";
const PLAN_SESSION = "__Host-dominus-planes";
const TTL = 3600;
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
  return url.protocol === "https:" && url.origin === env.OSINT_ORIGIN &&
    Boolean(env.OSINT_GITHUB_CLIENT_ID?.trim() && env.OSINT_GITHUB_CLIENT_SECRET?.trim() &&
      env.OSINT_SESSION_SECRET?.length >= 32 && admins(env).length);
}

export async function sessionId(request, env, mode = "admin") {
  const value = read(request, mode === "planes" ? PLAN_SESSION : SESSION);
  if (!value || !/^[1-9][0-9]{0,19}\.[0-9]{1,12}\.[A-Za-z0-9_-]{43}$/.test(value)) return null;
  const [id, expires, signature] = value.split(".");
  const current = now();
  if (+expires <= current || +expires > current + TTL) return null;
  const bytes = Uint8Array.from(atob(signature.replaceAll("-", "+").replaceAll("_", "/") + "="), char => char.charCodeAt(0));
  const payload = mode === "planes" ? `planes.${id}.${expires}` : `${id}.${expires}`;
  return await crypto.subtle.verify("HMAC", await key(env), bytes, UTF8.encode(payload)) ? id : null;
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

  try {
    const token = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "User-Agent": "DOMINUS-Huella" },
      body: new URLSearchParams({
        client_id: env.OSINT_GITHUB_CLIENT_ID.trim(), client_secret: env.OSINT_GITHUB_CLIENT_SECRET.trim(),
        code, redirect_uri: callback(url, root), code_verifier: verifier
      }),
      redirect: "error", signal: AbortSignal.timeout(6500)
    });
    const credentials = await token.json();
    if (credentials?.error === "incorrect_client_credentials") return deny("credenciales-oauth");
    if (credentials?.error === "redirect_uri_mismatch") return deny("retorno-oauth");
    if (credentials?.error === "bad_verification_code") return deny("codigo-rechazado");
    if (credentials?.error === "unverified_user_email") return deny("correo-sin-verificar");
    if (!token.ok || typeof credentials?.access_token !== "string" || !credentials.access_token) return deny("intercambio-github");
    const user = await fetch("https://api.github.com/user", {
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${credentials.access_token}`, "User-Agent": "DOMINUS-Huella" },
      redirect: "error", signal: AbortSignal.timeout(6500)
    });
    if (!user.ok) return deny("identidad-github");
    const { id, type } = await user.json();
    if (type !== "User" || !Number.isSafeInteger(id)) return deny("identidad-github");
    const allowed = mode === "planes" ? await activePlan?.(String(id)) : admins(env).includes(String(id));
    if (!allowed) return deny("sin-acceso");
    const payload = `${id}.${now() + TTL}`;
    const signature = await crypto.subtle.sign("HMAC", await key(env), UTF8.encode(mode === "planes" ? "planes." + payload : payload));
    return redirect(destination, [cleared, cookie(mode === "planes" ? PLAN_SESSION : SESSION, `${payload}.${b64url(signature)}`, TTL)]);
  } catch {
    return deny("ingreso-no-disponible");
  }
}

export function signOut(mode = "admin") {
  return new Response(null, { status: 204, headers: { ...headers, "Set-Cookie": cookie(mode === "planes" ? PLAN_SESSION : SESSION, "", 0) } });
}
