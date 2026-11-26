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
  let resp = {}, actual = cat.areas[0].id;
  try { resp = Object.fromEntries((await api()).respuestas.map((r) => [r.clave, r])); }
  catch (e) { $("or-msg").innerHTML = `<span class="error">${esc(e.message)}</span>`; }
  for (const [k, v] of Object.entries(cat.etapas)) $("or-etapa").insertAdjacentHTML("beforeend", `<option value="${k}">${esc(v)}</option>`);

  const pintar = () => {
    const etapa = $("or-etapa").value;
    const tot = cat.areas.map((a) => avance(a, resp, etapa)), suma = tot.reduce((s, x) => ({ total: s.total + x.total - x.na, hecho: s.hecho + x.hecho }), { total: 0, hecho: 0 });
    $("or-resumen").innerHTML = `<p><b>Avance general: ${suma.total ? Math.round((suma.hecho / suma.total) * 100) : 0} %</b> <span class="meta">(${suma.hecho} de ${suma.total} tareas hechas${etapa ? ` en «${esc(cat.etapas[etapa])}»` : ""})</span></p>`;
    $("or-areas").innerHTML = cat.areas.map((a, i) => `<button type="button" class="area" data-area="${esc(a.id)}" aria-pressed="${a.id === actual}"><b>${esc(a.icono)} ${esc(a.nombre)}</b>
      <span class="meta">${tot[i].hecho}/${tot[i].total - tot[i].na} hechas · ${tot[i].proceso} en proceso</span><div class="progreso" aria-hidden="true"><i style="width:${tot[i].pct}%"></i></div></button>`).join("");
    const a = cat.areas.find((x) => x.id === actual);
    const etapas = Object.keys(cat.etapas).filter((e) => !etapa || e === etapa);
    $("or-area").innerHTML = `<div class="tarjeta"><h2>${esc(a.icono)} ${esc(a.nombre)}</h2><p>${esc(a.objetivo)}</p>
      ${a.normas.length ? `<p class="meta">Normas de referencia: ${a.normas.map((n) => `<span class="chip">${esc(n)}</span>`).join("")}</p>` : ""}
      <p class="meta">Herramientas: ${a.herramientas.map((n) => `<span class="chip">${esc(n)}</span>`).join("")}</p>
      ${etapas.map((e) => { const ts = a.tareas.filter((t) => t.etapa === e); return ts.length ? `<h3>${esc(cat.etapas[e])}</h3>${ts.map((t) => {
        const k = `${a.id}.${t.id}`, r = resp[k] || {};
        return `<div class="tarea estado-${esc(r.estado || "pendiente")}" data-clave="${esc(k)}"><div class="texto">${esc(t.texto)}${r.actualizado ? `<div class="meta">Actualizado ${new Date(r.actualizado * 1000).toISOString().slice(0, 10)}</div>` : ""}</div>
          <select data-c="estado" aria-label="Estado">${Object.entries(ESTADOS).map(([v, n]) => `<option value="${v}" ${v === (r.estado || "pendiente") ? "selected" : ""}>${n}</option>`).join("")}</select>
          <input data-c="responsable" maxlength="120" placeholder="Responsable" aria-label="Responsable" value="${esc(r.responsable || "")}">
          <input data-c="fecha_limite" type="date" aria-label="Fecha límite" value="${esc(r.fecha_limite || "")}">
          <input data-c="evidencia" maxlength="1000" placeholder="Evidencia (enlace o nota)" aria-label="Evidencia" value="${esc(r.evidencia || "")}"></div>`; }).join("")}` : ""; }).join("")}</div>`;
    const soc = resp["legal.sociedad"];
    $("or-recordatorio").innerHTML = soc?.estado === "cumple" ? "" : `<div class="tarjeta recordatorio">📌 <b>Recordatorio:</b> evaluar constituir una sociedad (S.A.P.I. o S. de R.L. de C.V.) en lugar de seguir como persona física con actividad empresarial. Está en el área <b>Legal y societario</b>.${soc?.fecha_limite ? ` Fecha objetivo: ${esc(soc.fecha_limite)}.` : ""}</div>`;
  };
  $("or-areas").addEventListener("click", (e) => { const b = e.target.closest("[data-area]"); if (b) { actual = b.dataset.area; pintar(); } });
  $("or-etapa").addEventListener("input", pintar);
  $("or-area").addEventListener("change", async (e) => {
    const fila = e.target.closest(".tarea"); if (!fila) return;
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
