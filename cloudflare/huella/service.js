import { adminMap } from "./admin-map.js";
import { authorized, begin, complete, configured, signOut } from "./auth.js";

import { activePlan, servePlans } from "../planes/service.js";

const ROOT = "/admin/huella/";
const HEADERS = {
  "Cache-Control": "private, no-store",
  "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff"
};

function json(value, status = 200) {
  return Response.json(value, { status, headers: HEADERS });
}

function dnsUrl(name, type) {
  const query = new URLSearchParams({ name, type, edns_client_subnet: "0.0.0.0/0" });
  return `https://dns.google/resolve?${query}`;
}

async function upstream(url, accept = "application/json") {
  const response = await fetch(url, {
    headers: { Accept: accept, "User-Agent": "DOMINUS-Huella" },
    redirect: "error",
    signal: AbortSignal.timeout(6500)
  });
  if (response.status === 429 || (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0")) {
    return { status: "limitado" };
  }
  if (response.status === 404) return { status: "sin_resultado" };
  if (!response.ok) return { status: "indeterminado" };
  return { data: await response.json() };
}

async function dns(name, type, select) {
  const { data, status } = await upstream(dnsUrl(name, type));
  if (status) return { status: status === "sin_resultado" ? "indeterminado" : status };
  if (data.Status === 3) return { status: "sin_resultado", detail: "Nombre DNS inexistente" };
  if (data.Status !== 0 || data.TC) return { status: "indeterminado" };
  const records = (data.Answer || []).filter(r => r.type === type && typeof r.data === "string")
    .map(r => r.data).filter(select).slice(0, 12);
  const detail = type === 15 && records.length === 1 && records[0] === "0 ."
    ? "Null MX: el dominio declara que no acepta correo." : undefined;
  return { status: records.length ? "verificado" : "sin_resultado", records, detail };
}

async function alias(source, id) {
  const safe = encodeURIComponent(id);
  if (source === "github") {
    const { data, status } = await upstream(`https://api.github.com/users/${safe}`);
    if (status) return { status };
    if (data.login?.toLowerCase() !== id.toLowerCase()) return { status: "indeterminado" };
    return {
      status: "verificado", url: `https://github.com/${encodeURIComponent(data.login)}`,
      detail: data.type === "Organization" ? "Organización" : "Cuenta pública",
      since: data.created_at, name: data.name
    };
  }

  if (source === "dev") {
    const { data, status } = await upstream(`https://dev.to/api/users/by_username?url=${safe}`, "application/vnd.forem.api-v1+json");
    if (status) return { status };
    if (data.username?.toLowerCase() !== id.toLowerCase()) return { status: "indeterminado" };
    return { status: "verificado", url: `https://dev.to/${encodeURIComponent(data.username)}`, detail: "Cuenta pública", name: data.name };
  }

  const { data, status } = await upstream(`https://hacker-news.firebaseio.com/v0/user/${safe}.json`);
  if (status) return { status };
  if (data === null) return { status: "sin_resultado" };
  if (data.id !== id) return { status: "indeterminado" };
  return {
    status: "verificado", url: `https://news.ycombinator.com/user?id=${safe}`,
    detail: "Cuenta pública", since: Number.isFinite(data.created) ? new Date(data.created * 1000).toISOString() : undefined
  };
}

async function incidentesDominio(domain) {
  const { data, status } = await upstream("https://haveibeenpwned.com/api/v3/breaches?" + new URLSearchParams({ Domain: domain }));
  if (status || !Array.isArray(data)) return { status: status === "limitado" ? status : "indeterminado" };
  const exact = data.filter(item => item?.Domain?.toLowerCase() === domain && typeof item.Title === "string");
  const incidents = exact.sort((a, b) => String(b.BreachDate).localeCompare(String(a.BreachDate)))
    .slice(0, 12).map(({ Title, BreachDate, DataClasses, IsVerified }) => ({
      title: Title, date: BreachDate, verified: IsVerified === true,
      classes: Array.isArray(DataClasses) ? DataClasses.filter(item => typeof item === "string").slice(0, 12) : []
    }));
  return {
    status: exact.length ? "encontrado" : "sin_resultado", incidents,
    detail: "Incidentes de este sitio en el catálogo público. El resultado se refiere al dominio, no a una dirección de correo.",
    count: exact.length
  };
}

async function inspect({ domain, username }) {
  const checks = [];
  if (domain) {
    checks.push(
      ["MX", () => dns(domain, 15, () => true)],
      ["SPF", () => dns(domain, 16, r => /^"?v=spf1(?:\s|")/i.test(r))],
      ["DMARC", () => dns(`_dmarc.${domain}`, 16, r => /^"?v=dmarc1(?:;|")/i.test(r))],
      ["Have I Been Pwned · incidentes del sitio", () => incidentesDominio(domain)]
    );
  }
  if (username) checks.push(
    ["GitHub", () => alias("github", username)],
    ["Hacker News", () => alias("hn", username)],
    ["DEV Community", () => alias("dev", username)]
  );
  const results = await Promise.all(checks.map(async ([source, run]) => {
    try { return { source, ...await run() }; }
    catch { return { source, status: "indeterminado" }; }
  }));
  return { checkedAt: new Date().toISOString(), results };
}

async function readQuery(request) {
  // Lee hasta 1 KiB también cuando el cliente omite Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return null;
  const bytes = new Uint8Array(1024);
  let offset = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (offset + value.length > bytes.length) { await reader.cancel(); return null; }
    bytes.set(value, offset);
    offset += value.length;
  }
  const input = JSON.parse(new TextDecoder().decode(bytes.subarray(0, offset)));
  if (!input || typeof input !== "object") return null;
  const domain = typeof input.domain === "string" ? input.domain.trim().toLowerCase() : "";
  const username = typeof input.username === "string" ? input.username.trim().replace(/^@/, "") : "";
  if (!domain && !username) return null;
  if (domain && (domain.length > 253 || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(domain))) return null;
  if (username && !/^[a-z0-9][a-z0-9_-]{0,38}$/i.test(username)) return null;
  return { domain, username };
}

const LOGIN_MESSAGES = new Map([
  ["sin-acceso", "La cuenta de GitHub elegida no tiene acceso de administrador. Elige la cuenta autorizada al volver a iniciar sesión."],
  ["intento-vencido", "El intento de ingreso venció o perdió su sesión. Pulsa Continuar con GitHub y completa el proceso en esta pestaña."],
  ["autorizacion-cancelada", "La autorización de GitHub se canceló. Puedes iniciar el proceso de nuevo."],
  ["codigo-rechazado", "GitHub rechazó el código de ingreso o este ya no es válido. Inicia un intento nuevo."],
  ["credenciales-oauth", "GitHub rechazó las credenciales de la OAuth App. Se debe comprobar el Client ID y el Client Secret configurados en Huella."],
  ["retorno-oauth", "GitHub rechazó la URL de retorno. Comprueba la Redirect URI en la configuración de la OAuth App."],
  ["correo-sin-verificar", "GitHub pide verificar el correo de la cuenta antes de autorizar el acceso."],
  ["intercambio-github", "GitHub no pudo completar el intercambio de autorización. Inténtalo de nuevo."],
  ["github-tiempo", "GitHub no respondió a tiempo al confirmar el ingreso. Inicia otro intento."],
  ["github-conexion", "Huella no pudo conectar con el servicio de autorización de GitHub."],
  ["github-respuesta-invalida", "El servicio de autorización de GitHub devolvió una respuesta inesperada."],
  ["identidad-github", "Huella no pudo verificar la cuenta con GitHub. Inténtalo de nuevo."],
  ["ingreso-no-disponible", "No se pudo completar el ingreso en este momento. Inténtalo de nuevo."]
]);

export async function serve(request, env, assets) {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/cuenta/")) return servePlans(request, url, env, ROOT);
  if (!url.pathname.startsWith(ROOT)) return await adminMap(request, url, env) || json({ error: "Ruta inexistente" }, 404);
  if (!configured(url, env)) return json({ error: "Ingreso administrativo sin configurar." }, 503);
  const route = url.pathname.slice(ROOT.length);
  if (request.method === "GET") {
    if (route === "oauth/inicio") return begin(url, env, ROOT);
    if (route === "oauth/callback") return complete(request, url, env, ROOT, (id) => activePlan(env.OSINT_PLANS_DB, id));
    if (route === "ingreso" || route === "huella.css") {
      const [body, type] = assets.get(route);
      const reason = route === "ingreso" && LOGIN_MESSAGES.get(url.searchParams.get("estado"));
      const message = reason ? `<p role="alert">${reason}</p>` : "";
      return new Response(route === "ingreso" ? body.replace("<h1>Ingreso administrativo</h1>", "<h1>Ingreso administrativo</h1>" + message) : body,
        { headers: { ...HEADERS, "Content-Type": type } });
    }
  }
  if (!await authorized(request, env)) {
    if (route === "" && request.method === "GET") return new Response(null, {
      status: 303, headers: { ...HEADERS, Location: ROOT + "ingreso" }
    });
    return json({ error: "Acceso reservado a administradores." }, 403);
  }
  if (route === "salir" && request.method === "POST" && request.headers.get("Origin") === url.origin) return signOut();
  if (route === "sesion" && request.method === "GET") {
    return new Response(null, { status: 204, headers: { ...HEADERS, "X-Dominus-Huella": "admin" } });
  }
  if (route === "consulta" && request.method === "POST") {
    if (request.headers.get("Origin") !== url.origin ||
        request.headers.get("Content-Type")?.split(";")[0] !== "application/json") {
      return json({ error: "Origen o formato de solicitud inválido." }, 403);
    }
    const query = await readQuery(request).catch(() => null);
    if (!query) return json({ error: "Indica un dominio o alias válido." }, 400);
    return json(await inspect(query));
  }
  const asset = assets.get(route);
  if (asset && request.method === "GET") {
    const [body, type] = asset;
    return new Response(body, { headers: { ...HEADERS, "Content-Type": type } });
  }
  return json({ error: "Ruta inexistente" }, 404);
}
