// Sólo lectura: ningún botón simula firma, aprobación o recepción de solicitudes.
import { esc } from './util.js';

/** Subconjunto documental de Markdown; no ejecuta HTML ni interpreta enlaces del texto. */
export function textoDocumento(texto) {
  const lines = String(texto || '').split(/\r?\n/), out = [];
  for (let i = 0; i < lines.length;) {
    const l = lines[i].trim();
    if (!l) { i++; continue; }
    if (/^#{1,6} /.test(l)) { out.push(`<h4>${esc(l.replace(/^#+ /, ''))}</h4>`); i++; continue; }
    if (l.startsWith('|')) {
      const filas = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i++].trim().replace(/^\||\|$/g, '').split('|').map(x => x.trim());
        if (cells.every(x => /^:?-+:?$/.test(x))) continue;
        filas.push(cells);
      }
      out.push(`<div class="desliza"><table class="t">${filas.map((f, n) => `<tr>${f.map(c => n ? `<td>${esc(c)}</td>` : `<th>${esc(c)}</th>`).join('')}</tr>`).join('')}</table></div>`);
      continue;
    }
    if (l.startsWith('- ')) {
      const lista = [];
      while (i < lines.length && lines[i].trim().startsWith('- ')) lista.push(lines[i++].trim().slice(2));
      out.push(`<ul>${lista.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`); continue;
    }
    const parrafo = [];
    while (i < lines.length && lines[i].trim() && !/^(?:#{1,6} |\||- )/.test(lines[i].trim())) parrafo.push(lines[i++].trim());
    out.push(`<p>${esc(parrafo.join(' '))}</p>`);
  }
  return out.join('');
}

export function documentosHTML(d) {
  return `<h3>Documentos del SGSI</h3><p>Revisión documental: ${esc(d.revisado)}. Lectura de los documentos versionados; no equivale a aprobación, certificación ni prueba de eficacia.</p>
    ${(d.documentos || []).map(x => `<details class="caja"><summary>${esc(x.titulo)}</summary>${textoDocumento(x.texto)}</details>`).join('')}
    <p><b>Para cerrar pendientes:</b> el titular debe aprobar y comunicar SGSI-02 v2 con evidencia y fecha. Para ARCO, comprobar el correo en <a href="legal.html">Datos legales</a> y guardar evidencia privada de un ensayo con datos ficticios. Ninguna solicitud o firma debe publicarse.</p>`;
}
