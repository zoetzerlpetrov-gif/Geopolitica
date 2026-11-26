// Proyectos por cliente (pantalla compartida): Admin → 🧭 Proyectos de principio a fin y Mi empresa → 📋 Proyectos.
// Cada proyecto avanza por 7 fases (config/proyectos.json). Las fases son pestañas: se puede abrir cualquiera para
// consultar o editar; cada una muestra solo lo suyo, sus requisitos y el botón para completarla. Todo se guarda en el
// servidor (D1): datos del proyecto, datos de cada fase, actividades, lista de auditoría, riesgos, hallazgos y notas.
import { campoPais, paises as listaPaises, nombreDe, CSS_PAISES } from "./paises.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const ETIQ = { pendiente: "⏳ Pendiente", en_proceso: "🔄 En proceso", hecho: "✅ Hecho", bloqueado: "⛔ Bloqueado", abierto: "🔴 Abierto",
  cerrado: "✅ Cerrado", aceptado: "🟡 Riesgo aceptado", registrada: "📝 Registrada", activo: "🟢 Activo", en_pausa: "⏸️ En pausa",
  cumple: "✅ Cumple", no_cumple: "❌ No cumple", no_aplica: "➖ No aplica", mitigado: "🛡️ Mitigado", hallazgo: "📌 Registrado como hallazgo" };
const SEV = { baja: "🟢 Baja", media: "🟡 Media", alta: "🟠 Alta", critica: "🔴 Crítica" };
const info = (t) => (t ? ` <span class="pr-info" tabindex="0" role="img" aria-label="${esc(t)}" title="${esc(t)}">ⓘ</span>` : "");

/** Posición de la fase actual (0-6) y la siguiente. */
export function siguientePaso(fases, faseId) {
  const i = Math.max(0, fases.findIndex((f) => f.id === faseId));
  return { indice: i, actual: fases[i], siguiente: fases[i + 1] || null };
}

/** Los pasos 1→7 (solo el orden si no hay fase). */
export function htmlFases(fases, faseId) {
  const indice = faseId ? siguientePaso(fases, faseId).indice : -1;
  return `<ol class="pr-fases">${fases.map((f, i) => `<li class="${i < indice ? "hecha" : i === indice ? "actual" : ""}" title="${esc(f.que)}"><span>${esc(f.icono)}</span>${esc(f.nombre)}</li>`).join("")}</ol>`;
}

/** Campos obligatorios del proyecto (fase Alta). */
export const OBLIGATORIOS_PROYECTO = [["nombre", "Nombre del proyecto"], ["responsable", "Responsable"], ["sector", "Sector"], ["pais", "País"], ["inicio", "Fecha de inicio"], ["objetivo", "Objetivo"]];

/** Lo que falta para completar una fase (lista de textos; vacía = lista para completarse). */
export function faltantes(fase, d) {
  const p = d.proyecto, datos = p.fases_datos?.[fase.id] || {}, falta = [];
  if (fase.id === "alta") for (const [k, n] of OBLIGATORIOS_PROYECTO) if (!String(p[k] || "").trim()) falta.push(n);
  for (const c of fase.campos || []) if (c.requerido && !String(datos[c.id] || "").trim()) falta.push(c.etiqueta);
  const act = d.items.filter((x) => x.tipo === "actividad"), hall = d.items.filter((x) => x.tipo === "hallazgo");
  const preg = (d.checklist || []).filter((x) => x.tipo === "pregunta");
  if (fase.id === "plan" && !act.length) falta.push("Al menos una actividad en el plan (genera la plantilla o agrégala a mano)");
  if (fase.id === "auditorias") {
    const pend = preg.filter((x) => x.estado === "pendiente").length;
    if (pend) falta.push(`Responder la lista de auditoría (${pend} pregunta(s) sin respuesta)`);
    if (!preg.length && !hall.length) falta.push("Registrar el resultado: responde la lista de auditoría o registra al menos un hallazgo");
    const sinResp = hall.filter((x) => !x.responsable).length;
    if (sinResp) falta.push(`Asignar responsable a ${sinResp} hallazgo(s)`);
  }
  if (fase.id === "seguimiento") {
    if (!d.items.some((x) => x.tipo === "seguimiento")) falta.push("Al menos una nota de seguimiento");
    const crit = hall.filter((x) => ["alta", "critica"].includes(x.severidad) && x.estado === "abierto").length;
    if (crit) falta.push(`Cerrar, atender o aceptar ${crit} hallazgo(s) alto(s) o crítico(s) abierto(s)`);
  }
  return falta;
}

/**
 * Monta la pantalla en `cont`. `api(ruta, cuerpo?)` llama al servidor (ruta relativa a proyectos: "", "<pid>", "crear"…);
 * `editar`: si el rol permite escribir.
 */
export function montarProyectos(cont, { api, editar = true, alMensaje = () => {}, alAbrir = () => {} }) {
  let fases = [], d = null, vista = "", generado = null, sectores = [], nombresPais = [];
  const msg = (t, error = false) => alMensaje(error ? `<span class="error">${esc(t)}</span>` : esc(t));
  const PS = () => import("./plan-servidor.js");
  const nombreSector = (id) => sectores.find(([k]) => k === id)?.[1] || id || "";
  const cargarListas = async () => {
    if (!sectores.length) sectores = await (await PS()).sectores().catch(() => []);
    if (!nombresPais.length) nombresPais = (await listaPaises()).paises;
  };

  const campoHtml = (c, valor) => {
    const id = `pf-${c.id}`, req = c.requerido ? ' <b class="req" title="Obligatorio">*</b>' : "";
    const etiqueta = `<label for="${id}">${esc(c.etiqueta)}${req}${info(c.ayuda)}</label>`;
    if (c.tipo === "area") return `<div class="pr-campo ancho">${etiqueta}<textarea id="${id}" data-f="${esc(c.id)}" rows="3" maxlength="2000">${esc(valor)}</textarea></div>`;
    if (c.tipo === "opciones") return `<div class="pr-campo">${etiqueta}<select id="${id}" data-f="${esc(c.id)}"><option value="">Elige…</option>${c.opciones.map((o) => `<option ${o === valor ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></div>`;
    return `<div class="pr-campo">${etiqueta}<input id="${id}" data-f="${esc(c.id)}" type="${c.tipo === "fecha" ? "date" : "text"}" maxlength="500" value="${esc(valor)}"></div>`;
  };

  // Formulario de datos del proyecto (nuevo y fase Alta). Los obligatorios llevan * y cada campo su ⓘ.
  const formProyecto = (p = {}) => `<div class="pr-rejilla">
    <div class="pr-campo"><label>Nombre del proyecto <b class="req">*</b>${info("Nombre corto que identifique el proyecto, p. ej. «Diagnóstico de riesgos 2027 · Planta Monterrey».")}</label><input data-n="nombre" maxlength="160" value="${esc(p.nombre || "")}"></div>
    <div class="pr-campo"><label>Responsable <b class="req">*</b>${info("Persona de tu equipo que dirige el proyecto (nombre o correo).")}</label><input data-n="responsable" maxlength="120" value="${esc(p.responsable || "")}"></div>
    <div class="pr-campo"><label>Sector <b class="req">*</b>${info("Actividad principal del cliente. Define qué leyes, auditorías y riesgos trae la plantilla.")}</label><select data-n="sector"><option value="">Elige el sector…</option>${sectores.map(([k, n]) => `<option value="${esc(k)}" ${k === p.sector ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
    <div class="pr-campo"><label>País principal <b class="req">*</b>${info("Escribe y elige de la lista (cualquier país; con o sin tildes). Puedes sumar más países en la fase Plan.")}</label><input data-n="pais" data-iso="${esc(p.pais || "")}" placeholder="Escribe el país…"></div>
    <div class="pr-campo"><label>Fecha de inicio <b class="req">*</b>${info("Día en que arranca el trabajo. La plantilla calcula las fechas del plan desde aquí.")}</label><input data-n="inicio" type="date" value="${esc(p.inicio || "")}"></div>
    <div class="pr-campo"><label>Fecha de fin${info("Fecha comprometida de cierre (opcional).")}</label><input data-n="fin" type="date" value="${esc(p.fin || "")}"></div>
    <div class="pr-campo ancho"><label>Objetivo <b class="req">*</b>${info("Qué debe lograr el proyecto, en una o dos frases.")}</label><textarea data-n="objetivo" rows="2" maxlength="1000">${esc(p.objetivo || "")}</textarea></div>
    <div class="pr-campo ancho"><label>Sedes o instalaciones${info("Lugares que cubre el proyecto, separados por punto y coma (opcional).")}</label><input data-n="sedes" maxlength="500" value="${esc(p.sedes || "")}"></div></div>`;
  const leerProyecto = (raiz) => {
    const v = Object.fromEntries([...raiz.querySelectorAll("[data-n]")].map((x) => [x.dataset.n, x.dataset.n === "pais" ? (x.dataset.iso || "") : x.value.trim()]));
    const falta = OBLIGATORIOS_PROYECTO.filter(([k]) => !v[k]).map(([, n]) => n);
    const paisEscrito = raiz.querySelector('[data-n="pais"]');
    if (paisEscrito?.value && !v.pais) falta.push("País: elígelo de la lista de sugerencias");
    return { v, falta };
  };
  const avisarFaltantes = (falta) => msg(`Falta llenar: ${falta.join(" · ")}`, true);

  async function lista() {
    d = null; vista = ""; generado = null;
    try {
      await cargarListas();
      const r = await api("");
      fases = r.fases;
      cont.innerHTML = `<div class="pr-guia"><b>Cómo se trabaja cada proyecto:</b> 7 fases en orden. Al abrir un proyecto, cada fase es una pestaña: puedes volver a cualquiera para corregir.
        ${htmlFases(fases, "")}<details><summary>Ver qué se hace y qué se entrega en cada fase</summary><table class="t"><tr><th>Fase</th><th>Qué se hace</th><th>Entregable</th><th>Se completa cuando…</th></tr>
        ${fases.map((f) => `<tr><td>${esc(f.icono)} ${esc(f.nombre)}</td><td>${esc(f.que)}</td><td>${esc(f.entregable)}</td><td>${esc(f.hecho)}</td></tr>`).join("")}</table></details></div>
        ${editar ? `<details class="pr-nuevo"><summary>➕ Nuevo proyecto</summary><p class="meta">Los campos con <b class="req">*</b> son obligatorios. Pasa el cursor sobre ⓘ para ver qué se pide.</p>${formProyecto()}
          <button type="button" class="si" data-crear>Crear proyecto</button></details>` : ""}
        ${r.proyectos.length ? `<table class="t pr-lista"><tr><th>Proyecto</th><th>Fase actual</th><th>Avance del plan</th><th>Hallazgos abiertos</th><th>Estado</th><th></th></tr>
          ${r.proyectos.map((p) => { const f = siguientePaso(fases, p.fase).actual; return `<tr><td><b>${esc(p.nombre)}</b><div class="meta">${esc([nombreSector(p.sector), nombreDe(nombresPais, p.pais), p.responsable].filter(Boolean).join(" · "))}</div></td>
            <td>${esc(f.icono)} ${esc(f.nombre)}</td><td><div class="pr-barra"><i style="width:${p.avance}%"></i></div><span class="meta">${p.hechas}/${p.actividades} actividades (${p.avance} %)</span></td>
            <td>${p.hallazgos_abiertos}${p.criticos ? ` <span class="error">(${p.criticos} altos o críticos)</span>` : ""}</td><td>${esc(ETIQ[p.estado] || p.estado)}</td>
            <td><button type="button" class="b" data-abrir="${esc(p.id)}">Abrir</button></td></tr>`; }).join("")}</table>`
          : `<p class="meta">Aún no hay proyectos${editar ? ". Crea el primero con «➕ Nuevo proyecto»." : "."}</p>`}`;
      const pais = cont.querySelector('.pr-nuevo [data-n="pais"]');
      if (pais) campoPais(pais);
    } catch (e) { cont.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
  }

  // ── Tablas de actividades, hallazgos y notas ──
  const tablaItems = (tipo, cols) => {
    const xs = d.items.filter((x) => x.tipo === tipo);
    if (!xs.length) return '<p class="meta">Nada registrado todavía.</p>';
    return `<div class="pr-desliza"><table class="t"><tr>${cols.map((c) => `<th>${c}</th>`).join("")}${editar ? "<th></th>" : ""}</tr>${xs.map((x) => `<tr data-item="${esc(x.id)}" data-tipo="${tipo}">
      <td>${esc(x.texto)}</td>${tipo !== "seguimiento" ? `<td>${esc(x.responsable || "—")}</td>` : ""}<td>${esc(x.fecha || "—")}</td>
      ${tipo === "hallazgo" ? `<td>${SEV[x.severidad] || ""}</td>` : ""}
      ${tipo !== "seguimiento" ? `<td>${editar ? `<select data-estado aria-label="Estado">${d.tipos[tipo].estados.map((s) => `<option value="${s}" ${s === x.estado ? "selected" : ""}>${ETIQ[s] || s}</option>`).join("")}</select>` : esc(ETIQ[x.estado] || x.estado)}</td>` : ""}
      ${editar ? `<td><button type="button" class="b" data-borrar-item title="Eliminar">🗑️</button></td>` : ""}</tr>`).join("")}</table></div>`;
  };
  const formItem = (tipo, ph) => (editar ? `<div class="pr-form" data-tipo="${tipo}"><input data-i="texto" maxlength="2000" placeholder="${esc(ph)}">
    ${tipo !== "seguimiento" ? '<input data-i="responsable" maxlength="120" placeholder="Responsable">' : ""}<input data-i="fecha" type="date" aria-label="Fecha">
    ${tipo === "hallazgo" ? `<select data-i="severidad">${["baja", "media", "alta", "critica"].map((s) => `<option value="${s}" ${s === "media" ? "selected" : ""}>${SEV[s]}</option>`).join("")}</select>` : ""}
    <button type="button" class="b" data-agregar>Agregar</button></div>` : "");

  // Lista de auditoría (preguntas) agrupada por ley, con filtro.
  const listaAuditoria = (filtro) => {
    const preg = d.checklist.filter((x) => x.tipo === "pregunta" && (filtro === "todas" || (filtro === "pendientes" ? x.estado === "pendiente" : x.estado === filtro)));
    if (!d.checklist.some((x) => x.tipo === "pregunta")) return '<p class="meta">Aún no hay lista de auditoría: se carga desde la plantilla en la fase <b>3. Plan</b> (o registra hallazgos a mano abajo).</p>';
    const grupos = new Map(); for (const q of preg) { if (!grupos.has(q.grupo)) grupos.set(q.grupo, []); grupos.get(q.grupo).push(q); }
    return [...grupos.entries()].map(([g, qs]) => `<details class="pr-ley"${filtro === "no_cumple" || grupos.size <= 3 ? " open" : ""}><summary>${esc(g || "General")} (${qs.length}${qs.filter((q) => q.estado === "pendiente").length ? `, ${qs.filter((q) => q.estado === "pendiente").length} sin responder` : ""})</summary>${qs.map((q) => `<div class="pr-preg" data-check="${esc(q.id)}">
      <div>${esc(q.texto)}${q.pais ? ` <span class="chip">${esc(q.pais)}</span>` : ""}${q.detalle ? `<div class="meta">Evidencia sugerida: ${esc(q.detalle)}</div>` : ""}</div>
      ${editar ? `<select data-check-estado aria-label="Resultado">${d.estados_check.pregunta.map((s) => `<option value="${s}" ${s === q.estado ? "selected" : ""}>${ETIQ[s]}</option>`).join("")}</select>
      <input data-check-nota maxlength="1000" placeholder="Nota o evidencia" value="${esc(q.nota)}">` : `<span>${ETIQ[q.estado]}</span><span class="meta">${esc(q.nota)}</span>`}</div>`).join("")}</details>`).join("") || '<p class="meta">Nada con ese filtro.</p>';
  };
  const listaRiesgos = () => {
    const rs = d.checklist.filter((x) => x.tipo === "riesgo");
    if (!rs.length) return '<p class="meta">Aún no hay riesgos: se cargan con la plantilla en la fase <b>3. Plan</b>.</p>';
    return `<div class="pr-desliza"><table class="t"><tr><th>Riesgo</th><th>Consecuencia</th><th>Estado</th></tr>${rs.map((r) => `<tr data-check="${esc(r.id)}"><td>${esc(r.texto)}${r.pais ? ` <span class="chip">${esc(r.pais)}</span>` : ""}</td><td class="meta">${esc(r.detalle)}</td>
      <td>${editar ? `<select data-check-estado aria-label="Estado del riesgo">${d.estados_check.riesgo.map((s) => `<option value="${s}" ${s === r.estado ? "selected" : ""}>${ETIQ[s] === ETIQ.hallazgo ? "📌 Registrar como hallazgo" : ETIQ[s]}</option>`).join("")}</select>` : ETIQ[r.estado]}</td></tr>`).join("")}</table></div>`;
  };

  // Contenido propio de cada fase
  function contenidoFase(f) {
    const p = d.proyecto, datos = p.fases_datos?.[f.id] || {};
    const campos = (f.campos || []).length ? `<div class="pr-rejilla" data-campos="${f.id}">${f.campos.map((c) => campoHtml(c, datos[c.id] || "")).join("")}</div>
      ${editar ? `<p><button type="button" class="b" data-guardar-fase>💾 Guardar datos de esta fase</button></p>` : ""}` : "";
    switch (f.id) {
      case "alta": return `<h4>Datos del proyecto</h4>${formProyecto(p)}${editar ? `<p><button type="button" class="b" data-guardar-proyecto>💾 Guardar datos del proyecto</button>
        <label class="pr-inline">Estado <select data-estado-proyecto>${["activo", "en_pausa", "cerrado"].map((s) => `<option value="${s}" ${s === p.estado ? "selected" : ""}>${ETIQ[s] || "🏁 Cerrado"}</option>`).join("")}</select></label></p>` : ""}
        <h4>Formalización</h4>${campos}`;
      case "arranque": return campos;
      case "plan": return `<div class="pr-explica"><b>Cómo se arma el plan, en 3 pasos:</b><ol>
          <li><b>Generar la plantilla</b> con el sector y los países del proyecto: DOMINUS arma las tareas por fase, la normativa que aplica, la lista de auditoría y los riesgos.</li>
          <li><b>Revisar el resumen</b> y, si quieres, descargar el Excel (Gantt, vencimientos, base normativa) para trabajarlo fuera.</li>
          <li><b>Guardar en el proyecto</b>: las tareas se vuelven tus <b>actividades</b> (con responsable, fecha y estado para dar seguimiento), y la lista de auditoría y los riesgos quedan guardados para las fases <b>4. Auditorías</b> y <b>5. Seguimiento</b>.</li></ol></div>
        <div class="pr-plantilla" id="pr-plantilla">
          <div class="pr-form"><span>Sector: <b>${esc(nombreSector(p.sector) || "— (elígelo en Alta)")}</b></span>
            <label class="pr-inline">Países ${info("El país principal viene de Alta. Agrega otros donde opere el proyecto; los de la UE usan la normativa europea.")} <input data-pl-pais placeholder="Agregar país…"></label>
            <span data-pl-chips></span><label class="pr-inline"><input type="checkbox" data-pl-extranjera> Empresa extranjera en México</label>
            <button type="button" class="si" data-pl-generar>⚙️ 1. Generar plantilla</button></div>
          <div data-pl="resultado"></div>
          ${editar ? `<p class="meta">¿Ya tienes el Excel o el JSON lleno? <label class="b">📥 Importar Excel/JSON al plan<input type="file" accept=".xlsx,.json" data-pl-importar hidden></label></p>` : ""}</div>
        <h4>🗓️ Actividades del plan</h4>${tablaItems("actividad", ["Actividad", "Responsable", "Fecha", "Estado"])}${formItem("actividad", "Nueva actividad, p. ej. «Visita a la planta»")}
        <h4>Criterio de éxito</h4>${campos}`;
      case "auditorias": return `${campos}<h4>🔍 Lista de auditoría</h4><p class="meta">Marca cada pregunta. Al elegir <b>❌ No cumple</b> se registra un hallazgo automáticamente (lo ves abajo para asignar responsable y fecha).</p>
        <label class="pr-inline">Mostrar <select data-filtro-aud><option value="pendientes">Sin responder</option><option value="no_cumple">No cumple</option><option value="todas">Todas</option></select></label>
        <div data-lista-aud>${listaAuditoria("pendientes")}</div>
        <h4>📌 Hallazgos</h4>${tablaItems("hallazgo", ["Hallazgo", "Responsable", "Fecha límite", "Gravedad", "Estado"])}${formItem("hallazgo", "Nuevo hallazgo, p. ej. «Sin control de acceso en el almacén»")}`;
      case "seguimiento": return `${campos}<h4>📈 Avance de actividades</h4>${tablaItems("actividad", ["Actividad", "Responsable", "Fecha", "Estado"])}
        <h4>🎲 Riesgos de incumplimiento</h4><p class="meta">Vienen de la plantilla y se quedan guardados. Cambia su estado; «📌 Registrar como hallazgo» lo pasa a hallazgos.</p>${listaRiesgos()}
        <h4>📌 Hallazgos</h4>${tablaItems("hallazgo", ["Hallazgo", "Responsable", "Fecha límite", "Gravedad", "Estado"])}
        <h4>📝 Notas de seguimiento</h4>${tablaItems("seguimiento", ["Nota", "Fecha"])}${formItem("seguimiento", "Qué se revisó, acuerdos y riesgos nuevos")}`;
      case "entrega": return `${campos}<p class="meta">El informe integral se arma en DOMINUS OPS (paso «Informe y cierre» de Proyectos de principio a fin). Aquí registras su entrega y aprobación.</p>`;
      case "cierre": return `${campos}<p class="meta">Al completar esta fase, el proyecto queda en estado «Cerrado». Podrás reabrirlo si hace falta.</p>`;
      default: return campos;
    }
  }

  function pintarDetalle() {
    const p = d.proyecto, { indice: iAct } = siguientePaso(fases, p.fase), iVer = fases.findIndex((f) => f.id === vista), f = fases[iVer];
    const falta = faltantes(f, d), cerrado = p.estado === "cerrado";
    const pie = !editar ? "" : iVer === iAct && !(cerrado && f.id === "cierre")
      ? `<div class="pr-pie ${falta.length ? "" : "ok"}"><button type="button" class="si" data-completar>${f.id === "cierre" ? "🏁 Completar y cerrar el proyecto" : `✅ Completar «${esc(f.nombre)}» y pasar a «${esc(fases[iVer + 1].nombre)}»`}</button>
        ${falta.length ? `<span class="meta">Falta: ${falta.map(esc).join(" · ")}</span>` : '<span class="meta">Todo listo para completar esta fase.</span>'}</div>`
      : iVer < iAct || cerrado ? `<div class="pr-pie ok">✅ Fase completada. Puedes editar sus datos cuando quieras. <button type="button" class="b" data-reabrir>↩ Reabrir el proyecto en esta fase</button></div>`
        : `<div class="pr-pie">Esta fase aún no empieza (la fase actual es «${esc(fases[iAct].nombre)}»). Puedes adelantar datos.</div>`;
    cont.innerHTML = `<p><button type="button" class="b" data-volver>← Todos los proyectos</button></p>
      <div class="pr-cabecera"><div><h3>${esc(p.nombre)}</h3><p class="meta">${esc([nombreSector(p.sector), nombreDe(nombresPais, p.pais), p.responsable && `Responsable: ${p.responsable}`, p.inicio && `${p.inicio} → ${p.fin || "?"}`].filter(Boolean).join(" · "))} · ${esc(ETIQ[p.estado] || p.estado)}</p></div>
        ${editar ? `<div class="pr-acciones"><button type="button" class="b" data-compartir>${p.vista_token ? "🔗 Enlace de solo vista (activo)" : "🔗 Compartir vista (solo lectura)"}</button><button type="button" class="b peligro" data-borrar-proyecto>🗑️ Eliminar proyecto</button></div>` : ""}</div>
      ${p.vista_token ? `<p class="meta pr-enlace">Vista de solo lectura: <input readonly value="${esc(new URL(`vista-proyecto.html#${p.vista_token}`, "https://dominusosint.com/").href)}"> ${editar ? '<button type="button" class="b" data-copiar-vista>📋 Copiar</button> <button type="button" class="b" data-quitar-vista>Quitar enlace</button>' : ""}</p>` : ""}
      <div class="pr-kpis"><span><b>${p.avance} %</b> del plan</span><span><b>${p.respondidas}/${p.preguntas}</b> preguntas de auditoría</span><span><b>${p.hallazgos_abiertos}</b> hallazgos abiertos</span><span><b>${p.criticos}</b> altos o críticos</span><span><b>${p.riesgos_abiertos}</b> riesgos abiertos</span><span><b>${p.notas}</b> notas</span></div>
      <nav class="pr-tabs" role="tablist" aria-label="Fases del proyecto">${fases.map((x, i) => `<button type="button" role="tab" data-ver="${x.id}" aria-selected="${x.id === vista}" class="${i < iAct || cerrado ? "hecha" : i === iAct ? "actual" : ""}">
        <span class="pr-tab-num">${i < iAct || cerrado ? "✅" : i === iAct ? "▶" : i + 1}</span>${esc(x.icono)} ${esc(x.nombre.replace(/^\d+\.\s*/, ""))}</button>`).join("")}</nav>
      <section class="pr-fase"><h3 class="pr-titulo-fase">${esc(f.icono)} ${esc(f.nombre)}</h3><p>${esc(f.que)}</p><p class="meta">Entregable: <b>${esc(f.entregable)}</b> · Se completa cuando: ${esc(f.hecho)}</p>
        ${contenidoFase(f)}${pie}</section>`;
    const pais = cont.querySelector('.pr-fase [data-n="pais"]'); if (pais) campoPais(pais);
    if (f.id === "plan") prepararPlantilla();
  }

  async function abrir(pid, ver) {
    try {
      await cargarListas();
      d = await api(pid); fases = d.fases;
      if (!ver || !fases.some((f) => f.id === ver)) ver = d.proyecto.fase;
      vista = ver; pintarDetalle(); alAbrir(pid);
    } catch (e) { msg(e.message, true); }
  }
  const recargar = () => abrir(d.proyecto.id, vista);

  // ── Plantilla (fase Plan) ──
  let paisesPlan = [];
  async function prepararPlantilla() {
    paisesPlan = d.proyecto.fases_datos?.plan?.paises?.length ? [...d.proyecto.fases_datos.plan.paises] : [d.proyecto.pais].filter(Boolean);
    const chips = () => { const c = cont.querySelector("[data-pl-chips]"); if (c) c.innerHTML = paisesPlan.map((i) => `<span class="chip">${esc(nombreDe(nombresPais, i))} <button type="button" class="pr-x" data-quitar-pais="${esc(i)}" aria-label="Quitar">×</button></span>`).join(" "); };
    chips(); cont._chips = chips;
    const entrada = cont.querySelector("[data-pl-pais]");
    if (entrada) campoPais(entrada, { alElegir: (iso) => { if (!paisesPlan.includes(iso)) paisesPlan.push(iso); entrada.value = ""; entrada.dataset.iso = ""; chips(); } });
    if (generado) pintarGenerado();
  }
  function pintarGenerado() {
    const r = cont.querySelector('[data-pl="resultado"]'); if (!r || !generado) return;
    const g = generado, pl = g.plan;
    r.innerHTML = `<div class="pr-explica"><b>${esc(g.titulo)}</b><br><span class="meta">${pl.tareas.filter((t) => !String(t.id).startsWith("HITO-")).length} tareas · ${pl.base.length} leyes y normas · ${pl.auditoria.length} preguntas de auditoría · ${pl.riesgos.length} riesgos · ${pl.recurrentes.length} obligaciones recurrentes${g.sinCatalogo?.length ? ` · ⚠️ Sin catálogo normativo todavía: ${esc(g.sinCatalogo.join(", "))} (solo tareas generales)` : ""}</span>
      <p>${editar ? `<button type="button" class="si" data-pl-cargar>💾 3. Guardar en el proyecto (actividades + lista de auditoría + riesgos)</button> <label class="pr-inline"><input type="checkbox" data-pl-reemplazar checked> reemplazar lo que ya hay</label> ` : ""}
        <button type="button" class="b" data-pl-excel>⬇ 2. Descargar Excel</button> <button type="button" class="b" data-pl-json>⬇ JSON</button></p>
      <details><summary>⚖️ Normativa que aplica (${pl.base.length})</summary><div class="pr-desliza"><table class="t"><tr><th>País</th><th>Ley o norma</th><th>Ámbito</th><th>Autoridad</th></tr>
        ${pl.base.map((b) => `<tr><td>${esc(b.pais)}</td><td>${esc(b.sigla ? `${b.sigla} · ` : "")}${esc(b.nombre)}</td><td>${esc(b.ambito)}</td><td>${esc(b.autoridad)}</td></tr>`).join("")}</table></div></details></div>`;
  }
  const bajar = (bytes, nombre, tipo) => { const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([bytes], { type: tipo })), download: nombre }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); };
  const nombreArchivo = (ext) => `plan-${(d?.proyecto?.nombre || "proyecto").replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60)}.${ext}`;

  async function enviarEnLotes(ruta, items, reemplazar) {
    let total = 0;
    for (let k = 0; k < items.length; k += 800) { const r = await api(ruta, { items: items.slice(k, k + 800), reemplazar: reemplazar && k === 0 }); total += r.agregadas ?? r.agregados ?? 0; }
    return total;
  }

  // ── Eventos ──
  cont.addEventListener("click", async (e) => {
    const t = e.target.closest("button, [data-abrir]") || e.target;
    try {
      if (t.matches("[data-volver]")) return lista();
      if (t.dataset.abrir) return abrir(t.dataset.abrir);
      if (t.matches("[data-crear]")) {
        const { v, falta } = leerProyecto(cont.querySelector(".pr-nuevo"));
        if (falta.length) return avisarFaltantes(falta);
        const r = await api("crear", v); msg("Proyecto creado. Sigue con los datos de la fase «Alta»."); return abrir(r.id, "alta");
      }
      if (!d) return;
      const p = d.proyecto;
      if (t.dataset.ver) { vista = t.dataset.ver; return pintarDetalle(); }
      if (t.matches("[data-guardar-proyecto]")) {
        const { v, falta } = leerProyecto(cont.querySelector(".pr-fase"));
        if (falta.length) return avisarFaltantes(falta);
        await api(`${p.id}/editar`, { ...v, fase: p.fase, estado: p.estado }); msg("Datos del proyecto guardados."); return recargar();
      }
      if (t.matches("[data-guardar-fase]") || t.matches("[data-completar]")) {
        const caja = cont.querySelector("[data-campos]");
        if (caja) {
          const datos = Object.fromEntries([...caja.querySelectorAll("[data-f]")].map((x) => [x.dataset.f, x.value.trim()]));
          await api(`${p.id}/fase-datos`, { fase: vista, datos });
          d.proyecto.fases_datos = { ...p.fases_datos, [vista]: datos };
        }
        if (vista === "alta" && t.matches("[data-completar]")) {
          const { v, falta } = leerProyecto(cont.querySelector(".pr-fase"));
          if (falta.length) return avisarFaltantes(falta);
          await api(`${p.id}/editar`, { ...v, fase: p.fase, estado: p.estado }); Object.assign(d.proyecto, v);
        }
        if (t.matches("[data-guardar-fase]")) { msg("Datos de la fase guardados."); return recargar(); }
        const f = fases.find((x) => x.id === vista), falta = faltantes(f, d);
        if (falta.length) { avisarFaltantes(falta); return pintarDetalle(); }
        const i = fases.indexOf(f), ultima = i === fases.length - 1;
        await api(`${p.id}/editar`, { ...d.proyecto, fase: ultima ? f.id : fases[i + 1].id, estado: ultima ? "cerrado" : d.proyecto.estado });
        msg(ultima ? "🏁 Proyecto cerrado." : `Fase «${f.nombre}» completada. Ahora: «${fases[i + 1].nombre}».`);
        return abrir(p.id, ultima ? f.id : fases[i + 1].id);
      }
      if (t.matches("[data-reabrir]")) {
        if (!window.confirm(`¿Regresar la fase actual del proyecto a «${fases.find((x) => x.id === vista).nombre}»? Las fases siguientes quedarán como pendientes (sus datos se conservan).`)) return;
        await api(`${p.id}/editar`, { ...p, fase: vista, estado: "activo" }); msg("Proyecto reabierto en esta fase."); return recargar();
      }
      if (t.matches("[data-borrar-proyecto]")) {
        if (!window.confirm(`¿Eliminar el proyecto «${p.nombre}» con todas sus fases, actividades, hallazgos, lista de auditoría y notas? No se puede deshacer.`)) return;
        await api(`${p.id}/borrar`, {}); msg("Proyecto eliminado."); return lista();
      }
      if (t.matches("[data-compartir]") && !p.vista_token) { await api(`${p.id}/compartir`, { activar: true }); msg("Enlace de solo vista creado: cualquiera con el enlace puede ver el avance, sin editar."); return recargar(); }
      if (t.matches("[data-quitar-vista]")) { if (!window.confirm("¿Quitar el enlace? Quien lo tenga ya no podrá ver el proyecto.")) return; await api(`${p.id}/compartir`, { activar: false }); msg("Enlace quitado."); return recargar(); }
      if (t.matches("[data-copiar-vista]")) { try { await navigator.clipboard.writeText(cont.querySelector(".pr-enlace input").value); t.textContent = "✅ Copiado"; } catch { /* */ } return; }
      if (t.matches("[data-agregar]")) {
        const fm = t.closest("[data-tipo]");
        const it = { tipo: fm.dataset.tipo, ...Object.fromEntries([...fm.querySelectorAll("[data-i]")].map((x) => [x.dataset.i, x.value])) };
        if (!it.texto.trim()) return msg("Escribe el texto antes de agregar.", true);
        await api(`${p.id}/item`, it); msg("Guardado."); return recargar();
      }
      if (t.matches("[data-borrar-item]")) {
        if (!window.confirm("¿Eliminar este elemento?")) return;
        await api(`${p.id}/item/${t.closest("[data-item]").dataset.item}/borrar`, {}); msg("Eliminado."); return recargar();
      }
      if (t.dataset.quitarPais) { paisesPlan = paisesPlan.filter((x) => x !== t.dataset.quitarPais); cont._chips?.(); return; }
      // Plantilla
      if (t.matches("[data-pl-generar]")) {
        if (!p.sector) return msg("Primero elige el sector del proyecto en la fase «Alta».", true);
        if (!paisesPlan.length) return msg("Agrega al menos un país.", true);
        const S = await PS();
        const jur = [], sinCatalogo = [], europeos = [];
        for (const iso of paisesPlan) {
          const j = await S.jurisdiccionDe(iso);
          if (!j) { sinCatalogo.push(nombreDe(nombresPais, iso)); continue; }
          if (j === "EUR") europeos.push(nombreDe(nombresPais, iso));
          if (!jur.includes(j)) jur.push(j);
        }
        if (!jur.length) return msg(`Aún no hay catálogo normativo para ${sinCatalogo.join(", ")}. Agrega un país con catálogo (p. ej. México) o escribe a soporte.`, true);
        t.disabled = true; t.textContent = "Generando…";
        generado = await S.generarPlan({ nombre: p.nombre, sector: p.sector, paises: jur, extranjera: cont.querySelector("[data-pl-extranjera]")?.checked, inicio: p.inicio,
          nombresJur: europeos.length ? { EUR: `${europeos.join(", ")} (normativa UE)` } : {} });
        generado.sinCatalogo = sinCatalogo;
        generado.titulo = `${p.nombre} · ${generado.sectorNombre || "General"} · ${paisesPlan.map((i) => nombreDe(nombresPais, i)).join(", ")}`;
        t.disabled = false; t.textContent = "⚙️ 1. Generar plantilla"; pintarGenerado();
        await api(`${p.id}/fase-datos`, { fase: "plan", datos: { ...(p.fases_datos?.plan || {}), paises: paisesPlan } }).catch(() => {});
        return;
      }
      if (!generado) return;
      const S = await PS();
      if (t.matches("[data-pl-excel]")) return bajar(await S.excel(generado), nombreArchivo("xlsx"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      if (t.matches("[data-pl-json]")) return bajar(JSON.stringify(await S.json(generado), null, 1), nombreArchivo("json"), "application/json");
      if (t.matches("[data-pl-cargar]")) {
        const reemplazar = cont.querySelector("[data-pl-reemplazar]")?.checked;
        if (reemplazar && (d.items.some((x) => x.tipo === "actividad") || d.checklist.length) && !window.confirm("Se reemplazarán las actividades, la lista de auditoría y los riesgos que ya tiene el proyecto. Los hallazgos y notas se conservan. ¿Continuar?")) return;
        t.disabled = true; t.textContent = "Guardando…";
        const nA = await enviarEnLotes(`${p.id}/items`, await S.actividadesDeGenerado(generado), reemplazar);
        const nC = await enviarEnLotes(`${p.id}/checklist`, S.checklistDeGenerado(generado), reemplazar);
        msg(`✔ Guardado en el proyecto: ${nA} actividades y ${nC} elementos de auditoría y riesgos.`);
        const g = generado; await recargar(); generado = g; pintarGenerado();
      }
    } catch (err) { msg(err.message, true); }
  });

  cont.addEventListener("change", async (e) => {
    if (!d) return;
    const p = d.proyecto, t = e.target;
    try {
      if (t.matches("[data-estado-proyecto]")) { await api(`${p.id}/editar`, { ...p, estado: t.value }); msg("Estado actualizado."); return recargar(); }
      if (t.matches("[data-filtro-aud]")) { cont.querySelector("[data-lista-aud]").innerHTML = listaAuditoria(t.value); return; }
      if (t.matches("[data-estado]")) {
        const fila = t.closest("[data-item]"), item = d.items.find((i) => i.id === fila.dataset.item);
        await api(`${p.id}/item`, { ...item, estado: t.value }); item.estado = t.value; msg("Estado actualizado."); return;
      }
      if (t.matches("[data-check-estado], [data-check-nota]")) {
        const fila = t.closest("[data-check]"), c = d.checklist.find((x) => x.id === fila.dataset.check);
        const estado = fila.querySelector("[data-check-estado]")?.value || c.estado, nota = fila.querySelector("[data-check-nota]")?.value ?? c.nota;
        await api(`${p.id}/checklist/${c.id}`, { estado, nota });
        const nuevo = t.matches("[data-check-estado]") && ((c.tipo === "pregunta" && estado === "no_cumple") || (c.tipo === "riesgo" && estado === "hallazgo"));
        if (nuevo) {
          await api(`${p.id}/item`, { tipo: "hallazgo", texto: (c.tipo === "pregunta" ? `No cumple: ${c.texto} (${c.grupo}${c.pais ? `, ${c.pais}` : ""})` : `${c.texto} — ${c.detalle}`).slice(0, 2000),
            responsable: c.responsable || "", severidad: c.tipo === "riesgo" ? "alta" : "alta" });
          msg("Se registró un hallazgo: asígnale responsable y fecha en la tabla de hallazgos."); return recargar();
        }
        c.estado = estado; c.nota = nota; msg("Guardado.");
      }
    } catch (err) { msg(err.message, true); }
  });

  cont.addEventListener("input", async (e) => {
    if (!d || !e.target.matches("[data-pl-importar]") || !e.target.files[0]) return;
    try {
      const S = await PS(), f = e.target.files[0];
      const items = await S.actividadesDeArchivo(f.name, new Uint8Array(await f.arrayBuffer()));
      if (!items.length) return msg("El archivo no trae actividades.", true);
      if (!window.confirm(`Se cargarán ${items.length} actividades del archivo (con su estado y fechas) y reemplazarán las actuales. ¿Continuar?`)) return;
      const n = await enviarEnLotes(`${d.proyecto.id}/items`, items, true); msg(`✔ ${n} actividades importadas.`); return recargar();
    } catch (err) { msg(`No se pudo importar: ${err.message}`, true); }
  });

  return { lista, abrir };
}

export const CSS_PROYECTOS = `${CSS_PAISES}
  .pr-fases { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; padding: 0; margin: 10px 0; }
  .pr-fases li { padding: 6px 10px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface-2); font-size: 13px; }
  .pr-fases li span { margin-right: 4px; }
  .pr-fases li.hecha { background: color-mix(in srgb, #24733b 18%, var(--surface)); border-color: #24733b; }
  .pr-fases li.actual { outline: 3px solid var(--accent); font-weight: 700; }
  .pr-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 0; border-bottom: 2px solid var(--accent); }
  .pr-tabs button { font: inherit; display: inline-flex; gap: 6px; align-items: center; padding: 8px 12px; border: 1px solid var(--line); border-bottom: 0; border-radius: 10px 10px 0 0; background: var(--surface-2); color: var(--text); cursor: pointer; }
  .pr-tabs button.hecha { background: color-mix(in srgb, #24733b 14%, var(--surface)); }
  .pr-tabs button.actual { font-weight: 700; }
  .pr-tabs button[aria-selected="true"] { background: var(--accent); color: var(--on-accent, #fff); border-color: var(--accent); }
  .pr-tab-num { font-size: 12px; min-width: 18px; text-align: center; }
  .pr-fase { border: 1px solid var(--line); border-top: 0; border-radius: 0 0 var(--radius) var(--radius); padding: 10px 14px 14px; background: var(--surface); }
  .pr-titulo-fase { margin: 4px 0; border-left: 6px solid var(--accent); padding-left: 10px; }
  .pr-fase h4 { margin: 16px 0 6px; padding: 4px 10px; border-left: 4px solid var(--accent); background: var(--surface-2); border-radius: 4px; }
  .pr-cabecera { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; align-items: flex-start; } .pr-cabecera h3 { margin: 0; }
  .pr-acciones { display: flex; flex-wrap: wrap; gap: 6px; } .peligro { color: var(--danger, #b3261e) !important; }
  .pr-enlace input { width: min(520px, 100%); }
  .pr-kpis { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; } .pr-kpis span { border: 1px solid var(--line); border-radius: var(--radius); padding: 6px 10px; background: var(--surface); }
  .pr-barra { height: 8px; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--line); overflow: hidden; min-width: 90px; } .pr-barra i { display: block; height: 100%; background: #24733b; }
  .pr-rejilla { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px 14px; align-items: start; margin: 8px 0; }
  .pr-campo { display: flex; flex-direction: column; gap: 4px; } .pr-campo.ancho { grid-column: 1 / -1; } .pr-campo label { font-weight: 600; font-size: 14px; }
  .pr-campo input, .pr-campo select, .pr-campo textarea { width: 100%; box-sizing: border-box; font: inherit; padding: 6px 8px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface-2); color: var(--text); }
  .pr-campo { position: relative; }
  .req { color: var(--danger, #b3261e); } .pr-info { display: inline-grid; place-items: center; width: 18px; height: 18px; margin-left: 4px; border-radius: 50%; border: 1px solid var(--line); font-size: 12px; font-weight: 700; cursor: help; color: var(--text-2); }
  .pr-form { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 14px; align-items: center; position: relative; }
  .pr-form input, .pr-form select, table.t select { width: auto !important; min-width: 0; }
  .pr-form input[data-i="texto"] { flex: 1 1 320px; } .pr-form input[data-i="responsable"] { flex: 0 1 180px; }
  .pr-inline { display: inline-flex !important; gap: 6px; align-items: center; position: relative; }
  .pr-pie { margin-top: 16px; padding: 10px 12px; border: 2px dashed var(--line); border-radius: var(--radius); display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .pr-pie.ok { border-style: solid; border-color: #24733b; }
  .pr-explica { border-left: 5px solid var(--accent); padding: 8px 12px; background: var(--surface-2); border-radius: var(--radius); margin: 8px 0; } .pr-explica ol { margin: 6px 0 0 18px; padding: 0; }
  .pr-plantilla { border: 1px solid var(--line); border-radius: var(--radius); padding: 8px 12px; margin: 12px 0; }
  .pr-preg { display: grid; grid-template-columns: 1fr 170px minmax(160px, 260px); gap: 8px; align-items: start; padding: 6px 0; border-top: 1px dashed var(--line); }
  .pr-preg input, .pr-preg select { width: 100%; box-sizing: border-box; }
  .pr-ley { margin: 6px 0; } .pr-ley summary { font-weight: 600; cursor: pointer; }
  .pr-x { border: 0; background: none; cursor: pointer; font-weight: 700; color: inherit; } .chip { display: inline-block; font-size: 12px; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface-2); }
  .pr-desliza { overflow-x: auto; } .pr-guia { margin-bottom: 10px; }
  @media (max-width: 760px) { .pr-preg { grid-template-columns: 1fr; } }`;
