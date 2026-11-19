import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { textoDocx, analizar, datosClave, htmlAnalisis, borradorContrato } from "../../js/contrato_patrocinio.js";

/** .docx mínimo: un ZIP con word/document.xml comprimido (deflate). */
function docx(xml) {
  const nombre = Buffer.from("word/document.xml"), datos = deflateRawSync(Buffer.from(xml));
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(datos.length, 18); local.writeUInt16LE(nombre.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(datos.length, 20); central.writeUInt16LE(nombre.length, 28); central.writeUInt32LE(0, 42);
  const off = 30 + nombre.length + datos.length;
  const fin = Buffer.alloc(22); fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(1, 8); fin.writeUInt16LE(1, 10); fin.writeUInt32LE(46 + nombre.length, 12); fin.writeUInt32LE(off, 16);
  return Buffer.concat([local, nombre, datos, central, nombre, fin]);
}

test("lee un .docx sin bibliotecas", async () => {
  const b = docx('<w:document><w:body><w:p><w:r><w:t>Cláusula 1. Objeto &amp; vigencia</w:t></w:r></w:p></w:body></w:document>');
  assert.equal((await textoDocx(b)).trim(), "Cláusula 1. Objeto & vigencia");
  await assert.rejects(textoDocx(Buffer.from("no es zip")), /Word/);
});

test("el borrador propio sale con riesgo bajo y todas las cláusulas", () => {
  const html = borradorContrato({ marca: "Marca A", contrato: "OI-0007", posicion: "pausa", desde: "2026-12-01", hasta: "2026-12-31" });
  const a = analizar(html.replace(/<[^>]+>/g, " ") + " RFC AAA010101AA1");
  assert.deepEqual(a.necesarias.filter((n) => !n.presente).map((n) => n.id), []);
  assert.deepEqual(a.riesgos.map((r) => r.id), []);   // «no se aceptan apuestas» o «no hay renovación automática» no cuentan
  assert.equal(a.nivel, "bajo");
});

test("detecta cláusulas de riesgo y datos clave", () => {
  const t = `Contrato No. OI-2031. Vigencia del 1 de diciembre de 2026 al 31 de enero de 2027. El Patrocinador tendrá derecho de veto
    sobre las notas y podrá solicitar que se retire cualquier contenido. El contrato tendrá renovación automática. El Medio garantiza un mínimo de vistas.
    Se pagará a los 90 días. Precio $150,000.00 MXN.`;
  const a = analizar(t);
  const ids = a.riesgos.map((r) => r.id);
  for (const id of ["aprobacion", "renovacion", "metricas", "pago_largo"]) assert.ok(ids.includes(id), id);
  assert.equal(a.nivel, "alto");
  assert.deepEqual(datosClave(t), { desde: "2026-12-01", hasta: "2027-01-31", contrato: "OI-2031", monto: "150,000.00" });
  assert.match(htmlAnalisis(a, "Word"), /Riesgo alto/);
});
