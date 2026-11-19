// Monitor de entidades (entidades.html, solo admin): cambios de razón social, filiales y actos oficiales de empresas y
// entes del Estado. Lee data/vivos/entidades.json (tools/mexico/entidades.py, una vez al día).
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const seguro = (u) => (/^https:\/\//i.test(String(u || "")) ? String(u) : "#");

export const TIPOS = {
  "cambio de razón social": ["🔁", "Cambio de razón social"],
  "cambio societario": ["🏛️", "Fusión, escisión, extinción o estatutos (DOF)"],
  "filial nueva": ["🆕", "Filial nueva"],
  "filial retirada": ["➖", "Filial que ya no aparece"],
  "lista 69-B": ["⚠️", "Coincidencia con la lista 69-B del SAT"],
  "cambio de registro": ["🗂️", "Cambio de domicilio, forma o registro (GLEIF)"],
  "acto oficial": ["📄", "Acto oficial en el DOF"],
};
export const RELEVANTES = ["cambio de razón social", "cambio societario", "filial nueva", "filial retirada", "lista 69-B"];

export function filtrar(d, { entidad = "", tipo = "relevantes", fuente = "", texto = "" } = {}) {
  const t = texto.trim().toLowerCase();
  return (d?.entidades || []).filter((e) => !entidad || e.id === entidad).flatMap((e) => e.eventos.map((x) => ({ ...x, entidad: e.nombre })))
    .filter((x) => (tipo === "relevantes" ? RELEVANTES.includes(x.tipo) : !tipo || x.tipo === tipo) && (!fuente || x.fuente === fuente)
      && (!t || `${x.titulo} ${x.detalle} ${x.entidad}`.toLowerCase().includes(t)))
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
}

export function htmlEvento(x) {
  const [ic, nombre] = TIPOS[x.tipo] || ["•", x.tipo];
  return `<li class="ev ${x.nuevo ? "nuevo" : ""}"><span class="chip">${ic} ${esc(nombre)}</span> <b>${esc(x.entidad)}</b> <span class="meta">${esc(x.fecha || "sin fecha")} · ${esc(x.fuente)} · ${esc(x.estado)}</span>${x.nuevo ? ' <span class="chip nuevo">NUEVO</span>' : ""}
    <div>${esc(x.titulo)}</div>${x.detalle ? `<div class="meta">${esc(x.detalle)}</div>` : ""}<a href="${esc(seguro(x.url))}" target="_blank" rel="noopener noreferrer">Ver la fuente ↗</a></li>`;
}

export function htmlResumen(d) {
  return `<table class="tabla-ficha"><tr><th>Entidad</th><th>Tipo</th>${RELEVANTES.map((t) => `<th title="${esc(TIPOS[t][1])}">${TIPOS[t][0]}</th>`).join("")}<th>📄 DOF</th><th>GLEIF</th></tr>
    ${(d?.entidades || []).map((e) => `<tr><td><button type="button" class="link" data-ent="${esc(e.id)}">${esc(e.nombre)}</button></td><td class="meta">${esc(e.tipo)}</td>
      ${RELEVANTES.map((t) => `<td>${e.resumen?.[t] || ""}</td>`).join("")}<td>${e.resumen?.["acto oficial"] || ""}</td>
      <td>${e.gleif ? `<a href="${esc(seguro(e.gleif.url))}" target="_blank" rel="noopener noreferrer">${esc(e.gleif.lei)}</a>` : `<span class="meta">sin LEI</span>`}</td></tr>`).join("")}</table>`;
}

export function htmlFicha(e) {
  if (!e) return "";
  const g = e.gleif;
  return `<h3>${esc(e.nombre)}</h3><p class="meta">${esc(e.tipo)}${e.cik ? ` · CIK SEC ${esc(e.cik)}` : ""}</p>
    ${g ? `<p>Nombre legal en GLEIF: <b>${esc(g.nombre_legal)}</b>${g.otros_nombres?.length ? ` · otros nombres: ${g.otros_nombres.map(esc).join("; ")}` : ""} · estado ${esc(g.estado)} · registro ${esc(g.registro)}</p>
      ${g.filiales?.length ? `<p><b>Filiales directas (${g.filiales.length}):</b></p><ul class="arbol">${g.filiales.map(([lei, n, p]) => `<li>${esc(n)} <span class="meta">${esc(p)} · <a href="https://search.gleif.org/#/record/${encodeURIComponent(lei)}" target="_blank" rel="noopener noreferrer">${esc(lei)}</a></span></li>`).join("")}</ul>` : `<p class="meta">Sin filiales registradas en GLEIF.</p>`}`
    : `<p class="meta">Esta entidad no tiene LEI en GLEIF (no emite deuda en mercados que lo exijan): se vigila en el DOF${e.cik ? " y en la SEC" : ""}.</p>`}`;
}

export async function iniciar(doc = document) {
  const $ = (id) => doc.getElementById(id);
  let d;
  try { d = await (await fetch("data/vivos/entidades.json", { cache: "no-store" })).json(); }
  catch { $("en-estado").textContent = "Aún no hay datos: se generan una vez al día con «Datos en movimiento»."; return; }
  $("en-estado").textContent = `${d.entidades.length} entidades · actualizado ${String(d.generado_utc).replace("T", " ").slice(0, 16)} UTC · fuentes: ${d.fuentes.join(", ")}. ${d.nota}${d.errores?.length ? ` · Avisos: ${d.errores.join("; ")}` : ""}`;
  $("en-resumen").innerHTML = htmlResumen(d);
  $("en-entidad").innerHTML = `<option value="">Todas</option>${d.entidades.map((e) => `<option value="${esc(e.id)}">${esc(e.nombre)}</option>`).join("")}`;
  $("en-tipo").innerHTML = `<option value="relevantes">Solo cambios relevantes</option><option value="">Todo</option>${Object.entries(TIPOS).map(([k, [ic, n]]) => `<option value="${esc(k)}">${ic} ${esc(n)}</option>`).join("")}`;
  $("en-fuente").innerHTML = `<option value="">Todas</option>${[...new Set(d.entidades.flatMap((e) => e.eventos.map((x) => x.fuente)))].map((f) => `<option>${esc(f)}</option>`).join("")}`;
  const pintar = () => {
    const f = { entidad: $("en-entidad").value, tipo: $("en-tipo").value, fuente: $("en-fuente").value, texto: $("en-texto").value };
    const lista = filtrar(d, f);
    $("en-lista").innerHTML = lista.length ? `<ul class="eventos">${lista.slice(0, 300).map(htmlEvento).join("")}</ul>` : `<p class="meta">Sin hallazgos con estos filtros.</p>`;
    $("en-cuenta").textContent = `${lista.length} hallazgo(s)${lista.length > 300 ? " (se muestran 300)" : ""}`;
    $("en-ficha").innerHTML = htmlFicha(d.entidades.find((e) => e.id === f.entidad));
  };
  for (const id of ["en-entidad", "en-tipo", "en-fuente"]) $(id).addEventListener("change", pintar);
  $("en-texto").addEventListener("input", pintar);
  $("en-resumen").addEventListener("click", (e) => { const b = e.target.closest("[data-ent]"); if (b) { $("en-entidad").value = b.dataset.ent; $("en-tipo").value = ""; pintar(); $("en-lista").scrollIntoView({ behavior: "smooth" }); } });
  pintar();
}

if (typeof document !== "undefined" && document.getElementById("en-lista")) iniciar();
