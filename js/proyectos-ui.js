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
        <div class="pr-plantilla" id="pr-plantilla"><h4>🧩 Plantilla y normativa del proyecto (fases 3 y 4)</h4>
          <p class="meta">Elige el sector y los países: DOMINUS arma el plan completo (trámites y entregables por fase), la normativa que aplica, la lista de auditoría y los riesgos. Desde aquí lo cargas al plan, lo descargas en Excel o importas el Excel que ya llenaste. No necesitas ir a otra página.</p>
          <div class="pr-form"><label>Sector <select data-pl="sector"><option value="">Solo generales (toda empresa)</option></select></label>
            <details class="pr-paises"><summary>Países: <b data-pl="resumen-paises">${esc(p.pais || "MEX")}</b></summary><div data-pl="paises"></div></details>
            <label><input type="checkbox" data-pl="extranjera"> Empresa extranjera en México</label>
            <button type="button" class="si" data-pl-generar>⚙️ Generar plantilla</button></div>
          <div data-pl="resultado"></div>
          ${editar ? `<p class="meta">¿Ya tienes el Excel o JSON lleno? <label class="b">📥 Importar Excel/JSON al plan<input type="file" accept=".xlsx,.json" data-pl-importar hidden></label></p>` : ""}
        </div>
        <h4>🗓️ Plan de actividades (fase 3)</h4>${tabla("actividad", ["Actividad", "Responsable", "Fecha", "Estado"])}${formItem("actividad", "Nueva actividad, p. ej. «Visita a la planta»")}
        <h4>🔍 Hallazgos de auditoría (fase 4)</h4>${tabla("hallazgo", ["Hallazgo", "Responsable", "Fecha límite", "Gravedad", "Estado"])}${formItem("hallazgo", "Nuevo hallazgo, p. ej. «Sin control de acceso en el almacén»")}
        <h4>📈 Notas de seguimiento (fase 5)</h4>${tabla("seguimiento", ["Nota", "Fecha"])}${formItem("seguimiento", "Qué se revisó, acuerdos y riesgos nuevos")}`;
      cont._proyecto = p; generado = null;
      prepararPlantilla(p).catch(() => {});
    } catch (e) { msg(e.message, true); }
  }

  // ── Plantilla: generar, cargar al plan, descargar, importar; normativa, auditoría y riesgos en la misma vista ──
  let generado = null;
  const PS = () => import("./plan-servidor.js");
  async function prepararPlantilla(p) {
    const caja = cont.querySelector("#pr-plantilla"); if (!caja) return;
    const S = await PS();
    const sel = caja.querySelector('[data-pl="sector"]');
    const lista = await S.sectores();
    const guess = lista.find(([, n]) => p.sector && n.toLowerCase().includes(p.sector.toLowerCase()));
    sel.insertAdjacentHTML("beforeend", lista.map(([k, n]) => `<option value="${esc(k)}" ${guess?.[0] === k ? "selected" : ""}>${esc(n)}</option>`).join(""));
    const pais = /^[A-Z]{3}$/.test(p.pais || "") ? p.pais : "MEX";
    caja.querySelector('[data-pl="paises"]').innerHTML = S.JURISDICCIONES.map(([i, n]) => `<label class="pr-pais"><input type="checkbox" value="${i}" ${i === pais ? "checked" : ""}> ${esc(n)}</label>`).join("");
  }
  const paisesElegidos = () => [...cont.querySelectorAll('[data-pl="paises"] input:checked')].map((x) => x.value);
  function pintarGenerado() {
    const r = cont.querySelector('[data-pl="resultado"]'); if (!r || !generado) return;
    const g = generado, pl = g.plan;
    const porLey = new Map(); for (const q of pl.auditoria) { if (!porLey.has(q.ley)) porLey.set(q.ley, []); porLey.get(q.ley).push(q); }
    r.innerHTML = `<p><b>${esc(g.titulo)}</b><br><span class="meta">${pl.tareas.filter((t) => !String(t.id).startsWith("HITO-")).length} tareas en ${new Set(pl.tareas.map((t) => t.fase)).size} fases · ${pl.base.length} leyes y normas · ${pl.auditoria.length} preguntas de auditoría · ${pl.riesgos.length} riesgos · ${pl.recurrentes.length} obligaciones recurrentes</span></p>
      <p>${editar ? `<button type="button" class="si" data-pl-cargar>➕ Cargar las actividades al plan del proyecto</button> <label><input type="checkbox" data-pl-reemplazar> reemplazar las actividades que ya hay</label> ` : ""}
        <button type="button" class="b" data-pl-excel>⬇ Descargar Excel</button> <button type="button" class="b" data-pl-json>⬇ Descargar JSON</button></p>
      <details><summary>⚖️ Normativa que aplica (${pl.base.length})</summary><table class="t"><tr><th>País</th><th>Ley o norma</th><th>Ámbito</th><th>Autoridad</th></tr>
        ${pl.base.map((b) => `<tr><td>${esc(b.pais)}</td><td>${esc(b.sigla ? `${b.sigla} · ` : "")}${esc(b.nombre)}</td><td>${esc(b.ambito)}</td><td>${esc(b.autoridad)}</td></tr>`).join("")}</table></details>
      <details><summary>🔍 Lista de auditoría (${pl.auditoria.length} preguntas)${editar ? " — marca lo que no cumple y se registra como hallazgo" : ""}</summary>
        ${[...porLey.entries()].map(([ley, qs]) => `<details class="pr-ley"><summary>${esc(ley)} (${qs.length})</summary><ul>${qs.map((q) => `<li>${esc(q.pregunta)}${q.evidencia ? `<div class="meta">Evidencia: ${esc(q.evidencia)}</div>` : ""}
          ${editar ? `<button type="button" class="b" data-pl-hallazgo="${esc(q.id)}">❌ No cumple → hallazgo</button>` : ""}</li>`).join("")}</ul></details>`).join("")}</details>
      <details><summary>🎲 Riesgos de incumplimiento (${pl.riesgos.length})</summary><ul>${pl.riesgos.map((x) => `<li>${esc(x.riesgo)} <span class="meta">— ${esc(x.consecuencia || "")}</span>
        ${editar ? `<button type="button" class="b" data-pl-riesgo="${esc(x.id)}">➕ Registrar como hallazgo</button>` : ""}</li>`).join("")}</ul></details>`;
  }
  const bajar = (bytes, nombre, tipo) => { const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([bytes], { type: tipo })), download: nombre }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); };
  const nombreArchivo = (ext) => `plan-${(cont._proyecto?.nombre || "proyecto").replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60)}.${ext}`;
  cont.addEventListener("click", async (e) => {
    const t = e.target, p = cont._proyecto;
    if (!p || !t.closest("#pr-plantilla")) return;
    try {
      const S = await PS();
      if (t.matches("[data-pl-generar]")) {
        const paises = paisesElegidos(); if (!paises.length) return msg("Elige al menos un país.", true);
        t.disabled = true; t.textContent = "Generando…";
        generado = await S.generarPlan({ nombre: p.nombre, sector: cont.querySelector('[data-pl="sector"]').value, paises, extranjera: cont.querySelector('[data-pl="extranjera"]').checked, inicio: p.inicio });
        t.disabled = false; t.textContent = "⚙️ Generar plantilla"; pintarGenerado(); return;
      }
      if (!generado) return;
      if (t.matches("[data-pl-excel]")) return bajar(await S.excel(generado), nombreArchivo("xlsx"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      if (t.matches("[data-pl-json]")) return bajar(JSON.stringify(await S.json(generado), null, 1), nombreArchivo("json"), "application/json");
      if (t.matches("[data-pl-cargar]")) {
        const items = await S.actividadesDeGenerado(generado), reemplazar = cont.querySelector("[data-pl-reemplazar]")?.checked;
        if (reemplazar && !window.confirm("Se borrarán las actividades actuales del proyecto y se cargarán las de la plantilla. ¿Continuar?")) return;
        const r = await api(`${p.id}/items`, { items, reemplazar: Boolean(reemplazar) }); msg(`✔ ${r.agregadas} actividades cargadas al plan.`); const g = generado; await abrir(p.id); generado = g; pintarGenerado(); return;
      }
      const q = t.dataset.plHallazgo && generado.plan.auditoria.find((x) => x.id === t.dataset.plHallazgo);
      const rg = t.dataset.plRiesgo && generado.plan.riesgos.find((x) => x.id === t.dataset.plRiesgo);
      if (q || rg) {
        await api(`${p.id}/item`, q ? { tipo: "hallazgo", texto: `No cumple: ${q.pregunta} (${q.ley}, ${q.pais})`, responsable: q.rol || "", severidad: "alta" }
          : { tipo: "hallazgo", texto: `${rg.riesgo} — ${rg.consecuencia || ""}`.slice(0, 2000), responsable: rg.rol || "", severidad: rg.impacto >= 5 ? "critica" : "alta" });
        t.textContent = "✔ Registrado"; t.disabled = true; msg("Hallazgo registrado en el proyecto.");
      }
    } catch (err) { msg(err.message, true); }
  });
  cont.addEventListener("input", async (e) => {
    if (e.target.closest('[data-pl="paises"]')) { const r = cont.querySelector('[data-pl="resumen-paises"]'); if (r) r.textContent = paisesElegidos().join(", ") || "ninguno"; }
    const p = cont._proyecto;
    if (!e.target.matches("[data-pl-importar]") || !p || !e.target.files[0]) return;
    try {
      const S = await PS(), f = e.target.files[0];
      const items = await S.actividadesDeArchivo(f.name, new Uint8Array(await f.arrayBuffer()));
      if (!items.length) return msg("El archivo no trae actividades.", true);
      if (!window.confirm(`Se cargarán ${items.length} actividades del archivo (con su estado y fechas) y reemplazarán las actuales. ¿Continuar?`)) return;
      const r = await api(`${p.id}/items`, { items, reemplazar: true }); msg(`✔ ${r.agregadas} actividades importadas.`); await abrir(p.id);
    } catch (err) { msg(`No se pudo importar: ${err.message}`, true); }
  });

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
  .pr-guia { margin-bottom: 10px; }
  .pr-plantilla { border: 1px solid var(--line); border-radius: var(--radius); padding: 8px 12px; margin: 12px 0; background: var(--surface); }
  .pr-paises > div { display: flex; flex-wrap: wrap; gap: 4px 12px; max-width: 760px; padding: 6px 0; } .pr-pais { display: inline-flex; gap: 4px; align-items: center; }
  .pr-plantilla details { margin: 6px 0; } .pr-plantilla li { margin: 4px 0; } .pr-ley { margin-left: 10px; }`;
