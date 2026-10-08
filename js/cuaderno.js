// Cuaderno del analista: checklist, notas y ajustes de riesgo por evento. Se guarda SOLO en este
// navegador (localStorage); no se envía a ningún servidor. Se conservan los 300 eventos más recientes.
import { storage } from "./util.js";

const CLAVE = "gp_cuaderno";
const MAX = 300;

function leerTodo() {
  try { return JSON.parse(storage.get(CLAVE) || "{}"); } catch (e) { return {}; }
}

function guardarTodo(todo) {
  const ids = Object.keys(todo);
  if (ids.length > MAX) {
    ids.sort((a, b) => (todo[b].t || 0) - (todo[a].t || 0));
    for (const id of ids.slice(MAX)) delete todo[id];
  }
  storage.set(CLAVE, JSON.stringify(todo));
}

/** { c: [pasos marcados], n: "notas", r: { p, i } | undefined, t: fecha } */
export function leer(id) {
  return { c: [], n: "", ...leerTodo()[id] };
}

export function actualizar(id, cambios) {
  const todo = leerTodo();
  const previo = { c: [], n: "", ...todo[id], ...cambios, t: Date.now() };
  if (!previo.c.length && !previo.n && !previo.r) delete todo[id];
  else todo[id] = previo;
  guardarTodo(todo);
  return previo;
}

/** Ajustes de riesgo de todos los eventos: { id: { p, i } }. */
export function ajustesRiesgo() {
  const out = {};
  for (const [id, x] of Object.entries(leerTodo())) if (x.r) out[id] = x.r;
  return out;
}
