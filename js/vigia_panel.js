// Centro de control → «Vigía de seguridad»: estado de la última revisión (tools/seguridad/vigia.py, cada 10 minutos).
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const NIVEL = { normal: ["🟢", "Normal"], alerta: ["🟠", "Alerta"], ataque: ["🔴", "Ataque en curso"] };

export function htmlVigia(d) {
  if (!d) return `<p class="meta">Aún no hay revisiones (el flujo «Vigía de seguridad» corre cada 10 minutos).</p>`;
  const [ic, nombre] = NIVEL[d.nivel] || ["⚪", d.nivel];
  const det = d.detalle || {}, cf = det.cloudflare, gh = det.github;
  const sitios = (det.sitios || []).map((s) => `<tr><td>${esc(s.sitio)}</td><td>${s.ok ? "✅" : "❌"} ${esc(s.estado)}</td><td>${s.ms == null ? "—" : `${s.ms} ms`}</td><td>${s.integro === false ? "⚠️ distinto al repositorio" : s.integro ? "✅ íntegro" : "—"}</td></tr>`).join("");
  const barras = (d.historial || []).slice(-72).map((h) => `<i class="vg-${esc(h.nivel)}" title="${esc(h.hora)} · ${esc(h.nivel)}${h.solicitudes != null ? ` · ${h.solicitudes} solicitudes` : ""}"></i>`).join("");
  return `<p><b>${ic} ${nombre}</b>${d.proteccion ? " · 🛡️ <b>modo de protección ACTIVO</b> (Cloudflare desafía cada visita)" : ""} <span class="meta">· revisión ${esc(String(d.generado_utc || "").replace("T", " ").slice(0, 16))} UTC</span></p>
    ${(d.motivos || []).length ? `<ul>${d.motivos.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}
    <div class="vg-linea" aria-label="Últimas 12 horas">${barras}</div>
    <table class="tabla-ficha"><tr><th>Sitio</th><th>Respuesta</th><th>Tiempo</th><th>Integridad</th></tr>${sitios}</table>
    ${cf ? `<p class="meta">Cloudflare, últimos 15 min: ${cf.solicitudes_15m} solicitudes (promedio ${cf.promedio_15m}), ${cf.pct_5xx} % de errores 5xx, ${cf.eventos_firewall} eventos de firewall${cf.paises?.length ? ` · países: ${cf.paises.map(([p, n]) => `${esc(p)} ${n}`).join(", ")}` : ""}.</p>` : ""}
    ${gh ? `<p class="meta">GitHub: ${gh.commits_extranos?.length || 0} commits de autores no permitidos · alertas abiertas: code scanning ${gh.alertas?.code_scanning ?? "—"}, secretos ${gh.alertas?.secret_scanning ?? "—"}, Dependabot ${gh.alertas?.dependabot ?? "—"}.</p>` : ""}
    ${(det.avisos || []).length ? `<p class="meta">Avisos: ${det.avisos.map(esc).join(" · ")}</p>` : ""}`;
}

if (typeof document !== "undefined" && document.getElementById("vigia")) {
  fetch("data/vigia/estado.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    .then((d) => { document.getElementById("vigia").innerHTML = htmlVigia(d); });
}
