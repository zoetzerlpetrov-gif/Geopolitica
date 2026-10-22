// Exportar una tabla (y su gráfico, si hay) en 9 formatos. Los de texto salen de exportar-logica.js; PDF y Excel cargan
// su librería (jsPDF, SheetJS) desde jsDelivr solo al pedirlos; la imagen se dibuja en un canvas.
import * as X from "./exportar-logica.js";

const LIB = {
  jspdf: "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm",
  autotable: "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/+esm",
  xlsx: "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm",
};

export function descargarBlob(nombre, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

const celda = (v) => (v == null ? "" : typeof v === "bigint" ? v.toString() : typeof v === "object" ? JSON.stringify(v) : String(v));

/** SVG (texto) → canvas con fondo blanco. */
async function svgACanvas(svg, ancho = 1200) {
  const img = new Image();
  const marcado = svg.includes("xmlns=") ? svg : svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  img.src = URL.createObjectURL(new Blob([marcado], { type: "image/svg+xml" }));
  await img.decode();
  const alto = Math.round(ancho * (img.naturalHeight || 300) / (img.naturalWidth || 600));
  const c = document.createElement("canvas");
  c.width = ancho; c.height = alto;
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, ancho, alto);
  g.drawImage(img, 0, 0, ancho, alto);
  URL.revokeObjectURL(img.src);
  return c;
}

/** PNG: título, gráfico (si hay) y hasta 40 filas de la tabla. */
async function aPNG(cols, filas, { titulo, svg }) {
  const graf = svg ? await svgACanvas(svg) : null;
  const ancho = 1200, altoFila = 22, n = Math.min(filas.length, 40);
  const altoTabla = (n + 1) * altoFila + (filas.length > 40 ? altoFila : 0);
  const c = document.createElement("canvas");
  c.width = ancho; c.height = 50 + (graf ? graf.height + 16 : 0) + altoTabla + 16;
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#111"; g.font = "bold 20px system-ui, sans-serif"; g.fillText(titulo, 16, 32);
  let y = 50;
  if (graf) { g.drawImage(graf, 0, y); y += graf.height + 16; }
  const w = (ancho - 32) / Math.max(1, cols.length);
  g.font = "13px system-ui, sans-serif";
  const fila = (vals, negrita) => {
    g.fillStyle = negrita ? "#eee" : "#fff"; g.fillRect(16, y, ancho - 32, altoFila);
    g.strokeStyle = "#ccc"; g.strokeRect(16, y, ancho - 32, altoFila);
    g.fillStyle = "#111"; g.font = `${negrita ? "bold " : ""}13px system-ui, sans-serif`;
    vals.forEach((v, i) => {
      let t = celda(v);
      while (t.length > 1 && g.measureText(t).width > w - 8) t = t.slice(0, -2) + "…";
      g.fillText(t, 20 + i * w, y + 15);
    });
    y += altoFila;
  };
  fila(cols, true);
  for (const f of filas.slice(0, 40)) fila(cols.map((k) => f[k]));
  if (filas.length > 40) { g.fillStyle = "#555"; g.fillText(`… y ${filas.length - 40} filas más (usa CSV o Excel para todas)`, 20, y + 15); }
  return new Promise((ok) => c.toBlob(ok, "image/png"));
}

async function aPDF(cols, filas, { titulo, nota, svg }) {
  const { jsPDF } = await import(LIB.jspdf);
  const at = await import(LIB.autotable);
  const doc = new jsPDF({ orientation: cols.length > 6 ? "landscape" : "portrait", unit: "pt" });
  doc.setFontSize(14); doc.text(titulo, 40, 40);
  let y = 56;
  if (nota) { doc.setFontSize(9); doc.text(doc.splitTextToSize(nota, doc.internal.pageSize.getWidth() - 80), 40, y); y += 24; }
  if (svg) {
    const c = await svgACanvas(svg, 1000);
    const ancho = doc.internal.pageSize.getWidth() - 80, alto = ancho * c.height / c.width;
    doc.addImage(c.toDataURL("image/png"), "PNG", 40, y, ancho, alto);
    y += alto + 12;
  }
  (at.default || at.autoTable)(doc, { startY: y, head: [cols], body: filas.map((f) => cols.map((k) => celda(f[k]))), styles: { fontSize: 8 }, headStyles: { fillColor: [200, 16, 46] } });
  return doc.output("blob");
}

async function aXLSX(cols, filas, { titulo }) {
  const XLSX = await import(LIB.xlsx);
  const hoja = XLSX.utils.aoa_to_sheet([cols, ...filas.map((f) => cols.map((k) => (typeof f[k] === "bigint" ? Number(f[k]) : f[k] ?? null)))]);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, String(titulo).replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Datos");
  const datos = XLSX.write(libro, { bookType: "xlsx", type: "array" });
  return new Blob([datos], { type: X.FORMATOS.xlsx[2] });
}

/**
 * Exporta y descarga. `formato`: csv | json | sql | md | html | pdf | xlsx | doc | png.
 * `op`: { titulo, nota, svg (texto del gráfico), tabla (nombre para SQL) }.
 */
export async function exportar(formato, cols, filas, op = {}) {
  const titulo = op.titulo || "Resultado";
  const [, ext, mime] = X.FORMATOS[formato] || X.FORMATOS.csv;
  const nombre = `${X.nombreArchivo(titulo)}-${new Date().toISOString().slice(0, 10)}.${ext}`;
  const texto = {
    csv: () => X.aCSV(cols, filas), json: () => X.aJSON(cols, filas), sql: () => X.aSQL(cols, filas, op.tabla || X.nombreArchivo(titulo).replace(/-/g, "_")),
    md: () => X.aMD(cols, filas, titulo), html: () => X.aHTML(cols, filas, { titulo, nota: op.nota, svg: op.svg }), doc: () => X.aWord(cols, filas, { titulo, nota: op.nota }),
  }[formato];
  if (texto) return descargarBlob(nombre, new Blob([texto()], { type: mime }));
  const blob = formato === "pdf" ? await aPDF(cols, filas, { ...op, titulo }) : formato === "xlsx" ? await aXLSX(cols, filas, { titulo }) : await aPNG(cols, filas, { ...op, titulo });
  descargarBlob(nombre, blob);
}

/** <select> + botón listo para insertar: «Exportar como [formato] ⬇». */
export const htmlSelectorExportar = (id) => `<span class="exportar"><select id="${id}-fmt" aria-label="Formato">${Object.entries(X.FORMATOS).map(([k, [n]]) => `<option value="${k}">${n}</option>`).join("")}</select>
  <button type="button" class="btn" id="${id}-btn">⬇ Exportar</button></span>`;

const ESTILO_DOC = "body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#111;margin:24px;line-height:1.4}h1{font-size:18pt;color:#7a0b1c}h2{font-size:14pt;margin-top:18px;border-bottom:1px solid #ccc}h3{font-size:12pt}table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border:1px solid #999;padding:3pt 6pt;font-size:9.5pt;vertical-align:top;text-align:left}th{background:#eee}.meta{color:#555;font-size:9pt}";

/** Documento completo (no tabla): Word (.doc), PDF, HTML, Markdown o impresión. `html` es el cuerpo; `md` opcional. */
export async function exportarDocumento(formato, { titulo = "Documento", html = "", md = "" } = {}) {
  const base = `${X.nombreArchivo(titulo)}-${new Date().toISOString().slice(0, 10)}`;
  const pagina = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${titulo.replace(/</g, "&lt;")}</title><style>${ESTILO_DOC}</style></head><body>${html}</body></html>`;
  if (formato === "md") return descargarBlob(`${base}.md`, new Blob([md || html.replace(/<[^>]+>/g, "")], { type: "text/markdown;charset=utf-8" }));
  if (formato === "html") return descargarBlob(`${base}.html`, new Blob([pagina], { type: "text/html;charset=utf-8" }));
  if (formato === "doc") {
    const word = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${titulo}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]--><style>${ESTILO_DOC}</style></head><body>${html}</body></html>`;
    return descargarBlob(`${base}.doc`, new Blob(["﻿", word], { type: "application/msword" }));
  }
  if (formato === "imprimir") {
    const v = window.open("", "_blank");
    if (!v) throw new Error("El navegador bloqueó la ventana de impresión; permite ventanas emergentes para este sitio.");
    v.document.write(pagina); v.document.close(); v.focus();
    setTimeout(() => v.print(), 400);
    return;
  }
  // PDF: jsPDF dibuja el HTML con html2canvas (ambas librerías se cargan solo al pedir el PDF).
  const [{ jsPDF }, h2c] = await Promise.all([import(LIB.jspdf), import("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm")]);
  window.html2canvas = h2c.default || h2c;
  const caja = document.createElement("div");
  caja.style.cssText = "position:fixed;left:-10000px;top:0;width:760px;background:#fff;color:#111";
  caja.innerHTML = `<style>${ESTILO_DOC.replace(/body\{/, ".doc-pdf{")}</style><div class="doc-pdf">${html}</div>`;
  document.body.appendChild(caja);
  try {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    await doc.html(caja, { margin: [36, 36, 36, 36], autoPaging: "text", width: 540, windowWidth: 760, html2canvas: { scale: 0.71 } });
    descargarBlob(`${base}.pdf`, doc.output("blob"));
  } finally { caja.remove(); }
}

/** Selector de formato para documentos. */
export const htmlSelectorDocumento = (id) => `<span class="exportar"><select id="${id}-fmt" aria-label="Formato"><option value="doc">Word (.doc)</option><option value="pdf">PDF</option><option value="imprimir">Imprimir</option><option value="html">HTML</option><option value="md">Markdown (.md)</option></select>
  <button type="button" class="btn" id="${id}-btn">⬇ Generar</button></span>`;
