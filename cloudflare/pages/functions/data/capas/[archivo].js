// Cloudflare Pages Function: sirve desde R2 las capas que pasan del límite de 25 MiB por archivo de Pages
// (p. ej. lugares_culto*.pmtiles). Solo se invoca para las rutas que tools/cloudflare/publicar_pages.sh pone en
// _routes.json; el resto del sitio son archivos estáticos sin costo de Functions. PMTiles lee por rangos de bytes
// (cabecera Range), así que se responden 206 con Content-Range.
export async function onRequest({ request, env, params, next }) {
  if (!env.GRANDES || !["GET", "HEAD"].includes(request.method)) return next();
  const clave = `capas/${params.archivo}`;
  const comunes = (obj) => {
    const h = new Headers();
    obj.writeHttpMetadata(h);
    h.set("etag", obj.httpEtag);
    h.set("accept-ranges", "bytes");
    h.set("cache-control", "public, max-age=3600");
    if (!h.has("content-type")) h.set("content-type", "application/octet-stream");
    return h;
  };
  if (request.method === "HEAD") {
    const obj = await env.GRANDES.head(clave);
    if (!obj) return next();
    const h = comunes(obj);
    h.set("content-length", String(obj.size));
    return new Response(null, { headers: h });
  }
  const conRango = request.headers.has("range");
  const obj = await env.GRANDES.get(clave, conRango ? { range: request.headers, onlyIf: request.headers } : { onlyIf: request.headers });
  if (!obj) return next();
  const h = comunes(obj);
  if (!("body" in obj)) return new Response(null, { status: 304, headers: h });   // If-None-Match coincidió
  if (conRango && obj.range) {
    const inicio = obj.range.offset ?? 0;
    const largo = obj.range.length ?? obj.size - inicio;
    h.set("content-range", `bytes ${inicio}-${inicio + largo - 1}/${obj.size}`);
    h.set("content-length", String(largo));
    return new Response(obj.body, { status: 206, headers: h });
  }
  h.set("content-length", String(obj.size));
  return new Response(obj.body, { headers: h });
}
