// Admin → Organización DOMINUS (organizacion.html). Catálogo en config/organizacion.json; avance en el Worker
// (/cuenta/empresa/admin/interno, solo con la sesión de administración).
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const $ = (id) => document.getElementById(id);
export const ESTADOS = { pendiente: "Pendiente", en_proceso: "En proceso", cumple: "Hecho", no_cumple: "Bloqueado", no_aplica: "No aplica" };
const API = "/cuenta/empresa/admin/interno";

/** Avance de un área: % hecho sin contar «no aplica», filtrando por etapa si se indica. */
export function avance(area, resp = {}, etapa = "") {
  const ts = area.tareas.filter((t) => !etapa || t.etapa === etapa);
  const c = { total: ts.length, hecho: 0, proceso: 0, na: 0 };
  for (const t of ts) {
    const e = resp[`${area.id}.${t.id}`]?.estado;
    if (e === "cumple") c.hecho++; else if (e === "en_proceso") c.proceso++; else if (e === "no_aplica") c.na++;
  }
  const base = c.total - c.na;
  return { ...c, pct: base > 0 ? Math.round((c.hecho / base) * 100) : 0 };
}

export function csv(cat, resp = {}) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const filas = [["area", "etapa", "tarea", "estado", "responsable", "fecha_limite", "evidencia"]];
  for (const a of cat.areas) for (const t of a.tareas) {
    const r = resp[`${a.id}.${t.id}`] || {};
    filas.push([a.nombre, cat.etapas[t.etapa], t.texto, ESTADOS[r.estado || "pendiente"], r.responsable, r.fecha_limite, r.evidencia]);
  }
  return "﻿" + filas.map((f) => f.map(q).join(",")).join("\r\n");
}

/** Markdown sencillo (títulos, negritas, listas, tablas, citas) → HTML escapado; para vista previa y Word. */
export function mdHtml(md) {
  const inl = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>");
  const out = []; let lista = "", tabla = null;
  const cerrar = () => { if (lista) { out.push(`</${lista}>`); lista = ""; } if (tabla) { out.push(`<table border="1" cellpadding="4" style="border-collapse:collapse">${tabla.join("")}</table>`); tabla = null; } };
  for (const linea of String(md || "").split(/\r?\n/)) {
    const l = linea.trimEnd(); let m;
    if (/^\|.*\|$/.test(l.trim())) {
      if (/^\|[\s:|-]+\|$/.test(l.trim())) continue;
      if (lista) { out.push(`</${lista}>`); lista = ""; }
      const celdas = l.trim().slice(1, -1).split("|").map((c) => c.trim());
      const tag = tabla ? "td" : "th"; tabla = tabla || [];
      tabla.push(`<tr>${celdas.map((c) => `<${tag}>${inl(c)}</${tag}>`).join("")}</tr>`); continue;
    }
    if (tabla) cerrar();
    if ((m = /^(#{1,4})\s+(.*)$/.exec(l))) { cerrar(); out.push(`<h${m[1].length}>${inl(m[2])}</h${m[1].length}>`); }
    else if ((m = /^\s*(?:[-*]|\d+\.)\s+(?:\[( |x)\]\s+)?(.*)$/i.exec(l))) {
      const tipo = /^\s*\d+\./.test(l) ? "ol" : "ul";
      if (lista !== tipo) { cerrar(); out.push(`<${tipo}>`); lista = tipo; }
      out.push(`<li>${m[1] !== undefined ? (m[1].toLowerCase() === "x" ? "☑ " : "☐ ") : ""}${inl(m[2])}</li>`);
    } else if ((m = /^>\s?(.*)$/.exec(l))) { cerrar(); out.push(`<blockquote>${inl(m[1])}</blockquote>`); }
    else if (!l.trim()) cerrar();
    else { cerrar(); out.push(`<p>${inl(l)}</p>`); }
  }
  cerrar();
  return out.join("\n");
}

/** Texto para pegar en Claude que invoca una skill con el contexto del área. */
export function indicacionSkill(area, sk) {
  return `/${sk.skill} Contexto: DOMINUS OSINT, plataforma de inteligencia de riesgos en México (hoy persona física con actividad empresarial, clientes en México y el extranjero). Área: ${area.nombre}. Necesito: ${sk.para}. Explícamelo paso a paso, con normas mexicanas aplicables y un ejemplo resuelto.`;
}

async function api(cuerpo) {
  const init = { credentials: "include", cache: "no-store" };
  if (cuerpo) Object.assign(init, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(cuerpo) });
  const r = await fetch(API, init);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 403 ? "Tu sesión de administración terminó: vuelve a ingresar." : d.error || `HTTP ${r.status}`);
  return d;
}

if (typeof document !== "undefined" && $("or-areas")) {
  const cat = await fetch("config/organizacion.json", { cache: "no-cache" }).then((r) => r.json());
  const plantillas = await fetch("config/organizacion-plantillas.json", { cache: "no-cache" }).then((r) => r.json()).then((d) => d.plantillas).catch(() => []);
  let resp = {}, actual = cat.areas[0].id, docs = [], r2 = true;
  const DOCS = "/cuenta/empresa/admin/docs";
  const docsApi = async (ruta = "", init = {}) => {
    const r = await fetch(DOCS + ruta, { credentials: "include", cache: "no-store", ...init });
    if ((r.headers.get("Content-Type") || "").startsWith("application/json")) {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(r.status === 403 ? "Tu sesión de administración terminó: vuelve a ingresar." : d.error || `HTTP ${r.status}`);
      return d;
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r;
  };
  const cargarDocs = async () => { try { const d = await docsApi(); docs = d.documentos; r2 = d.r2; } catch (e) { $("or-msg").innerHTML = `<span class="error">${esc(e.message)}</span>`; } };
  await cargarDocs();
  try { resp = Object.fromEntries((await api()).respuestas.map((r) => [r.clave, r])); }
  catch (e) { $("or-msg").innerHTML = `<span class="error">${esc(e.message)}</span>`; }
  for (const [k, v] of Object.entries(cat.etapas)) $("or-etapa").insertAdjacentHTML("beforeend", `<option value="${k}">${esc(v)}</option>`);

  const pintar = () => {
    const etapa = $("or-etapa").value;
    const tot = cat.areas.map((a) => avance(a, resp, etapa)), suma = tot.reduce((s, x) => ({ total: s.total + x.total - x.na, hecho: s.hecho + x.hecho }), { total: 0, hecho: 0 });
    $("or-resumen").innerHTML = `<p><b>Avance general: ${suma.total ? Math.round((suma.hecho / suma.total) * 100) : 0} %</b> <span class="meta">(${suma.hecho} de ${suma.total} tareas hechas${etapa ? ` en «${esc(cat.etapas[etapa])}»` : ""})</span></p>`;
    $("or-areas").innerHTML = cat.areas.map((a, i) => `<button type="button" class="area" data-area="${esc(a.id)}" aria-pressed="${a.id === actual}"><b>${esc(a.icono)} ${esc(a.nombre)}</b>
      <span class="meta">${tot[i].hecho}/${tot[i].total - tot[i].na} hechas · ${tot[i].proceso} en proceso · 📁 ${docs.filter((d) => d.area === a.id).length}</span><div class="progreso" aria-hidden="true"><i style="width:${tot[i].pct}%"></i></div></button>`).join("");
    const a = cat.areas.find((x) => x.id === actual);
    const etapas = Object.keys(cat.etapas).filter((e) => !etapa || e === etapa);
    $("or-area").innerHTML = `<div class="tarjeta"><h2>${esc(a.icono)} ${esc(a.nombre)}</h2><p>${esc(a.objetivo)}</p>
      ${a.normas.length ? `<p class="meta">Normas de referencia: ${a.normas.map((n) => `<span class="chip">${esc(n)}</span>`).join("")}</p>` : ""}
      <p class="meta">Herramientas: ${a.herramientas.map((n) => `<span class="chip">${esc(n)}</span>`).join("")}</p>
      ${etapas.map((e) => { const ts = a.tareas.filter((t) => t.etapa === e); return ts.length ? `<h3>${esc(cat.etapas[e])}</h3>${ts.map((t) => {
        const k = `${a.id}.${t.id}`, r = resp[k] || {};
        const pl = plantillas.filter((p) => p.area === a.id && p.tarea === t.id), nd = docs.filter((d) => d.area === a.id && d.tarea === t.id).length;
        return `<div class="tarea estado-${esc(r.estado || "pendiente")}" data-clave="${esc(k)}"><div class="texto">${esc(t.texto)}${pl.map((p) => ` <button type="button" class="b mini" data-plantilla="${esc(p.id)}" title="Crear documento a partir de esta plantilla">📄 ${esc(p.titulo)}</button>`).join("")}${nd ? ` <span class="chip">📁 ${nd} documento(s)</span>` : ""}${r.actualizado ? `<div class="meta">Actualizado ${new Date(r.actualizado * 1000).toISOString().slice(0, 10)}</div>` : ""}</div>
          <select data-c="estado" aria-label="Estado">${Object.entries(ESTADOS).map(([v, n]) => `<option value="${v}" ${v === (r.estado || "pendiente") ? "selected" : ""}>${n}</option>`).join("")}</select>
          <input data-c="responsable" maxlength="120" placeholder="Responsable" aria-label="Responsable" value="${esc(r.responsable || "")}">
          <input data-c="fecha_limite" type="date" aria-label="Fecha límite" value="${esc(r.fecha_limite || "")}">
          <input data-c="evidencia" maxlength="1000" placeholder="Evidencia (enlace o nota)" aria-label="Evidencia" value="${esc(r.evidencia || "")}"></div>`; }).join("")}` : ""; }).join("")}</div>
      ${pintarSkills(a)}${pintarDocs(a)}`;
    const soc = resp["legal.sociedad"];
    $("or-recordatorio").innerHTML = soc?.estado === "cumple" ? "" : `<div class="tarjeta recordatorio">📌 <b>Recordatorio:</b> evaluar constituir una sociedad (S.A.P.I. o S. de R.L. de C.V.) en lugar de seguir como persona física con actividad empresarial. Está en el área <b>Legal y societario</b>.${soc?.fecha_limite ? ` Fecha objetivo: ${esc(soc.fecha_limite)}.` : ""}</div>`;
  };
  function pintarSkills(a) {
    if (!a.skills?.length) return "";
    return `<div class="tarjeta"><h3>🤖 Skills de Claude para esta área</h3><p class="meta">Copia la indicación y pégala en Claude (Claude Code o claude.ai con la skill habilitada). Ya incluye el contexto de DOMINUS.</p>
      <div class="skills">${a.skills.map((sk, i) => `<div class="skill"><code>${esc(sk.skill)}</code><span>${esc(sk.para)}</span><button type="button" class="b mini" data-skill="${i}">📋 Copiar indicación</button></div>`).join("")}</div></div>`;
  }
  function pintarDocs(a) {
    const lista = docs.filter((d) => d.area === a.id);
    const tareas = Object.fromEntries(a.tareas.map((t) => [t.id, t.texto]));
    const pl = plantillas.filter((p) => p.area === a.id);
    return `<div class="tarjeta" id="or-docs"><h3>📁 Documentos de ${esc(a.nombre)}</h3>
      <p class="meta">Se guardan en el servidor (privado, solo administración). Los documentos de texto se editan aquí; los archivos (PDF, Word, Excel, imágenes, hasta 10 MB) se suben y se descargan.</p>
      <div class="barra">
        ${pl.length ? `<select id="or-pl" aria-label="Plantilla">${pl.map((p) => `<option value="${esc(p.id)}">${esc(p.titulo)}</option>`).join("")}</select>
        <button type="button" class="b" id="or-pl-usar">📄 Crear desde plantilla</button>` : ""}
        <button type="button" class="b" id="or-blanco">📝 Documento en blanco</button>
        ${r2 ? `<label class="b subir">⬆️ Subir archivo<input type="file" id="or-subir" hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.csv,.txt,.md,.png,.jpg,.jpeg,.webp,.zip,.xml"></label>` : `<span class="meta">Subir archivos requiere el almacenamiento R2 del Worker.</span>`}
      </div>
      ${lista.length ? `<table class="docs"><thead><tr><th>Documento</th><th>Tarea</th><th>Tipo</th><th>Actualizado</th><th>Acciones</th></tr></thead><tbody>${lista.map((d) => `<tr data-doc="${esc(d.id)}">
        <td><b>${esc(d.titulo)}</b>${d.nota ? `<div class="meta">${esc(d.nota)}</div>` : ""}</td>
        <td class="meta">${esc(tareas[d.tarea] || "—")}</td>
        <td>${d.tipo === "texto" ? "📝 Texto" : `📎 ${esc((d.nombre || "").split(".").pop().toUpperCase())} · ${Math.max(1, Math.round(d.tamano / 1024))} KB`}</td>
        <td class="meta">${new Date(d.actualizado * 1000).toLocaleDateString("es-MX")} · v${d.version}</td>
        <td class="acciones">${d.tipo === "texto" ? `<button type="button" class="b mini" data-acc="abrir">✏️ Abrir y editar</button>` : `<button type="button" class="b mini" data-acc="bajar">⬇️ Descargar</button><label class="b mini">🔁 Reemplazar<input type="file" data-acc="reemplazar" hidden></label>`}
          <button type="button" class="b mini" data-acc="datos">🏷️ Renombrar / mover</button><button type="button" class="b mini peligro" data-acc="borrar">🗑️ Eliminar</button></td></tr>`).join("")}</tbody></table>`
        : `<p class="meta">Aún no hay documentos en esta área. Empieza con una plantilla.</p>`}</div>`;
  }

  // Editor de documentos de texto (diálogo)
  const dlg = $("or-editor");
  const abrirEditor = (doc) => {
    const a = cat.areas.find((x) => x.id === doc.area);
    $("ed-id").value = doc.id || ""; $("ed-area").value = doc.area; $("ed-titulo").value = doc.titulo || ""; $("ed-nota").value = doc.nota || "";
    $("ed-contenido").value = doc.contenido || "";
    $("ed-tarea").innerHTML = `<option value="">(sin tarea)</option>` + a.tareas.map((t) => `<option value="${esc(t.id)}" ${t.id === doc.tarea ? "selected" : ""}>${esc(t.texto.slice(0, 90))}</option>`).join("");
    $("ed-vista").hidden = true; $("ed-contenido").hidden = false; $("ed-msg").textContent = "";
    dlg.showModal();
  };
  const descargar = (blob, nombre) => { const x = document.createElement("a"); x.href = URL.createObjectURL(blob); x.download = nombre; x.click(); setTimeout(() => URL.revokeObjectURL(x.href), 1000); };
  const nombreSeguro = () => ($("ed-titulo").value.trim() || "documento").replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 80);
  $("ed-guardar").addEventListener("click", async () => {
    const cuerpo = { id: $("ed-id").value || undefined, area: $("ed-area").value, tarea: $("ed-tarea").value, titulo: $("ed-titulo").value, nota: $("ed-nota").value, contenido: $("ed-contenido").value };
    $("ed-msg").textContent = "Guardando…";
    try {
      const r = await docsApi("/texto", { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(cuerpo) });
      $("ed-id").value = r.id; $("ed-msg").textContent = `Guardado ${new Date().toLocaleTimeString("es-MX")}.`;
      await cargarDocs(); pintar();
    } catch (e) { $("ed-msg").innerHTML = `<span class="error">${esc(e.message)}</span>`; }
  });
  $("ed-vista-btn").addEventListener("click", () => {
    const v = $("ed-vista"); v.hidden = !v.hidden; $("ed-contenido").hidden = !v.hidden;
    if (!v.hidden) v.innerHTML = mdHtml($("ed-contenido").value);
  });
  $("ed-md").addEventListener("click", () => descargar(new Blob([$("ed-contenido").value], { type: "text/markdown;charset=utf-8" }), nombreSeguro() + ".md"));
  $("ed-word").addEventListener("click", () => descargar(new Blob([`<html><head><meta charset="utf-8"><title>${esc($("ed-titulo").value)}</title></head><body style="font-family:Calibri,Arial,sans-serif">${mdHtml($("ed-contenido").value)}</body></html>`], { type: "application/msword" }), nombreSeguro() + ".doc"));
  $("ed-cerrar").addEventListener("click", () => dlg.close());

  $("or-area").addEventListener("click", async (e) => {
    const a = cat.areas.find((x) => x.id === actual);
    const sk = e.target.closest("[data-skill]");
    if (sk) {
      const txt = indicacionSkill(a, a.skills[Number(sk.dataset.skill)]);
      try { await navigator.clipboard.writeText(txt); sk.textContent = "✅ Copiada"; } catch { window.prompt("Copia la indicación:", txt); }
      setTimeout(() => { sk.textContent = "📋 Copiar indicación"; }, 2000); return;
    }
    const plb = e.target.closest("[data-plantilla]") || (e.target.id === "or-pl-usar" ? { dataset: { plantilla: $("or-pl").value } } : null);
    if (plb) { const p = plantillas.find((x) => x.id === plb.dataset.plantilla); if (p) abrirEditor({ area: p.area, tarea: p.tarea, titulo: p.titulo, contenido: p.contenido }); return; }
    if (e.target.id === "or-blanco") { abrirEditor({ area: a.id, tarea: "", titulo: "", contenido: "# Título\n\n" }); return; }
    const fila = e.target.closest("[data-doc]"), acc = e.target.closest("[data-acc]")?.dataset.acc;
    if (!fila || !acc || acc === "reemplazar") return;
    const d = docs.find((x) => x.id === fila.dataset.doc);
    try {
      if (acc === "abrir") abrirEditor((await docsApi("/" + d.id)).documento);
      else if (acc === "bajar") descargar(await (await docsApi("/" + d.id)).blob(), d.nombre || "documento");
      else if (acc === "datos") {
        const titulo = window.prompt("Nuevo título:", d.titulo); if (titulo === null) return;
        const nota = window.prompt("Nota (opcional):", d.nota || ""); if (nota === null) return;
        const opciones = cat.areas.map((x) => x.id).join(", ");
        const area = window.prompt(`Área (${opciones}):`, d.area); if (area === null) return;
        const tarea = area === d.area ? d.tarea : "";
        await docsApi(`/${d.id}/editar`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ titulo, nota, area: area.trim(), tarea }) });
        await cargarDocs(); pintar(); $("or-msg").textContent = "Documento actualizado.";
      } else if (acc === "borrar") {
        if (!window.confirm(`¿Eliminar «${d.titulo}»? Esta acción no se puede deshacer.`)) return;
        await docsApi(`/${d.id}/borrar`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" });
        await cargarDocs(); pintar(); $("or-msg").textContent = "Documento eliminado.";
      }
    } catch (err) { $("or-msg").innerHTML = `<span class="error">${esc(err.message)}</span>`; }
  });
  const subir = async (archivo, id) => {
    const a = cat.areas.find((x) => x.id === actual);
    if (archivo.size > 10 * 1024 * 1024) { $("or-msg").innerHTML = `<span class="error">El archivo supera 10 MB.</span>`; return; }
    const titulo = id ? docs.find((x) => x.id === id).titulo : (window.prompt("Título del documento:", archivo.name.replace(/\.[^.]+$/, "")) || "").trim();
    if (!titulo) return;
    const q = new URLSearchParams({ area: a.id, tarea: id ? docs.find((x) => x.id === id).tarea : "", titulo, nombre: archivo.name, ...(id ? { id } : {}) });
    $("or-msg").textContent = `Subiendo ${archivo.name}…`;
    try { await docsApi("/archivo?" + q, { method: "POST", headers: { "Content-Type": archivo.type || "application/octet-stream" }, body: archivo }); await cargarDocs(); pintar(); $("or-msg").textContent = "Archivo guardado en el servidor."; }
    catch (err) { $("or-msg").innerHTML = `<span class="error">${esc(err.message)}</span>`; }
  };
  $("or-area").addEventListener("input", (e) => {
    if (e.target.id === "or-subir" && e.target.files[0]) subir(e.target.files[0]);
    if (e.target.dataset?.acc === "reemplazar" && e.target.files[0]) subir(e.target.files[0], e.target.closest("[data-doc]").dataset.doc);
  });

  $("or-areas").addEventListener("click", (e) => { const b = e.target.closest("[data-area]"); if (b) { actual = b.dataset.area; pintar(); } });
  $("or-etapa").addEventListener("input", pintar);
  $("or-area").addEventListener("change", async (e) => {
    const fila = e.target.closest(".tarea"); if (!fila || !e.target.dataset.c) return;
    const v = (c) => fila.querySelector(`[data-c="${c}"]`).value;
    const d = { clave: fila.dataset.clave, estado: v("estado"), responsable: v("responsable"), fecha_limite: v("fecha_limite"), evidencia: v("evidencia") };
    $("or-msg").textContent = "Guardando…";
    try { const r = await api(d); resp[d.clave] = { ...d, actualizado: r.actualizado }; $("or-msg").textContent = `Guardado ${new Date().toLocaleTimeString("es-MX")}.`; pintar(); }
    catch (err) { $("or-msg").innerHTML = `<span class="error">${esc(err.message)}</span>`; }
  });
  $("or-csv").addEventListener("click", () => {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv(cat, resp)], { type: "text/csv;charset=utf-8" })); a.download = "organizacion-dominus.csv"; a.click();
  });
  pintar();
}
