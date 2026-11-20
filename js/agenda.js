// Página «Agenda regulatoria de México» (data/normativa/agenda.json, generado por tools/normativa/agenda.py).
// Todo el texto que viene de fuentes externas se escapa.
export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const $ = (id) => document.getElementById(id);
const url = (u) => (/^https:\/\//i.test(String(u || "")) ? esc(u) : "#");

/** Filtra señales según los controles de la página. */
export function filtrar(senales, f) {
  const q = String(f.q || "").toLowerCase().trim();
  return (senales || []).filter((s) => (!f.etapa || s.etapa === f.etapa) && (!f.sector || (s.sectores || []).includes(f.sector))
    && (!f.tema || (s.temas || []).includes(f.tema))
    && (!f.ambito || (s.ambito || "federal") === f.ambito) && (!f.estado || s.estado === f.estado) && (s.probabilidad || 0) >= Number(f.prob || 0)
    && (!q || `${s.titulo} ${(s.leyes || []).join(" ")} ${s.medio}`.toLowerCase().includes(q)));
}

/** Meses aaaa-mm desde `desde` (inclusive) durante `n` meses. */
export function meses(desde, n = 12) {
  const [a, m] = String(desde).split("-").map(Number), out = [];
  for (let i = 0; i < n; i++) { const d = new Date(Date.UTC(a, m - 1 + i, 1)); out.push(d.toISOString().slice(0, 7)); }
  return out;
}

/** Señales en curso cuya ventana estimada toca cada mes de los próximos 12. */
export function porMes(senales, desde, n = 12) {
  const lista = meses(desde, n);
  return lista.map((mes) => [mes, (senales || []).filter((s) => s.estado === "en curso" && s.ventana && s.ventana[0] <= mes && mes <= s.ventana[1])
    .sort((a, b) => (b.probabilidad || 0) - (a.probabilidad || 0))]);
}

const NOMBRE_MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const mesLargo = (m) => `${NOMBRE_MES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const legible = (k) => { const t = String(k || "").replace(/_/g, " "); return t.charAt(0).toUpperCase() + t.slice(1); };
const claseConf = (c) => (/desmentida/.test(c) ? "conf-desm" : /oficial/.test(c) ? "conf-oficial" : /varios/.test(c) ? "conf-varios" : "conf-uno");

function fila(s, nombres, temas = {}) {
  const pct = Math.round((s.probabilidad || 0) * 100);
  const secs = (s.temas || []).map((x) => `<span class="chip">${esc(temas[x] || x)}</span>`).join("") + (s.sectores || []).map((x) => `<span class="chip">🏭 ${esc(nombres[x] || legible(x))}</span>`).join("");
  const leyes = (s.leyes || []).map((x) => `<div class="meta">⚖️ ${esc(x)}</div>`).join("");
  const notas = (s.notas || []).slice(-5).map((n) => `<li><a href="${url(n.u)}" target="_blank" rel="noopener noreferrer">${esc(n.m || "fuente")}</a> · ${esc(n.f)}</li>`).join("");
  const estado = s.estado === "publicada" ? `<div class="estado-pub">✔ Publicada en el DOF el ${esc(s.publicada_el)}</div>` : "";
  const verif = (s.verificaciones || []).map((n) => `<li>⚠️ <a href="${url(n.u)}" target="_blank" rel="noopener noreferrer">${esc(n.m || "verificación")}</a>: ${esc(n.t)}</li>`).join("");
  const conf = `<div class="${claseConf(s.confirmacion || "")}">${esc(s.confirmacion || "")}</div>${verif ? `<ul>${verif}</ul>` : ""}`;
  const vig = s.vigor_desde ? `<div class="meta">Entra en vigor: ${esc(mesLargo(s.vigor_desde))}</div>` : "";
  return `<tr><td>${esc(s.detectado)}${s.actualizado && s.actualizado !== s.detectado ? `<div class="meta">act. ${esc(s.actualizado)}</div>` : ""}</td>
    <td><a href="${url(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.titulo)}</a><div class="meta">${esc(s.fuente)} · ${s.ambito === "estatal" ? "estatal" : "federal"}</div>${estado}</td>
    <td>${esc(s.etapa_nombre)}</td><td><span class="prob" aria-hidden="true"><i style="width:${pct}%"></i></span> ${pct} %</td>
    <td>${s.vigor_desde ? "" : `${esc(s.horizonte_meses)} meses`}${vig}${s.ventana ? `<div class="meta">${esc(mesLargo(s.ventana[0]))} – ${esc(mesLargo(s.ventana[1]))}</div>` : ""}</td><td>${secs || '<span class="meta">sin tema identificado</span>'}${leyes}</td>
    <td>${conf}<details><summary>${(s.notas || []).length} fuente(s)</summary><ul>${notas}</ul></details></td></tr>`;
}

async function iniciar() {
  let d;
  try {
    const r = await fetch("data/normativa/agenda.json", { cache: "no-cache" });
    if (!r.ok) throw new Error(String(r.status));
    d = await r.json();
  } catch {
    $("ag-kpis").textContent = "La agenda aún no se ha generado (se crea con la revisión normativa diaria).";
    return;
  }
  const nombres = d.sectores_nombres || {}, r = d.resumen || {}, temas = d.temas || {};
  $("ag-kpis").innerHTML = [["En curso", r.en_curso], ["Probabilidad alta (≥70 %)", r.alta_probabilidad], ["Federales", r.federal], ["Estatales", r.estatal], ["Ya publicadas en el DOF", r.publicadas], ["Desmentidas o matizadas", r.desmentidas]]
    .map(([k, v]) => `<div class="kpi"><b>${esc(v ?? 0)}</b>${esc(k)}</div>`).join("") + `<div class="kpi meta">Actualizado<br>${esc(d.generado_utc)}</div>`;
  for (const [k, e] of Object.entries(d.etapas || {})) $("ag-etapa").insertAdjacentHTML("beforeend", `<option value="${esc(k)}">${esc(e.nombre)}</option>`);
  const secs = [...new Set((d.senales || []).flatMap((s) => s.sectores || []))].sort((a, b) => String(nombres[a] || a).localeCompare(String(nombres[b] || b), "es"));
  for (const [k, v] of Object.entries(temas).sort((a, b) => a[1].localeCompare(b[1], "es"))) $("ag-tema").insertAdjacentHTML("beforeend", `<option value="${esc(k)}">${esc(v)}</option>`);
  $("ag-temas").innerHTML = Object.entries(r.por_tema || {}).map(([k, v]) => `<div class="kpi"><b>${esc(v)}</b>${esc(temas[k] || (k === "otros" ? "Otros" : k))}</div>`).join("") || '<span class="meta">Sin datos</span>';
  const p = d.proximo_periodo;
  if (p) $("ag-periodo").textContent = `${p.en_curso ? "Periodo ordinario de sesiones en curso" : "Próximo periodo ordinario de sesiones"}: del ${p.inicio} al ${p.fin}. Las iniciativas se votan sobre todo en estos periodos (1 sep–15 dic y 1 feb–30 abr); fuera de ellos sesiona la Comisión Permanente.`;
  const inicio = String(d.generado_utc || new Date().toISOString()).slice(0, 7);
  $("ag-meses").innerHTML = porMes(d.senales, inicio).map(([m, l]) => `<div class="mes"><h3>${esc(mesLargo(m))} · ${l.length}</h3>${l.length
    ? `<ul>${l.slice(0, 6).map((s) => `<li>${Math.round((s.probabilidad || 0) * 100)} % · ${esc(s.titulo.slice(0, 90))}</li>`).join("")}${l.length > 6 ? `<li class="meta">y ${l.length - 6} más</li>` : ""}</ul>` : '<div class="vacio">Sin señales todavía</div>'}</div>`).join("");
  for (const k of secs) $("ag-sector").insertAdjacentHTML("beforeend", `<option value="${esc(k)}">${esc(nombres[k] || legible(k))}</option>`);
  $("ag-sectores").innerHTML = Object.entries(r.por_sector || {}).map(([k, v]) => `<div class="kpi"><b>${esc(v)}</b>${esc(nombres[k] || legible(k))}</div>`).join("") || '<span class="meta">Sin datos</span>';
  $("ag-fuentes").innerHTML = Object.entries(d.fuentes || {}).map(([k, v]) => `<li><b>${esc(k)}:</b> ${esc(v)}</li>`).join("");
  $("ag-etapas").innerHTML = `<table><thead><tr><th>Etapa</th><th>Probabilidad estimada</th><th>Horizonte típico</th></tr></thead><tbody>${
    Object.values(d.etapas || {}).map((e) => `<tr><td>${esc(e.nombre)}</td><td>${Math.round(e.prob * 100)} %</td><td>${esc(e.meses)} meses</td></tr>`).join("")}</tbody></table>`;
  const ids = ["ag-etapa", "ag-tema", "ag-sector", "ag-ambito", "ag-estado", "ag-prob", "ag-q"];
  const pintar = () => {
    const f = { etapa: $("ag-etapa").value, tema: $("ag-tema").value, sector: $("ag-sector").value, ambito: $("ag-ambito").value, estado: $("ag-estado").value, prob: $("ag-prob").value, q: $("ag-q").value };
    const lista = filtrar(d.senales, f);
    $("ag-filas").innerHTML = lista.map((s) => fila(s, nombres, temas)).join("") || '<tr><td colspan="7" class="meta">Sin señales con estos filtros.</td></tr>';
  };
  for (const id of ids) $(id).addEventListener("input", pintar);
  pintar();
}

if (typeof document !== "undefined" && document.getElementById("ag-filas")) iniciar();
