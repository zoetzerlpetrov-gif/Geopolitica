// Funciones puras del tutorial: inventario del menú en HTML y búsqueda por palabras.
import { esc } from "./util.js";

/** Bloque del inventario → listas anidadas (opciones del bloque y sus sub-bloques). */
export function htmlInventario(b, nivel = 0) {
  const ops = b.opciones.length ? `<ul>${b.opciones.map((o) => `<li>${esc(o.t)}${o.ayuda ? ` <span class="meta">— ${esc(o.ayuda)}</span>` : ""}</li>`).join("")}</ul>` : "";
  const subs = b.sub.map((s) => htmlInventario(s, nivel + 1)).join("");
  if (!ops && !subs) return "";
  return nivel === 0 ? ops + subs : `<div class="grupo-inv"><b>${esc(b.titulo)}</b>${ops}${subs}</div>`;
}

/** ¿El texto (ya sin acentos) contiene todas las palabras de la consulta? */
export const coincide = (texto, q) => q.split(/\s+/).filter(Boolean).every((p) => texto.includes(p));

/** Cuenta las opciones de un bloque y sus sub-bloques. */
export const cuentaOpciones = (b) => b.opciones.length + b.sub.reduce((s, x) => s + cuentaOpciones(x), 0);
