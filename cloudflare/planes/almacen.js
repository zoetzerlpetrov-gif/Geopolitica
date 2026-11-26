// DESTINOS_FIJOS: este módulo no llama a servicios externos; solo usa la base D1 (OSINT_PLANS_DB).
// Lo que se captura en DOMINUS OPS, la Caja del analista e Inteligencia corporativa (DMI, gobernanza, matriz,
// instalaciones, respuestas de normativa y auditoría…) se guarda en el servidor por empresa, además del navegador.
// Lo usa js/sincronizar.js. Solo administración:
//   GET  /cuenta/empresa/admin/datos/<org>   → { datos: { clave: valor } }   (<org> = id de empresa o «dominus-interno»)
//   POST /cuenta/empresa/admin/datos/<org>   → { cambios: { clave: valor | null } }  (null borra la clave)
export const CLAVES = /^(gp_ops_[a-z_]{1,20}|gp_corp_instalaciones|gp_planes|gp_nube|gp_marcos|gp_carver|gp_actores|gp_ach|gp_herr_esc|gp_aud_[a-z0-9_]{1,40}|gp_norma_[A-Z]{3}|agencias)$/;
export const MAX_VALOR = 400000;
export const MAX_CLAVES = 120;
export const INTERNO = "dominus-interno";
const listas = new WeakSet();

async function asegurar(db) {
  if (listas.has(db)) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS dominus_org_datos (org_id TEXT NOT NULL, clave TEXT NOT NULL, valor TEXT NOT NULL,
    actualizado INTEGER NOT NULL, PRIMARY KEY (org_id, clave))`).run();
  listas.add(db);
}

/** Atiende GET/POST de los datos de una empresa. Devuelve [cuerpo, estado]. */
export async function rutaDatos(db, org, metodo, cuerpo = {}) {
  await asegurar(db);
  if (org !== INTERNO) {
    const o = /^[0-9a-f]{16}$/.test(org || "") ? await db.prepare("SELECT id FROM dominus_orgs WHERE id = ?").bind(org).first() : null;
    if (!o) return [{ error: "Empresa inválida." }, 404];
  }
  if (metodo === "GET") {
    const r = (await db.prepare("SELECT clave, valor, actualizado FROM dominus_org_datos WHERE org_id = ?").bind(org).all()).results || [];
    return [{ datos: Object.fromEntries(r.map((x) => [x.clave, x.valor])), actualizado: Math.max(0, ...r.map((x) => x.actualizado)) }, 200];
  }
  const cambios = cuerpo?.cambios;
  if (!cambios || typeof cambios !== "object" || Array.isArray(cambios)) return [{ error: "Cambios inválidos." }, 400];
  const entradas = Object.entries(cambios);
  if (!entradas.length || entradas.length > MAX_CLAVES) return [{ error: "Demasiadas claves." }, 400];
  for (const [k, v] of entradas) {
    if (!CLAVES.test(k)) return [{ error: `Clave no permitida: ${k}` }, 400];
    if (v !== null && (typeof v !== "string" || v.length > MAX_VALOR)) return [{ error: `Valor inválido o demasiado grande: ${k}` }, 413];
  }
  const t = Math.floor(Date.now() / 1000);
  await db.batch(entradas.map(([k, v]) => (v === null
    ? db.prepare("DELETE FROM dominus_org_datos WHERE org_id = ? AND clave = ?").bind(org, k)
    : db.prepare("INSERT INTO dominus_org_datos (org_id, clave, valor, actualizado) VALUES (?, ?, ?, ?) ON CONFLICT (org_id, clave) DO UPDATE SET valor = excluded.valor, actualizado = excluded.actualizado").bind(org, k, v, t))));
  const n = await db.prepare("SELECT count(*) AS n FROM dominus_org_datos WHERE org_id = ?").bind(org).first();
  if ((n?.n || 0) > MAX_CLAVES) return [{ error: "Se pasó del máximo de claves por empresa." }, 409];
  return [{ ok: true, actualizado: t }, 200];
}
