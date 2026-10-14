// Historia de cada país, desde lo más antiguo registrado hasta hoy. Se consulta en el navegador solo al pedirla:
//  1) Wikipedia en español: artículo «Historia de …» (resumen de la introducción y sus grandes etapas, que son los
//     títulos de sección). Licencia CC BY-SA 4.0: se muestra con atribución y enlace; no se guarda nada.
//  2) Wikidata (CC0): cronología de hechos fechados del país (guerras, revoluciones, tratados, desastres…) con
//     artículo en 12 o más Wikipedias. Se precalcula una vez al mes (consultarla en vivo agota el tiempo de Wikidata).
import { getJSON } from "./util.js";

const WP = "https://es.wikipedia.org";
// Secciones de servicio que no son etapas históricas.
const NO_ETAPA = /^(v[eé]ase tambi[eé]n|referencias|notas|bibliograf[ií]a|enlaces externos|fuentes|lecturas adicionales|historiograf[ií]a|galer[ií]a)/i;
// Hechos que no son historia política o social (deporte, entretenimiento).
const NO_HISTORIA = /(deport|f[uú]tbol|temporada|torneo|campeonato|copa |gran premio|carrera|concurso|festival|gira|premios|edici[oó]n de|juegos (panamericanos|centroamericanos|bolivarianos))/i;

/** Título del artículo «Historia de …» entre los resultados de opensearch (el primero que empieza así). */
export function elegirArticulo(opensearch, nombre) {
  const norm = (t) => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const n = norm(nombre);
  const cands = (opensearch?.[1] || []).filter((t) => /^historia de /i.test(t) && !t.includes("("));
  // «Historia de México», «Historia de los Estados Unidos», «Historia de la India»…
  return cands.find((t) => norm(t).replace(/^historia de (los |las |el |la )?/, "") === n.replace(/^(los |las |el |la )/, ""))
    || cands.find((t) => norm(t).includes(n)) || null;
}

/** Secciones de nivel 1 de `action=parse&prop=sections` → etapas [{titulo, ancla}] sin las de servicio. */
export function etapas(parse) {
  return (parse?.parse?.sections || []).filter((s) => String(s.toclevel) === "1" && !NO_ETAPA.test(s.line.replace(/<[^>]+>/g, "")))
    .map((s) => ({ titulo: s.line.replace(/<[^>]+>/g, ""), ancla: s.anchor }));
}

/** Fecha ISO de Wikidata («-0500-01-01T00:00:00Z», precisión variable) → texto: «500 a. C.», «1810», «16 sep 1810». */
export function fechaHistorica(iso, precision = 9) {
  const m = /^([+-]?)(\d+)-(\d\d)-(\d\d)/.exec(String(iso || ""));
  if (!m) return "";
  const anio = Number(m[2]);
  if (m[1] === "-") return `${(anio).toLocaleString("es-MX")} a. C.`;
  if (precision >= 11) return new Date(Date.UTC(anio, Number(m[3]) - 1, Number(m[4]))).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  if (precision === 10) return new Date(Date.UTC(anio, Number(m[3]) - 1, 1)).toLocaleDateString("es-MX", { month: "short", year: "numeric", timeZone: "UTC" });
  return String(anio);
}

/** Año con signo para ordenar (−500 = 500 a. C.). */
export const anioDe = (iso) => { const m = /^([+-]?)(\d+)/.exec(String(iso || "")); return m ? (m[1] === "-" ? -1 : 1) * Number(m[2]) : NaN; };

/** Filas precalculadas [qid, nombre, fecha ISO, precisión, tipo, artículo en es.wikipedia] → hechos ordenados, sin deporte. */
export function hechos(filas) {
  const vistos = new Set();
  return (filas || []).map(([id, nombre, iso, prec, tipo, art]) => ({ id, nombre, iso, prec: Number(prec || 9), tipo: tipo || "",
    url: typeof art === "string" && art ? `${WP}/wiki/${encodeURIComponent(art.replace(/ /g, "_"))}` : `https://www.wikidata.org/wiki/${id}` }))
    .filter((h) => h.nombre && !/^Q\d+$/.test(h.nombre) && !NO_HISTORIA.test(`${h.nombre} ${h.tipo}`) && !vistos.has(h.id) && vistos.add(h.id))
    .map((h) => ({ ...h, anio: anioDe(h.iso), fecha: fechaHistorica(h.iso, h.prec) }))
    .filter((h) => Number.isFinite(h.anio))
    .sort((a, b) => a.anio - b.anio || String(a.iso).localeCompare(String(b.iso)));
}

/** Agrupa por época para la línea de tiempo: antes de 1500, 1500–1799, siglo XIX, 1900–1945, 1946–1999, 2000 en adelante. */
export const EPOCAS = [[-Infinity, 1499, "Antigüedad y Edad Media (antes de 1500)"], [1500, 1799, "1500–1799: colonización, imperios y revoluciones"],
  [1800, 1899, "Siglo XIX: independencias y Estados nacionales"], [1900, 1945, "1900–1945: guerras mundiales y revoluciones"],
  [1946, 1999, "1946–1999: Guerra Fría y descolonización"], [2000, Infinity, "2000 a hoy"]];
export function porEpoca(lista) {
  return EPOCAS.map(([a, b, t]) => ({ titulo: t, hechos: lista.filter((h) => h.anio >= a && h.anio <= b) })).filter((g) => g.hechos.length);
}

/** Descarga lo necesario para un país. Cada parte falla por separado (si Wikidata tarda, la de Wikipedia sigue). */
export async function cargarHistoria(iso3, nombre) {
  const q = (u) => getJSON(u);
  const art = q(`${WP}/w/api.php?action=opensearch&search=${encodeURIComponent(`Historia de ${nombre}`)}&limit=8&namespace=0&format=json&origin=*`)
    .then(async (os) => {
      const titulo = elegirArticulo(os, nombre);
      if (!titulo) return null;
      const t = encodeURIComponent(titulo.replace(/ /g, "_"));
      const [resumen, secs] = await Promise.all([q(`${WP}/api/rest_v1/page/summary/${t}`),
        q(`${WP}/w/api.php?action=parse&page=${t}&prop=sections&redirects=1&format=json&origin=*`).catch(() => null)]);
      return { titulo, url: resumen?.content_urls?.desktop?.page || `${WP}/wiki/${t}`, extracto: resumen?.extract || "", etapas: etapas(secs) };
    });
  // Cronología precalculada cada mes por «Construir capas» (tools/historia/cronologia.py): un archivo pequeño por país.
  const evs = q(`data/capas/historia/${String(iso3).replace(/[^A-Z]/g, "")}.json`).then((d) => hechos(d.hechos));
  const [a, e] = await Promise.allSettled([art, evs]);
  return { articulo: a.status === "fulfilled" ? a.value : null, hechos: e.status === "fulfilled" ? e.value : null,
    wpError: a.status === "rejected" ? a.reason?.message || String(a.reason) : null, errores: [] };
}

const escH = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Ficha de historia: resumen y etapas (Wikipedia) + línea de tiempo por épocas (Wikidata). */
export function htmlHistoria(nombre, d) {
  const a = d.articulo;
  const wpEnlace = (ancla, t) => `<a href="${escH(a.url)}#${encodeURIComponent(ancla)}" target="_blank" rel="noopener noreferrer">${escH(t)}</a>`;
  const grupos = d.hechos ? porEpoca(d.hechos) : [];
  return `<h3 id="ficha-titulo">📜 Historia de ${escH(nombre)}</h3>
    <div class="fecha">Desde lo más antiguo registrado hasta hoy · Wikipedia y Wikidata</div>
    ${a ? `<h4>Resumen</h4><p>${escH(a.extracto)}</p>
      <p class="meta">Texto de la introducción de <a href="${escH(a.url)}" target="_blank" rel="noopener noreferrer">«${escH(a.titulo)}»</a> en Wikipedia en español, con licencia
        <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.es" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>. Se lee al abrir esta ficha; no se guarda.</p>
      ${a.etapas.length ? `<h4>Grandes etapas (${a.etapas.length})</h4><ol class="hist-etapas">${a.etapas.map((e) => `<li>${wpEnlace(e.ancla, e.titulo)}</li>`).join("")}</ol>
        <p class="meta">Son los capítulos del artículo, en su orden; cada uno abre la sección en Wikipedia.</p>` : ""}`
      : d.wpError ? `<p class="meta">No se pudo consultar Wikipedia en este momento (${escH(d.wpError)}). Intenta de nuevo más tarde.</p>`
      : `<p class="meta">No se encontró un artículo «Historia de ${escH(nombre)}» en Wikipedia en español.</p>`}
    <h4>Línea de tiempo: hechos con relevancia internacional${d.hechos ? ` (${d.hechos.length})` : ""}</h4>
    ${d.hechos === null ? `<p class="meta">La cronología de este país aún no está disponible (se genera una vez al mes).</p>`
      : grupos.length ? grupos.map((g) => `<details class="hist-epoca"${g === grupos[grupos.length - 1] ? " open" : ""}><summary>${escH(g.titulo)} <span class="meta">(${g.hechos.length})</span></summary>
        <ul class="hist-hechos">${g.hechos.map((h) => `<li><b>${escH(h.fecha)}</b> · <a href="${escH(h.url || `https://www.wikidata.org/wiki/${h.id}`)}" target="_blank" rel="noopener noreferrer">${escH(h.nombre)}</a>${h.tipo ? ` <span class="meta">${escH(h.tipo)}</span>` : ""}</li>`).join("")}</ul></details>`).join("")
      : `<p class="meta">Sin hechos fechados con artículo en 12 o más Wikipedias.</p>`}
    <p class="meta">Línea de tiempo: Wikidata (CC0), hechos del país con fecha y con artículo en 12 o más Wikipedias (filtro de relevancia internacional; deja fuera historia local). Cada hecho enlaza a su artículo en Wikipedia en español, o a Wikidata si no lo hay.
      Wikidata y Wikipedia los edita cualquiera: contrasta con fuentes académicas.</p>
    ${d.errores.length ? `<p class="meta">Avisos: ${escH(d.errores.join("; "))}</p>` : ""}`;
}
