import { authorized, configured } from "./auth.js";

const mapOrigin = "https://zoetzerlpetrov-gif.github.io";
const mapPath = "/Geopolitica/";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

export async function adminMap(request, url, env) {
  if (!url.hostname.endsWith(".workers.dev") || !configured(url, env)) return null;
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
  target.pathname = mapPath + url.pathname.slice(1);
  if (!target.pathname.startsWith(mapPath)) return new Response(null, { status: 404, headers });
  target.search = url.search;
  const forwarded = new Headers();
  for (const name of ["Accept", "Range", "If-Range", "If-None-Match", "If-Modified-Since"]) {
    if (request.headers.has(name)) forwarded.set(name, request.headers.get(name));
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
