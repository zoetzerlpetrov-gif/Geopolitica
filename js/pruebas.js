// Página de Admin «Tablero de pruebas». Lee las corridas del Worker (solo con sesión de administración). Todo el texto se escapa.
export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const $ = (id) => document.getElementById(id);
const ROLES = ["admin", "demo", "recon", "analyst", "command"];
const NOMBRE = { admin: "Admin", demo: "Demo", recon: "Recon", analyst: "Analyst", command: "Command" };

/** Totales de una corrida: graves, roles con problemas y pruebas unitarias. */
export function totales(c) {
  const roles = c?.roles || [];
  const u = c?.unitarias || {};
  return { graves: roles.reduce((n, r) => n + (r.grave || 0), 0), rolesMal: roles.filter((r) => r.grave).length, roles: roles.length,
    pasan: (u.python?.pasan || 0) + (u.js?.pasan || 0), fallan: (u.python?.fallan || 0) + (u.js?.fallan || 0) };
}

/** Comprobaciones de la última corrida en tabla: filas = comprobación, columnas = rol. */
export function matrizComprobaciones(c) {
  const nombres = [...new Set((c?.roles || []).flatMap((r) => (r.comprobaciones || []).map((x) => x.nombre)))];
  return nombres.map((n) => [n, ROLES.map((rol) => (c.roles.find((r) => r.rol === rol)?.comprobaciones || []).find((x) => x.nombre === n) || null)]);
}

/** Gráfica SVG: graves por corrida (barras) y pruebas unitarias que fallan (línea), de la más antigua a la más reciente. */
export function svgHistorial(corridas) {
  const cs = [...corridas].reverse().slice(-60);
  if (!cs.length) return '<p class="meta">Sin corridas todavía.</p>';
  const W = 900, H = 180, m = 24, ancho = (W - 2 * m) / cs.length, t = cs.map(totales), max = Math.max(1, ...t.map((x) => Math.max(x.graves, x.fallan)));
  const barras = t.map((x, i) => `<rect x="${(m + i * ancho + 1).toFixed(1)}" y="${(H - m - (x.graves / max) * (H - 2 * m)).toFixed(1)}" width="${Math.max(1, ancho - 2).toFixed(1)}" height="${((x.graves / max) * (H - 2 * m)).toFixed(1)}" fill="#C8102E"><title>${esc(cs[i].fecha)}: ${x.graves} graves</title></rect>`).join("");
  const linea = t.map((x, i) => `${(m + i * ancho + ancho / 2).toFixed(1)},${(H - m - (x.fallan / max) * (H - 2 * m)).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Problemas graves por corrida y pruebas unitarias que fallan">${barras}<polyline points="${linea}" fill="none" stroke="#b8860b" stroke-width="2"/>
    <text x="${m}" y="14" font-size="12" fill="currentColor">Barras rojas: problemas graves · línea: pruebas unitarias que fallan (máx. ${max})</text></svg>`;
}

const marca = (ok) => (ok ? '<span class="ok">✔</span>' : '<span class="mal">✘</span>');

/** Compatibilidad con informes anteriores: no reescribe la bitácora ni esconde fallos de carga. */
export function separarAnotaciones(r) {
  const historicos=(r.problemas||[]).filter(p=>/^Capa vacía o sin datos \(aviso\):/.test(p));
  return {problemas:(r.problemas||[]).filter(p=>!historicos.includes(p)),
    avisos:[...(r.avisos||[]),...historicos.map(p=>p.replace(/^Capa vacía o sin datos \(aviso\):/, 'Sin coincidencias en el periodo:')+' · Revisar cobertura de fuentes; no implica ausencia de hechos.')]};
}

async function iniciar() {
  let corridas = [];
  try {
    const r = await fetch("/admin/huella/pruebas", { credentials: "same-origin", cache: "no-store" });
    if (!r.ok) throw new Error(r.status === 403 ? "Necesitas iniciar sesión de administración." : `El servidor respondió ${r.status}.`);
    corridas = (await r.json()).corridas || [];
  } catch (e) {
    $("pr-error").hidden = false;
    $("pr-error").textContent = `${e.message} Esta página solo funciona en https://admin.dominusosint.com/pruebas.html.`;
    $("pr-kpis").textContent = "";
    return;
  }
  const c = corridas[0];
  if (!c) { $("pr-kpis").textContent = "Aún no hay corridas guardadas. La primera llega con la siguiente ejecución de «Pruebas integrales por rol»."; return; }
  const t = totales(c);
  $("pr-kpis").innerHTML = [[t.graves ? `<span class="mal">${t.graves}</span>` : '<span class="ok">0</span>', "Problemas graves"], [`${t.roles - t.rolesMal}/${t.roles}`, "Roles sin problemas graves"],
    [t.fallan ? `<span class="mal">${t.fallan}</span>` : '<span class="ok">0</span>', "Pruebas unitarias que fallan"], [t.pasan, "Pruebas unitarias que pasan"]]
    .map(([v, k]) => `<div class="kpi"><b>${v}</b>${esc(k)}</div>`).join("")
    + `<div class="kpi meta">Corrida<br>${esc(c.fecha)}${c.corrida ? `<br><a href="${esc(/^https:\/\/github\.com\//.test(c.corrida) ? c.corrida : "#")}" target="_blank" rel="noopener noreferrer">ver en GitHub</a>` : ""}</div>`;
  $("pr-roles").innerHTML = `<table><tr><th>Rol</th><th>Graves</th><th>Arranque</th><th>Capas (vacías)</th><th>Imágenes pegadas</th><th>Páginas (con error)</th><th>Errores JS</th><th>Solo admin visible</th><th>Cambios de candado</th></tr>${
    (c.roles || []).map((r) => `<tr><td>${esc(NOMBRE[r.rol] || r.rol)}</td><td>${r.grave ? `<span class="mal">${r.grave}</span>` : '<span class="ok">0</span>'}</td><td>${esc(r.arranque_s)} s</td>
      <td>${esc(r.capas)} (<span class="${r.vacias ? "aviso-t" : ""}">${esc(r.vacias)}</span>)</td><td>${esc(r.pegadas)}</td><td>${esc(r.paginas)} (${esc(r.paginas_mal)})</td><td>${esc(r.js)}</td><td>${esc(r.solo_admin_visible)}</td><td>${esc(r.parpadeo)}</td></tr>`).join("")}</table>`;
  const mat = matrizComprobaciones(c);
  $("pr-comprobaciones").innerHTML = mat.length ? `<table><tr><th>Comprobación</th>${ROLES.map((r) => `<th>${NOMBRE[r]}</th>`).join("")}</tr>${
    mat.map(([n, cols]) => `<tr><td>${esc(n)}</td>${cols.map((x) => `<td title="${esc(x?.detalle || "")}">${x ? marca(x.ok) : '<span class="meta">—</span>'}</td>`).join("")}</tr>`).join("")}</table>` : '<p class="meta">Sin comprobaciones en esta corrida.</p>';
  $("pr-problemas").innerHTML = (c.roles || []).map((r) => { const a=separarAnotaciones(r);return `<details${r.grave ? " open" : ""}><summary>${esc(NOMBRE[r.rol] || r.rol)} · ${a.problemas.length} problemas · ${a.avisos.length} avisos de datos</summary>${
    a.problemas.length ? `<ul>${a.problemas.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : '<p class="meta">Sin problemas de ejecución registrados.</p>'}
    ${a.avisos.length?`<h3>Cobertura y coincidencias</h3><ul>${a.avisos.map(p=>`<li class="meta">${esc(p)}</li>`).join('')}</ul>`:''}</details>`;}).join("");
  $("pr-hist").innerHTML = svgHistorial(corridas);
  const dp = Object.entries(c.datos_plan || {});
  $("pr-datos").innerHTML = dp.length ? `<p class="meta">${dp.length} archivos o carpetas de data/ que solo piden planes superiores a Demo (base para proteger los datos por plan en el Worker).</p>
    <table><tr><th>Archivo</th><th>Plan mínimo</th></tr>${dp.map(([k, v]) => `<tr><td><code>${esc(k)}</code></td><td>${esc(NOMBRE[v] || v)}</td></tr>`).join("")}</table>` : '<p class="meta">Sin medición en esta corrida.</p>';
  $("pr-bitacora").innerHTML = `<table><tr><th>Fecha</th><th>Graves</th><th>Roles con problemas</th><th>Unitarias (pasan / fallan)</th><th>Commit</th></tr>${corridas.map((x) => {
    const s = totales(x);
    return `<tr><td>${esc(x.fecha)}</td><td>${s.graves}</td><td>${s.rolesMal}/${s.roles}</td><td>${s.pasan} / ${s.fallan}</td><td><code>${esc(String(x.commit || "").slice(0, 7))}</code></td></tr>`;
  }).join("")}</table>`;
}

if (typeof document !== "undefined" && document.getElementById("pr-kpis")) iniciar();
