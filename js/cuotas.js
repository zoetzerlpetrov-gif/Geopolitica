// Admin → Cuotas de APIs y llaves (cuotas.html): lee data/cuotas/estado.json (workflow «Cuotas de APIs y llaves»).
const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const num = (n) => (n == null ? "—" : Number(n).toLocaleString("es-MX", { maximumFractionDigits: 1 }));
const COLOR = { verde: "#2e7d32", amarillo: "#d4a017", rojo: "#C8102E" };
export const TEXTO = { verde: "Holgado", amarillo: "Vigilar", rojo: "Cerca del tope", sin_limite: "Límite por verificar", sin_medicion: "Sin medición (depende de visitas)" };

/** Recomendación según el semáforo. */
export function recomendacion(s) {
  if (s.semaforo === "rojo") return `Actuar ya: ${s.si_excede || "revisar el plan del servicio"}`;
  if (s.semaforo === "amarillo") return `Planear: ${s.si_excede || "revisar el plan del servicio"}`;
  if (s.semaforo === "sin_limite") return "Confirmar el límite en el panel del servicio.";
  if (s.semaforo === "sin_medicion") return s.uso_por_visitas ? "Revisar el consumo en el panel del servicio cada semana." : "Sin consumo automático registrado.";
  return "Nada que hacer.";
}

export function fila(s) {
  const pct = s.pct == null ? null : Math.min(100, Math.round(s.pct * 100));
  const medido = s.real && s.real.usado != null;
  const barra = pct == null ? "" : `<span class="barra" role="img" aria-label="${esc(pct)} %"><i style="width:${esc(pct)}%;background:${esc(COLOR[s.semaforo] || "#888")}"></i></span> ${esc(pct)} %`;
  const det = (s.detalle || []).filter((d) => d.corridas_dia != null).map((d) => `<li>${esc(d.workflow)}: ${esc(num(d.corridas_dia))} corridas/día → ${esc(num(d.llamadas_dia))} ${esc(s.unidad)}/día${d.nota ? ` (${esc(d.nota)})` : ""}</li>`).join("");
  const err = s.real && s.real.error ? `<br><span class="meta">Medición: ${esc(s.real.error)}</span>` : "";
  return `<tr><td><b>${esc(s.nombre)}</b><br><span class="meta">Secreto: ${esc(s.secreto)}</span>${s.panel ? ` · <a href="${esc(s.panel)}" target="_blank" rel="noopener">panel</a>` : ""}</td>
    <td>${esc(num(s.usado))} ${esc(s.unidad)} / ${esc(s.periodo)} <span class="chip">${medido ? "medido" : s.usado == null ? "sin dato" : "estimado"}</span>${barra ? `<br>${barra}` : ""}${det ? `<details><summary class="meta">detalle</summary><ul>${det}</ul></details>` : ""}${err}</td>
    <td>${s.limite == null ? "—" : `${esc(num(s.limite))} ${esc(s.unidad)} / ${esc(s.periodo)}`}${s.verificado ? "" : ' <span class="chip">verificar</span>'}</td>
    <td class="s-${esc(COLOR[s.semaforo] ? s.semaforo : "gris")}">${esc(TEXTO[s.semaforo] || s.semaforo)}</td>
    <td>${esc(recomendacion(s))}</td></tr>`;
}

async function iniciar() {
  let d;
  try { const r = await fetch("data/cuotas/estado.json", { cache: "no-store" }); if (!r.ok) throw Error(r.status); d = await r.json(); }
  catch { $("cq-kpis").textContent = "Aún no hay datos: el workflow «Cuotas de APIs y llaves» publica el primer reporte en su siguiente corrida."; return; }
  const cuenta = (k) => d.servicios.filter((s) => s.semaforo === k).length;
  $("cq-kpis").innerHTML = [["Servicios", d.servicios.length], ["Cerca del tope", cuenta("rojo")], ["Vigilar", cuenta("amarillo")], ["Límite por verificar", cuenta("sin_limite")]]
    .map(([t, n]) => `<div class="kpi"><span class="meta">${esc(t)}</span><b>${esc(n)}</b></div>`).join("") + `<div class="kpi"><span class="meta">Actualizado</span><b style="font-size:15px">${esc(new Date(d.generado_utc).toLocaleString("es-MX"))}</b></div>`;
  const orden = { rojo: 0, amarillo: 1, sin_limite: 2, sin_medicion: 3, verde: 4 };
  $("cq-filas").innerHTML = d.servicios.slice().sort((a, b) => (orden[a.semaforo] ?? 9) - (orden[b.semaforo] ?? 9)).map(fila).join("");
  const u = d.limites_por_usuario || {};
  const planes = Object.keys(u).filter((k) => !k.startsWith("_"));
  $("cq-usuarios").innerHTML = planes.length ? `<div class="tabla"><table><thead><tr><th>Plan</th>${Object.keys(u[planes[0]]).map((k) => `<th>${esc(k.replace(/_/g, " "))} por día</th>`).join("")}</tr></thead><tbody>${planes.map((p) => `<tr><td>${esc(p)}</td>${Object.values(u[p]).map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div><p class="meta">${esc(u._nota || "")}</p>` : "";
}

if (typeof document !== "undefined" && document.getElementById("cq-filas")) iniciar();
