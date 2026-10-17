// Intermediario de vuelos en vivo para el Monitor Geopolítico (Cloudflare Workers, plan gratuito).
// adsb.lol no permite que una página web lea su API directamente (no envía cabeceras CORS); este Worker la consulta
// y devuelve una versión mínima con permiso solo para el sitio. Cada zona se pide a adsb.lol como mucho cada 10 s.
import { ORIGENES, ruta, limpiar } from "./logica.js";

const TTL_MS = 10000;
const UA = "Geopolitica-monitor (+https://github.com/zoetzerlpetrov-gif/Geopolitica)";
const memo = new Map(); // zona → {t, cuerpo}; vive mientras la instancia del Worker siga activa

export default {
  async fetch(req) {
    const origen = req.headers.get("Origin") || "";
    const permitido = ORIGENES.includes(origen);
    const cors = { "Access-Control-Allow-Origin": permitido ? origen : ORIGENES[0], Vary: "Origin" };
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "GET", "Access-Control-Max-Age": "86400" } });
    if (req.method !== "GET") return new Response("solo GET", { status: 405, headers: cors });
    if (!permitido) return new Response("origen no permitido", { status: 403, headers: cors });
    const p = ruta(new URL(req.url).pathname);
    if (!p) return new Response("uso: /punto/{lat}/{lon}/{25|50|100|150|250}", { status: 400, headers: cors });
    const clave = `${p.lat}/${p.lon}/${p.nm}`;
    let e = memo.get(clave);
    if (!e || Date.now() - e.t > TTL_MS) {
      const r = await fetch(`https://api.adsb.lol/v2/point/${clave}`, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (!r.ok) return new Response(JSON.stringify({ error: `adsb.lol respondió ${r.status}` }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
      e = { t: Date.now(), cuerpo: JSON.stringify({ t: Date.now(), fuente: "adsb.lol (ODbL)", ac: limpiar(await r.json()) }) };
      memo.set(clave, e);
      if (memo.size > 300) memo.delete(memo.keys().next().value);
    }
    return new Response(e.cuerpo, { headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  },
};
