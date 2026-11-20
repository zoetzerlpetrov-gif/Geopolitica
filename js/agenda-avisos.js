// Reformas que vienen (Agenda regulatoria, data/normativa/agenda.json) que tocan un plan de proyecto, un sector de
// auditoría o un tema. Lo usan DOMINUS OPS y la Caja del analista (seguimiento de planes), la Cartera de proyectos y
// las auditorías por sector. La probabilidad es una estimación por etapa: el texto siempre lo dice.
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const url = (u) => (/^https:\/\//i.test(String(u || "")) ? esc(u) : "#");
const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

let cache = null;
/** Señales de la agenda (vacío si el archivo no existe o no se puede leer). */
export function cargarAgenda(f = globalThis.fetch) {
  cache ||= Promise.resolve(f?.("data/normativa/agenda.json", { cache: "no-cache" }))
    .then((r) => (r?.ok ? r.json() : { senales: [] })).then((d) => d?.senales || []).catch(() => []);
  return cache;
}

const enCurso = (s) => s?.estado === "en curso";
const orden = (a, b) => (b.probabilidad || 0) - (a.probabilidad || 0) || String(b.actualizado || "").localeCompare(String(a.actualizado || ""));

/** ¿El texto del sector del plan («Energía eléctrica», «energia_electrica») corresponde al id de sector de la agenda? */
export function mismoSector(textoPlan, idSector) {
  const a = norm(textoPlan).replace(/[\s-]+/g, "_"), b = norm(idSector);
  return Boolean(a && b && (a === b || a.startsWith(b) || b.startsWith(a.split("_(")[0]) || a.includes(b)));
}

/** Reformas en curso que tocan las leyes del plan (MEX:id) o su sector. */
export function reformasDelPlan(plan, senales = []) {
  const leyes = new Set(plan?.leyes || []);
  return senales.filter((s) => enCurso(s) && ((s.leyes_ids || []).some((l) => leyes.has(l)) || (s.sectores || []).some((x) => mismoSector(plan?.sector, x)))).sort(orden);
}

/** Reformas en curso de un sector de auditoría (id de config/auditorias.json). */
export const reformasDelSector = (sector, senales = []) => senales.filter((s) => enCurso(s) && (s.sectores || []).includes(sector)).sort(orden);

/** Lista HTML (sin contenedor) de reformas: probabilidad estimada, etapa, ventana y confirmación. */
export function htmlReformas(lista, { max = 6, vacio = "Sin reformas en curso detectadas para esto." } = {}) {
  if (!lista.length) return `<p class="meta tb-sub">${esc(vacio)}</p>`;
  const li = lista.slice(0, max).map((s) => `<li><b>${Math.round((s.probabilidad || 0) * 100)} %</b> · <a href="${url(s.url)}" target="_blank" rel="noopener noreferrer">${esc(String(s.titulo).slice(0, 150))}</a>
    <span class="meta tb-sub"> · ${esc(s.etapa_nombre)}${s.vigor_desde ? ` · entra en vigor ${esc(s.vigor_desde)}` : s.ventana ? ` · ${esc(s.ventana[0])} a ${esc(s.ventana[1])}` : ""} · ${esc(s.confirmacion || "")}</span></li>`).join("");
  return `<ul class="tb-lista">${li}</ul><p class="meta tb-sub">Probabilidad: estimación por etapa del proceso, no pronóstico oficial.${lista.length > max ? ` Y ${lista.length - max} más.` : ""}</p>`;
}
