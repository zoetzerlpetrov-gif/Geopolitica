// Plantilla de proyecto dentro de cada proyecto del servidor (Admin → Proyectos de principio a fin y Mi empresa → Proyectos).
// Reúne en un solo lugar lo que antes estaba repartido entre «Normativa por país» y «Seguimiento de proyecto»:
// generar el plan por sector y países (con su base normativa), descargarlo en Excel o JSON, e importar el Excel ya llenado.
// Las actividades del plan se guardan en el proyecto (servidor); el Excel sigue siendo el documento de trabajo detallado.
import { JURISDICCIONES, sectoresOrdenados } from "./herr-logica.js";

const cache = {};
const traer = (u) => (cache[u] ||= fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null));

export { JURISDICCIONES };

/** Sectores disponibles para la plantilla (de la A a la Z). */
export async function sectores() {
  const [aud, mex] = await Promise.all([traer("config/auditorias.json"), traer("config/normativa/MEX_sectores.json")]);
  return sectoresOrdenados(aud?.sectores || {}, mex?.sectores || {});
}

async function norma(iso) {
  const n = await traer(`config/normativa/${iso}.json`);
  if (n && iso === "MEX") {
    const x = await traer("config/normativa/MEX_sectores.json");
    return { ...n, sectores: { ...n.sectores, ...(x?.sectores || {}) } };
  }
  return n;
}

/** Plan del proyecto por sector y países (las mismas reglas que la plantilla de la Caja del analista). */
export async function generarPlan({ nombre = "Plan de proyecto", sector = "", paises = ["MEX"], extranjera = false, inicio = "" }) {
  const [cfg, dur] = await Promise.all([traer("config/plan_proyecto.json"), traer("config/plan_duraciones.json")]);
  if (!cfg) throw new Error("No se pudo cargar la plantilla (config/plan_proyecto.json).");
  const catalogos = Object.fromEntries(await Promise.all(paises.map(async (p) => [p, await norma(p)])));
  const nombres = Object.fromEntries(JURISDICCIONES.map(([i, n]) => [i, n.replace(/^[^\p{L}]+/u, "")]));
  const P = await import("./plan-proyecto.js");
  const plan = P.construirPlan({ cfg, catalogos, jurisdicciones: paises, sector, extranjera: extranjera && paises.includes("MEX"), nombres, duraciones: dur?.reglas || [] });
  const sectorNombre = sector ? (await sectores()).find(([k]) => k === sector)?.[1] || sector : "";
  const lunes = new Date(); lunes.setUTCDate(lunes.getUTCDate() + ((8 - lunes.getUTCDay()) % 7 || 7));
  const fechaInicio = new Date(`${/^\d{4}-\d{2}-\d{2}$/.test(inicio) ? inicio : lunes.toISOString().slice(0, 10)}T00:00:00Z`);
  const titulo = `${nombre} · ${sectorNombre || "General"} · ${paises.map((p) => nombres[p]).join(", ")}`;
  return { plan, cfg, titulo, inicio: fechaInicio, sector, sectorNombre, paises, nombres, extranjera, revisado: catalogos.MEX?.revisado || "" };
}

/** Bytes del Excel (Plan, Gantt, Vencimientos, Base normativa, Auditoría, Riesgos…). */
export async function excel(g) {
  const X = await import("./plan-excel.js");
  return X.excelPlanComprimido(g.plan, { cfg: g.cfg, titulo: g.titulo, inicio: g.inicio, sectorNombre: g.sectorNombre, paises: g.paises.map((p) => g.nombres[p]), extranjera: g.extranjera, revisado: g.revisado });
}

/** JSON del plan (para importar en otras herramientas). */
export async function json(g) {
  const X = await import("./plan-excel.js");
  return X.jsonPlan(g.plan, { titulo: g.titulo, inicio: g.inicio, sector: g.sector, paises: g.paises, extranjera: g.extranjera });
}

const ESTADO = { "hecho": "hecho", "en proceso": "en_proceso", "bloqueado": "bloqueado" };

/** Plan normalizado (de plan-importar: desdeJSON o importarArchivo) → actividades del proyecto en el servidor. */
export function actividadesDePlan(plan) {
  const tareas = (plan.tareas || []).filter((t) => !t.hito && t.aplica !== "No" && t.tarea);
  const acts = tareas.map((t) => ({
    tipo: "actividad", texto: `${String(t.fase || "").split(".")[0].trim() ? `[${String(t.fase).split(".")[0].trim()}] ` : ""}${t.tarea}${t.pais && t.pais !== "Todos" ? ` (${t.pais})` : ""}`.slice(0, 2000),
    responsable: String(t.rol || "").slice(0, 120), fecha: /^\d{4}-\d{2}-\d{2}$/.test(t.fin || "") ? t.fin : "",
    estado: ESTADO[String(t.estado || "").toLowerCase()] || "pendiente",
  }));
  const rec = (plan.recurrentes || []).map((r) => ({ tipo: "actividad", texto: `Obligación recurrente: ${r.tramite}${r.plazo ? ` · ${r.plazo}` : ""}${r.pais ? ` (${r.pais})` : ""}`.slice(0, 2000),
    responsable: String(r.rol || "").slice(0, 120), fecha: "", estado: "pendiente" }));
  return [...acts, ...rec].slice(0, 800);
}

/** Del plan generado a actividades (pasa por el mismo normalizador que la importación, que calcula fechas). */
export async function actividadesDeGenerado(g) {
  const I = await import("./plan-importar.js");
  return actividadesDePlan(I.desdeJSON(await json(g)));
}

/** Excel o JSON ya llenado → actividades (con su estado y fechas). */
export async function actividadesDeArchivo(nombre, bytes) {
  const I = await import("./plan-importar.js");
  return actividadesDePlan(await I.importarArchivo(nombre, bytes));
}
