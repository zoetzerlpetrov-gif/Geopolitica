// Escritor mínimo de libros de Excel (.xlsx, Office Open XML) con formato: sin bibliotecas externas y sin red.
// Lo que sí hace: varias hojas, textos y números, fórmulas (se calculan al abrir), fechas, anchos de columna, filas y
// columnas fijas, filtros, celdas combinadas, listas desplegables (validación de datos) y formato condicional por fórmula.
// El ZIP se escribe sin compresión (método «stored»): Excel, LibreOffice y Google Sheets lo abren igual.
import { crc32 } from "./fase5-gtfs-zip.js";

/** Estilos de celda disponibles (nombre → índice en styles.xml). */
export const ESTILOS = { normal: 0, titulo: 1, encabezado: 2, fase: 3, seccion: 4, texto: 5, fecha: 6, numero: 7, porcentaje: 8, nota: 9, hito: 10,
  enlace: 11, critica: 12, fechaHito: 13, subtitulo: 14, numeroHito: 15 };
/** Formatos para el formato condicional (nombre → índice dxf). */
export const DXF = { gantt: 0, ganttHito: 1, hecho: 2, vencido: 3, hoy: 4, noAplica: 5, alerta: 6 };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

/** Letra(s) de columna: 0 → A, 25 → Z, 26 → AA. */
export function col(n) {
  let s = "";
  for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Fecha de JavaScript → número de serie de Excel (días desde 1899-12-30). */
export const serialFecha = (d) => Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000 + 25569);

function celdaXML(ref, c) {
  if (c == null || c === "") return "";
  const o = typeof c === "object" ? c : { v: c };
  const s = o.s != null ? ` s="${typeof o.s === "number" ? o.s : ESTILOS[o.s] ?? 0}"` : "";
  if (o.f != null) return `<c r="${ref}"${s}><f>${esc(String(o.f).replace(/^=/, ""))}</f></c>`;
  if (o.v == null || o.v === "") return s ? `<c r="${ref}"${s}/>` : "";
  if (typeof o.v === "number" && Number.isFinite(o.v)) return `<c r="${ref}"${s}><v>${o.v}</v></c>`;
  if (typeof o.v === "boolean") return `<c r="${ref}"${s} t="b"><v>${o.v ? 1 : 0}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(String(o.v).slice(0, 32000))}</t></is></c>`;
}

function hojaXML(h) {
  const filas = h.filas || [];
  const ancho = Math.max(1, ...filas.map((f) => f.length));
  const vista = h.congelar
    ? `<sheetViews><sheetView workbookViewId="0"${h.zoom ? ` zoomScale="${h.zoom}"` : ""}><pane${h.congelar.col ? ` xSplit="${h.congelar.col}"` : ""}${h.congelar.fila ? ` ySplit="${h.congelar.fila}"` : ""} topLeftCell="${col(h.congelar.col || 0)}${(h.congelar.fila || 0) + 1}" activePane="${h.congelar.col && h.congelar.fila ? "bottomRight" : h.congelar.fila ? "bottomLeft" : "topRight"}" state="frozen"/></sheetView></sheetViews>`
    : `<sheetViews><sheetView workbookViewId="0"${h.zoom ? ` zoomScale="${h.zoom}"` : ""}/></sheetViews>`;
  const cols = (h.cols || []).length ? `<cols>${h.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
  const datos = filas.map((f, i) => {
    const alto = h.altos?.[i + 1];
    const celdas = f.map((c, j) => celdaXML(`${col(j)}${i + 1}`, c)).join("");
    return celdas || alto ? `<row r="${i + 1}"${alto ? ` ht="${alto}" customHeight="1"` : ""}>${celdas}</row>` : "";
  }).join("");
  const filtro = h.filtro ? `<autoFilter ref="${h.filtro}"/>` : "";
  const comb = (h.combinar || []).length ? `<mergeCells count="${h.combinar.length}">${h.combinar.map((r) => `<mergeCell ref="${r}"/>`).join("")}</mergeCells>` : "";
  let prioridad = 1;
  const cond = (h.condicionales || []).map((c) => `<conditionalFormatting sqref="${c.rango}"><cfRule type="expression" dxfId="${DXF[c.estilo] ?? c.estilo}" priority="${prioridad++}"${c.parar ? ' stopIfTrue="1"' : ""}><formula>${esc(c.formula.replace(/^=/, ""))}</formula></cfRule></conditionalFormatting>`).join("");
  const val = (h.validaciones || []).length ? `<dataValidations count="${h.validaciones.length}">${h.validaciones.map((v) => `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${v.rango}"><formula1>${esc(v.formula || `"${v.lista.join(",")}"`)}</formula1></dataValidation>`).join("")}</dataValidations>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    + `<sheetPr>${h.color ? `<tabColor rgb="FF${h.color}"/>` : ""}</sheetPr><dimension ref="A1:${col(ancho - 1)}${Math.max(1, filas.length)}"/>${vista}<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${datos}</sheetData>${filtro}${comb}${cond}${val}`
    + `<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

const ESTILOS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts>
<fonts count="8">
<font><sz val="10"/><name val="Calibri"/></font>
<font><b/><sz val="16"/><color rgb="FF1F2A44"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FF1F2A44"/><name val="Calibri"/></font>
<font><i/><sz val="9"/><color rgb="FF5F6B7A"/><name val="Calibri"/></font>
<font><u/><sz val="10"/><color rgb="FF1155CC"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><color rgb="FFB71C1C"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><name val="Calibri"/></font>
</fonts>
<fills count="7">
<fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1F2A44"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF6E7B8"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEDF0F4"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFD6E6F5"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFC9D1DB"/></left><right style="thin"><color rgb="FFC9D1DB"/></right><top style="thin"><color rgb="FFC9D1DB"/></top><bottom style="thin"><color rgb="FFC9D1DB"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="16">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center" horizontal="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="7" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" horizontal="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" horizontal="center"/></xf>
<xf numFmtId="9" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" horizontal="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="7" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="6" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" horizontal="center"/></xf>
<xf numFmtId="164" fontId="7" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" horizontal="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="7" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" horizontal="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
<dxfs count="7">
<dxf><fill><patternFill><bgColor rgb="FF4A7FB5"/></patternFill></fill></dxf>
<dxf><fill><patternFill><bgColor rgb="FFC8A13A"/></patternFill></fill></dxf>
<dxf><font><color rgb="FF1B5E20"/></font><fill><patternFill><bgColor rgb="FFDCEFD9"/></patternFill></fill></dxf>
<dxf><font><b/><color rgb="FFB71C1C"/></font><fill><patternFill><bgColor rgb="FFF9DADA"/></patternFill></fill></dxf>
<dxf><fill><patternFill><bgColor rgb="FFFFF2B3"/></patternFill></fill></dxf>
<dxf><font><strike/><color rgb="FF9AA3AD"/></font></dxf>
<dxf><font><b/><color rgb="FF8A5A00"/></font><fill><patternFill><bgColor rgb="FFFFE9C2"/></patternFill></fill></dxf>
</dxfs>
</styleSheet>`;

function zip(archivos, comprimidos = null) {
  const enc = new TextEncoder(), partes = [], central = [];
  let off = 0;
  const u16 = (n) => [n & 255, (n >>> 8) & 255], u32 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  for (const [i, [nombre, texto]] of archivos.entries()) {
    const n = enc.encode(nombre), crudo = typeof texto === "string" ? enc.encode(texto) : texto, c = crc32(crudo);
    const z = comprimidos?.[i], metodo = z ? 8 : 0, d = z || crudo;
    // Fecha fija (1-ene-2026 00:00) para que el mismo contenido produzca el mismo archivo.
    const fh = [...u16(0), ...u16(0x5C21)];
    const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(metodo), ...fh, ...u32(c), ...u32(d.length), ...u32(crudo.length), ...u16(n.length), ...u16(0)]);
    partes.push(local, n, d);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(metodo), ...fh, ...u32(c), ...u32(d.length), ...u32(crudo.length),
      ...u16(n.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), n);
    off += local.length + n.length + d.length;
  }
  const tamCentral = central.reduce((s, p) => s + p.length, 0);
  const fin = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(archivos.length), ...u16(archivos.length), ...u32(tamCentral), ...u32(off), ...u16(0)]);
  const todo = [...partes, ...central, fin], total = todo.reduce((s, p) => s + p.length, 0), out = new Uint8Array(total);
  let p = 0;
  for (const x of todo) { out.set(x, p); p += x.length; }
  return out;
}

/**
 * Arma el libro. `hojas`: [{ nombre, filas: [[celda]], cols: [anchos], congelar: {fila, col}, filtro: "A4:Z9", combinar: ["A1:D1"],
 * validaciones: [{rango, lista} | {rango, formula}], condicionales: [{rango, formula, estilo}], color, zoom, altos: {fila: alto} }].
 * Celda: texto, número, o {v, s: estilo, f: "fórmula"}. Devuelve los bytes del .xlsx.
 */
export function libroXLSX(hojas, op = {}) {
  return zip(partesLibro(hojas, op));
}

/** Igual que libroXLSX pero comprimido (deflate) con CompressionStream del navegador o de Node: ~10 veces más ligero. */
export async function libroXLSXComprimido(hojas, op = {}) {
  const archivos = partesLibro(hojas, op);
  if (typeof CompressionStream === "undefined") return zip(archivos);
  const enc = new TextEncoder();
  const comprimir = async (txt) => new Uint8Array(await new Response(new Blob([enc.encode(txt)]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
  return zip(archivos.map(([n, t]) => [n, enc.encode(t)]), await Promise.all(archivos.map(([, t]) => comprimir(t))));
}

function partesLibro(hojas, { titulo = "", autor = "DOMINUS OSINT" } = {}) {
  const nombres = hojas.map((h, i) => String(h.nombre || `Hoja${i + 1}`).replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
  if (new Set(nombres).size !== nombres.length) throw new Error("Nombres de hoja repetidos");
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
${nombres.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const libro = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${nombres.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>`
    + `${hojas.some((h) => h.filtro) ? `<definedNames>${hojas.map((h, i) => h.filtro ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(nombres[i])}'!${h.filtro.replace(/([A-Z]+)(\d+)/g, "$$$1$$$2")}</definedName>` : "").join("")}</definedNames>` : ""}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
  const wrels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${nombres.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${nombres.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(titulo)}</dc:title><dc:creator>${esc(autor)}</dc:creator></cp:coreProperties>`;
  return ([["[Content_Types].xml", ct], ["_rels/.rels", rels], ["docProps/core.xml", core], ["xl/workbook.xml", libro], ["xl/_rels/workbook.xml.rels", wrels], ["xl/styles.xml", ESTILOS_XML],
    ...hojas.map((h, i) => [`xl/worksheets/sheet${i + 1}.xml`, hojaXML(h)])]);
}
