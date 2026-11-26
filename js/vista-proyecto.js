// Vista de solo lectura de un proyecto (vista-proyecto.html#<token>). El enlace lo crea quien administra el proyecto
// («🔗 Compartir vista»); aquí no hay botones para editar y el servidor no entrega correos ni notas internas.
import { baseApi } from "./empresa.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const ETIQ = { pendiente: "⏳ Pendiente", en_proceso: "🔄 En proceso", hecho: "✅ Hecho", bloqueado: "⛔ Bloqueado", abierto: "🔴 Abierto", cerrado: "✅ Cerrado",
  aceptado: "🟡 Aceptado", registrada: "📝", activo: "🟢 Activo", en_pausa: "⏸️ En pausa" };
const SEV = { baja: "🟢 Baja", media: "🟡 Media", alta: "🟠 Alta", critica: "🔴 Crítica" };

export function htmlVista(v) {
  const p = v.proyecto, iAct = Math.max(0, v.fases.findIndex((f) => f.id === p.fase)), cerrado = p.estado === "cerrado";
  const tabla = (tipo, cols, fila) => { const xs = v.items.filter((x) => x.tipo === tipo); return xs.length ? `<table><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr>${xs.map(fila).join("")}</table>` : '<p class="meta">Sin registros.</p>'; };
  return `<p><span class="solo">👁️ Solo lectura</span></p>
    <h1 style="margin:6px 0">${esc(p.nombre)}</h1><p class="meta">${esc(v.empresa)}${p.sector ? ` · ${esc(p.sector)}` : ""}${p.pais ? ` · ${esc(p.pais)}` : ""} · ${esc(ETIQ[p.estado] || p.estado)} · actualizado ${new Date(p.actualizado * 1000).toLocaleDateString("es-MX")}</p>
    ${p.objetivo ? `<p>${esc(p.objetivo)}</p>` : ""}
    <h2>Fases</h2><ol class="fases">${v.fases.map((f, i) => `<li class="${i < iAct || cerrado ? "hecha" : i === iAct ? "actual" : ""}">${i < iAct || cerrado ? "✅" : esc(f.icono)} ${esc(f.nombre)}</li>`).join("")}</ol>
    <h2>Indicadores</h2><div class="kpis"><div><b>${p.avance} %</b>avance del plan<div class="barra"><i style="width:${p.avance}%"></i></div></div><div><b>${p.hechas}/${p.actividades}</b>actividades hechas</div>
      <div><b>${p.hallazgos_abiertos}</b>hallazgos abiertos</div><div><b>${p.criticos}</b>altos o críticos</div><div><b>${p.respondidas}/${p.preguntas}</b>preguntas de auditoría</div></div>
    <h2>Hallazgos</h2>${tabla("hallazgo", ["Hallazgo", "Responsable", "Fecha límite", "Gravedad", "Estado"], (x) => `<tr><td>${esc(x.texto)}</td><td>${esc(x.responsable || "—")}</td><td>${esc(x.fecha || "—")}</td><td>${SEV[x.severidad] || ""}</td><td>${esc(ETIQ[x.estado] || x.estado)}</td></tr>`)}
    <h2>Actividades</h2>${tabla("actividad", ["Actividad", "Responsable", "Fecha", "Estado"], (x) => `<tr><td>${esc(x.texto)}</td><td>${esc(x.responsable || "—")}</td><td>${esc(x.fecha || "—")}</td><td>${esc(ETIQ[x.estado] || x.estado)}</td></tr>`)}
    <h2>Notas de seguimiento</h2>${tabla("seguimiento", ["Nota", "Fecha"], (x) => `<tr><td>${esc(x.texto)}</td><td>${esc(x.fecha || "—")}</td></tr>`)}
    <p class="meta">Vista compartida por DOMINUS OSINT. Si el enlace deja de funcionar, pide uno nuevo a quien te lo envió.</p>`;
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
    } catch { caja.innerHTML = "<p>No se pudo abrir la vista. Revisa tu conexión.</p>"; }
  }
}
