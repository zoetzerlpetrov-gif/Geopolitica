// Intermediario de vuelos en vivo para el Monitor Geopolítico (Cloudflare Workers, plan gratuito).
// Consulta OpenSky Network con la cuenta del proyecto (secretos OPENSKY_CLIENT_ID y OPENSKY_CLIENT_SECRET, que el
// workflow de GitHub carga como secretos del Worker) y devuelve una versión mínima con permiso solo para el sitio.
// Cada zona se pide a OpenSky como mucho cada 10 s; el token OAuth se reutiliza hasta 1 min antes de vencer.
import { ORIGENES, ruta, caja, deOpensky } from "./logica.js";

const TTL_MS = 10000;
const TOKEN_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
const memo = new Map(); // zona → {t, cuerpo}; vive mientras la instancia del Worker siga activa
let token = { valor: "", vence: 0 };

async function pedirToken(env) {
  if (token.valor && Date.now() < token.vence - 60000) return token.valor;
  const r = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: env.OPENSKY_CLIENT_ID || "", client_secret: env.OPENSKY_CLIENT_SECRET || "" }) });
  if (!r.ok) throw new Error(`token de OpenSky: ${r.status}`);
  const j = await r.json();
  token = { valor: j.access_token, vence: Date.now() + (j.expires_in || 1800) * 1000 };
  return token.valor;
}

export default {
  async fetch(req, env) {
    const origen = req.headers.get("Origin") || "";
    const permitido = ORIGENES.includes(origen);
    const cors = { "Access-Control-Allow-Origin": permitido ? origen : ORIGENES[0], Vary: "Origin" };
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "GET", "Access-Control-Max-Age": "86400" } });
    if (req.method !== "GET") return new Response("solo GET", { status: 405, headers: cors });
    if (!permitido) return new Response("origen no permitido", { status: 403, headers: cors });
    const p = ruta(new URL(req.url).pathname);
    if (!p) return new Response("uso: /punto/{lat}/{lon}/{25|50|100|150|250}", { status: 400, headers: cors });
    const clave = `${p.lat}/${p.lon}/${p.nm}`;
    let e = memo.get(clave);
    if (!e || Date.now() - e.t > TTL_MS) {
      try {
        const b = caja(p);
        const r = await fetch(`https://opensky-network.org/api/states/all?extended=1&lamin=${b.lamin}&lomin=${b.lomin}&lamax=${b.lamax}&lomax=${b.lomax}`,
          { headers: { Authorization: `Bearer ${await pedirToken(env)}`, Accept: "application/json" } });
        if (r.status === 401) token = { valor: "", vence: 0 }; // token vencido o revocado: se pide otro en la siguiente consulta
        if (!r.ok) return json({ error: `OpenSky respondió ${r.status}`, restantes: r.headers.get("X-Rate-Limit-Remaining") }, 502);
        e = { t: Date.now(), cuerpo: JSON.stringify({ t: Date.now(), fuente: "OpenSky Network", restantes: Number(r.headers.get("X-Rate-Limit-Remaining")) || null, ac: deOpensky(await r.json()) }) };
      } catch (err) {
        return json({ error: String(err.message || err) }, 502);
      }
      memo.set(clave, e);
      if (memo.size > 300) memo.delete(memo.keys().next().value);
    }
    return new Response(e.cuerpo, { headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  },
};
