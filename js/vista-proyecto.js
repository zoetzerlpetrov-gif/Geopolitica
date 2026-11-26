// Vista de solo lectura de un proyecto (vista-proyecto.html#<token>). El enlace lo crea quien administra el proyecto
// («🔗 Compartir vista»); aquí no hay botones para editar y el servidor no entrega correos ni notas internas.
import { baseApi } from "./empresa.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const ETIQ = { pendiente: "⏳ Pendiente", en_proceso: "🔄 En proceso", hecho: "✅ Hecho", bloqueado: "⛔ Bloqueado", abierto: "🔴 Abierto", cerrado: "✅ Cerrado",
  aceptado: "🟡 Aceptado", registrada: "📝", activo: "🟢 Activo", en_pausa: "⏸️ En pausa" };
const SEV = { baja: "🟢 Baja", media: "🟡 Media", alta: "🟠 Alta", critica: "🔴 Crítica" };

const EST_CHECK = { pendiente: "⏳ Sin responder", cumple: "✅ Cumple", no_cumple: "❌ No cumple", no_aplica: "➖ No aplica", abierto: "🔴 Abierto", mitigado: "🟢 Mitigado", aceptado: "🟡 Aceptado", hallazgo: "📌 Hallazgo" };
// Qué muestra cada fase además de sus datos (todas de solo lectura).
const QUE = { alta: "Datos generales del proyecto.", arranque: "Lo que se acordó en la junta de arranque.", plan: "Actividades del plan y su avance.",
  auditorias: "Resultado de la lista de auditoría y de los riesgos de incumplimiento.", seguimiento: "Hallazgos y notas de seguimiento.",
  entrega: "Informe final y su aprobación.", cierre: "Satisfacción del cliente y lecciones aprendidas." };

export function htmlVista(v) {
  const p = v.proyecto, iAct = Math.max(0, v.fases.findIndex((f) => f.id === p.fase)), cerrado = p.estado === "cerrado";
  const tabla = (tipo, cols, fila) => { const xs = v.items.filter((x) => x.tipo === tipo); return xs.length ? `<div class="desliza"><table><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr>${xs.map(fila).join("")}</table></div>` : '<p class="meta">Sin registros.</p>'; };
  const datos = (f) => {
    const d = v.datos_fase?.[f.id] || {}, cs = (f.campos || []).filter((c) => d[c.id]);
    return cs.length ? `<dl class="vp-datos">${cs.map((c) => `<dt>${esc(c.etiqueta || c.nombre || c.id)}</dt><dd>${esc(d[c.id])}</dd>`).join("")}</dl>` : "";
  };
  const lista = (tipo) => {
    const xs = (v.checklist || []).filter((c) => c.tipo === tipo);
    if (!xs.length) return '<p class="meta">Sin registros.</p>';
    const cuenta = {}; for (const x of xs) cuenta[x.estado] = (cuenta[x.estado] || 0) + 1;
    return `<p>${Object.entries(cuenta).map(([e, n]) => `<span class="solo">${esc(EST_CHECK[e] || e)}: <b>${n}</b></span>`).join(" ")}</p>
      <div class="desliza"><table><tr><th>${tipo === "pregunta" ? "Ley / grupo" : "Área"}</th><th>${tipo === "pregunta" ? "Pregunta" : "Riesgo"}</th><th>Resultado</th></tr>
      ${xs.map((x) => `<tr><td>${esc(x.grupo || "—")}</td><td>${esc(x.texto)}${x.pais ? ` <span class="solo">${esc(x.pais)}</span>` : ""}</td><td>${esc(EST_CHECK[x.estado] || x.estado)}</td></tr>`).join("")}</table></div>`;
  };
  const propio = (f) => {
    switch (f.id) {
      case "alta": return `<dl class="vp-datos"><dt>Empresa</dt><dd>${esc(v.empresa || "—")}</dd><dt>Sector</dt><dd>${esc(p.sector || "—")}</dd><dt>País</dt><dd>${esc(p.pais || "—")}</dd>
        <dt>Sedes</dt><dd>${esc(p.sedes || "—")}</dd><dt>Inicio y fin</dt><dd>${esc(p.inicio || "—")} a ${esc(p.fin || "—")}</dd>${p.objetivo ? `<dt>Objetivo</dt><dd>${esc(p.objetivo)}</dd>` : ""}</dl>`;
      case "plan": return `<div class="barra"><i style="width:${p.avance}%"></i></div><p class="meta">${p.avance} % de avance · ${p.hechas} de ${p.actividades} actividades hechas</p>
        ${tabla("actividad", ["Actividad", "Responsable", "Fecha", "Estado"], (x) => `<tr><td>${esc(x.texto)}</td><td>${esc(x.responsable || "—")}</td><td>${esc(x.fecha || "—")}</td><td>${esc(ETIQ[x.estado] || x.estado)}</td></tr>`)}`;
      case "auditorias": return `<h3>Lista de auditoría (${p.respondidas}/${p.preguntas} respondidas)</h3>${lista("pregunta")}<h3>Riesgos de incumplimiento</h3>${lista("riesgo")}`;
      case "seguimiento": return `<h3>Hallazgos (${p.hallazgos_abiertos} abiertos)</h3>${tabla("hallazgo", ["Hallazgo", "Responsable", "Fecha límite", "Gravedad", "Estado"], (x) => `<tr><td>${esc(x.texto)}</td><td>${esc(x.responsable || "—")}</td><td>${esc(x.fecha || "—")}</td><td>${SEV[x.severidad] || ""}</td><td>${esc(ETIQ[x.estado] || x.estado)}</td></tr>`)}
        <h3>Notas de seguimiento</h3>${tabla("seguimiento", ["Nota", "Fecha"], (x) => `<tr><td>${esc(x.texto)}</td><td>${esc(x.fecha || "—")}</td></tr>`)}`;
      default: return "";
    }
  };
  const estadoFase = (i) => (i < iAct || cerrado ? "hecha" : i === iAct ? "actual" : "pendiente");
  const ETQ_FASE = { hecha: "✅ Terminada", actual: "▶️ En curso", pendiente: "⏳ Por iniciar" };
  return `<p><span class="solo">👁️ Solo lectura</span> <span class="meta">Puedes revisar cada fase; nada se puede cambiar desde aquí.</span></p>
    <h1 style="margin:6px 0">${esc(p.nombre)}</h1><p class="meta">${esc(v.empresa)}${p.sector ? ` · ${esc(p.sector)}` : ""}${p.pais ? ` · ${esc(p.pais)}` : ""} · ${esc(ETIQ[p.estado] || p.estado)} · actualizado ${new Date(p.actualizado * 1000).toLocaleDateString("es-MX")}</p>
    <h2>Indicadores</h2><div class="kpis"><div><b>${p.avance} %</b>avance del plan<div class="barra"><i style="width:${p.avance}%"></i></div></div><div><b>${p.hechas}/${p.actividades}</b>actividades hechas</div>
      <div><b>${p.hallazgos_abiertos}</b>hallazgos abiertos</div><div><b>${p.criticos}</b>altos o críticos</div><div><b>${p.respondidas}/${p.preguntas}</b>preguntas de auditoría</div></div>
    <h2>Fases del proyecto</h2>
    <div class="fases" role="tablist">${v.fases.map((f, i) => `<button type="button" role="tab" class="${estadoFase(i)}" data-vp-fase="${esc(f.id)}" aria-selected="${i === iAct}">${estadoFase(i) === "hecha" ? "✅" : esc(f.icono)} ${esc(f.nombre)}</button>`).join("")}</div>
    ${v.fases.map((f, i) => `<section class="tarjeta vp-fase" data-vp-panel="${esc(f.id)}" ${i === iAct ? "" : "hidden"}>
      <h3 style="margin-top:0">${esc(f.icono)} ${esc(f.nombre)} · <span class="meta">${ETQ_FASE[estadoFase(i)]}</span></h3>
      <p class="meta">${esc(QUE[f.id] || f.objetivo || "")}</p>${propio(f)}${datos(f) || (propio(f) ? "" : '<p class="meta">Aún no hay datos capturados en esta fase.</p>')}</section>`).join("")}
    <p class="meta">Vista compartida por DOMINUS OSINT. Si el enlace deja de funcionar, pide uno nuevo a quien te lo envió.</p>`;
}

/** Cambia de fase en la vista (sin editar nada). */
export function activarPestanas(caja) {
  caja.addEventListener("click", (e) => {
    const b = e.target.closest("[data-vp-fase]"); if (!b) return;
    for (const x of caja.querySelectorAll("[data-vp-fase]")) x.setAttribute("aria-selected", String(x === b));
    for (const s of caja.querySelectorAll("[data-vp-panel]")) s.hidden = s.dataset.vpPanel !== b.dataset.vpFase;
  });
}

if (typeof document !== "undefined" && document.getElementById("vp")) {
  const token = location.hash.slice(1);
  const caja = document.getElementById("vp");
  if (!/^[0-9a-f]{32}$/.test(token)) caja.innerHTML = '<p>El enlace no es válido.</p>';
  else {
    try {
      const r = await fetch(`${baseApi()}vista/${token}`, { cache: "no-store", credentials: "omit" });
      const v = await r.json();
      caja.innerHTML = r.ok ? htmlVista(v) : `<p>${esc(v.error || "No se pudo abrir la vista.")}</p>`;
      if (r.ok) activarPestanas(caja);
    } catch { caja.innerHTML = "<p>No se pudo abrir la vista. Revisa tu conexión.</p>"; }
  }
}
