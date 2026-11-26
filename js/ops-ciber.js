// DOMINUS OPS → Ciberseguridad: cuestionario guiado, revisión pública del dominio (DNS sobre HTTPS de Cloudflare,
// solo registros públicos), resultados por función de NIST CSF 2.0, preparación por amenaza, plan de acción y reporte.
// Las respuestas se guardan por cliente en localStorage; js/sincronizar.js las copia al servidor por empresa.
import { calcular, evaluarDNS, respuestaCorreo, limpiarDominio, DOMINIO } from "./ops-ciber-logica.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const CLAVE = "gp_ops_ciber";
const COLOR = (p) => (p >= 85 ? "#2e7d32" : p >= 65 ? "#4f8fd6" : p >= 40 ? "#d4a017" : "#C8102E");
let cat = null, estado = { cliente: "", dominio: "", resp: {}, dns: null };

const leer = () => { try { return JSON.parse(localStorage.getItem(CLAVE) || "{}"); } catch { return {}; } };
function guardar() { try { const t = leer(); t[estado.cliente || "(sin nombre)"] = estado; localStorage.setItem(CLAVE, JSON.stringify(t)); } catch { /* modo privado */ } }

/** Radar (hexágono) con el puntaje de cada función. */
export function svgRadar(porFuncion) {
  const C = 150, R = 110, n = porFuncion.length;
  const punto = (i, r) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / n; return [C + r * Math.cos(a), C + r * Math.sin(a)]; };
  const anillos = [25, 50, 75, 100].map((v) => `<polygon points="${porFuncion.map((_, i) => punto(i, (R * v) / 100).join(",")).join(" ")}" fill="none" stroke="currentColor" stroke-opacity=".18"/>`).join("");
  const forma = porFuncion.map((f, i) => punto(i, (R * f.pct) / 100).join(",")).join(" ");
  const etiquetas = porFuncion.map((f, i) => { const [x, y] = punto(i, R + 22); return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-size="12" fill="currentColor">${esc(f.nombre)} ${f.pct}%</text>`; }).join("");
  return `<svg viewBox="-60 -10 420 320" class="cb-radar" role="img" aria-label="Madurez por función de NIST CSF 2.0">${anillos}<polygon points="${forma}" fill="rgba(201,162,39,.35)" stroke="#c9a227" stroke-width="2"/>${etiquetas}</svg>`;
}

function pintarPreguntas() {
  $("cb-preguntas").innerHTML = cat.funciones.map((f) => `<details class="cb-funcion" open><summary><b>${esc(f.id)} · ${esc(f.nombre)}</b> <span class="meta">${esc(f.pregunta)}</span></summary>
    ${cat.preguntas.filter((p) => p.funcion === f.id).map((p) => `<fieldset class="cb-q"><legend>${esc(p.pregunta)}</legend><p class="meta">${esc(p.ayuda)} · <span title="NIST CSF 2.0 · CIS Controls v8 · ISO/IEC 27001:2022">${esc(p.csf)} · CIS ${esc(p.cis)} · ISO ${esc(p.iso)}</span></p>
      <div class="cb-op">${cat.respuestas.map((r, v) => `<label><input type="radio" name="cb-${esc(p.id)}" value="${v}" data-q="${esc(p.id)}" ${String(estado.resp[p.id]) === String(v) ? "checked" : ""}> ${esc(r)}</label>`).join("")}</div></fieldset>`).join("")}</details>`).join("");
}

function pintarResultado() {
  const r = calcular(cat, estado.resp);
  $("cb-resultado").innerHTML = `<div class="cb-kpis"><div class="cb-kpi"><span>Madurez global</span><b style="color:${COLOR(r.global)}">${r.global}%</b><small>${esc(r.nivel.nombre)}</small></div>
      <div class="cb-kpi"><span>Respondidas</span><b>${r.respondidas}/${r.total}</b><small>${r.respondidas < r.total ? "Las sin respuesta cuentan como «No»" : "Completo"}</small></div>
      <div class="cb-kpi"><span>Amenaza más expuesta</span><b style="color:${COLOR(r.amenazas[0]?.pct ?? 0)}">${r.amenazas[0]?.pct ?? 0}%</b><small>${esc(r.amenazas[0]?.nombre || "")}</small></div></div>
    <p class="meta">${esc(r.nivel.texto)}</p>
    <div class="cb-dos">${svgRadar(r.porFuncion)}<div><h3>Preparación frente a amenazas</h3>${r.amenazas.map((a) => `<div class="cb-barra"><span>${esc(a.nombre)}</span><span class="cb-pista"><i style="width:${Math.max(a.pct, 2)}%;background:${COLOR(a.pct)}"></i></span><b>${a.pct}%</b></div>`).join("")}</div></div>
    <h3>Plan de acción priorizado (${r.plan.length})</h3>
    <table class="t"><tr><th>#</th><th>Acción</th><th>Plazo</th><th>Referencia</th><th>Hoy</th></tr>${r.plan.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.accion)}</td><td>${p.plazo} días</td><td class="meta">${esc(p.csf)} · CIS ${esc(p.cis)} · ISO ${esc(p.iso)}</td><td>${esc(cat.respuestas[p.actual])}</td></tr>`).join("") || '<tr><td colspan="5">Sin acciones pendientes. Revisa de nuevo en 6 meses.</td></tr>'}</table>`;
  return r;
}

async function consultarDNS(nombre, tipo) {
  const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(nombre)}&type=${tipo}&do=1`, { headers: { accept: "application/dns-json" } });
  if (!r.ok) throw new Error(`DNS ${r.status}`);
  return r.json();
}
const textos = (j) => (j.Answer || []).map((a) => String(a.data || "").replace(/^"|"$/g, "").replace(/"\s*"/g, ""));

async function revisarDominio() {
  const d = limpiarDominio($("cb-dominio").value);
  if (!DOMINIO.test(d)) { $("cb-dns").textContent = "Escribe un dominio válido, por ejemplo empresa.com.mx."; return; }
  $("cb-dns").textContent = "Consultando registros públicos…";
  try {
    const [txt, dmarc, caa, mx, sts] = await Promise.all([consultarDNS(d, "TXT"), consultarDNS(`_dmarc.${d}`, "TXT"), consultarDNS(d, "CAA"), consultarDNS(d, "MX"), consultarDNS(`_mta-sts.${d}`, "TXT")]);
    const ev = evaluarDNS({ spf: textos(txt), dmarc: textos(dmarc), caa: caa.Answer || [], mx: mx.Answer || [], mtasts: textos(sts), dnssec: txt.AD === true });
    estado.dominio = d; estado.dns = ev;
    if (estado.resp.pr11 == null) estado.resp.pr11 = respuestaCorreo(ev);
    guardar(); pintarPreguntas(); pintarResultado(); pintarDNS();
  } catch (e) { $("cb-dns").textContent = `No se pudo consultar el DNS (${e.message}).`; }
}
function pintarDNS() {
  if (!estado.dns) { $("cb-dns").textContent = ""; return; }
  const icono = { bien: "✅", regular: "🟡", mal: "🔴" };
  $("cb-dns").innerHTML = `<p class="meta">Dominio revisado: <b>${esc(estado.dominio)}</b> (solo registros públicos de DNS).</p><ul class="cb-dns">${estado.dns.map((x) => `<li>${icono[x.estado]} ${esc(x.texto)}${x.accion ? `<br><span class="meta">→ ${esc(x.accion)}</span>` : ""}</li>`).join("")}</ul>`;
}

/** HTML del reporte para exportar (Word, PDF, HTML o Markdown). */
export function htmlReporte(cat, est, r) {
  return `<h1>Diagnóstico de ciberseguridad</h1><p class="meta">${esc(est.cliente || "Empresa")} · ${new Date().toISOString().slice(0, 10)}${est.dominio ? ` · dominio ${esc(est.dominio)}` : ""}. Autoevaluación guiada con NIST CSF 2.0, CIS Controls v8 e ISO/IEC 27001:2022; no es una auditoría ni una certificación.</p>
    <h2>Resumen</h2><p>Madurez global: <b>${r.global}%</b> (${esc(r.nivel.nombre)}). ${esc(r.nivel.texto)}</p>
    <table><tr><th>Función</th><th>Puntaje</th></tr>${r.porFuncion.map((f) => `<tr><td>${esc(f.id)} · ${esc(f.nombre)}</td><td>${f.pct}%</td></tr>`).join("")}</table>
    <h2>Preparación frente a amenazas</h2><table><tr><th>Amenaza</th><th>Preparación</th></tr>${r.amenazas.map((a) => `<tr><td>${esc(a.nombre)}</td><td>${a.pct}%</td></tr>`).join("")}</table>
    ${est.dns ? `<h2>Revisión del dominio</h2><ul>${est.dns.map((x) => `<li>${esc(x.texto)}${x.accion ? ` → ${esc(x.accion)}` : ""}</li>`).join("")}</ul>` : ""}
    <h2>Plan de acción</h2><table><tr><th>#</th><th>Acción</th><th>Plazo</th><th>Referencia</th></tr>${r.plan.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.accion)}</td><td>${p.plazo} días</td><td>${esc(p.csf)} · CIS ${esc(p.cis)} · ISO ${esc(p.iso)}</td></tr>`).join("")}</table>
    <h2>Respuestas</h2><table><tr><th>Pregunta</th><th>Respuesta</th></tr>${cat.preguntas.map((p) => `<tr><td>${esc(p.pregunta)}</td><td>${esc(cat.respuestas[Number(est.resp[p.id]) || 0])}${est.resp[p.id] == null ? " (sin respuesta)" : ""}</td></tr>`).join("")}</table>`;
}

async function iniciar() {
  try { cat = await (await fetch("config/ciber_diagnostico.json", { cache: "no-cache" })).json(); }
  catch { $("cb-preguntas").textContent = "No se pudo cargar el cuestionario."; return; }
  const guardados = leer();
  $("cb-cliente").innerHTML = `<option value="">— Nuevo diagnóstico —</option>${Object.keys(guardados).map((k) => `<option>${esc(k)}</option>`).join("")}`;
  $("cb-cliente").addEventListener("change", () => {
    const k = $("cb-cliente").value;
    estado = k ? { ...guardados[k] } : { cliente: "", dominio: "", resp: {}, dns: null };
    $("cb-nombre").value = estado.cliente || ""; $("cb-dominio").value = estado.dominio || "";
    pintarPreguntas(); pintarResultado(); pintarDNS();
  });
  $("cb-nombre").value = $("cl-nombre")?.value || "";
  estado.cliente = $("cb-nombre").value.trim();
  $("cb-nombre").addEventListener("change", () => { estado.cliente = $("cb-nombre").value.trim().slice(0, 80); guardar(); });
  $("cb-preguntas").addEventListener("change", (e) => {
    const q = e.target.dataset?.q; if (!q) return;
    estado.resp[q] = Number(e.target.value); guardar(); pintarResultado();
  });
  $("cb-revisar").addEventListener("click", revisarDominio);
  $("cb-exportar").addEventListener("click", async () => {
    const X = await import("./exportar.js");
    await X.exportarDocumento($("cb-formato").value, { titulo: `Diagnóstico de ciberseguridad ${estado.cliente || ""}`.trim(), html: htmlReporte(cat, estado, calcular(cat, estado.resp)) });
  });
  $("cb-reiniciar").addEventListener("click", () => { if (confirm("¿Borrar las respuestas de este diagnóstico?")) { estado.resp = {}; estado.dns = null; guardar(); pintarPreguntas(); pintarResultado(); pintarDNS(); } });
  pintarPreguntas(); pintarResultado();
}

if (typeof document !== "undefined" && document.getElementById("p-ciber")) iniciar();
