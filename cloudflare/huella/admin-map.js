import { authorized, configured } from "./auth.js";
import adminPages from "../../config/paginas_admin.json" with { type: "json" };

// El mapa completo se lee de Cloudflare Pages (antes de GitHub Pages). Las páginas de administración viven en /ops/
// (tools/pages/mover_admin.py). Si /ops/* queda detrás de Cloudflare Access, el Worker entra con un token de servicio
// (secretos ACCESS_CLIENT_ID y ACCESS_CLIENT_SECRET del Worker); sin ellos pide la página sin credenciales.
const mapOrigin = "https://dominus-osint.pages.dev";
const mapPath = "/";
const OPS = new Set(adminPages.paginas);

/** Ruta en Pages para una ruta del Worker: «/legal.html» → «/ops/legal», «/index.html» → «/». */
export function rutaPages(pathname) {
  const nombre = pathname.slice(1).replace(/\.html$/, "");
  if (nombre === "index") return "/";
  if (OPS.has(nombre)) return `/${adminPages.ruta}/${nombre}`;
  return pathname;
}
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

export async function adminMap(request, url, env) {
  if (!(url.hostname.endsWith(".workers.dev") || url.hostname === "admin.dominusosint.com") || !configured(url, env)) return null;
  if (!["GET", "HEAD"].includes(request.method)) {
    return new Response(null, { status: 405, headers: { ...headers, Allow: "GET, HEAD" } });
  }
  if (!await authorized(request, env)) {
    if (url.pathname === "/" || url.pathname.endsWith(".html")) {
      return new Response(null, { status: 303, headers: { ...headers, Location: "/admin/huella/ingreso" } });
    }
    return new Response(null, { status: 403, headers });
  }

  const target = new URL(mapPath, mapOrigin);
  target.pathname = rutaPages(url.pathname);
  if (!target.pathname.startsWith(mapPath)) return new Response(null, { status: 404, headers });
  target.search = url.search;
  const forwarded = new Headers();
  for (const name of ["Accept", "Range", "If-Range", "If-None-Match", "If-Modified-Since"]) {
    if (request.headers.has(name)) forwarded.set(name, request.headers.get(name));
  }
  if (env.ACCESS_CLIENT_ID && env.ACCESS_CLIENT_SECRET) {
    forwarded.set("CF-Access-Client-Id", env.ACCESS_CLIENT_ID);
    forwarded.set("CF-Access-Client-Secret", env.ACCESS_CLIENT_SECRET);
  }
  try {
    const upstream = await fetch(target, { method: request.method, headers: forwarded, redirect: "manual" });
    if (upstream.status >= 300 && upstream.status < 400 && upstream.status !== 304) {
      const location = upstream.headers.get("Location");
      const next = location && new URL(location, target);
      if (next?.origin === mapOrigin && next.pathname.startsWith(mapPath) && !next.pathname.slice(mapPath.length).startsWith("/")) {
        return new Response(null, { status: upstream.status, headers: {
          ...headers, Location: "/" + next.pathname.slice(mapPath.length) + next.search + next.hash
        } });
      }
      return new Response(null, { status: 502, headers });
    }
    const responseHeaders = new Headers(upstream.headers);
    for (const [name, value] of Object.entries(headers)) responseHeaders.set(name, value);
    responseHeaders.delete("Set-Cookie");
    responseHeaders.delete("Clear-Site-Data");
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return new Response("No se pudo cargar el mapa de DOMINUS.", { status: 502, headers });
  }
}
