// Importa un plan de proyecto (Excel de la plantilla o su JSON) y calcula su estatus para los tableros de DOMINUS OSINT
// (Caja del analista → Seguimiento de proyecto) y DOMINUS OPS. Lógica pura: sin DOM.
import { leerXLSX, fechaDeSerie } from "./xlsx-lector.js";
import { COLUMNAS_PLAN, feriadosMexico, proximaFecha } from "./plan-proyecto.js";

export const FORMATO = "dominus-plan-proyecto";
/** Grupos del semáforo (los mismos de la hoja «Vencimientos» del Excel). */
export const SEMAFORO = [["vencido", "🔴 Vencido", "#C62828"], ["7", "🟠 Vence en 7 días o menos", "#EF6C00"], ["30", "🟡 Vence en 8 a 30 días", "#F9A825"],
  ["60", "🔵 Vence en 31 a 60 días", "#1E88E5"], ["proceso", "⏳ En proceso (más de 60 días)", "#3949AB"], ["pendiente", "⚪ Pendiente (más de 60 días)", "#90A4AE"], ["hecho", "✅ Cumplido", "#2E7D32"]];
const DIA = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);
const aFecha = (s) => new Date(`${s}T00:00:00Z`);
const texto = (v) => (v == null ? "" : String(v).trim());

/** Suma días hábiles (sin sábados, domingos ni días inhábiles) como WORKDAY de Excel. */
export function sumarHabiles(desde, n, inhabiles = new Set()) {
  const d = aFecha(desde);
  const habil = (x) => x.getUTCDay() % 6 !== 0 && !inhabiles.has(iso(x));
  let k = Math.abs(n);
  const paso = n < 0 ? -1 : 1;
  while (k > 0) { d.setUTCDate(d.getUTCDate() + paso); if (habil(d)) k--; }
  return iso(d);
}

/** Fechas de inicio y fin con las mismas reglas que la hoja Plan (predecesora, días hábiles, «¿Aplica? = No» y hitos de fase). */
export function calcularFechas(tareas, inicio, inhabiles = new Set()) {
  const porId = new Map(tareas.map((t) => [t.id, t]));
  for (let vuelta = 0; vuelta < 6; vuelta++) {
    let cambios = 0;
    for (const t of tareas) {
      if (t.hito) continue;
      const p = t.pred && porId.get(t.pred);
      const ini = p?.fin ? sumarHabiles(p.fin, 1, inhabiles) : inicio;
      const fin = t.aplica === "No" ? ini : sumarHabiles(ini, Math.max((Number(t.dias) || 1) - 1, 0), inhabiles);
      if (t.inicio !== ini || t.fin !== fin) { t.inicio = ini; t.fin = fin; cambios++; }
    }
    for (const h of tareas.filter((x) => x.hito)) {
      const fs = tareas.filter((x) => !x.hito && x.fase === h.fase && x.fin).map((x) => x.fin).sort();
      h.inicio = h.fin = fs.at(-1) || inicio;
    }
    if (!cambios) break;
  }
  return tareas;
}

function normalizarTarea(t) {
  let avance = Number(String(t.avance ?? "").replace("%", ""));
  if (!Number.isFinite(avance)) avance = 0;
  if (avance > 1) avance /= 100;
  const estado = texto(t.estado) || "Pendiente";
  return { id: texto(t.id), fase: texto(t.fase || t.faseNombre), seccion: texto(t.seccion), tarea: texto(t.tarea), pais: texto(t.pais), ambito: texto(t.ambito),
    base: texto(t.base), autoridad: texto(t.autoridad), plazo: texto(t.plazo), frecuencia: texto(t.frecuencia), rol: texto(t.rol), prioridad: texto(t.prioridad) || "Media",
    pred: texto(t.pred), dias: Number(t.dias) || 0, inicio: t.inicio || null, fin: t.fin || null, aplica: texto(t.aplica) === "No" ? "No" : "Sí", estado,
    avance: estado === "Hecho" ? 1 : Math.max(0, Math.min(1, avance)), url: texto(t.url), hito: texto(t.id).startsWith("HITO-") };
}

/** JSON de la plantilla («Descargar datos (JSON) para importar») → plan normalizado. */
export function desdeJSON(j) {
  if (!j || j.formato !== FORMATO || !Array.isArray(j.tareas)) throw new Error("El JSON no es un plan de DOMINUS (falta «formato: dominus-plan-proyecto»).");
  const tareas = j.tareas.map((t) => normalizarTarea({ ...t, fase: t.faseNombre || t.fase }));
  const inicio = /^\d{4}-\d{2}-\d{2}$/.test(j.inicio) ? j.inicio : iso(new Date());
  const paisesIso = j.paises || [];
  const anio = +inicio.slice(0, 4);
  calcularFechas(tareas, inicio, new Set(paisesIso.includes("MEX") ? feriadosMexico([anio, anio + 1, anio + 2, anio + 3]) : []));
  return { titulo: j.titulo || "Plan de proyecto", inicio, sector: j.sector || "", paises: paisesIso, origen: "json", tareas,
    recurrentes: (j.recurrentes || []).map((r) => ({ id: r.id, tramite: r.tramite, pais: r.pais, rol: r.rol, plazo: r.plazo, ley: r.ley, estado: "Pendiente", proxima: null })),
    leyes: (j.base_normativa || []).map((b) => b.id).filter(Boolean),
    riesgos: (j.riesgos || []).map((r) => ({ id: r.id, riesgo: r.riesgo, prob: r.prob, impacto: r.impacto, estado: "Abierto" })), auditoria: { total: (j.auditoria || []).length } };
}

const filaEncabezado = (filas, primera) => filas.findIndex((f) => texto(f?.[0]) === primera);

/** Hojas del Excel (leerXLSX) → plan normalizado. Usa los valores guardados por Excel; lo que falte (fechas) se calcula. */
export function desdeHojas(hojas) {
  const plan = hojas.Plan;
  if (!plan) throw new Error("El libro no tiene la hoja «Plan» de la plantilla de DOMINUS.");
  const h = filaEncabezado(plan, "ID");
  if (h < 0) throw new Error("No encontré los encabezados de la hoja Plan (fila con «ID»).");
  const porNombre = Object.fromEntries(COLUMNAS_PLAN.map(([k, n]) => [n, k]));
  const cols = plan[h].map((n) => porNombre[texto(n)] || null);
  if (!cols.includes("id") || !cols.includes("tarea")) throw new Error("La hoja Plan no tiene las columnas «ID» y «Tarea».");
  const inicio = fechaDeSerie(plan[1]?.[2]) || iso(new Date());
  const tareas = [];
  for (const f of plan.slice(h + 1)) {
    const o = {};
    cols.forEach((k, i) => { if (k) o[k] = f[i]; });
    if (!texto(o.id) || (o.dias == null && o.estado == null)) continue;  // filas vacías y encabezados de fase
    const t = normalizarTarea(o);
    t.inicio = fechaDeSerie(o.inicio); t.fin = fechaDeSerie(o.fin);
    tareas.push(t);
  }
  if (!tareas.length) throw new Error("La hoja Plan no tiene tareas.");
  if (tareas.some((t) => !t.fin)) {
    const inh = new Set((hojas["Días inhábiles"] || []).slice(1).map((f) => fechaDeSerie(f[0])).filter(Boolean));
    calcularFechas(tareas, inicio, inh);
  }
  const hoy = new Date();
  const cal = hojas.Calendario || [], hc = filaEncabezado(cal, "ID tarea");
  const recurrentes = hc < 0 ? [] : cal.slice(hc + 1).filter((f) => texto(f[0])).map((f) => {
    const p = proximaFecha(texto(f[4]));
    return { id: texto(f[0]), pais: texto(f[1]), ley: texto(f[2]), tramite: texto(f[3]), plazo: texto(f[4]), rol: texto(f[7]),
      proxima: fechaDeSerie(f[8]) || (p ? proximaDe(p, hoy) : null), estado: texto(f[9]) || "Pendiente" };
  });
  const bn = hojas["Base normativa"] || [], hb = filaEncabezado(bn, "ID");
  const ri = hojas.Riesgos || [], hr = filaEncabezado(ri, "ID");
  const au = hojas["Auditoría"] || [], ha = filaEncabezado(au, "ID");
  const res = ha < 0 ? [] : au.slice(ha + 1).filter((f) => texto(f[0])).map((f) => texto(f[6]));
  const titulo = texto(hojas.Instrucciones?.[0]?.[0]) || texto(plan[0]?.[0]) || "Plan de proyecto";
  return { titulo, inicio, sector: texto(plan[1]?.[8]), paises: texto(plan[1]?.[11]).split(/,\s*/).filter(Boolean), origen: "xlsx", tareas, recurrentes,
    leyes: hb < 0 ? [] : bn.slice(hb + 1).map((f) => texto(f[0])).filter((x) => /^[A-Z]{3}:/.test(x)),
    riesgos: hr < 0 ? [] : ri.slice(hr + 1).filter((f) => texto(f[0])).map((f) => ({ id: texto(f[0]), riesgo: texto(f[3]), prob: Number(f[5]) || null, impacto: Number(f[6]) || null, estado: texto(f[11]) || "Abierto" })),
    auditoria: { total: res.length, cumple: res.filter((x) => x === "Cumple").length, parcial: res.filter((x) => x === "Cumple parcialmente").length,
      no: res.filter((x) => x === "No cumple").length, na: res.filter((x) => x === "No aplica").length } };
}

/** Próxima fecha (AAAA-MM-DD) a partir de la regla de proximaFecha, como las fórmulas de la hoja Calendario. */
export function proximaDe(p, hoy = new Date()) {
  const y = hoy.getUTCFullYear(), m = hoy.getUTCMonth(), d = hoy.getUTCDate();
  const f = (a, mes, dia) => (dia ? new Date(Date.UTC(a, mes - 1, dia)) : new Date(Date.UTC(a, mes, 0)));
  if (p.tipo === "mensual") return iso(d <= p.dia ? new Date(Date.UTC(y, m, p.dia)) : new Date(Date.UTC(y, m + 1, p.dia)));
  if (p.tipo === "fin_mes") return iso(new Date(Date.UTC(y, m + 1, 0)));
  const este = f(y, p.mes, p.dia);
  return iso(este >= new Date(Date.UTC(y, m, d)) ? este : f(y + 1, p.mes, p.dia));
}

/** Archivo (.xlsx o .json) → plan normalizado. */
export async function importarArchivo(nombre, bytes) {
  if (/\.json$/i.test(nombre)) return desdeJSON(JSON.parse(new TextDecoder().decode(bytes)));
  if (/\.xlsx$/i.test(nombre)) return desdeHojas(await leerXLSX(bytes));
  throw new Error("Formato no admitido: sube el .xlsx de la plantilla o su .json.");
}

/** Grupo del semáforo de una fecha límite. */
export function grupoSemaforo(fecha, estado, aplica = "Sí", hoy = new Date()) {
  if (!fecha || aplica === "No") return null;
  if (estado === "Hecho") return "hecho";
  const dias = Math.round((aFecha(fecha) - Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())) / DIA);
  if (dias < 0) return "vencido";
  if (dias <= 7) return "7";
  if (dias <= 30) return "30";
  if (dias <= 60) return "60";
  return estado === "En curso" ? "proceso" : "pendiente";
}

/** Estatus del plan para los tableros: avance, semáforo, fases, países, próximos vencimientos y recurrentes. */
export function resumenPlan(plan, hoy = new Date()) {
  const vivas = plan.tareas.filter((t) => !t.hito && t.aplica !== "No");
  const dias = (f) => Math.round((aFecha(f) - Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())) / DIA);
  const sem = Object.fromEntries(SEMAFORO.map(([k]) => [k, 0]));
  const items = [
    ...vivas.map((t) => ({ tipo: "tarea", id: t.id, que: t.tarea, pais: t.pais, rol: t.rol, fecha: t.fin, estado: t.estado, prioridad: t.prioridad, base: t.base, plazo: t.plazo })),
    ...plan.recurrentes.filter((r) => r.proxima).map((r) => ({ tipo: "recurrente", id: r.id, que: r.tramite, pais: r.pais, rol: r.rol, fecha: r.proxima, estado: r.estado, base: r.ley, plazo: r.plazo })),
  ].map((x) => ({ ...x, grupo: grupoSemaforo(x.fecha, x.estado, "Sí", hoy), dias: x.fecha ? dias(x.fecha) : null }));
  for (const x of items) if (x.grupo) sem[x.grupo]++;
  const avance = vivas.length ? vivas.reduce((s, t) => s + t.avance, 0) / vivas.length : 0;
  const fases = [...new Set(plan.tareas.map((t) => t.fase))].map((f) => {
    const ts = vivas.filter((t) => t.fase === f), fechas = ts.flatMap((t) => [t.inicio, t.fin]).filter(Boolean).sort();
    return { fase: f, total: ts.length, hechas: ts.filter((t) => t.estado === "Hecho").length, vencidas: ts.filter((t) => t.estado !== "Hecho" && t.fin && dias(t.fin) < 0).length,
      avance: ts.length ? ts.reduce((s, t) => s + t.avance, 0) / ts.length : 0, inicio: fechas[0] || null, fin: fechas.at(-1) || null };
  }).filter((f) => f.total);
  const paises = {};
  for (const t of vivas) { const p = (paises[t.pais || "—"] ||= { total: 0, hechas: 0, vencidas: 0 }); p.total++; p.hechas += t.estado === "Hecho"; p.vencidas += t.estado !== "Hecho" && !!t.fin && dias(t.fin) < 0; }
  const fechas = vivas.map((t) => t.fin).filter(Boolean).sort();
  return {
    total: vivas.length, hechas: vivas.filter((t) => t.estado === "Hecho").length, enCurso: vivas.filter((t) => t.estado === "En curso").length,
    bloqueadas: vivas.filter((t) => t.estado === "Bloqueado").length, criticas: vivas.filter((t) => t.prioridad === "Crítica" && t.estado !== "Hecho").length,
    avance, semaforo: sem, fases, paises, inicio: plan.inicio, finEstimado: fechas.at(-1) || null,
    proximos: items.filter((x) => ["vencido", "7", "30", "60"].includes(x.grupo)).sort((a, b) => a.dias - b.dias),
    enProceso: items.filter((x) => x.estado === "En curso").sort((a, b) => (a.dias ?? 1e9) - (b.dias ?? 1e9)),
    cumplidos: items.filter((x) => x.grupo === "hecho"),
  };
}

/** Cambios de la bitácora normativa (últimos `diasAtras`) que tocan leyes del plan. */
export function cambiosQueTocan(plan, entradas = [], hoy = new Date(), diasAtras = 90) {
  const leyes = new Set(plan.leyes || []);
  const desde = iso(new Date(hoy - diasAtras * DIA));
  return entradas.filter((e) => (e.fecha || "") >= desde && (e.leyes || []).some((l) => leyes.has(`${e.pais}:${l.id}`)));
}
