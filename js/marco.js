// Marco normativo (marco.html): leyes, tratados, estándares y metodologías que tocan a DOMINUS OSINT (config/normativa.json).
import { getJSON, esc, safeUrl } from "./util.js";

const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Grupos con solo los elementos que contienen todas las palabras buscadas (en nombre, emisor, qué es o relación). */
export function filtrar(cfg, q = "") {
  const pal = norm(q).split(/\s+/).filter(Boolean);
  return (cfg?.grupos || []).map((g) => ({ ...g, items: g.items.filter((i) => pal.every((p) => norm(`${i.nombre} ${i.emisor} ${i.que_es} ${i.relacion}`).includes(p))) }))
    .filter((g) => g.items.length);
}

const enlace = (u) => (u === "SOURCES.md" ? "https://github.com/zoetzerlpetrov-gif/Geopolitica/blob/main/SOURCES.md" : safeUrl(u));

export function htmlGrupos(grupos) {
  if (!grupos.length) return `<p class="mc-vacio">Nada coincide con la búsqueda.</p>`;
  return grupos.map((g) => `<section class="mc-grupo" id="g-${esc(g.id)}"><h2>${esc(g.titulo)} <span class="mc-n">${g.items.length}</span></h2>
    ${g.items.map((i) => `<article class="mc-item"><h3><a href="${esc(enlace(i.url))}" target="_blank" rel="noopener noreferrer">${esc(i.nombre)}</a></h3>
      <p class="mc-emisor">${esc(i.emisor)}</p><p>${esc(i.que_es)}</p><p class="mc-rel"><b>En DOMINUS:</b> ${esc(i.relacion)}</p></article>`).join("")}</section>`).join("");
}

async function iniciar() {
  const cfg = await getJSON("config/normativa.json").catch(() => null);
  if (!cfg) { document.getElementById("mc-lista").textContent = "No se pudo cargar el marco normativo."; return; }
  document.getElementById("mc-desc").textContent = cfg.descripcion;
  document.getElementById("mc-indice").innerHTML = cfg.grupos.map((g) => `<a href="#g-${esc(g.id)}">${esc(g.titulo)}</a>`).join(" · ");
  const pintar = () => { document.getElementById("mc-lista").innerHTML = htmlGrupos(filtrar(cfg, document.getElementById("mc-buscar").value)); };
  document.getElementById("mc-buscar").addEventListener("input", pintar);
  pintar();
}

if (typeof document !== "undefined" && document.getElementById("mc-lista")) iniciar();
