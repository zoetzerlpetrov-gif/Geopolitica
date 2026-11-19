// Continuidad familiar: lógica pura (sin DOM) para probarla con node --test.
// Niveles, bitácora y reglas de cambio; días de estancia; avance de checklists; fases; búsqueda de datos personales.
import { cifrar, descifrar } from "./web-cripto.js";

export const NIVELES = ["verde", "amarillo", "naranja", "rojo"];
const DIA = 86400000;
const soloFecha = (f) => new Date(`${String(f).slice(0, 10)}T12:00:00Z`);
export const diasEntre = (a, b) => Math.floor((soloFecha(b) - soloFecha(a)) / DIA);

/** Nivel vigente = último cambio de la bitácora (o verde). */
export const nivelActual = (bitacora = []) => (bitacora.length ? bitacora[bitacora.length - 1].nivel : "verde");

/** Fecha del último disparador: la última subida de nivel o la última activación de un escenario. */
export function ultimoDisparador(bitacora = [], escenarios = {}) {
  const fechas = [];
  for (let i = 0; i < bitacora.length; i++) {
    const prev = i ? NIVELES.indexOf(bitacora[i - 1].nivel) : 0;
    if (NIVELES.indexOf(bitacora[i].nivel) > prev) fechas.push(bitacora[i].fecha);
  }
  for (const e of Object.values(escenarios)) if (e?.fecha) fechas.push(e.fecha);
  return fechas.sort().pop() || null;
}

/**
 * ¿Se puede pasar al nivel `nuevo`? → { ok, motivo }.
 * Reglas: cualquier adulto sube a Amarillo o Naranja (con motivo); Rojo exige dos aprobadores distintos;
 * bajar solo de un nivel en uno, sin escenarios activos y tras `diasBajar` días desde el último disparador.
 */
export function validarCambio({ bitacora = [], escenarios = {}, nuevo, motivo = "", aprobadores = [], fecha, diasBajar = 14, rojoAprobadores = 2 }) {
  const actual = nivelActual(bitacora), ia = NIVELES.indexOf(actual), in_ = NIVELES.indexOf(nuevo);
  if (in_ < 0) return { ok: false, motivo: "Nivel desconocido." };
  if (!fecha || Number.isNaN(soloFecha(fecha).getTime())) return { ok: false, motivo: "Falta la fecha." };
  if (in_ === ia) return { ok: false, motivo: `El nivel ya es ${nuevo}.` };
  if (!String(motivo).trim()) return { ok: false, motivo: "Escribe el motivo del cambio." };
  if (in_ > ia) {
    if (nuevo === "rojo") {
      const distintos = new Set(aprobadores.map((a) => String(a).trim().toLowerCase()).filter(Boolean));
      if (distintos.size < rojoAprobadores) return { ok: false, motivo: `Rojo exige registrar ${rojoAprobadores} personas distintas que lo aprueban.` };
    }
    return { ok: true, motivo: "" };
  }
  if (ia - in_ > 1) return { ok: false, motivo: `Solo se baja un nivel a la vez: de ${actual} a ${NIVELES[ia - 1]}.` };
  const activos = Object.entries(escenarios).filter(([, e]) => e?.activo);
  if (activos.length) return { ok: false, motivo: `No se puede bajar: hay ${activos.length} escenario(s) activos. Desactívalos cuando el disparador termine.` };
  const ult = ultimoDisparador(bitacora, escenarios);
  if (ult) {
    const pasan = diasEntre(ult, fecha);
    if (pasan < diasBajar) return { ok: false, motivo: `Solo se baja tras ${diasBajar} días sin disparadores: han pasado ${pasan} desde el ${ult.slice(0, 10)} (faltan ${diasBajar - pasan}).` };
  }
  return { ok: true, motivo: "" };
}

/** Días de estancia: transcurridos, restantes y avisos (día de decisión y cercanía del límite). */
export function estancia(llegada, limiteDias, hoy, { diaDecision = 150, antes = 15 } = {}) {
  if (!llegada) return null;
  const transcurridos = Math.max(0, diasEntre(llegada, hoy)) + 1;   // el día de llegada cuenta como día 1
  const restantes = limiteDias == null ? null : limiteDias - transcurridos;
  const avisos = [];
  if (transcurridos >= diaDecision) avisos.push({ tipo: "decision", texto: `Día ${transcurridos}: toca la decisión del día ${diaDecision} (quedarse, rotar o regresar).` });
  if (restantes != null && restantes <= antes) avisos.push({ tipo: "limite", texto: restantes < 0 ? `Se rebasó el límite de estancia por ${-restantes} día(s).` : `Quedan ${restantes} día(s) de estancia legal.` });
  return { transcurridos, restantes, avisos };
}

/** Avance de una lista: { hechos, total, pct }. `hechos` es un objeto id → true. */
export function avance(items = [], hechos = {}, prefijo = "") {
  const total = items.length, h = items.filter((i) => hechos[prefijo + i.id]).length;
  return { hechos: h, total, pct: total ? Math.round((h / total) * 100) : 0 };
}

/** Marcar una fase como completa: falla si quedan pendientes. */
export function completarFase(fase, hechos = {}) {
  const pend = (fase.checklist || []).filter((i) => !hechos[`${fase.id}.${i.id}`]);
  return pend.length ? { ok: false, motivo: `Quedan ${pend.length} pendiente(s): ${pend.map((p) => p.texto).join("; ")}.` } : { ok: true, motivo: "" };
}

/** Patrones de datos personales que nunca deben estar en la plantilla pública. */
export const PATRONES_PERSONALES = {
  correo: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  telefono: /(?<!\d)(?:\+?52[\s-]?)?(?:\d[\s-]?){10}(?!\d)/,
  curp: /\b[A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/i,
  rfc: /\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/i,
  pasaporte: /\b[A-Z]\d{8}\b/,
};
export function datosPersonales(texto) {
  return Object.entries(PATRONES_PERSONALES).filter(([, r]) => r.test(texto)).map(([k]) => k);
}

/** Informe en claro: solo la plantilla y el avance (nunca datos capturados de la familia). */
export function informeMarkdown(plantilla, hechos = {}, nivel = "verde", hoy = new Date().toISOString().slice(0, 10)) {
  const l = [`# Plan de continuidad familiar · avance`, ``, `Generado: ${hoy} · Nivel vigente: ${nivel}`, ``, `> Este informe no incluye datos personales: solo la plantilla genérica y el avance de las listas.`, ``];
  const bloque = (t, items, pref) => { const a = avance(items, hechos, pref); l.push(`## ${t} (${a.pct} %)`, ...items.map((i) => `- [${hechos[pref + i.id] ? "x" : " "}] ${i.texto}`), ""); };
  for (const f of plantilla.fases || []) bloque(f.nombre, f.checklist, `${f.id}.`);
  for (const p of plantilla.perfiles || []) bloque(p.nombre, p.checklist, `${p.id}.`);
  for (const c of plantilla.checklists_generales || []) bloque(c.nombre, c.checklist, `${c.id}.`);
  return l.join("\n");
}

export const TIPO_RESPALDO = "dominus-continuidad-familiar";

/** Respaldo cifrado (AES-GCM, PBKDF2 600,000 iteraciones). No hay exportación en claro de los datos de la familia. */
export async function exportarCifrado(estado, contrasena) {
  if (String(contrasena || "").length < 12) throw Error("Usa una contraseña de al menos 12 caracteres.");
  return cifrar({ tipo: TIPO_RESPALDO, version: 1, estado }, contrasena);
}
export async function importarCifrado(paquete, contrasena) {
  const d = await descifrar(paquete, contrasena);   // con otra contraseña lanza el error de web-cripto.js
  if (d?.tipo !== TIPO_RESPALDO || typeof d.estado !== "object") throw Error("El archivo no es un respaldo de Continuidad familiar.");
  return d.estado;
}
