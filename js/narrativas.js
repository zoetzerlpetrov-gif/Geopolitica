// Narrativas y estrategia (narrativas.html): técnicas de poder, propaganda e influencia (config/narrativas.json) cruzadas
// con los titulares reales del noticiero y de la ingesta. Una coincidencia dice que el titular HABLA del tema, no que
// alguien esté aplicando la técnica: es un punto de partida para analizar, no una conclusión.
import { getJSON, esc, safeUrl, hace } from "./util.js";

const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Titulares de las últimas `horas` (noticiero + eventos), sin repetir, del más nuevo al más viejo. */
export function titulares(noticiero, eventos, { horas = 72, ahora = Date.now() } = {}) {
  const desde = ahora - horas * 3600e3, vistos = new Set(), out = [];
  const add = (t, u, m, f) => { const k = norm(t).slice(0, 90); if (t && u && Date.parse(f) >= desde && !vistos.has(k)) { vistos.add(k); out.push({ t, u, m, f }); } };
  for (const n of noticiero?.notas || []) add(n.t, n.u, n.m, n.f);
  for (const e of eventos?.eventos || []) if (!e.es_ejemplo) add(e.titulo, e.url, e.fuente, e.fecha_utc);
  return out.sort((a, b) => (a.f < b.f ? 1 : -1));
}

/** Por técnica, los titulares cuyo texto coincide con su expresión (el texto se compara sin acentos). */
export function coincidencias(tecnicas, lista, max = 6) {
  return tecnicas.map((tec) => {
    const rx = new RegExp(norm(tec.rx).replace(/\[oo\]|\[aa\]|\[ee\]|\[ii\]|\[uu\]|\[nn\]/g, (m) => m[1]));
    const notas = lista.filter((n) => rx.test(norm(n.t)));
    return { tec, total: notas.length, notas: notas.slice(0, max) };
  });
}

const nombreObra = (obras, id) => obras.find((o) => o.id === id)?.titulo || id;

export function htmlTecnica({ tec, total, notas }, obras, now = Date.now()) {
  return `<article class="nr-tec" id="t-${esc(tec.id)}"><h3>${esc(tec.nombre)} <span class="nr-n">${total} titular${total === 1 ? "" : "es"} en 72 h</span></h3>
    <p>${esc(tec.que_es)}</p>
    <p class="nr-obras">Viene de: ${tec.obras.map((o) => `<a href="#o-${esc(o)}">${esc(nombreObra(obras, o))}</a>`).join(" · ")}</p>
    ${notas.length ? `<h4>Titulares de hoy que tocan el tema</h4><ul class="nr-notas">${notas.map((n) => `<li><a href="${esc(safeUrl(n.u))}" target="_blank" rel="noopener noreferrer">${esc(n.t)}</a>
      <span class="nr-meta">${esc(n.m || "")} · ${esc(hace(n.f, now))}</span></li>`).join("")}</ul>` : `<p class="nr-meta">Ningún titular de las últimas 72 h usa estas palabras.</p>`}
    <details><summary>Señales, qué suele seguir y cómo protegerte</summary>
      <p><b>Señales para reconocerla:</b></p><ul>${tec.senales.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
      <p><b>Qué suele seguir:</b> ${esc(tec.que_sigue)}</p><p><b>Cómo protegerte:</b> ${esc(tec.defensa)}</p></details></article>`;
}

export function htmlObra(o) {
  return `<article class="nr-obra" id="o-${esc(o.id)}"><h3>${esc(o.titulo)}</h3><p class="nr-meta">${esc(o.autor)} · ${esc(o.pais)} · ${esc(o.fecha)}</p>
    <p><b>Idea central:</b> ${esc(o.idea)}</p><p><b>Cómo se ve hoy:</b> ${esc(o.hoy)}</p></article>`;
}

async function iniciar() {
  const [cfg, noticiero, eventos] = await Promise.all([getJSON("config/narrativas.json"), getJSON("data/vivos/noticiero.json", { bust: true }).catch(() => null),
    getJSON("data/events.json", { bust: true }).catch(() => null)]);
  const lista = titulares(noticiero, eventos);
  const res = coincidencias(cfg.tecnicas, lista).sort((a, b) => b.total - a.total);
  document.getElementById("nr-desc").textContent = cfg.descripcion;
  document.getElementById("nr-base").textContent = `Analizados ${lista.length} titulares de las últimas 72 h (noticiero y eventos del monitor).`;
  document.getElementById("nr-tecnicas").innerHTML = res.map((r) => htmlTecnica(r, cfg.obras)).join("");
  document.getElementById("nr-obras").innerHTML = cfg.obras.map(htmlObra).join("");
  document.getElementById("nr-proteccion").innerHTML = cfg.proteccion.map((p) => `<li><b>${esc(p.titulo)}:</b> ${esc(p.texto)}</li>`).join("");
}

if (typeof document !== "undefined" && document.getElementById("nr-tecnicas")) iniciar();
