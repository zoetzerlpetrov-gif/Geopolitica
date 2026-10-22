// Formatos de exportación de una tabla (columnas + filas) sin red ni DOM: CSV, JSON, SQL, Markdown, HTML y Word.
// PDF, Excel e imagen necesitan librerías o canvas y viven en exportar.js.

const texto = (v) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
const escHtml = (s) => texto(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** CSV con comillas en cada celda y BOM para que Excel lea bien los acentos. */
export function aCSV(cols, filas) {
  const q = (v) => `"${texto(v).replace(/"/g, '""')}"`;
  return "﻿" + [cols.map(q).join(","), ...filas.map((f) => cols.map((c) => q(f[c])).join(","))].join("\n");
}

/** JSON: lista de objetos (una fila = un objeto). BigInt de DuckDB se pasa a número o texto. */
export function aJSON(cols, filas) {
  const limpio = (v) => (typeof v === "bigint" ? (Number.isSafeInteger(Number(v)) ? Number(v) : v.toString()) : v);
  return JSON.stringify(filas.map((f) => Object.fromEntries(cols.map((c) => [c, limpio(f[c] ?? null)]))), null, 2);
}

/** Tipo SQL de una columna según sus valores: INTEGER, DOUBLE, BOOLEAN, DATE, TIMESTAMP o VARCHAR. */
export function tipoSQL(valores) {
  const v = valores.filter((x) => x != null && x !== "");
  if (!v.length) return "VARCHAR";
  if (v.every((x) => typeof x === "boolean")) return "BOOLEAN";
  if (v.every((x) => typeof x === "bigint" || (typeof x === "number" && Number.isInteger(x)))) return "INTEGER";
  if (v.every((x) => typeof x === "number" || typeof x === "bigint")) return "DOUBLE";
  if (v.every((x) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x))) return "DATE";
  if (v.every((x) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(x))) return "TIMESTAMP";
  return "VARCHAR";
}

const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;

/** Script SQL: CREATE TABLE con tipos deducidos e INSERT por fila (sirve en DuckDB, PostgreSQL y SQLite). */
export function aSQL(cols, filas, tabla = "resultado") {
  const tipos = cols.map((c) => tipoSQL(filas.map((f) => f[c])));
  const lit = (v, t) => {
    if (v == null || v === "") return "NULL";
    if (t === "INTEGER" || t === "DOUBLE") return String(v);
    if (t === "BOOLEAN") return v ? "TRUE" : "FALSE";
    return `'${texto(v).replace(/'/g, "''")}'`;
  };
  const crear = `CREATE TABLE ${ident(tabla)} (\n${cols.map((c, i) => `  ${ident(c)} ${tipos[i]}`).join(",\n")}\n);`;
  const ins = filas.map((f) => `INSERT INTO ${ident(tabla)} (${cols.map(ident).join(", ")}) VALUES (${cols.map((c, i) => lit(f[c], tipos[i])).join(", ")});`);
  return [crear, ...ins].join("\n") + "\n";
}

/** Tabla Markdown (las barras verticales y saltos de línea dentro de una celda se escapan). */
export function aMD(cols, filas, titulo = "") {
  const c = (v) => texto(v).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  return (titulo ? `# ${titulo}\n\n` : "") + `| ${cols.map(c).join(" | ")} |\n| ${cols.map(() => "---").join(" | ")} |\n`
    + filas.map((f) => `| ${cols.map((k) => c(f[k])).join(" | ")} |`).join("\n") + "\n";
}

const tablaHtml = (cols, filas) => `<table><thead><tr>${cols.map((c) => `<th>${escHtml(c)}</th>`).join("")}</tr></thead><tbody>`
  + filas.map((f) => `<tr>${cols.map((c) => `<td>${escHtml(f[c])}</td>`).join("")}</tr>`).join("") + "</tbody></table>";

/** Página HTML completa e independiente (se abre sin conexión). `svg`: gráfico opcional ya dibujado. */
export function aHTML(cols, filas, { titulo = "Resultado", nota = "", svg = "" } = {}) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escHtml(titulo)}</title>
<style>body{font-family:system-ui,sans-serif;margin:24px;color:#111}table{border-collapse:collapse;font-size:13px}th,td{border:1px solid #bbb;padding:4px 8px;text-align:left}th{background:#eee}.nota{color:#555;font-size:12px}svg{max-width:100%}</style>
</head><body><h1>${escHtml(titulo)}</h1>${nota ? `<p class="nota">${escHtml(nota)}</p>` : ""}${svg}${tablaHtml(cols, filas)}</body></html>`;
}

/** Documento para Word: HTML con los espacios de nombres de Office; Word lo abre como documento editable (.doc). */
export function aWord(cols, filas, { titulo = "Resultado", nota = "" } = {}) {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escHtml(titulo)}</title><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
<style>body{font-family:Calibri,sans-serif}table{border-collapse:collapse}th,td{border:1px solid #999;padding:3pt 6pt;font-size:10pt}th{background:#e7e6e6}</style></head>
<body><h1>${escHtml(titulo)}</h1>${nota ? `<p>${escHtml(nota)}</p>` : ""}${tablaHtml(cols, filas)}</body></html>`;
}

/** Formatos disponibles: id → [etiqueta, extensión, tipo MIME]. */
export const FORMATOS = {
  csv: ["CSV", "csv", "text/csv;charset=utf-8"],
  json: ["JSON", "json", "application/json"],
  sql: ["SQL", "sql", "application/sql"],
  md: ["Markdown (.md)", "md", "text/markdown;charset=utf-8"],
  html: ["HTML", "html", "text/html;charset=utf-8"],
  pdf: ["PDF", "pdf", "application/pdf"],
  xlsx: ["Excel (.xlsx)", "xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  doc: ["Word (.doc)", "doc", "application/msword"],
  png: ["Imagen (.png)", "png", "image/png"],
};

/** Nombre de archivo seguro: «Mi consulta: 2026» → «mi-consulta-2026». */
export const nombreArchivo = (s) => (String(s || "resultado").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "resultado");
