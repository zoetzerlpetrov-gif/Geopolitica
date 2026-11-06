import { catalogInfo, inspectCatalog, readSignatureBody } from "./catalog.js";
import { adminMap } from "./admin-map.js";
import { authorized, begin, complete, configured, signOut } from "./auth.js";

import { avatarOrigins, declaredProfiles, markCorrelations, publicAvatar, publicProfileChecks } from "./profiles.js";

import { activePlan, servePlans } from "../planes/service.js";

const ROOT = "/admin/huella/";
const HEADERS = {
  "Cache-Control": "private, no-store",
  "Content-Security-Policy": `default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src ${avatarOrigins.join(" ")}; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
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

async function provider(url, accept, body) {
  const headers = { Accept: accept, "User-Agent": "DOMINUS-Huella" };
  if (body) headers["Content-Type"] = "application/json";
  return fetch(url, {
    headers,
    method: body ? "POST" : "GET",
    body: body ? JSON.stringify(body) : undefined,
    // Workers acepta "manual"; providerStatus descarta respuestas 3xx.
    redirect: "manual",
    signal: AbortSignal.timeout(6500)
  });
}

function providerStatus(response) {
  if (response.status === 429 || (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0")) {
    return "limitado";
  }
  if (response.status === 404) return "sin_resultado";
  if (!response.ok) return "indeterminado";
}

async function upstream(url, accept = "application/json", { body, readBadRequest, text } = {}) {
  const response = await provider(url, accept, body);
  if (response.status === 204) return { data: null };
  if (readBadRequest && response.status === 400) return { data: await response.json() };
  const status = providerStatus(response);
  if (!status && !text) return { data: await response.json() };
  if (!status && /^text\/html(?:;|$)/i.test(response.headers.get("Content-Type") || "")) {
    return { data: (await readSignatureBody(response)).text };
  }
  await response.body?.cancel();
  return { status: status || "indeterminado" };
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
      since: data.created_at, name: data.name, avatar: publicAvatar(data.avatar_url)
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

async function publicResource(url, type, detail) {
  const response = await provider(url, type);
  const status = providerStatus(response);
  const contentType = response.headers.get("Content-Type") || "";
  await response.body?.cancel();
  if (status) return { status };
  return response.status === 200 && contentType.toLowerCase().startsWith(type)
    ? { status: "verificado", detail } : { status: "indeterminado" };
}

async function gravatar(email) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email.toLowerCase()));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const { data, status } = await upstream(`https://api.gravatar.com/v3/profiles/${hash}`);
  if (status) return { status };
  if (data?.hash !== hash || typeof data.profile_url !== "string" ||
      !/^https:\/\/gravatar\.com\/[a-z0-9_-]+\/?$/i.test(data.profile_url)) return { status: "indeterminado" };
  return { status: "verificado", url: data.profile_url,
    name: typeof data.display_name === "string" ? data.display_name.slice(0, 120) : undefined,
    declaredProfiles: declaredProfiles(data.verified_accounts), avatar: publicAvatar(data.avatar_url),
    detail: "Gravatar devolvió un perfil público asociado a la huella del correo." };
}

async function publicCommits(email) {
  const query = new URLSearchParams({ q: `author-email:${email}`, per_page: "5" });
  const { data, status } = await upstream(`https://api.github.com/search/commits?${query}`, "application/vnd.github+json");
  if (status) return { status: status === "sin_resultado" ? "indeterminado" : status };
  if (!Array.isArray(data?.items)) return { status: "indeterminado" };
  const records = data.items
    .filter(item => typeof item?.commit?.author?.email === "string" &&
      item.commit.author.email.toLowerCase() === email.toLowerCase())
    .map(item => {
      const repo = item.repository?.full_name;
      const sha = item.sha;
      return typeof repo === "string" && /^[\w.-]+\/[\w.-]+$/.test(repo) &&
        typeof sha === "string" && /^[a-f0-9]{40}$/i.test(sha) ? `https://github.com/${repo}/commit/${sha}` : "";
    }).filter(Boolean);
  if (records.length) return {
    status: "verificado", evidence: [...new Set(records)],
    detail: "El correo figura como autor en el metadato de estos commits públicos. Ese campo lo elige quien crea el commit."
  };
  return { status: data.total_count === 0 && data.incomplete_results === false ? "sin_resultado" : "indeterminado" };
}

async function publicGitHubEmail(email) {
  const query = new URLSearchParams({ q: `${email} in:email`, per_page: "10" });
  const { data, status } = await upstream(`https://api.github.com/search/users?${query}`,
    "application/vnd.github.text-match+json");
  if (status) return { status: status === "sin_resultado" ? "indeterminado" : status };
  if (!Array.isArray(data?.items)) return { status: "indeterminado" };
  const matches = data.items.filter(item => typeof item?.login === "string" && /^[a-z0-9-]{1,39}$/i.test(item.login) &&
    Array.isArray(item.text_matches) && item.text_matches.some(match => match?.property === "email" &&
      typeof match.fragment === "string" && match.fragment.trim().toLowerCase() === email.toLowerCase()))
    .slice(0, 5);
  if (matches.length) return {
    status: "verificado", profileLinks: [...new Set(matches.map(item => `https://github.com/${item.login}`))],
    avatar: matches.length === 1 ? publicAvatar(matches[0].avatar_url) : undefined,
    detail: "La búsqueda de GitHub devolvió ese correo exacto en el campo público del perfil."
  };
  return { status: data.total_count === 0 && data.incomplete_results === false ? "sin_resultado" : "indeterminado" };
}

async function emailDns(label, type, email, domain) {
  const local = email.slice(0, email.indexOf("@"));
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(local)));
  const owner = Array.from(hash.subarray(0, 28), byte => byte.toString(16).padStart(2, "0")).join("");
  const { status, detail } = await dns(`${owner}.${label}.${domain}`, type, () => true);
  return { status, detail: status === "verificado" ? "El DNS del dominio publica un registro para esta dirección." : detail };
}

async function inspect({ domain, username, email }) {
  const checks = [];
  if (domain) {
    checks.push(
      ["MX", () => dns(domain, 15, () => true)],
      ["SPF", () => dns(domain, 16, r => /^"?v=spf1(?:\s|")/i.test(r))],
      ["DMARC", () => dns(`_dmarc.${domain}`, 16, r => /^"?v=dmarc1(?:;|")/i.test(r))],
      ["Have I Been Pwned · incidentes del sitio", () => incidentesDominio(domain)]
    );
  }
  if (email) checks.push(
    ["keys.openpgp.org · clave pública", () => publicResource(
      `https://keys.openpgp.org/vks/v1/by-email/${encodeURIComponent(email)}`, "application/pgp-keys",
      "El servidor devolvió una clave pública cuyo titular habilitó la búsqueda por ese correo.")],
    ["Gravatar · perfil público", () => gravatar(email)],
    ["GitHub · commits públicos", () => publicCommits(email)],
    ["GitHub · correo del perfil público", () => publicGitHubEmail(email)],
    ["DNS · clave OPENPGPKEY", () => emailDns("_openpgpkey", 61, email, domain)],
    ["DNS · certificado SMIMEA", () => emailDns("_smimecert", 53, email, domain)]
  );
  const aliasChecks = username ? [
    ["GitHub", () => alias("github", username)],
    ["Hacker News", () => alias("hn", username)],
    ["DEV Community", () => alias("dev", username)],
    ...publicProfileChecks(username, upstream, email)
  ] : [];
  const jobs = [
    ...checks.map(([source, run], index) => [source, run, index < 4 ? "dominio" : "correo"]),
    ...aliasChecks.map(([source, run]) => [source, run, "alias"])
  ];
  const results = new Array(jobs.length);
  let next = 0;
  // Workers admite seis conexiones a la espera de cabeceras por petición.
  await Promise.all(Array.from({ length: Math.min(6, jobs.length) }, async () => {
    while (next < jobs.length) {
      const index = next++;
      const [source, run, kind] = jobs[index];
      try { results[index] = { source, kind, ...await run() }; }
      catch { results[index] = { source, kind, status: "indeterminado" }; }
    }
  }));
  markCorrelations(results);
  return { checkedAt: new Date().toISOString(), results };
}

async function readJson(request) {
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
  return input && typeof input === "object" && !Array.isArray(input) ? input : null;
}

function validAlias(username) {
  return /^[a-z0-9](?:[a-z0-9_.-]{0,63}[a-z0-9_-])?$/i.test(username);
}

function readAlias(value) {
  return typeof value === "string" ? value.trim().replace(/^@/, "") : "";
}

function readQuery(input) {
  const domain = typeof input.domain === "string" ? input.domain.trim().toLowerCase() : "";
  const username = readAlias(input.username);
  const email = typeof input.email === "string" ? input.email.trim() : "";
  if ("email" in input && (!email || input.searchEmail !== true || email.length > 254 ||
      !/^[a-z0-9_%+-]+(?:\.[a-z0-9_%+-]+)*@[a-z0-9.-]+$/i.test(email) ||
      email.indexOf("@") > 64 || email.split("@")[1].toLowerCase() !== domain)) return null;
  if (!domain && !username) return null;
  if (domain && (domain.length > 253 || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(domain))) return null;
  if (username && !validAlias(username)) return null;
  return { domain, username, email };
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
  ["sesion-no-disponible", "GitHub confirmó tu identidad, pero Huella no pudo crear la sesión."]
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
  if ((route === "consulta" || route === "consulta/catalogo") && request.method === "POST") {
    if (request.headers.get("Origin") !== url.origin ||
        request.headers.get("Content-Type")?.split(";")[0] !== "application/json") {
      return json({ error: "Origen o formato de solicitud inválido." }, 403);
    }
    const input = await readJson(request).catch(() => null);
    if (!input) return json({ error: "Solicitud inválida." }, 400);
    if (route === "consulta/catalogo") {
      const username = readAlias(input.username);
      if (!validAlias(username) || Object.keys(input).some(key => !["username", "offset", "category"].includes(key))) {
        return json({ error: "El catálogo requiere un alias válido." }, 400);
      }
      const batch = await inspectCatalog(username, input.offset, input.category);
      return batch ? json(batch) : json({ error: "Lote inválido." }, 400);
    }
    const query = readQuery(input);
    if (!query) return json({ error: "Indica un dominio, correo o alias válido." }, 400);
    return json({ ...await inspect(query), catalog: query.username ? catalogInfo : undefined });
  }
  const asset = assets.get(route);
  if (asset && request.method === "GET") {
    const [body, type] = asset;
    const page = route === "" ? body.replace("{{catalogTotal}}", String(catalogInfo.total))
      .replace("{{catalogCategories}}", catalogInfo.sections.map(({ id, label, total }) =>
        `<option value="${id}">${label} (${total})</option>`).join("")) : body;
    return new Response(page,
      { headers: { ...HEADERS, "Content-Type": type } });
  }
  return json({ error: "Ruta inexistente" }, 404);
}
