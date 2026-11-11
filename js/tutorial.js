// Tutorial (tutorial.html): índice, lista de secciones, inventario completo del menú izquierdo
// (config/tutorial_inventario.json, generado con tools/tutorial/inventario.cjs) y buscador dentro de la página.
import { esc, getJSON, sinAcentos, MIN_BUSQUEDA } from "./util.js";
import { htmlInventario, coincide, esOpcionAdmin } from "./tutorial-logica.js";
import { vistaActual, restricciones } from "./licencias.js";

const $ = (id) => document.getElementById(id);

const pago = vistaActual() === "pago";
// Versión de pago: los capítulos de administración no existen para el cliente y los demás se numeran sin huecos.
const capitulos = [...document.querySelectorAll("section[data-tema]")].filter((s) => !(pago && s.hasAttribute("data-solo-admin")));
if (pago) capitulos.forEach((s, i) => { const h = s.querySelector("h2"); h.textContent = h.textContent.replace(/^\d+\.\s*/, `${i + 1}. `); });
$("tut-indice").innerHTML = capitulos.map((s) => `<li><a href="#${esc(s.id)}">${esc(s.querySelector("h2").textContent)}</a></li>`).join("");

/** Qué opciones del inventario son solo de administración (solo se calcula en la versión de pago). */
async function filtroAdmin() {
  if (!pago) return () => false;
  const [lic, planes, { CAPAS }] = await Promise.all([getJSON("config/comercial_licencias.json"), getJSON("config/planes.json"), import("./riesgos.js")]);
  const r = restricciones(lic, null, planes);
  const nombres = new Set([...CAPAS.filter((c) => r.riesgos.has(c.id)).map((c) => c.nombre),
    ...(planes.solo_admin || []).filter((x) => x.tipo === "capa").map((x) => String(x.nombre).split(" · ").pop())]);
  const MOV = { aeronaves: "Aeronaves", buques: "Buques" };
  const fragmentos = [...[...r.movimiento].map((id) => MOV[id]).filter(Boolean), "Global Fishing Watch"];
  return (t) => esOpcionAdmin(t, nombres, fragmentos);
}

try {
  const [inv, ocultar] = await Promise.all([getJSON("config/tutorial_inventario.json"), filtroAdmin().catch(() => () => false)]);
  $("tut-secciones").innerHTML = inv.secciones.map((x) => `<li><a href="${esc(x.href)}">${esc(x.t)}</a>${x.ayuda ? ` <span class="meta">— ${esc(x.ayuda)}</span>` : ""}</li>`).join("");
  for (const d of document.querySelectorAll("[data-inv]")) {
    const grupo = inv.panel.find((g) => g.titulo.includes(d.dataset.inv));
    if (grupo) d.insertAdjacentHTML("beforeend", `<div class="inv"><p class="meta">Todas las opciones de este grupo (lista generada el ${esc(inv.generado)}):</p>${htmlInventario(grupo, 0, ocultar)}</div>`);
  }
} catch (e) {
  $("tut-secciones").innerHTML = `<li class="meta">No se pudo cargar la lista de opciones (${esc(e.message)}).</li>`;
}

// Buscador: muestra solo los bloques que contienen el texto y los abre.
const bloques = [...document.querySelectorAll("section[data-tema] details.paso, section[data-tema] > p, section[data-tema] > ul, section[data-tema] > ol, section[data-tema] > .ejemplo")];
$("tut-q").addEventListener("input", (e) => {
  const q = e.target.value.trim();
  if (q.length < MIN_BUSQUEDA) {
    for (const b of bloques) b.hidden = false;
    for (const s of document.querySelectorAll("section[data-tema]")) s.hidden = false;
    $("tut-n").textContent = "";
    return;
  }
  let n = 0;
  for (const b of bloques) {
    const si = coincide(sinAcentos(b.textContent), sinAcentos(q));
    b.hidden = !si;
    if (si) { n++; if (b.tagName === "DETAILS") b.open = true; }
  }
  for (const s of document.querySelectorAll("section[data-tema]")) s.hidden = ![...s.querySelectorAll(":scope > *")].some((x) => bloques.includes(x) && !x.hidden);
  $("tut-n").textContent = n ? `${n} bloque(s) con «${q}».` : `Nada con «${q}». Prueba con otra palabra.`;
});
