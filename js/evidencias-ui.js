// Evidencias (archivos, enlaces y notas) guardadas en el servidor para un elemento concreto: un hallazgo, una pregunta de
// auditoría, una fase del proyecto, un punto de cumplimiento o un control de la autoauditoría. La usan proyectos-ui.js,
// empresa.js (Mi empresa) y autoauditoria.js. `base`: ruta de la API de evidencias de la empresa (Admin o Mi empresa).
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const ICONO = { archivo: "📎", enlace: "🔗", nota: "📝" };
export const ACEPTA = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.csv,.txt,.md,.png,.jpg,.jpeg,.webp,.zip,.xml";

async function pedir(url, init = {}) {
  const r = await fetch(url, { credentials: "include", cache: "no-store", ...init });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 403 ? d.error || "Sin permiso: vuelve a iniciar sesión." : d.error || `HTTP ${r.status}`);
  return d;
}

/** Conteo de evidencias por referencia, para todas las que empiezan con `prefijo`. */
export async function contarEvidencias(base, prefijo) {
  try {
    const { evidencias } = await pedir(`${base}?prefijo=${encodeURIComponent(prefijo)}`);
    const n = {}; for (const e of evidencias) n[e.ref] = (n[e.ref] || 0) + 1; return n;
  } catch { return {}; }
}

/** Pinta la lista y los formularios dentro de `caja`. `alCambiar(total)` avisa el nuevo número de evidencias. */
export async function montarEvidencias(caja, { base, ref, editar = true, alCambiar = () => {} }) {
  const pintar = async () => {
    caja.innerHTML = '<p class="meta">Cargando evidencias…</p>';
    let lista = [], puede = editar;
    try { const d = await pedir(`${base}?ref=${encodeURIComponent(ref)}`); lista = d.evidencias; puede = editar && d.escribir !== false; }
    catch (e) { caja.innerHTML = `<p class="error">${esc(e.message)}</p>`; return; }
    caja.innerHTML = `<div class="ev-caja">
      ${lista.length ? `<ul class="ev-lista">${lista.map((e) => `<li data-ev="${esc(e.id)}">${ICONO[e.tipo]} <b>${esc(e.titulo)}</b>
        ${e.tipo === "archivo" ? ` · <a href="${esc(`${base}/${e.id}`)}" target="_blank" rel="noopener">Descargar ${esc(e.nombre)}</a> <span class="meta">(${Math.max(1, Math.round(e.tamano / 1024))} KB)</span>` : ""}
        ${e.tipo === "enlace" ? ` · <a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">Abrir enlace</a>` : ""}
        ${e.nota ? `<div class="meta">${esc(e.nota)}</div>` : ""}
        <div class="meta">${new Date(e.creado * 1000).toLocaleString("es-MX")} · ${esc(e.por)}</div>
        ${puede ? '<button type="button" class="b ev-quitar" data-ev-quitar>🗑️ Quitar</button>' : ""}</li>`).join("")}</ul>` : '<p class="meta">Sin evidencias todavía.</p>'}
      ${puede ? `<div class="ev-formas">
        <div class="ev-forma"><b>📎 Subir archivo</b> <span class="meta">(PDF, Word, Excel, imagen, ZIP… hasta 10 MB)</span>
          <input data-ev="titulo-a" maxlength="200" placeholder="Título (p. ej. «Contrato firmado»)"><input type="file" data-ev="archivo" accept="${ACEPTA}">
          <button type="button" class="b" data-ev-subir>Subir</button></div>
        <div class="ev-forma"><b>🔗 Enlace o 📝 nota</b>
          <input data-ev="titulo-e" maxlength="200" placeholder="Título"><input data-ev="url" maxlength="1000" placeholder="https://… (opcional)">
          <input data-ev="nota" maxlength="3000" placeholder="Nota: qué se revisó y qué se encontró (opcional)">
          <button type="button" class="b" data-ev-guardar>Guardar</button></div></div>` : ""}
      <p class="meta">Sin límite de enlaces o notas; hasta 10 MB por archivo y 5,000 evidencias por empresa en total. Para entregar un paquete de auditoría, la skill de Claude <code>finance:audit-support</code> ordena estas evidencias por control.</p>
      <p class="meta ev-msg" role="status"></p></div>`;
    alCambiar(lista.length);
  };
  const msg = (t, error) => { const m = caja.querySelector(".ev-msg"); if (m) m.innerHTML = error ? `<span class="error">${esc(t)}</span>` : esc(t); };
  caja.addEventListener("click", async (e) => {
    const v = (k) => caja.querySelector(`[data-ev="${k}"]`);
    try {
      if (e.target.matches("[data-ev-subir]")) {
        const f = v("archivo").files[0]; if (!f) return msg("Elige un archivo.", true);
        if (f.size > 10 * 1024 * 1024) return msg("El archivo supera 10 MB.", true);
        msg(`Subiendo ${f.name}…`);
        const q = new URLSearchParams({ ref, titulo: v("titulo-a").value.trim() || f.name.replace(/\.[^.]+$/, ""), nombre: f.name });
        await pedir(`${base}/archivo?${q}`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: f });
        return pintar();
      }
      if (e.target.matches("[data-ev-guardar]")) {
        const cuerpo = { ref, titulo: v("titulo-e").value.trim(), url: v("url").value.trim(), nota: v("nota").value.trim() };
        if (!cuerpo.titulo || (!cuerpo.url && !cuerpo.nota)) return msg("Escribe un título y un enlace o una nota.", true);
        await pedir(`${base}/enlace`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(cuerpo) });
        return pintar();
      }
      if (e.target.matches("[data-ev-quitar]")) {
        if (!window.confirm("¿Quitar esta evidencia? Si es un archivo, se borra del servidor.")) return;
        await pedir(`${base}/${e.target.closest("[data-ev]").dataset.ev}/borrar`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" });
        return pintar();
      }
    } catch (err) { msg(err.message, true); }
  });
  await pintar();
}

export const CSS_EVIDENCIAS = `.ev-caja { border: 1px dashed var(--line); border-radius: var(--radius, 8px); padding: 8px 10px; margin: 6px 0; background: var(--surface); }
  .ev-lista { list-style: none; padding: 0; margin: 0 0 8px; } .ev-lista li { padding: 6px 0; border-bottom: 1px solid var(--line); }
  .ev-formas { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 10px; }
  .ev-forma { display: flex; flex-direction: column; gap: 6px; } .ev-forma input { font: inherit; padding: 5px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface-2); color: var(--text); }
  .ev-forma button { align-self: flex-start; } .ev-quitar { margin-top: 4px; }
  .ev-boton { white-space: nowrap; }`;
