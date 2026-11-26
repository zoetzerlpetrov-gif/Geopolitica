// Cumplimiento normativo por empresa (empresa.html): qué leyes aplican según país y sectores, sus preguntas de
// auditoría con una clave estable, el avance y los avisos (ley que cambió después de la última revisión, plazo
// vencido). Funciones puras: sin DOM ni red. Las fichas vienen de config/normativa/<PAÍS>.json (+ MEX_sectores.json).

export const ESTADOS = {
  pendiente: "Pendiente", en_proceso: "En proceso", cumple: "Cumple", no_cumple: "No cumple", no_aplica: "No aplica",
};

/** Huella corta y estable de un texto (FNV-1a de 32 bits, 8 caracteres hex): la clave de una pregunta no cambia
 *  aunque se agreguen otras preguntas a la ley. */
export function huella(texto) {
  let h = 0x811c9dc5;
  for (const c of new TextEncoder().encode(String(texto))) { h ^= c; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

export const legible = (k) => { const t = String(k || "").replace(/_/g, " "); return t.charAt(0).toUpperCase() + t.slice(1); };

/** Sectores disponibles para un país: los de su ficha más los adicionales (México). [{id, nombre}] ordenados A-Z. */
/** Nombres con ortografía correcta de los sectores base (los mismos de config/auditorias.json). */
export const NOMBRES_SECTOR = {"automotriz": "Automotriz y autopartes", "energia_electrica": "Energía eléctrica (generación, transmisión, distribución, renovables)", "hidrocarburos": "Hidrocarburos (exploración, refinación, ductos, estaciones de servicio)", "aeronautico": "Aeronáutico y aeroespacial", "farmaceutico": "Farmacéutico y dispositivos médicos", "construccion": "Construcción e infraestructura", "defensa": "Defensa, armamento y bienes de uso dual (cumplimiento)", "seguros": "Seguros y fianzas", "bancos": "Bancos y servicios financieros", "mineria": "Minería", "alimentos": "Alimentos y bebidas", "telecom": "Telecomunicaciones", "ti_digital": "Tecnología, nube y servicios digitales", "logistica": "Transporte y logística"};

export function sectoresDe(norma, extra = {}) {
  const ids = new Set([...Object.keys(norma?.sectores || {}), ...Object.keys(extra || {})]);
  return [...ids].map((id) => ({ id, nombre: norma?.sectores?.[id]?.nombre || extra?.[id]?.nombre || NOMBRES_SECTOR[id] || legible(id) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Leyes que aplican: las generales del país y las de cada sector elegido, sin repetir. */
export function leyesAplicables(norma, extra = {}, sectores = []) {
  const vistas = new Map();
  const agregar = (ley, area) => { if (ley?.id && !vistas.has(ley.id)) vistas.set(ley.id, { ...ley, area }); };
  for (const g of norma?.generales || []) for (const l of g.leyes || []) agregar(l, g.area || "General");
  for (const s of sectores) {
    const nombre = norma?.sectores?.[s]?.nombre || extra?.[s]?.nombre || NOMBRES_SECTOR[s] || legible(s);
    for (const l of norma?.sectores?.[s]?.leyes || []) agregar(l, `Sector: ${nombre}`);
    for (const l of extra?.[s]?.leyes || []) agregar(l, `Sector: ${nombre}`);
  }
  return [...vistas.values()];
}

/** Preguntas de auditoría de las leyes, cada una con su clave «idLey#huella». */
export function preguntas(leyes) {
  return leyes.flatMap((ley) => (ley.preguntas || []).map((texto) => ({ clave: `${String(ley.id).slice(0, 60)}#${huella(texto)}`, ley, texto })));
}

/** Fecha más reciente (AAAA-MM-DD) mencionada en «ultima_reforma»; null si no trae ninguna. */
export function fechaReforma(texto) {
  const fs = String(texto || "").match(/\d{4}-\d{2}-\d{2}/g) || [];
  return fs.sort().at(-1) || null;
}

const dia = (seg) => new Date(Number(seg) * 1000).toISOString().slice(0, 10);

/** Avisos de una pregunta: la ley cambió después de la última revisión, o el plazo ya venció sin cumplirse. */
export function avisos(item, r, hoy = new Date().toISOString().slice(0, 10)) {
  const out = [];
  const f = fechaReforma(item.ley.ultima_reforma);
  if (r?.actualizado && f && f > dia(r.actualizado)) out.push({ tipo: "cambio", texto: `La ley cambió el ${f}, después de tu última revisión (${dia(r.actualizado)}). Vuelve a revisarla.` });
  if (r?.fecha_limite && r.fecha_limite < hoy && !["cumple", "no_aplica"].includes(r.estado)) out.push({ tipo: "vencido", texto: `El plazo venció el ${r.fecha_limite}.` });
  return out;
}

/** Resumen del avance: conteo por estado y porcentaje que cumple (sin contar «no aplica»). */
export function resumen(items, respuestas = {}) {
  const c = Object.fromEntries(Object.keys(ESTADOS).map((k) => [k, 0]));
  let alertas = 0;
  for (const it of items) {
    const r = respuestas[it.clave];
    c[r?.estado || "pendiente"]++;
    if (avisos(it, r).length) alertas++;
  }
  const base = items.length - c.no_aplica;
  return { total: items.length, ...c, alertas, pct: base > 0 ? Math.round((c.cumple / base) * 100) : 0 };
}

/** CSV del cumplimiento (para Excel). */
export function csv(items, respuestas = {}) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const filas = [["ley", "sigla", "area", "pregunta", "estado", "responsable", "fecha_limite", "evidencia", "ultima_reforma", "url"]];
  for (const it of items) {
    const r = respuestas[it.clave] || {};
    filas.push([it.ley.nombre, it.ley.sigla, it.ley.area, it.texto, ESTADOS[r.estado || "pendiente"], r.responsable, r.fecha_limite, r.evidencia, it.ley.ultima_reforma, it.ley.url]);
  }
  return "﻿" + filas.map((f) => f.map(q).join(",")).join("\r\n");
}
