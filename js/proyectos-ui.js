// Proyectos y seguimiento por cliente (pantalla compartida): Admin → Clientes y proyectos → Proyectos, y Mi empresa → Proyectos.
// Muestra el orden de manejo (7 fases de config/proyectos.json), la lista de proyectos con avance y, al abrir uno,
// sus actividades (plan), hallazgos (auditorías) y notas de seguimiento. Todo se guarda en el servidor (D1).
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const ETIQ = { pendiente: "⏳ Pendiente", en_proceso: "🔄 En proceso", hecho: "✅ Hecho", bloqueado: "⛔ Bloqueado", abierto: "🔴 Abierto",
  cerrado: "✅ Cerrado", aceptado: "🟡 Riesgo aceptado", registrada: "📝 Registrada", activo: "🟢 Activo", en_pausa: "⏸️ En pausa" };
const SEV = { baja: "🟢 Baja", media: "🟡 Media", alta: "🟠 Alta", critica: "🔴 Crítica" };

/** Posición de la fase actual (0-6) y texto del siguiente paso. */
export function siguientePaso(fases, faseId) {
  const i = Math.max(0, fases.findIndex((f) => f.id === faseId));
  return { indice: i, actual: fases[i], siguiente: fases[i + 1] || null };
}

/** Pinta los pasos 1→7 con la fase actual marcada. */
export function htmlFases(fases, faseId) {
  const indice = faseId ? siguientePaso(fases, faseId).indice : -1; // sin fase: solo el orden, nada marcado
  return `<ol class="pr-fases">${fases.map((f, i) => `<li class="${i < indice ? "hecha" : i === indice ? "actual" : ""}" title="${esc(f.que)}"><span>${esc(f.icono)}</span>${esc(f.nombre)}</li>`).join("")}</ol>`;
}

/**
 * Monta la pantalla en `cont`. `api(ruta, cuerpo?)` llama al servidor (ruta relativa a proyectos: "", "<pid>", "crear"…);
 * `editar`: si el rol permite escribir.
 */
export function montarProyectos(cont, { api, editar = true, alMensaje = () => {} }) {
  let fases = [], tipos = {}, abierto = null;
  const msg = (t, error = false) => alMensaje(error ? `<span class="error">${esc(t)}</span>` : esc(t));

  async function lista() {
    abierto = null;
    try {
      const d = await api("");
      fases = d.fases; tipos = d.tipos;
      cont.innerHTML = `<div class="pr-guia"><b>Orden para manejar cada proyecto</b> (pasa el cursor sobre un paso para ver qué se hace):${htmlFases(fases, "")}
        <details><summary>Ver qué se hace y qué se entrega en cada fase</summary><table class="t"><tr><th>Fase</th><th>Qué se hace</th><th>Entregable</th><th>Se da por hecha cuando…</th></tr>
        ${fases.map((f) => `<tr><td>${esc(f.icono)} ${esc(f.nombre)}</td><td>${esc(f.que)}</td><td>${esc(f.entregable)}</td><td>${esc(f.hecho)}</td></tr>`).join("")}</table></details></div>
        ${editar ? `<details class="pr-nuevo"><summary>➕ Nuevo proyecto</summary><div class="rejilla">
          <label>Nombre <input data-n="nombre" maxlength="160" placeholder="Diagnóstico de riesgos 2027 · Planta Monterrey"></label>
          <label>Responsable <input data-n="responsable" maxlength="120" placeholder="Nombre o correo"></label>
          <label>Sector <input data-n="sector" maxlength="80" placeholder="Minería, energía, retail…"></label>
          <label>País (ISO-3) <input data-n="pais" maxlength="3" placeholder="MEX"></label>
          <label>Inicio <input data-n="inicio" type="date"></label><label>Fin <input data-n="fin" type="date"></label>
          <label style="grid-column:1/-1">Sedes o instalaciones <input data-n="sedes" maxlength="500" placeholder="Planta Monterrey; oficina CDMX"></label>
          <label style="grid-column:1/-1">Objetivo <input data-n="objetivo" maxlength="1000" placeholder="Qué debe lograr el proyecto"></label></div>
          <button type="button" class="si" data-crear>Crear proyecto</button></details>` : ""}
        ${d.proyectos.length ? `<table class="t pr-lista"><tr><th>Proyecto</th><th>Fase</th><th>Avance del plan</th><th>Hallazgos abiertos</th><th>Estado</th><th></th></tr>
          ${d.proyectos.map((p) => { const f = siguientePaso(fases, p.fase).actual; return `<tr><td><b>${esc(p.nombre)}</b><div class="meta">${esc([p.sector, p.pais, p.responsable].filter(Boolean).join(" · "))}</div></td>
            <td>${esc(f.icono)} ${esc(f.nombre)}</td><td><div class="pr-barra"><i style="width:${p.avance}%"></i></div><span class="meta">${p.hechas}/${p.actividades} actividades (${p.avance} %)</span></td>
            <td>${p.hallazgos_abiertos}${p.criticos ? ` <span class="error">(${p.criticos} altos/críticos)</span>` : ""}</td><td>${esc(ETIQ[p.estado] || p.estado)}</td>
            <td><button type="button" class="b" data-abrir="${esc(p.id)}">Abrir</button></td></tr>`; }).join("")}</table>`
          : `<p class="meta">Aún no hay proyectos${editar ? ". Crea el primero con «Nuevo proyecto»." : "."}</p>`}`;
    } catch (e) { cont.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
  }

  async function abrir(pid) {
    try {
      const d = await api(pid);
      abierto = pid; fases = d.fases; tipos = d.tipos;
      const p = d.proyecto, { actual, siguiente } = siguientePaso(fases, p.fase);
      const filas = (tipo) => d.items.filter((x) => x.tipo === tipo);
      const formItem = (tipo, ph) => editar ? `<div class="pr-form" data-tipo="${tipo}"><input data-i="texto" maxlength="2000" placeholder="${esc(ph)}">
        ${tipo !== "seguimiento" ? `<input data-i="responsable" maxlength="120" placeholder="Responsable">` : ""}<input data-i="fecha" type="date" aria-label="Fecha">
        ${tipo === "hallazgo" ? `<select data-i="severidad">${tipos.hallazgo.severidades.map((s) => `<option value="${s}" ${s === "media" ? "selected" : ""}>${SEV[s]}</option>`).join("")}</select>` : ""}
        <button type="button" class="b" data-agregar>Agregar</button></div>` : "";
      const tabla = (tipo, cols) => { const xs = filas(tipo); return xs.length ? `<table class="t"><tr>${cols.map((c) => `<th>${c}</th>`).join("")}${editar ? "<th></th>" : ""}</tr>${xs.map((x) => `<tr data-item="${esc(x.id)}" data-tipo="${tipo}">
          <td>${esc(x.texto)}</td>${tipo !== "seguimiento" ? `<td>${esc(x.responsable || "—")}</td>` : ""}<td>${esc(x.fecha || "—")}</td>
          ${tipo === "hallazgo" ? `<td>${SEV[x.severidad] || ""}</td>` : ""}
          ${tipo !== "seguimiento" ? `<td>${editar ? `<select data-estado aria-label="Estado">${tipos[tipo].estados.map((s) => `<option value="${s}" ${s === x.estado ? "selected" : ""}>${ETIQ[s] || s}</option>`).join("")}</select>` : esc(ETIQ[x.estado] || x.estado)}</td>` : ""}
          ${editar ? `<td><button type="button" class="b" data-borrar-item title="Eliminar">🗑️</button></td>` : ""}</tr>`).join("")}</table>` : '<p class="meta">Nada registrado todavía.</p>'; };
      cont.innerHTML = `<p><button type="button" class="b" data-volver>← Todos los proyectos</button></p>
        <h3>${esc(p.nombre)}</h3><p class="meta">${esc([p.sector, p.pais, p.sedes, p.responsable && `Responsable: ${p.responsable}`, p.inicio && `${p.inicio} → ${p.fin || "?"}`].filter(Boolean).join(" · "))}</p>
        ${p.objetivo ? `<p>${esc(p.objetivo)}</p>` : ""}
        ${htmlFases(fases, p.fase)}
        <div class="pr-ahora"><b>Fase actual: ${esc(actual.icono)} ${esc(actual.nombre)}</b> — ${esc(actual.que)}<br><span class="meta">Entregable: ${esc(actual.entregable)} · Se da por hecha cuando: ${esc(actual.hecho)}</span>
          ${editar ? `<p>${siguiente ? `<button type="button" class="si" data-fase="${esc(siguiente.id)}">Pasar a ${esc(siguiente.nombre)} ➜</button>` : ""}
          <label>Estado del proyecto <select data-estado-proyecto>${["activo", "en_pausa", "cerrado"].map((s) => `<option value="${s}" ${s === p.estado ? "selected" : ""}>${ETIQ[s] || "🏁 Cerrado"}</option>`).join("")}</select></label>
          <button type="button" class="b" data-borrar-proyecto>🗑️ Eliminar proyecto</button></p>` : ""}</div>
        <div class="pr-kpis"><span><b>${p.avance} %</b> del plan</span><span><b>${p.hallazgos_abiertos}</b> hallazgos abiertos</span><span><b>${p.criticos}</b> altos o críticos</span><span><b>${p.notas}</b> notas de seguimiento</span></div>
        <h4>🗓️ Plan de actividades (fase 3)</h4>${tabla("actividad", ["Actividad", "Responsable", "Fecha", "Estado"])}${formItem("actividad", "Nueva actividad, p. ej. «Visita a la planta»")}
        <h4>🔍 Hallazgos de auditoría (fase 4)</h4>${tabla("hallazgo", ["Hallazgo", "Responsable", "Fecha límite", "Gravedad", "Estado"])}${formItem("hallazgo", "Nuevo hallazgo, p. ej. «Sin control de acceso en el almacén»")}
        <h4>📈 Notas de seguimiento (fase 5)</h4>${tabla("seguimiento", ["Nota", "Fecha"])}${formItem("seguimiento", "Qué se revisó, acuerdos y riesgos nuevos")}`;
      cont._proyecto = p;
    } catch (e) { msg(e.message, true); }
  }

  cont.addEventListener("click", async (e) => {
    const t = e.target;
    try {
      if (t.matches("[data-volver]")) return lista();
      if (t.dataset.abrir) return abrir(t.dataset.abrir);
      if (t.matches("[data-crear]")) {
        const d = Object.fromEntries([...cont.querySelectorAll("[data-n]")].map((x) => [x.dataset.n, x.value]));
        const r = await api("crear", d); msg("Proyecto creado."); return abrir(r.id);
      }
      const p = cont._proyecto;
      if (t.dataset.fase && p) { await api(`${p.id}/editar`, { ...p, fase: t.dataset.fase }); msg("Fase actualizada."); return abrir(p.id); }
      if (t.matches("[data-borrar-proyecto]") && p) {
        if (!window.confirm(`¿Eliminar el proyecto «${p.nombre}» con todas sus actividades, hallazgos y notas? No se puede deshacer.`)) return;
        await api(`${p.id}/borrar`, {}); msg("Proyecto eliminado."); return lista();
      }
      if (t.matches("[data-agregar]") && p) {
        const f = t.closest("[data-tipo]");
        const d = { tipo: f.dataset.tipo, ...Object.fromEntries([...f.querySelectorAll("[data-i]")].map((x) => [x.dataset.i, x.value])) };
        await api(`${p.id}/item`, d); msg("Guardado."); return abrir(p.id);
      }
      if (t.matches("[data-borrar-item]") && p) {
        if (!window.confirm("¿Eliminar este elemento?")) return;
        await api(`${p.id}/item/${t.closest("[data-item]").dataset.item}/borrar`, {}); msg("Eliminado."); return abrir(p.id);
      }
    } catch (err) { msg(err.message, true); }
  });
  cont.addEventListener("change", async (e) => {
    const p = cont._proyecto; if (!p) return;
    try {
      if (e.target.matches("[data-estado-proyecto]")) { await api(`${p.id}/editar`, { ...p, estado: e.target.value }); msg("Estado actualizado."); return abrir(p.id); }
      if (e.target.matches("[data-estado]")) {
        const fila = e.target.closest("[data-item]");
        const x = { id: fila.dataset.item, tipo: fila.dataset.tipo };
        const d = await api(p.id); const item = d.items.find((i) => i.id === x.id);
        await api(`${p.id}/item`, { ...item, estado: e.target.value }); msg("Estado actualizado."); return abrir(p.id);
      }
    } catch (err) { msg(err.message, true); }
  });
  return { lista, abrir };
}

export const CSS_PROYECTOS = `
  .pr-fases { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; padding: 0; margin: 10px 0; }
  .pr-fases li { padding: 6px 10px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface-2); font-size: 13px; }
  .pr-fases li span { margin-right: 4px; }
  .pr-fases li.hecha { background: color-mix(in srgb, #24733b 18%, var(--surface)); border-color: #24733b; }
  .pr-fases li.actual { outline: 3px solid var(--accent); font-weight: 700; }
  .pr-ahora { border-left: 5px solid var(--accent); padding: 8px 12px; margin: 10px 0; background: var(--surface-2); border-radius: var(--radius); }
  .pr-kpis { display: flex; flex-wrap: wrap; gap: 10px; margin: 10px 0; } .pr-kpis span { border: 1px solid var(--line); border-radius: var(--radius); padding: 6px 10px; }
  .pr-barra { height: 8px; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--line); overflow: hidden; min-width: 90px; } .pr-barra i { display: block; height: 100%; background: #24733b; }
  .pr-form { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 14px; align-items: center; }
  .pr-form input, .pr-form select, .pr-ahora select, table.t select { width: auto !important; min-width: 0; }
  .pr-form input[data-i="texto"] { flex: 1 1 320px; } .pr-form input[data-i="responsable"] { flex: 0 1 180px; }
  .pr-ahora p { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; } .pr-ahora label { display: inline-flex; gap: 6px; align-items: center; }
  .pr-guia { margin-bottom: 10px; }`;
