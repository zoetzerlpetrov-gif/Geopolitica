// Admin → Vulnerabilidades en apps y plataformas (vulns-mundo.html). Lee data/seguridad/vulns_mundo.json
// (tools/seguridad/vulns_mundo.py; en el sitio solo lo entrega el Worker a Admin). «Ya lo actualicé» se guarda solo en
// este navegador. Todo el texto externo se escapa y los enlaces deben ser https.
export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const url = (u) => (/^https:\/\//i.test(String(u || "")) ? esc(u) : "#");
const $ = (id) => document.getElementById(id);
const CLAVE = "gp_vulns_hechas";

export function leerHechas(st = globalThis.localStorage) {
  try { return JSON.parse(st?.getItem(CLAVE) || "{}") || {}; } catch { return {}; }
}
function guardarHechas(h, st = globalThis.localStorage) { try { st?.setItem(CLAVE, JSON.stringify(h)); } catch { /* sin almacenamiento */ } }

/** Días entre una fecha AAAA-MM-DD y hoy. */
const diasDesde = (f, hoy = new Date()) => Math.floor((hoy - new Date(`${f}T00:00:00Z`)) / 86400000);

/** Filtra las vulnerabilidades según los controles de la página. */
export function filtrar(kev, f, hechas = {}, hoy = new Date()) {
  const q = String(f.q || "").toLowerCase().trim();
  return (kev || []).filter((v) => diasDesde(v.fecha, hoy) <= Number(f.dias || 9999)
    && (!f.fab || v.fabricante === f.fab) && (!f.inv || v.afecta_inventario) && (!f.pend || !hechas[v.cve])
    && (!f.riesgo || (f.riesgo === "critical" ? (v.cvss || 0) >= 9 : f.riesgo === "epss" ? (v.epss || 0) >= 0.1 : v.ransomware))
    && (!q || `${v.fabricante} ${v.producto} ${v.cve} ${v.nombre}`.toLowerCase().includes(q)));
}

function gravedad(v) {
  const s = (v.severidad || "").toLowerCase();
  const cvss = v.cvss != null ? `<span class="sev-${esc(s)}">${esc(v.cvss)} ${esc({ critical: "crítica", high: "alta", medium: "media", low: "baja" }[s] || s)}</span>` : '<span class="meta">CVSS pendiente</span>';
  const epss = v.epss != null ? `<div class="meta">Prob. de ataque: ${(v.epss * 100).toFixed(v.epss < 0.01 ? 2 : 1)} %</div>` : "";
  return `${cvss}${epss}${v.ransomware ? '<div><span class="chip rw">usada por ransomware</span></div>' : ""}`;
}

export function versionesTexto(v) {
  if (v.versiones?.length) return v.versiones.map((x) => `<div><b>${esc(x.producto)}</b>: ${x.corregida.map((c) => `${esc(c)} o posterior`).join(" · ")}</div>`).join("");
  return '<span class="meta">Sin versión en el NVD todavía: usa el aviso del fabricante.</span>';
}

function fila(v, hechas) {
  const h = hechas[v.cve];
  const avisos = [...(v.aviso_fabricante || []), ...(v.parches || [])].slice(0, 3).map((u, i) => `<a href="${url(u)}" target="_blank" rel="noopener noreferrer">aviso ${i + 1}</a>`).join(" · ");
  return `<tr class="${h ? "hecho" : ""}"><td>${esc(v.fecha)}<div class="meta">límite ${esc(v.limite)}</div></td>
    <td><b>${esc(v.fabricante)}</b> · ${esc(v.producto)}${v.afecta_inventario ? ' <span class="chip inv">lo usamos</span>' : ""}<div class="meta"><a href="https://nvd.nist.gov/vuln/detail/${esc(v.cve)}" target="_blank" rel="noopener noreferrer">${esc(v.cve)}</a></div></td>
    <td>${esc(v.tipo)}<details><summary class="meta">detalle (inglés)</summary><div class="meta">${esc(v.nombre)}. ${esc(v.descripcion)}</div></details></td>
    <td>${gravedad(v)}</td><td>${versionesTexto(v)}<div class="meta">${avisos || ""}</div></td>
    <td class="ver meta">${esc(v.como_verificar)}</td>
    <td><label><input type="checkbox" data-cve="${esc(v.cve)}" ${h ? "checked" : ""}> ${h ? `el ${esc(h.fecha)}` : "pendiente"}</label></td></tr>`;
}

async function iniciar() {
  let d;
  try {
    const r = await fetch("data/seguridad/vulns_mundo.json", { cache: "no-store" });
    if (!r.ok) throw new Error(r.status === 403 ? "Necesitas iniciar sesión de administración." : `Aún no hay datos (HTTP ${r.status}).`);
    d = await r.json();
  } catch (e) {
    $("vm-error").hidden = false; $("vm-error").textContent = `${e.message} Se genera cada día con el flujo «Vulnerabilidades en apps y plataformas».`;
    $("vm-kpis").textContent = ""; return;
  }
  const hechas = leerHechas();
  const r = d.resumen || {};
  $("vm-kpis").innerHTML = [[r.kev_30d, "Explotadas: nuevas en 30 días"], [r.afectan_inventario, "Afectan lo que usamos"], [r.ransomware, "Usadas por ransomware"],
    [r.brechas, "Brechas en plataformas (12 meses)"], [r.prensa, "Titulares de hackeos (12 meses)"]].map(([v, k]) => `<div class="kpi"><b>${esc(v ?? 0)}</b>${esc(k)}</div>`).join("")
    + `<div class="kpi meta">Actualizado<br>${esc(d.generado_utc)}</div>`;
  const fabs = [...new Set((d.kev || []).map((v) => v.fabricante))].sort((a, b) => a.localeCompare(b));
  $("vm-fab").insertAdjacentHTML("beforeend", fabs.map((f) => `<option>${esc(f)}</option>`).join(""));
  const pintar = () => {
    const f = { q: $("vm-q").value, fab: $("vm-fab").value, dias: $("vm-dias").value, riesgo: $("vm-riesgo").value, inv: $("vm-inv").checked, pend: $("vm-pend").checked };
    const lista = filtrar(d.kev, f, hechas);
    $("vm-filas").innerHTML = lista.slice(0, 400).map((v) => fila(v, hechas)).join("") || '<tr><td colspan="7" class="meta">Nada con estos filtros.</td></tr>';
    $("vm-conteo").textContent = `${lista.length} vulnerabilidades${lista.length > 400 ? " (se muestran las 400 más recientes)" : ""}.`;
    const hist = Object.entries(hechas).sort((a, b) => String(b[1].fecha).localeCompare(String(a[1].fecha)));
    $("vm-historial").innerHTML = hist.length ? `<table><tr><th>Fecha</th><th>CVE</th><th>Producto</th></tr>${hist.map(([c, h]) => `<tr><td>${esc(h.fecha)}</td><td>${esc(c)}</td><td>${esc(h.producto || "")}</td></tr>`).join("")}</table>` : '<p class="meta">Aún no marcas ninguna.</p>';
  };
  for (const id of ["vm-q", "vm-fab", "vm-dias", "vm-riesgo", "vm-inv", "vm-pend"]) $(id).addEventListener("input", pintar);
  $("vm-filas").addEventListener("change", (e) => {
    const cve = e.target.dataset.cve; if (!cve) return;
    const v = d.kev.find((x) => x.cve === cve);
    if (e.target.checked) hechas[cve] = { fecha: new Date().toISOString().slice(0, 10), producto: `${v?.fabricante || ""} ${v?.producto || ""}`.trim() };
    else delete hechas[cve];
    guardarHechas(hechas); pintar();
  });
  pintar();
  const cats = [...new Set((d.brechas || []).map((b) => b.categoria).filter(Boolean))].sort();
  $("vm-cat").insertAdjacentHTML("beforeend", cats.map((c) => `<option>${esc(c)}</option>`).join(""));
  const pintarB = () => {
    const c = $("vm-cat").value;
    $("vm-brechas").innerHTML = (d.brechas || []).filter((b) => !c || b.categoria === c).slice(0, 200).map((b) => `<tr><td>${esc(b.publicada)}</td>
      <td><b>${esc(b.nombre)}</b>${b.dominio ? ` <span class="meta">${esc(b.dominio)}</span>` : ""}${b.mx ? ' <span class="chip inv">México</span>' : ""}${b.categoria ? ` <span class="chip">${esc(b.categoria)}</span>` : ""}${b.verificada ? "" : ' <span class="meta">(no verificada)</span>'}</td>
      <td>${esc(b.fecha_brecha)}</td><td>${Number(b.cuentas || 0).toLocaleString("es-MX")}</td><td class="meta">${(b.datos || []).map(esc).join(", ")}</td></tr>`).join("") || '<tr><td colspan="5" class="meta">Sin brechas en esta categoría.</td></tr>';
  };
  $("vm-cat").addEventListener("input", pintarB); pintarB();
  $("vm-prensa").innerHTML = (d.prensa || []).slice(0, 200).map((p) => `<tr><td>${esc(p.f)}</td><td>${esc(p.marca)}<div class="meta">${esc(p.categoria)}</div></td>
    <td><a href="${url(p.u)}" target="_blank" rel="noopener noreferrer">${esc(p.t)}</a></td><td class="meta">${esc(p.m)}</td></tr>`).join("") || '<tr><td colspan="4" class="meta">Aún sin titulares: se acumulan cada día.</td></tr>';
  $("vm-fuentes").innerHTML = Object.entries(d.fuentes || {}).map(([k, v]) => `<li><b>${esc(k)}:</b> ${esc(v)}</li>`).join("") + `<li>${esc(d.nota || "")}</li>`;
}

if (typeof document !== "undefined" && document.getElementById("vm-filas")) iniciar();
