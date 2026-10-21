// Noticiero DOMINUS (noticiero.html): titulares de 72 h en 30 secciones y franja de indicadores.
// Los datos los arma el workflow «Datos en movimiento» (tools/noticiero/noticiero.py y tools/noticiero/indicadores.py);
// aquí solo se muestran. De cada nota hay título, medio, fecha, enlace e imagen del medio: el texto se lee en su sitio.
import { getJSON, esc, safeUrl, hace } from "./util.js";

const $ = (id) => document.getElementById(id);

/** Notas de una sección ("" = todas), filtradas por texto en título o medio, de la más reciente a la más antigua. */
export function notasDe(d, seccion, q = "") {
  const t = q.trim().toLowerCase();
  return (d?.notas || [])
    .filter((n) => !seccion || n.s.includes(seccion))
    .filter((n) => !t || `${n.t} ${n.m}`.toLowerCase().includes(t))
    .sort((a, b) => (a.f < b.f ? 1 : -1));
}

/** Cambio contra el dato anterior: {txt, clase} o null. «pp» para tasas (puntos porcentuales), «%» para precios. */
export function cambio(x) {
  if (x?.valor == null || x?.previo == null || x.previo === 0) return null;
  const tasa = x.unidad === "%";
  const v = tasa ? x.valor - x.previo : ((x.valor - x.previo) / Math.abs(x.previo)) * 100;
  if (Math.abs(v) < 0.005) return { txt: "= sin cambio", clase: "igual" };
  return { txt: `${v > 0 ? "▲" : "▼"} ${Math.abs(v).toFixed(2)}${tasa ? " pp" : " %"}`, clase: v > 0 ? "sube" : "baja" };
}

export const valorTxt = (x) => (x?.valor == null ? "—"
  : `${Number(x.valor).toLocaleString("es-MX", { minimumFractionDigits: x.decimales ?? 2, maximumFractionDigits: x.decimales ?? 2 })}${x.unidad === "%" ? " %" : ""}`);

export function htmlIndicadores(ind) {
  if (!ind?.grupos?.length) return `<p class="nt-vacio">Los indicadores aún no se publican.</p>`;
  return ind.grupos.map((g) => `<section class="nt-grupo"><h3>${esc(g.titulo)}</h3><div class="nt-cifras">${g.datos.map((x) => {
    const c = cambio(x);
    return `<div title="${esc(x.nombre)} · dato del ${esc(x.fecha || "")}${x.previo != null ? ` · anterior ${esc(valorTxt({ ...x, valor: x.previo }))}` : ""}">
      <span class="nt-nom">${esc(x.corto || x.nombre)}</span><b>${esc(valorTxt(x))}</b>
      <span class="nt-cambio ${c?.clase || ""}">${esc(c?.txt || "")}</span><span class="nt-fecha">${esc(x.fecha || "")}${x.unidad && x.unidad !== "%" ? ` · ${esc(x.unidad)}` : ""}</span></div>`;
  }).join("")}</div><p class="nt-fuente">Fuente: <a href="${esc(safeUrl(g.enlace))}" target="_blank" rel="noopener noreferrer">${esc(g.fuente)}</a>${g.nota ? ` · ${esc(g.nota)}` : ""}</p></section>`).join("");
}

export function htmlNota(n, now = Date.now()) {
  const img = /^https:\/\//i.test(n.img || "") ? `<img src="${esc(n.img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-quitar-si-falla>` : "";
  return `<li class="nt-nota">${img}<div><a href="${esc(safeUrl(n.u))}" target="_blank" rel="noopener noreferrer">${esc(n.t)}</a>
    <span class="nt-meta">${esc(n.m)}${n.tipo ? ` · ${esc(n.tipo)}` : ""} · ${esc(hace(n.f, now))}
      · <span class="nt-via" title="${n.via === "rss" ? "Del feed del propio medio" : "Detectada por GDELT en medios de todo el mundo; clasificada por palabras clave del título"}">${n.via === "rss" ? "feed del medio" : "GDELT, automática"}</span></span></div></li>`;
}

function htmlSeccion(sec) {
  if (!sec) return `<p class="nt-nota-sec">Todas las secciones, de lo más reciente a lo más antiguo.</p>`;
  const fuentes = sec.fuentes?.length ? `<details class="nt-fuentes"><summary>Medios elegidos para esta sección (${sec.fuentes.length})</summary><ul>${sec.fuentes
    .map((f) => `<li><b>${esc(f.nombre)}</b> · ${esc(f.tipo)}</li>`).join("")}</ul></details>` : "";
  return `<h2>${esc(sec.titulo)}</h2>${sec.nota ? `<p class="nt-nota-sec">${esc(sec.nota)}</p>` : ""}${fuentes}`;
}

async function iniciar() {
  const [d, ind] = await Promise.all([getJSON("data/vivos/noticiero.json", { bust: true }).catch(() => null),
    getJSON("data/vivos/indicadores.json", { bust: true }).catch(() => null)]);
  $("nt-indicadores").innerHTML = htmlIndicadores(ind) + (ind?.aviso ? `<p class="nt-aviso">${esc(ind.aviso)}</p>` : "");
  if (!d) { $("nt-lista").innerHTML = `<p class="nt-vacio">El noticiero aún no se publica. Vuelve en unos minutos.</p>`; return; }
  $("nt-generado").textContent = `Actualizado ${hace(d.generado_utc)} · últimas ${d.horas || 72} h`;
  const sel = $("nt-seccion");
  const cuenta = (id) => notasDe(d, id).length;
  sel.innerHTML = `<option value="">Todas (${d.notas.length})</option>${d.secciones.map((s, i) => `<option value="${esc(s.id)}">${i + 1}. ${esc(s.titulo)} (${cuenta(s.id)})</option>`).join("")}`;
  const pintar = () => {
    const id = sel.value, ns = notasDe(d, id, $("nt-buscar").value);
    $("nt-cab").innerHTML = htmlSeccion(d.secciones.find((s) => s.id === id));
    $("nt-lista").innerHTML = ns.length ? `<ul class="nt-notas">${ns.map((n) => htmlNota(n)).join("")}</ul>` : `<p class="nt-vacio">Sin notas en esta sección en las últimas ${d.horas || 72} h.</p>`;
    $("nt-lista").querySelectorAll("img[data-quitar-si-falla]").forEach((im) => im.addEventListener("error", () => im.remove(), { once: true }));
  };
  const inicial = decodeURIComponent(location.hash.slice(1));
  if (d.secciones.some((s) => s.id === inicial)) sel.value = inicial;
  sel.addEventListener("change", () => { history.replaceState(null, "", sel.value ? `#${sel.value}` : location.pathname); pintar(); });
  $("nt-buscar").addEventListener("input", pintar);
  pintar();
}

if (typeof document !== "undefined" && document.getElementById("nt-lista")) iniciar();
