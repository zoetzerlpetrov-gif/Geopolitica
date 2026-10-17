// Zonas de conflicto: noticias del monitor y videos de cada conflicto (lista curada en config/conflictos.json).
// Las noticias se eligen entre los eventos ya cargados: las que nombran una palabra clave del conflicto (lugar, actor)
// en el título o el resumen, de los últimos 30 días. Los videos vienen de vivos/conflictos_videos.json (API de datos
// de YouTube, solo canales de noticias); si no hay, se ofrecen búsquedas para abrir en otra pestaña.
import { esc, sinAcentos } from "./util.js";

const n = (t) => sinAcentos(String(t || "")).toLowerCase();

export function noticiasDe(conf, eventos, { max = 8, dias = 30, ahora = Date.now() } = {}) {
  const pal = (conf.palabras || []).map(n).filter((p) => p.length >= 3);
  if (!pal.length) return [];
  const rx = new RegExp(`\\b(${pal.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`);
  const limite = ahora - dias * 864e5;
  return (eventos || []).filter((e) => !e.es_ejemplo && new Date(e.fecha_utc).getTime() >= limite && rx.test(n(`${e.titulo} ${e.resumen}`)))
    .sort((a, b) => String(b.fecha_utc).localeCompare(String(a.fecha_utc))).slice(0, max);
}

export function htmlNoticias(lista) {
  if (!lista.length) return `<p class="meta">Sin noticias de este conflicto en los últimos 30 días entre las fuentes del monitor.</p>`;
  return `<ul class="lista-inv">${lista.map((e) => `<li><a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(e.titulo)}</a>
    <div class="meta">${esc(e.fuente || "")} · ${esc(String(e.fecha_utc || "").slice(0, 10))}${e.severidad ? ` · severidad ${esc(e.severidad)}` : ""}</div></li>`).join("")}</ul>`;
}

export const enlacesVideo = (q) => [
  ["YouTube (más recientes)", `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=CAI%253D`],
  ["Google (videos de noticias)", `https://www.google.com/search?q=${encodeURIComponent(q)}&tbm=vid`],
];

export function htmlVideos(lista, q) {
  const busquedas = enlacesVideo(q).map(([t, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>`).join(" · ");
  if (!lista?.length) return `<p class="meta">Videos: busca en ${busquedas}.</p>`;
  return `<div class="conf-videos">${lista.map((v) => `<button type="button" class="conf-video" data-video="${esc(v.video)}" title="${esc(v.titulo)}">
      <img src="https://i.ytimg.com/vi/${esc(v.video)}/mqdefault.jpg" alt="" loading="lazy" referrerpolicy="no-referrer"><span>${esc(v.titulo)}</span>
      <span class="meta">${esc(v.canal)} · ${esc(String(v.fecha).slice(0, 10))}</span></button>`).join("")}</div>
    <p class="meta">Videos de canales de noticias (YouTube). Pueden mostrar escenas fuertes. Más en ${busquedas}.</p>`;
}

/** Reemplaza la miniatura por el reproductor insertado de YouTube (modo sin cookies). */
export function reproducir(boton) {
  const id = boton.dataset.video;
  if (!/^[\w-]{11}$/.test(id)) return;
  const f = document.createElement("iframe");
  f.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
  f.title = boton.title;
  f.allow = "autoplay; encrypted-media; picture-in-picture";
  f.allowFullscreen = true;
  f.referrerPolicy = "strict-origin-when-cross-origin";
  f.className = "conf-iframe";
  boton.replaceWith(f);
}
