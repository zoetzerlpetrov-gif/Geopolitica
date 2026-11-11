// Funciones puras del tutorial: inventario del menú en HTML y búsqueda por palabras.
import { esc } from "./util.js";

/** Bloque del inventario → listas anidadas (opciones del bloque y sus sub-bloques). */
export function htmlInventario(b, nivel = 0, ocultar = () => false) {
  const vis = b.opciones.filter((o) => !ocultar(o.t));
  const ops = vis.length ? `<ul>${vis.map((o) => `<li>${esc(o.t)}${o.ayuda ? ` <span class="meta">— ${esc(o.ayuda)}</span>` : ""}</li>`).join("")}</ul>` : "";
  const subs = b.sub.filter((x) => !ocultar(x.titulo)).map((x) => htmlInventario(x, nivel + 1, ocultar)).join("");
  if (!ops && !subs) return "";
  return nivel === 0 ? ops + subs : `<div class="grupo-inv"><b>${esc(b.titulo)}</b>${ops}${subs}</div>`;
}

/** Versión de pago: ¿esta opción del inventario es solo de administración? `nombres` = nombres exactos de capas o
 *  bloques reservados (sin el prefijo «Grupo · »); `fragmentos` = textos que delatan una sección reservada. */
export function esOpcionAdmin(texto, nombres, fragmentos = []) {
  const t = String(texto || "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
  return nombres.has(t) || fragmentos.some((f) => t.includes(f));
}

/** ¿El texto (ya sin acentos) contiene todas las palabras de la consulta? */
export const coincide = (texto, q) => q.split(/\s+/).filter(Boolean).every((p) => texto.includes(p));

/** Cuenta las opciones de un bloque y sus sub-bloques. */
export const cuentaOpciones = (b) => b.opciones.length + b.sub.reduce((s, x) => s + cuentaOpciones(x), 0);
