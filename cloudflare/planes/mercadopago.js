// DESTINOS_FIJOS: solo llama a https://api.mercadopago.com/preapproval/{id} y /authorized_payments/{id} (URLs literales).
// Alta y baja automáticas de planes con Mercado Pago (suscripciones). Mercado Pago avisa a
// POST /cuenta/mercadopago/aviso; el Worker comprueba la firma (x-signature, HMAC-SHA256 con MP_WEBHOOK_SECRET), consulta
// la suscripción en la API con MP_ACCESS_TOKEN y activa o desactiva el plan del correo en D1 (dominus_memberships_email).
// Nunca confía en el contenido del aviso: solo toma de él el id y vuelve a preguntar a Mercado Pago.
// Secretos del Worker: MP_ACCESS_TOKEN (credencial de producción) y MP_WEBHOOK_SECRET (clave secreta de los avisos).
import config from "../../config/planes.json" with { type: "json" };

const CORREO = /^[^\s@<>"']{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const GRACIA_S = 5 * 86400;  // días de gracia tras la fecha del siguiente cobro
const UTF8 = new TextEncoder();
export const TABLA_PAGOS = "CREATE TABLE IF NOT EXISTS dominus_pagos (id INTEGER PRIMARY KEY AUTOINCREMENT, fecha INTEGER NOT NULL DEFAULT (unixepoch()), tipo TEXT NOT NULL, mp_id TEXT NOT NULL, estado TEXT NOT NULL, email TEXT, plan TEXT, nota TEXT) STRICT";
let tablas = false;

export const mercadoPagoConfigurado = (env) => Boolean(env.MP_ACCESS_TOKEN?.trim() && env.MP_WEBHOOK_SECRET?.trim());

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
function igual(a, b) {
  const x = UTF8.encode(String(a)), y = UTF8.encode(String(b));
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

/** Comprueba la firma de Mercado Pago: manifiesto «id:{data.id};request-id:{x-request-id};ts:{ts};». */
export async function firmaValida(request, url, secreto, ahora = Math.floor(Date.now() / 1000)) {
  const firma = request.headers.get("x-signature") || "", reqId = request.headers.get("x-request-id") || "";
  const partes = Object.fromEntries(firma.split(",").map((p) => p.trim().split("=").map((x) => x.trim())).filter((p) => p.length === 2));
  const ts = partes.ts, v1 = partes.v1, dataId = String(url.searchParams.get("data.id") || "").toLowerCase();
  if (!ts || !v1 || !/^\d{9,13}$/.test(ts) || !/^[a-f0-9]{64}$/.test(v1)) return false;
  // Antirrepetición: el aviso debe ser reciente (10 minutos). ts puede venir en segundos o milisegundos.
  const seg = ts.length > 10 ? Math.floor(Number(ts) / 1000) : Number(ts);
  if (Math.abs(ahora - seg) > 600) return false;
  const manifiesto = `${dataId ? `id:${dataId};` : ""}${reqId ? `request-id:${reqId};` : ""}ts:${ts};`;
  const llave = await crypto.subtle.importKey("raw", UTF8.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return igual(hex(await crypto.subtle.sign("HMAC", llave, UTF8.encode(manifiesto))), v1);
}

/** Plan de DOMINUS de una suscripción: por id de plan de Mercado Pago (mp_plan_id) o por el nombre del plan. */
export function planDeSuscripcion(s) {
  const pagados = config.planes.filter((p) => p.usd > 0);
  const porId = pagados.find((p) => p.mp_plan_id && p.mp_plan_id === s?.preapproval_plan_id);
  if (porId) return porId.id;
  const nombre = String(s?.reason || "").toLowerCase();
  const porNombre = pagados.filter((p) => new RegExp(`\\b${p.nombre.toLowerCase()}\\b`).test(nombre));
  return porNombre.length === 1 ? porNombre[0].id : null;
}

async function api(ruta, env) {
  const r = await fetch(`https://api.mercadopago.com${ruta}`, { headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN.trim()}` }, redirect: "manual", signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`Mercado Pago respondió ${r.status}`);
  return r.json();
}

async function preparar(db, tablaEmail) {
  if (tablas) return;
  await db.prepare(TABLA_PAGOS).run();
  await db.prepare(tablaEmail).run();
  tablas = true;
}

/** Aplica el estado de una suscripción a la tabla de planes. Devuelve lo que hizo (para la bitácora). */
export async function aplicarSuscripcion(db, s) {
  const email = String(s?.payer_email || "").toLowerCase(), plan = planDeSuscripcion(s), estado = String(s?.status || "");
  if (!CORREO.test(email)) return { estado: "sin-correo", email: null, plan };
  if (!plan) return { estado: "plan-desconocido", email, plan: null };
  if (estado === "authorized") {
    const prox = Date.parse(s.next_payment_date || "");
    const vence = Number.isFinite(prox) ? Math.floor(prox / 1000) + GRACIA_S : null;
    await db.prepare(`INSERT INTO dominus_memberships_email (email, plan, active, expires_at, updated_at) VALUES (?, ?, 1, ?, unixepoch())
      ON CONFLICT(email) DO UPDATE SET plan = excluded.plan, active = 1, expires_at = excluded.expires_at, updated_at = unixepoch()`).bind(email, plan, vence).run();
    return { estado: "activado", email, plan };
  }
  if (["cancelled", "paused"].includes(estado)) {
    await db.prepare("UPDATE dominus_memberships_email SET active = 0, updated_at = unixepoch() WHERE email = ? AND plan = ?").bind(email, plan).run();
    return { estado: estado === "paused" ? "pausado" : "cancelado", email, plan };
  }
  return { estado: `sin-cambio:${estado.slice(0, 20)}`, email, plan };
}

/** POST /cuenta/mercadopago/aviso */
export async function avisoMercadoPago(request, url, env, tablaEmail) {
  const ok = () => new Response(null, { status: 200 });  // Mercado Pago reintenta si no recibe 200/201
  if (!mercadoPagoConfigurado(env) || !env.OSINT_PLANS_DB) return new Response(null, { status: 503 });
  if (!await firmaValida(request, url, env.MP_WEBHOOK_SECRET.trim())) return new Response(null, { status: 401 });
  let cuerpo = {};
  try { cuerpo = JSON.parse((await request.text()).slice(0, 20000) || "{}"); } catch { /* sin cuerpo: se usa la URL */ }
  const tipo = String(cuerpo.type || url.searchParams.get("type") || "");
  const id = String(cuerpo?.data?.id || url.searchParams.get("data.id") || "");
  if (!ID.test(id)) return ok();
  const db = env.OSINT_PLANS_DB;
  await preparar(db, tablaEmail);
  let r = { estado: "ignorado", email: null, plan: null }, nota = "";
  try {
    if (tipo === "subscription_preapproval") r = await aplicarSuscripcion(db, await api(`/preapproval/${encodeURIComponent(id)}`, env));
    else if (tipo === "subscription_authorized_payment") {
      const pago = await api(`/authorized_payments/${encodeURIComponent(id)}`, env);
      if (ID.test(String(pago.preapproval_id || ""))) r = await aplicarSuscripcion(db, await api(`/preapproval/${encodeURIComponent(pago.preapproval_id)}`, env));
    }
  } catch (e) { r = { estado: "error", email: null, plan: null }; nota = String(e.message).slice(0, 120); }
  await db.prepare("INSERT INTO dominus_pagos (tipo, mp_id, estado, email, plan, nota) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(tipo.slice(0, 40) || "desconocido", id, r.estado, r.email, r.plan, nota).run();
  // Ante un error de la API se pide a Mercado Pago que reintente (500); lo demás se confirma.
  return r.estado === "error" ? new Response(null, { status: 500 }) : ok();
}
