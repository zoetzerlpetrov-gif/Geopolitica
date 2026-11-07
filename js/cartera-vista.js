// HTML de la cartera de proyectos y de la vista para directivos (sin DOM: devuelve texto HTML escapado).
import { ESTADOS } from "./cartera-logica.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pct = (x) => `${Math.round((x || 0) * 100)} %`;
const dinero = (n) => (n == null ? "—" : Number(n).toLocaleString("es-MX", { maximumFractionDigits: 0 }));
const fechaHora = (s) => (s ? new Date(s).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : "—");
const color = (e) => ESTADOS[e]?.[2] || "#90A4AE";

export const CSS_CARTERA = `
.ct-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
.ct-card{border:1px solid var(--line,#8884);border-left:6px solid var(--c);border-radius:10px;padding:10px 12px;background:var(--surface,#fff);cursor:pointer;text-align:left;font:inherit;color:inherit}
.ct-card:hover,.ct-card:focus-visible{outline:2px solid var(--c)}
.ct-card h3{margin:0 0 2px;font-size:15px}.ct-card .ct-emp{font-size:12px;opacity:.75}
.ct-av{height:8px;border-radius:4px;background:#8883;position:relative;margin:8px 0 4px}.ct-av i{position:absolute;inset:0 auto 0 0;border-radius:4px;background:var(--c)}
.ct-av b{position:absolute;top:-3px;width:2px;height:14px;background:#333}
.ct-est{display:flex;gap:10px;align-items:flex-start;border-left:8px solid var(--c);padding:8px 12px;border-radius:8px;background:var(--surface-2,#f4f6f8);margin:8px 0}
.ct-est .ct-big{font-size:28px;line-height:1}.ct-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin:8px 0}
.ct-kpi{border:1px solid var(--line,#8884);border-radius:8px;padding:8px}.ct-kpi b{display:block;font-size:22px}.ct-kpi span{font-size:12px;opacity:.75}
.ct-sec{margin:14px 0}.ct-sec h3{margin:0 0 6px}.ct-tend{width:100%;height:auto;max-height:180px}
@media print{.no-imprimir,.topbar,nav{display:none!important}.ct-card{break-inside:avoid}body{background:#fff;color:#000}}`;

/** Tarjeta de un plan en la cartera. */
export function htmlTarjeta(f) {
  const c = color(f.estado.color);
  return `<button type="button" class="ct-card" data-plan="${esc(f.id)}" style="--c:${c}">
    <div class="ct-emp">${esc(f.empresa)}${f.sector ? ` · ${esc(f.sector)}` : ""}${f.paises.length ? ` · ${esc(f.paises.join(", "))}` : ""}</div>
    <h3>${f.estado.icono} ${esc(f.titulo)}</h3>
    <div class="ct-av" title="Avance real ${pct(f.avance)}; planeado a hoy ${pct(f.planeado)}"><i style="width:${Math.round(f.avance * 100)}%"></i><b style="left:${Math.round(f.planeado * 100)}%"></b></div>
    <div class="meta">Avance ${pct(f.avance)} (planeado ${pct(f.planeado)}) · ${f.vencidas} vencidas · ${f.porVencer} por vencer en 30 días${f.escalar ? ` · ${f.escalar} por decidir` : ""}</div>
    <div class="meta">${f.proximoHito ? `Próximo hito: ${esc(f.proximoHito.tarea.replace(/^Hito:\s*/, ""))} (${esc(f.proximoHito.fin)})` : "Sin hitos pendientes"} · fin ${esc(f.finEstimado || "—")}${f.desviacion != null ? ` · ${f.desviacion > 0 ? `+${f.desviacion}` : f.desviacion} días vs línea base` : ""}</div>
    <div class="meta">${f.estado.motivos.slice(0, 2).map(esc).join(" · ")} · actualizado ${esc(fechaHora(f.actualizado))}</div></button>`;
}

/** Comparación por sector. */
export function htmlSectores(rows) {
  if (!rows.length) return "";
  return `<div class="desliza"><table class="t"><tr><th>Sector</th><th>Planes</th><th>Avance promedio</th><th>Vencidas</th><th>En riesgo</th></tr>
    ${rows.map((s) => `<tr><td>${esc(s.sector)}</td><td>${s.planes}</td><td>${pct(s.avance)}</td><td>${s.vencidas}</td><td>${s.rojos ? `🔴 ${s.rojos}` : "—"}</td></tr>`).join("")}</table></div>`;
}

/** Tendencia de avance y vencidas a partir de los cortes guardados (SVG). */
export function svgTendencia(t) {
  if (t.length < 2) return `<p class="meta">Se dibuja cuando haya al menos dos cortes (cada actualización del plan guarda uno).</p>`;
  const W = 600, H = 150, L = 34, x = (i) => L + (i / (t.length - 1)) * (W - L - 10), y = (v) => H - 20 - v * (H - 40);
  const maxV = Math.max(1, ...t.map((p) => p.vencidas || 0)), yv = (v) => H - 20 - (v / maxV) * (H - 40);
  return `<svg viewBox="0 0 ${W} ${H}" class="ct-tend" role="img" aria-label="Tendencia de avance" fill="currentColor">
    ${[0, 0.5, 1].map((v) => `<line x1="${L}" x2="${W - 10}" y1="${y(v)}" y2="${y(v)}" stroke="#8883"/><text x="2" y="${y(v) + 3}" font-size="9">${v * 100}%</text>`).join("")}
    <polyline points="${t.map((p, i) => `${x(i)},${y(p.avance)}`).join(" ")}" fill="none" stroke="#2E7D32" stroke-width="2.5"/>
    <polyline points="${t.map((p, i) => `${x(i)},${yv(p.vencidas || 0)}`).join(" ")}" fill="none" stroke="#C62828" stroke-width="1.5" stroke-dasharray="4 3"/>
    ${t.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.avance)}" r="3" fill="#2E7D32"><title>${esc(p.fecha)}: ${pct(p.avance)} · ${p.vencidas} vencidas</title></circle>`).join("")}
    <text x="${L}" y="${H - 4}" font-size="9">${esc(t[0].fecha)}</text><text x="${W - 10}" y="${H - 4}" font-size="9" text-anchor="end">${esc(t.at(-1).fecha)}</text>
    <text x="${W - 10}" y="12" font-size="9" text-anchor="end" fill="#2E7D32">— avance</text><text x="${W - 10}" y="24" font-size="9" text-anchor="end" fill="#C62828">- - vencidas</text></svg>`;
}

const lista = (xs, f, vacio) => (xs.length ? `<ul>${xs.map((x) => `<li>${f(x)}</li>`).join("")}</ul>` : `<p class="meta">${vacio}</p>`);

/** Vista ejecutiva (para el directivo) de un plan. `reg`: registro de la nube (empresa, sector, titulo, actualizado). */
export function htmlEjecutivo(v, reg) {
  const c = color(v.estado.color), r = v.resumen;
  const tarea = (t) => `${esc(t.tarea.replace(/^(Trámite|Hito):\s*/, ""))} <span class="meta">${[t.fin, t.pais, t.rol].filter(Boolean).map(esc).join(" · ")}</span>`;
  return `
  <div class="ct-est" style="--c:${c}"><span class="ct-big">${v.estado.icono}</span><div><b>${esc(v.estado.etiqueta)}</b> · ${esc(reg.empresa)}${reg.sector ? ` · ${esc(reg.sector)}` : ""}
    <div>${v.estado.motivos.map(esc).join(" · ")}</div><div class="meta">Datos actualizados ${esc(fechaHora(reg.actualizado))}</div></div></div>
  <div class="ct-kpis">
    <div class="ct-kpi"><b>${pct(v.avanceReal)}</b><span>avance real (planeado a hoy: ${pct(v.avancePlaneado)})</span></div>
    <div class="ct-kpi"><b>${esc(r.finEstimado || "—")}</b><span>fin estimado${v.lineaBase ? ` · línea base ${esc(v.lineaBase)}` : " · sin línea base"}</span></div>
    <div class="ct-kpi"><b style="color:${v.desviacion > 0 ? "#C62828" : "#2E7D32"}">${v.desviacion == null ? "—" : `${v.desviacion > 0 ? "+" : ""}${v.desviacion} días`}</b><span>contra la línea base</span></div>
    <div class="ct-kpi"><b style="color:${r.semaforo.vencido ? "#C62828" : ""}">${r.semaforo.vencido}</b><span>vencidas · ${r.semaforo["7"]} vencen en 7 días</span></div>
    <div class="ct-kpi"><b>${v.permisos.obtenidos}/${v.permisos.total}</b><span>permisos críticos obtenidos${v.permisos.vencidos ? ` · ${v.permisos.vencidos} vencidos` : ""}</span></div>
    <div class="ct-kpi"><b style="color:${v.escalar.length ? "#EF6C00" : ""}">${v.escalar.length}</b><span>decisiones pendientes del directivo</span></div>
  </div>
  <div class="ct-sec"><h3>🧭 Lo que se necesita del directivo</h3>${lista(v.escalar, (t) => `<b>${esc(t.escalar)}</b> — ${tarea(t)}`, "Nada escalado. (Columna «Escalar al directivo» del Excel.)")}</div>
  <div class="ct-sec"><h3>🏁 Hitos</h3>${v.hitos.atrasados.length ? `<p><b style="color:#C62828">Atrasados:</b></p>${lista(v.hitos.atrasados, tarea, "")}` : ""}${lista(v.hitos.proximos, tarea, "Sin hitos pendientes.")}</div>
  <div class="ct-sec"><h3>📈 Tendencia</h3>${svgTendencia(v.tendencia)}</div>
  <div class="ct-sec"><h3>⚖️ Cumplimiento regulatorio</h3>
    <p>${v.permisos.obtenidos} de ${v.permisos.total} permisos y trámites críticos obtenidos.</p>
    ${lista(v.permisos.pendientes.slice(0, 8), tarea, "Sin permisos críticos pendientes.")}
    <p><b>Vencimientos legales en 60 días o ya vencidos</b></p>${lista(v.legales.slice(0, 10), (t) => `${tarea(t)} <span class="meta">· plazo: ${esc(t.plazo)}${t.base ? ` · ${esc(t.base)}` : ""}</span>`, "Ninguno.")}
    <p><b>Cambios normativos recientes que tocan el plan</b></p>${lista(v.cambios.slice(0, 6), (e) => `<a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(e.titulo.slice(0, 160))}</a> <span class="meta">${esc(e.fecha)} · impacto ${esc(e.impacto)}</span>`, "Sin cambios en los últimos 90 días.")}</div>
  <div class="ct-sec"><h3>⚠️ Riesgos principales</h3>${lista(v.riesgos, (x) => `${esc(x.riesgo)} <span class="meta">probabilidad ${x.prob ?? "—"} × impacto ${x.impacto ?? "—"} = ${x.nivel}</span>`, "Sin riesgos abiertos.")}</div>
  <div class="ct-sec"><h3>💰 Presupuesto</h3>${v.presupuesto ? `<p>Gastado ${dinero(v.presupuesto.costo)} de ${dinero(v.presupuesto.presupuesto)} (${pct(v.presupuesto.presupuesto ? v.presupuesto.costo / v.presupuesto.presupuesto : 0)})${v.presupuesto.proyeccion ? ` · proyección al cierre al ritmo actual: ${dinero(v.presupuesto.proyeccion)}` : ""}</p>
    <div class="desliza"><table class="t"><tr><th>Fase</th><th>Presupuesto</th><th>Gastado</th></tr>${v.presupuesto.porFase.map((f) => `<tr><td>${esc(f.fase)}</td><td>${dinero(f.presupuesto)}</td><td style="color:${f.costo > f.presupuesto ? "#C62828" : ""}">${dinero(f.costo)}</td></tr>`).join("")}</table></div>`
    : `<p class="meta">Sin montos. Llena las columnas «Presupuesto» y «Costo real» del Excel para verlo aquí.</p>`}</div>`;
}
