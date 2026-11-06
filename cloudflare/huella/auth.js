// OAuth identifica la cuenta. El permiso se comprueba localmente por ID numérico de GitHub.
const STATE = "__Host-dominus-huella-oauth";
const SESSION = "__Host-dominus-huella";
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
    Boolean(env.OSINT_GITHUB_CLIENT_ID && env.OSINT_GITHUB_CLIENT_SECRET &&
      env.OSINT_SESSION_SECRET?.length >= 32 && admins(env).length);
}

export async function authorized(request, env) {
  const value = read(request, SESSION);
  if (!value || !/^[1-9][0-9]{0,19}\.[0-9]{1,12}\.[A-Za-z0-9_-]{43}$/.test(value)) return false;
  const [id, expires, signature] = value.split(".");
  if (+expires <= now() || +expires > now() + TTL || !admins(env).includes(id)) return false;
  const bytes = Uint8Array.from(atob(signature.replaceAll("-", "+").replaceAll("_", "/") + "="), char => char.charCodeAt(0));
  return crypto.subtle.verify("HMAC", await key(env), bytes, UTF8.encode(`${id}.${expires}`));
}

function redirect(location, cookies = []) {
  const response = new Response(null, { status: 303, headers: { ...headers, Location: location } });
  for (const value of cookies) response.headers.append("Set-Cookie", value);
  return response;
}

const callback = (url, root) => `${url.origin}${root}oauth/callback`;

export async function begin(url, env, root) {
  const state = random();
  const verifier = random();
  const challenge = b64url(await crypto.subtle.digest("SHA-256", UTF8.encode(verifier)));
  const params = new URLSearchParams({
    client_id: env.OSINT_GITHUB_CLIENT_ID, redirect_uri: callback(url, root), state,
    code_challenge: challenge, code_challenge_method: "S256"
  });
  return redirect(`https://github.com/login/oauth/authorize?${params}`, [
    cookie(STATE, `${state}.${verifier}.${now() + OAUTH_TTL}`, OAUTH_TTL)
  ]);
}

export async function complete(request, url, env, root) {
  const cleared = cookie(STATE, "", 0);
  const deny = () => redirect(`${root}ingreso?estado=sin-acceso`, [cleared]);
  const stored = read(request, STATE);
  if (!stored || !/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}\.[0-9]{1,12}$/.test(stored)) return deny();
  const [state, verifier, expires] = stored.split(".");
  const code = url.searchParams.get("code");
  if (url.searchParams.get("state") !== state || +expires <= now() || !code || code.length > 512) return deny();

  try {
    const token = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json" },
      body: new URLSearchParams({
        client_id: env.OSINT_GITHUB_CLIENT_ID, client_secret: env.OSINT_GITHUB_CLIENT_SECRET,
        code, redirect_uri: callback(url, root), code_verifier: verifier
      }),
      redirect: "error", signal: AbortSignal.timeout(6500)
    });
    if (!token.ok) return deny();
    const credentials = await token.json();
    if (typeof credentials.access_token !== "string" || !credentials.access_token) return deny();
    const user = await fetch("https://api.github.com/user", {
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${credentials.access_token}`, "User-Agent": "DOMINUS-Huella" },
      redirect: "error", signal: AbortSignal.timeout(6500)
    });
    if (!user.ok) return deny();
    const { id, type } = await user.json();
    if (type !== "User" || !Number.isSafeInteger(id) || !admins(env).includes(String(id))) return deny();
    const payload = `${id}.${now() + TTL}`;
    const signature = await crypto.subtle.sign("HMAC", await key(env), UTF8.encode(payload));
    return redirect(root, [cleared, cookie(SESSION, `${payload}.${b64url(signature)}`, TTL)]);
  } catch {
    return deny();
  }
}

export function signOut() {
  return new Response(null, { status: 204, headers: { ...headers, "Set-Cookie": cookie(SESSION, "", 0) } });
}
