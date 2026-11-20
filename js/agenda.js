// Página «Agenda regulatoria de México» (data/normativa/agenda.json, generado por tools/normativa/agenda.py).
// Todo el texto que viene de fuentes externas se escapa.
export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const $ = (id) => document.getElementById(id);
const url = (u) => (/^https:\/\//i.test(String(u || "")) ? esc(u) : "#");

/** Filtra señales según los controles de la página. */
export function filtrar(senales, f) {
  const q = String(f.q || "").toLowerCase().trim();
  return (senales || []).filter((s) => (!f.etapa || s.etapa === f.etapa) && (!f.sector || (s.sectores || []).includes(f.sector))
    && (!f.ambito || (s.ambito || "federal") === f.ambito) && (!f.estado || s.estado === f.estado) && (s.probabilidad || 0) >= Number(f.prob || 0)
    && (!q || `${s.titulo} ${(s.leyes || []).join(" ")} ${s.medio}`.toLowerCase().includes(q)));
}

function fila(s, nombres) {
  const pct = Math.round((s.probabilidad || 0) * 100);
  const secs = (s.sectores || []).map((x) => `<span class="chip">${esc(nombres[x] || x)}</span>`).join("");
  const leyes = (s.leyes || []).map((x) => `<div class="meta">⚖️ ${esc(x)}</div>`).join("");
  const notas = (s.notas || []).slice(-5).map((n) => `<li><a href="${url(n.u)}" target="_blank" rel="noopener noreferrer">${esc(n.m || "fuente")}</a> · ${esc(n.f)}</li>`).join("");
  const estado = s.estado === "publicada" ? `<div class="estado-pub">✔ Publicada en el DOF el ${esc(s.publicada_el)}</div>` : "";
  return `<tr><td>${esc(s.detectado)}${s.actualizado && s.actualizado !== s.detectado ? `<div class="meta">act. ${esc(s.actualizado)}</div>` : ""}</td>
    <td><a href="${url(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.titulo)}</a><div class="meta">${esc(s.fuente)} · ${s.ambito === "estatal" ? "estatal" : "federal"}</div>${estado}</td>
    <td>${esc(s.etapa_nombre)}</td><td><span class="prob" aria-hidden="true"><i style="width:${pct}%"></i></span> ${pct} %</td>
    <td>${esc(s.horizonte_meses)} meses</td><td>${secs || '<span class="meta">sin sector identificado</span>'}${leyes}</td>
    <td><details><summary>${(s.notas || []).length} fuente(s)</summary><ul>${notas}</ul></details></td></tr>`;
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
  const nombres = d.sectores_nombres || {}, r = d.resumen || {};
  $("ag-kpis").innerHTML = [["En curso", r.en_curso], ["Probabilidad alta (≥70 %)", r.alta_probabilidad], ["Federales", r.federal], ["Estatales", r.estatal], ["Ya publicadas en el DOF", r.publicadas]]
    .map(([k, v]) => `<div class="kpi"><b>${esc(v ?? 0)}</b>${esc(k)}</div>`).join("") + `<div class="kpi meta">Actualizado<br>${esc(d.generado_utc)}</div>`;
  for (const [k, e] of Object.entries(d.etapas || {})) $("ag-etapa").insertAdjacentHTML("beforeend", `<option value="${esc(k)}">${esc(e.nombre)}</option>`);
  const secs = [...new Set((d.senales || []).flatMap((s) => s.sectores || []))].sort((a, b) => String(nombres[a] || a).localeCompare(String(nombres[b] || b), "es"));
  for (const k of secs) $("ag-sector").insertAdjacentHTML("beforeend", `<option value="${esc(k)}">${esc(nombres[k] || k)}</option>`);
  $("ag-sectores").innerHTML = Object.entries(r.por_sector || {}).map(([k, v]) => `<div class="kpi"><b>${esc(v)}</b>${esc(nombres[k] || k)}</div>`).join("") || '<span class="meta">Sin datos</span>';
  $("ag-fuentes").innerHTML = Object.entries(d.fuentes || {}).map(([k, v]) => `<li><b>${esc(k)}:</b> ${esc(v)}</li>`).join("");
  $("ag-etapas").innerHTML = `<table><thead><tr><th>Etapa</th><th>Probabilidad estimada</th><th>Horizonte típico</th></tr></thead><tbody>${
    Object.values(d.etapas || {}).map((e) => `<tr><td>${esc(e.nombre)}</td><td>${Math.round(e.prob * 100)} %</td><td>${esc(e.meses)} meses</td></tr>`).join("")}</tbody></table>`;
  const ids = ["ag-etapa", "ag-sector", "ag-ambito", "ag-estado", "ag-prob", "ag-q"];
  const pintar = () => {
    const f = { etapa: $("ag-etapa").value, sector: $("ag-sector").value, ambito: $("ag-ambito").value, estado: $("ag-estado").value, prob: $("ag-prob").value, q: $("ag-q").value };
    const lista = filtrar(d.senales, f);
    $("ag-filas").innerHTML = lista.map((s) => fila(s, nombres)).join("") || '<tr><td colspan="7" class="meta">Sin señales con estos filtros.</td></tr>';
  };
  for (const id of ids) $(id).addEventListener("input", pintar);
  pintar();
}

if (typeof document !== "undefined" && document.getElementById("ag-filas")) iniciar();
