// Cartera de proyectos y vista para directivos (lógica pura, sin DOM ni red). Trabaja sobre planes normalizados por
// js/plan-importar.js. Reglas del estado general (documentadas en la página):
//   Rojo: algún permiso crítico vencido, alguna tarea crítica vencida, más de 10 % de tareas vencidas o un retraso de
//         más de 15 días contra la línea base.
//   Amarillo: alguna tarea vencida o bloqueada, alguna escalación pendiente, retraso de 1 a 15 días o algo crítico que
//         vence en 7 días.
//   Verde: nada de lo anterior.
import { resumenPlan } from "./plan-importar.js";

const DIA = 86400000;
const aMs = (s) => Date.parse(`${s}T00:00:00Z`);
const hoyMs = (hoy) => Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
const dias = (s, hoy) => (s ? Math.round((aMs(s) - hoyMs(hoy)) / DIA) : null);
const num = (x) => { const n = Number(String(x ?? "").replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : 0; };
const esEscalada = (t) => t.escalar && !/^(no|n\/a|-)?$/i.test(String(t.escalar).trim());
const esPermiso = (t) => /^3\./.test(t.fase) || (/^Trámite:/.test(t.tarea) && t.prioridad === "Crítica");

export const ESTADOS = { rojo: ["🔴", "En riesgo", "#C62828"], amarillo: ["🟡", "Con alertas", "#F9A825"], verde: ["🟢", "En tiempo", "#2E7D32"] };

/** Vista ejecutiva de un plan. `lineaBase`: fecha de fin aprobada (AAAA-MM-DD); `cortes`: [{fecha, resumen}]; `cambios`: bitácora. */
export function vistaEjecutiva(plan, { hoy = new Date(), lineaBase = null, cortes = [], cambios = [] } = {}) {
  const r = resumenPlan(plan, hoy);
  const vivas = plan.tareas.filter((t) => !t.hito && t.aplica !== "No");
  const pend = (t) => t.estado !== "Hecho";
  const vencida = (t) => pend(t) && t.fin && dias(t.fin, hoy) < 0;
  const planeado = vivas.length ? vivas.filter((t) => t.fin && dias(t.fin, hoy) < 0).length / vivas.length : 0;
  const desviacion = lineaBase && r.finEstimado ? Math.round((aMs(r.finEstimado) - aMs(lineaBase)) / DIA) : null;
  const hitos = plan.tareas.filter((t) => t.hito);
  const permisos = vivas.filter(esPermiso);
  const criticasVencidas = vivas.filter((t) => t.prioridad === "Crítica" && vencida(t));
  const escalar = vivas.filter((t) => esEscalada(t) && pend(t));
  const legales = vivas.filter((t) => t.plazo && pend(t) && t.fin && dias(t.fin, hoy) <= 60).sort((a, b) => a.fin.localeCompare(b.fin));
  const riesgos = [...(plan.riesgos || [])].map((x) => ({ ...x, nivel: (x.prob || 0) * (x.impacto || 0) })).filter((x) => !/cerrado|mitigado/i.test(x.estado || ""))
    .sort((a, b) => b.nivel - a.nivel).slice(0, 5);
  // Presupuesto (columnas opcionales del Excel).
  const porFase = {};
  for (const t of vivas) {
    const p = num(t.presupuesto), c = num(t.costo);
    if (!p && !c) continue;
    const f = (porFase[t.fase] ||= { fase: t.fase, presupuesto: 0, costo: 0 });
    f.presupuesto += p; f.costo += c;
  }
  const fasesP = Object.values(porFase), totalP = fasesP.reduce((s, f) => s + f.presupuesto, 0), totalC = fasesP.reduce((s, f) => s + f.costo, 0);
  const presupuesto = fasesP.length ? { porFase: fasesP, presupuesto: totalP, costo: totalC, proyeccion: r.avance > 0.05 ? Math.round(totalC / r.avance) : null } : null;
  // Estado general.
  const motivos = [];
  const pv = permisos.filter(vencida).length, pctV = vivas.length ? r.semaforo.vencido / vivas.length : 0;
  if (pv) motivos.push(`${pv} permiso(s) crítico(s) vencido(s)`);
  if (criticasVencidas.length) motivos.push(`${criticasVencidas.length} tarea(s) crítica(s) vencida(s)`);
  if (pctV > 0.1) motivos.push(`${Math.round(pctV * 100)} % de las tareas vencidas`);
  if (desviacion > 15) motivos.push(`${desviacion} días de retraso contra la línea base`);
  let color = motivos.length ? "rojo" : null;
  if (!color) {
    if (r.semaforo.vencido) motivos.push(`${r.semaforo.vencido} vencida(s)`);
    if (r.bloqueadas) motivos.push(`${r.bloqueadas} bloqueada(s)`);
    if (escalar.length) motivos.push(`${escalar.length} decisión(es) pendiente(s) del directivo`);
    if (desviacion > 0) motivos.push(`${desviacion} días de retraso contra la línea base`);
    const criticas7 = vivas.filter((t) => t.prioridad === "Crítica" && pend(t) && t.fin && dias(t.fin, hoy) >= 0 && dias(t.fin, hoy) <= 7).length;
    if (criticas7) motivos.push(`${criticas7} crítica(s) vencen en 7 días`);
    color = motivos.length ? "amarillo" : "verde";
  }
  return {
    resumen: r, estado: { color, icono: ESTADOS[color][0], etiqueta: ESTADOS[color][1], motivos: motivos.length ? motivos : ["Sin vencimientos ni bloqueos"] },
    avanceReal: r.avance, avancePlaneado: planeado, desviacion, lineaBase,
    hitos: { proximos: hitos.filter((h) => h.estado !== "Hecho" && h.fin && dias(h.fin, hoy) >= 0).sort((a, b) => a.fin.localeCompare(b.fin)).slice(0, 3),
      atrasados: hitos.filter((h) => h.estado !== "Hecho" && h.fin && dias(h.fin, hoy) < 0) },
    permisos: { total: permisos.length, obtenidos: permisos.filter((t) => t.estado === "Hecho").length, vencidos: pv,
      pendientes: permisos.filter(pend).sort((a, b) => (a.fin || "").localeCompare(b.fin || "")) },
    legales, escalar, riesgos, presupuesto, cambios,
    tendencia: cortes.map((c) => ({ fecha: String(c.fecha).slice(0, 10), avance: c.resumen?.avance ?? null, vencidas: c.resumen?.vencidas ?? null })).filter((x) => x.avance != null)
      .sort((a, b) => a.fecha.localeCompare(b.fecha)),
  };
}

/** Resumen pequeño de un plan para guardar como «corte» (historial). */
export function corteDe(plan, hoy = new Date()) {
  const r = resumenPlan(plan, hoy);
  return { avance: Math.round(r.avance * 1000) / 1000, hechas: r.hechas, total: r.total, vencidas: r.semaforo.vencido, bloqueadas: r.bloqueadas,
    semaforo: r.semaforo, finEstimado: r.finEstimado };
}

/** Fila de la cartera (lista de planes) a partir de un registro {id, empresa, sector, titulo, paises, datos, linea_base, actualizado}. */
export function filaCartera(reg, hoy = new Date()) {
  const v = vistaEjecutiva(reg.datos, { hoy, lineaBase: reg.linea_base });
  return { id: reg.id, empresa: reg.empresa, sector: reg.sector || "", titulo: reg.titulo, paises: reg.paises || [], actualizado: reg.actualizado, rol: reg.rol || "",
    estado: v.estado, avance: v.avanceReal, planeado: v.avancePlaneado, vencidas: v.resumen.semaforo.vencido, porVencer: v.resumen.semaforo["7"] + v.resumen.semaforo["30"],
    proximoHito: v.hitos.proximos[0] || null, finEstimado: v.resumen.finEstimado, desviacion: v.desviacion, escalar: v.escalar.length };
}

/** Totales por sector (para comparar empresas del mismo sector). */
export function porSector(filas) {
  const out = {};
  for (const f of filas) {
    const s = (out[f.sector || "Sin sector"] ||= { sector: f.sector || "Sin sector", planes: 0, avance: 0, vencidas: 0, rojos: 0 });
    s.planes++; s.avance += f.avance; s.vencidas += f.vencidas; s.rojos += f.estado.color === "rojo";
  }
  return Object.values(out).map((s) => ({ ...s, avance: s.avance / s.planes })).sort((a, b) => a.sector.localeCompare(b.sector, "es"));
}

/** Datos del plan que se guardan en la nube: lo necesario para los tableros, sin textos largos. */
export function planParaNube(plan) {
  const corto = (s, n) => String(s ?? "").slice(0, n);
  return { ...plan, tareas: plan.tareas.map((t) => ({ ...t, tarea: corto(t.tarea, 300), base: corto(t.base, 200), autoridad: corto(t.autoridad, 200), plazo: corto(t.plazo, 200) })) };
}
