// Seguimiento de proyecto: importa el Excel o JSON de la plantilla y muestra su tablero. Lo usan la Caja del analista
// (pestaña «Seguimiento de proyecto») y DOMINUS OPS (pestaña «Proyecto» y widgets de Tableros). Los planes se guardan
// solo en este navegador (localStorage «gp_planes»), compartidos entre ambas páginas.
import { importarArchivo, resumenPlan, SEMAFORO, cambiosQueTocan } from "./plan-importar.js";

const CLAVE = "gp_planes", MAX_PLANES = 10;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pct = (x) => `${Math.round((x || 0) * 100)} %`;
const COLOR_SEM = Object.fromEntries(SEMAFORO.map(([k, , c]) => [k, c]));
const NOMBRE_SEM = Object.fromEntries(SEMAFORO.map(([k, n]) => [k, n]));

export function leerPlanes() {
  try { const d = JSON.parse(localStorage.getItem(CLAVE)); return d && Array.isArray(d.planes) ? d : { activo: null, planes: [] }; } catch (e) { return { activo: null, planes: [] }; }
}
function guardarPlanes(d) {
  try { localStorage.setItem(CLAVE, JSON.stringify(d)); return true; } catch (e) { return false; }
}
/** Plan activo (o null). */
export function planActivo() {
  const d = leerPlanes();
  return d.planes.find((p) => p.id === d.activo) || d.planes[0] || null;
}

const barra = (k, v, max, color, etiqueta) => `<div class="tb-fila"><span>${esc(k)}</span><span class="tb-barra"><i style="width:${max ? Math.round((v / max) * 100) : 0}%;background:${color}"></i></span><b>${esc(etiqueta ?? v)}</b></div>`;

/** Gantt resumido por fase (SVG): una barra por fase, avance relleno y línea de hoy. */
export function ganttFasesSVG(fases, hoy = new Date()) {
  const fs = fases.filter((f) => f.inicio && f.fin);
  if (!fs.length) return `<p class="tb-sub">Sin fechas</p>`;
  const t = (s) => Date.parse(`${s}T00:00:00Z`);
  const ini = Math.min(...fs.map((f) => t(f.inicio))), fin = Math.max(...fs.map((f) => t(f.fin))) + 86400000;
  const W = 640, L = 190, alto = 22, x = (ms) => L + ((ms - ini) / (fin - ini)) * (W - L - 10);
  const hoyMs = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
  const meses = [];
  for (let d = new Date(ini); d <= fin; d.setUTCMonth(d.getUTCMonth() + 1, 1)) meses.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
  const paso = Math.max(1, Math.ceil(meses.length / 12));
  return `<svg viewBox="0 0 ${W} ${fs.length * alto + 30}" class="pl-gantt" role="img" aria-label="Gantt por fase" fill="currentColor">
    ${meses.filter((_, i) => i % paso === 0).map((m) => `<line x1="${x(+m)}" x2="${x(+m)}" y1="14" y2="${fs.length * alto + 22}" stroke="#8883"/><text x="${x(+m) + 2}" y="11" font-size="9">${m.toLocaleDateString("es-MX", { month: "short", year: "2-digit", timeZone: "UTC" })}</text>`).join("")}
    ${fs.map((f, i) => { const y = 18 + i * alto, a = x(t(f.inicio)), b = x(t(f.fin) + 86400000), c = f.vencidas ? "#C62828" : f.avance >= 0.999 ? "#2E7D32" : "#4A7FB5";
      return `<text x="4" y="${y + 13}" font-size="10">${esc(f.fase.slice(0, 34))}</text><rect x="${a}" y="${y + 3}" width="${Math.max(2, b - a)}" height="13" rx="3" fill="${c}" opacity=".35"/>
        <rect x="${a}" y="${y + 3}" width="${Math.max(0, (b - a) * f.avance)}" height="13" rx="3" fill="${c}"/>`; }).join("")}
    ${hoyMs >= ini && hoyMs <= fin ? `<line x1="${x(hoyMs)}" x2="${x(hoyMs)}" y1="14" y2="${fs.length * alto + 22}" stroke="#E2A400" stroke-width="2"/><text x="${x(hoyMs) + 3}" y="${fs.length * alto + 28}" font-size="9" fill="#B07C00">hoy</text>` : ""}
  </svg>`;
}

const tablaItems = (xs, max = 15) => xs.length ? `<div class="desliza"><table class="tb-t"><tr><th>Fecha</th><th>Días</th><th>Qué</th><th>País</th><th>Responsable</th><th>Estado</th></tr>
  ${xs.slice(0, max).map((x) => `<tr><td><span class="tb-p" style="background:${COLOR_SEM[x.grupo] || "#999"}"></span>${esc(x.fecha || "—")}</td><td>${x.dias ?? "—"}</td><td>${esc(x.que)}${x.tipo === "recurrente" ? ' <span class="tb-sub">(recurrente)</span>' : ""}<div class="tb-sub">${esc(x.id)}${x.base ? ` · ${esc(x.base)}` : ""}</div></td><td>${esc(x.pais)}</td><td>${esc(x.rol)}</td><td>${esc(x.estado)}</td></tr>`).join("")}</table></div>
  ${xs.length > max ? `<p class="tb-sub">y ${xs.length - max} más</p>` : ""}` : `<p class="tb-sub">Nada en este grupo.</p>`;

/** Widgets del tablero de un plan (HTML). `cambios`: entradas de la bitácora normativa que tocan sus leyes. */
export function widgetsPlan(plan, r, { cambios = [], hoy = new Date() } = {}) {
  const maxSem = Math.max(1, ...Object.values(r.semaforo));
  const w = (titulo, cuerpo, ancho = 1) => `<section class="tb-w" style="grid-column:span ${ancho}"><h3>${esc(titulo)}</h3>${cuerpo}</section>`;
  const num = (v, sub, c = "") => `<div class="tb-num" style="color:${c}">${v}</div><div class="tb-sub">${sub}</div>`;
  return [
    w("Avance del proyecto", num(pct(r.avance), `${r.hechas} de ${r.total} tareas hechas · ${r.enCurso} en curso`)),
    w("Vencidas", num(r.semaforo.vencido, `${r.bloqueadas} bloqueadas · ${r.criticas} críticas pendientes`, r.semaforo.vencido ? "#C62828" : "#2E7D32")),
    w("Fechas", num(r.finEstimado || "—", `fin estimado · inicio ${esc(r.inicio)}`)),
    w("Semáforo de vencimientos", `<div class="tb-barras">${SEMAFORO.map(([k, n, c]) => barra(n, r.semaforo[k], maxSem, c)).join("")}</div>`, 1),
    w("Gantt por fase", ganttFasesSVG(r.fases, hoy), 2),
    w("Avance por fase", `<div class="tb-barras">${r.fases.map((f) => barra(f.fase.replace(/^\d+\.\s*/, ""), Math.round(f.avance * 100), 100, f.vencidas ? "#C62828" : "#2E7D32", `${pct(f.avance)} · ${f.hechas}/${f.total}${f.vencidas ? ` · ${f.vencidas} venc.` : ""}`)).join("")}</div>`, 2),
    w("Por país", `<table class="tb-t"><tr><th>País</th><th>Tareas</th><th>Hechas</th><th>Vencidas</th></tr>${Object.entries(r.paises).map(([p, x]) => `<tr><td>${esc(p)}</td><td>${x.total}</td><td>${x.hechas}</td><td style="color:${x.vencidas ? "#C62828" : ""}">${x.vencidas}</td></tr>`).join("")}</table>`),
    w("Vencido y por vencer (60 días)", tablaItems(r.proximos), 3),
    w("En proceso", tablaItems(r.enProceso, 10), 2),
    w("Riesgos y auditoría", `<p>${plan.riesgos.length} riesgos (${plan.riesgos.filter((x) => (x.prob || 0) * (x.impacto || 0) >= 15).length} altos)</p>
      <p>${plan.auditoria?.total || 0} preguntas de auditoría${plan.auditoria?.cumple != null ? ` · cumple ${plan.auditoria.cumple} · parcial ${plan.auditoria.parcial} · no cumple ${plan.auditoria.no}` : ""}</p>`),
    w("Cambios normativos que tocan el plan (90 días)", cambios.length ? `<ul class="tb-lista">${cambios.slice(0, 8).map((e) => `<li><span class="tb-p" style="background:${e.impacto === "alto" ? "#C62828" : e.impacto === "medio" ? "#EF6C00" : "#90A4AE"}"></span><a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(e.titulo.slice(0, 140))}</a><span class="tb-sub"> ${esc(e.fecha)} · ${esc((e.leyes || []).map((l) => l.sigla || l.id).join(", "))}</span></li>`).join("")}</ul>` : `<p class="tb-sub">Sin cambios recientes en la Bitácora normativa para las leyes de este plan.</p>`, 3),
    w("Cumplido", tablaItems(r.cumplidos.slice().reverse(), 10), 3),
  ].join("");
}

export const CSS_PLAN = `.pl-gantt{width:100%;height:auto}.pl-barra{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0}`;

/**
 * Monta el importador y el tablero en `raiz`. `bitacora`: promesa con las entradas de la bitácora normativa (opcional).
 * `alCambiar`: se llama cuando cambia el plan activo (para refrescar otros tableros).
 */
export function montarSeguimiento(raiz, { bitacora = Promise.resolve([]), alCambiar = () => {} } = {}) {
  raiz.innerHTML = `<div class="pl-barra"><label class="boton">📥 Importar plan (.xlsx o .json) <input type="file" accept=".xlsx,.json" hidden data-pl="archivo"></label>
    <select data-pl="sel" aria-label="Plan importado" style="max-width:420px"></select><button type="button" data-pl="borrar">Quitar este plan</button></div>
    <p class="meta" data-pl="estado"></p><div class="tb-grid" data-pl="vista"></div>`;
  const q = (k) => raiz.querySelector(`[data-pl="${k}"]`);
  let entradas = [];
  bitacora.then((x) => { entradas = x || []; pintar(); }).catch(() => {});
  function pintar() {
    const d = leerPlanes(), p = d.planes.find((x) => x.id === d.activo) || d.planes[0];
    q("sel").innerHTML = d.planes.length ? d.planes.map((x) => `<option value="${esc(x.id)}"${p && x.id === p.id ? " selected" : ""}>${esc(x.titulo)} · importado ${esc(x.importado.slice(0, 10))}</option>`).join("") : `<option value="">Sin planes importados</option>`;
    q("borrar").disabled = !p;
    if (!p) { q("vista").innerHTML = `<p class="meta">Descarga la plantilla en Caja del analista → Normativa por país → «📊 Plantilla de proyecto en Excel», llénala (estados, avance, fechas) e impórtala aquí. Cada vez que la actualices, vuelve a importarla: reemplaza al plan con el mismo nombre.</p>`; return; }
    const r = resumenPlan(p);
    q("vista").innerHTML = widgetsPlan(p, r, { cambios: cambiosQueTocan(p, entradas) });
  }
  q("archivo").addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    q("estado").textContent = "Leyendo…";
    try {
      const plan = await importarArchivo(f.name, new Uint8Array(await f.arrayBuffer()));
      const d = leerPlanes();
      const previo = d.planes.find((x) => x.titulo === plan.titulo);
      const id = previo?.id || `plan-${Date.now().toString(36)}`;
      d.planes = [{ ...plan, id, archivo: f.name, importado: new Date().toISOString() }, ...d.planes.filter((x) => x.id !== id)].slice(0, MAX_PLANES);
      d.activo = id;
      if (!guardarPlanes(d)) throw new Error("No se pudo guardar en este navegador (modo privado o sin espacio).");
      q("estado").textContent = `Importado: ${plan.tareas.length} tareas, ${plan.recurrentes.length} obligaciones recurrentes${previo ? " (reemplazó la versión anterior)" : ""}.`;
      pintar(); alCambiar();
    } catch (err) { q("estado").textContent = `No se pudo importar: ${err.message}`; }
    e.target.value = "";
  });
  q("sel").addEventListener("change", () => { const d = leerPlanes(); d.activo = q("sel").value; guardarPlanes(d); pintar(); alCambiar(); });
  q("borrar").addEventListener("click", () => {
    const d = leerPlanes(), p = d.planes.find((x) => x.id === q("sel").value);
    if (!p || !confirm(`¿Quitar «${p.titulo}» de este navegador? El archivo original no se toca.`)) return;
    d.planes = d.planes.filter((x) => x.id !== p.id); d.activo = d.planes[0]?.id || null; guardarPlanes(d); pintar(); alCambiar();
  });
  pintar();
  return { pintar };
}
