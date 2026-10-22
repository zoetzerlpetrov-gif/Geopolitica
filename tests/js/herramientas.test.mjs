import { test } from "node:test";
import assert from "node:assert/strict";
import * as H from "../../js/herr-logica.js";

const bytes = (h) => Uint8Array.from(h.match(/../g).map((x) => parseInt(x, 16)));

test("firma del archivo y extensión engañosa", () => {
  assert.equal(H.tipoPorFirma(bytes("255044462d312e37")).tipo, "pdf");
  assert.equal(H.tipoPorFirma(bytes("4d5a90000300")).tipo, "exe");
  assert.equal(H.tipoPorFirma(bytes("524946460000000057454250")).tipo, "webp");
  assert.equal(H.tipoPorFirma(new TextEncoder().encode("hola,mundo\n1,2")).tipo, "texto");
  assert.deepEqual(H.extensionCoincide("foto.jpg", "exe"), { ext: "jpg", coincide: false });
  assert.equal(H.extensionCoincide("Informe.DOCX", "zip").coincide, true);
});

test("entropía", () => {
  assert.equal(H.entropia(new Uint8Array(100)), 0);
  assert.equal(H.entropia(Uint8Array.from({ length: 256 }, (_, i) => i)), 8);
});

test("ZIP: se leen entradas sin comprimir", async () => {
  // ZIP mínimo con un archivo «a.txt» = «hola», método 0 (sin compresión).
  const te = new TextEncoder(), nombre = te.encode("a.txt"), dato = te.encode("hola");
  const local = new Uint8Array(30 + nombre.length + dato.length); const dl = new DataView(local.buffer);
  dl.setUint32(0, 0x04034b50, true); dl.setUint32(18, 4, true); dl.setUint32(22, 4, true); dl.setUint16(26, nombre.length, true);
  local.set(nombre, 30); local.set(dato, 30 + nombre.length);
  const central = new Uint8Array(46 + nombre.length); const dc = new DataView(central.buffer);
  dc.setUint32(0, 0x02014b50, true); dc.setUint32(20, 4, true); dc.setUint32(24, 4, true); dc.setUint16(28, nombre.length, true); dc.setUint32(42, 0, true);
  central.set(nombre, 46);
  const fin = new Uint8Array(22); const df = new DataView(fin.buffer);
  df.setUint32(0, 0x06054b50, true); df.setUint16(8, 1, true); df.setUint16(10, 1, true); df.setUint32(12, central.length, true); df.setUint32(16, local.length, true);
  const zip = new Uint8Array([...local, ...central, ...fin]);
  const e = H.leerZip(zip);
  assert.equal(e[0].nombre, "a.txt");
  assert.equal(await H.textoZip(zip, e[0]), "hola");
});

test("Office: macros, vínculos externos, hojas ocultas y metadatos", () => {
  const entradas = ["docProps/core.xml", "docProps/app.xml", "xl/workbook.xml", "xl/vbaProject.bin", "xl/_rels/workbook.xml.rels"].map((nombre) => ({ nombre }));
  const r = H.analizarOffice(entradas, {
    "docProps/core.xml": "<cp:coreProperties><dc:creator>Ana</dc:creator><cp:lastModifiedBy>Luis</cp:lastModifiedBy></cp:coreProperties>",
    "docProps/app.xml": "<Properties><Company>ACME</Company><Application>Microsoft Excel</Application></Properties>",
    "xl/workbook.xml": '<sheets><sheet name="Datos" sheetId="1"/><sheet name="Secreta" sheetId="2" state="veryHidden"/></sheets>',
    "xl/_rels/workbook.xml.rels": '<Relationship Id="r9" Type="x" Target="https://malo.example/plantilla.dotm" TargetMode="External"/>',
  });
  assert.equal(r.meta["Autor"], "Ana"); assert.equal(r.meta["Empresa"], "ACME");
  assert.deepEqual(r.externos, ["https://malo.example/plantilla.dotm"]);
  assert.ok(r.alertas.some((a) => /macros/.test(a.texto)) && r.alertas.some((a) => /Secreta \(muy oculta\)/.test(a.texto)));
});

test("PDF: metadatos, JavaScript y revisiones", () => {
  const pdf = "%PDF-1.7\n1 0 obj <</Title (Informe \\(final\\)) /Author (Ana) /Producer (Word) /CreationDate (D:20240131120000-06'00')>>\n"
    + "2 0 obj <</Type /Page>> 3 0 obj <</OpenAction 4 0 R /JS (app.alert(1))>> <</URI (https://x.example/a)>>\n%%EOF\n%%EOF";
  const r = H.analizarPdf(pdf);
  assert.equal(r.version, "1.7"); assert.equal(r.meta["Título"], "Informe (final)"); assert.equal(r.revisiones, 2); assert.equal(r.paginas, 1);
  assert.deepEqual(r.urls, ["https://x.example/a"]);
  assert.ok(r.alertas.some((a) => a.nivel === "alto" && /JavaScript/.test(a.texto)));
  assert.equal(H.fechaPdf("D:20240131120000-06'00'"), "2024-01-31 12:00:00 -06:00");
});

test("IOC: extrae, desactiva y reactiva", () => {
  const r = H.extraerIOC("Ver hxxps://malo[.]example/x y 8.8.8.8, correo a@b.mx, CVE-2024-3400, hash d41d8cd98f00b204e9800998ecf8427e, IP falsa 999.1.1.1");
  assert.deepEqual(r.urls, ["https://malo.example/x"]); assert.deepEqual(r.ipv4, ["8.8.8.8"]); assert.deepEqual(r.correos, ["a@b.mx"]);
  assert.deepEqual(r.cve, ["CVE-2024-3400"]); assert.equal(r.md5.length, 1); assert.ok(r.dominios.includes("malo.example"));
  assert.equal(H.defang("https://malo.example"), "hxxps[://]malo[.]example");
  assert.equal(H.refang("hxxps[://]malo[.]example"), "https://malo.example");
});

test("encabezados de correo: SPF falla y remitente distinto", () => {
  const raw = "Received: from mx.malo.example (mx.malo.example [203.0.113.5]) by mx.google.com; Tue, 1 Oct 2026 10:00:00 -0600\n"
    + "Authentication-Results: mx.google.com;\n spf=fail smtp.mailfrom=malo.example; dkim=none; dmarc=fail\n"
    + "From: \"Banco\" <avisos@banco.mx>\nReturn-Path: <x@malo.example>\nReply-To: cobros@otro.example\nSubject: Urgente";
  const r = H.analizarEncabezados(raw);
  assert.equal(r.spf, "fail"); assert.equal(r.dmarc, "fail"); assert.equal(r.recibidos[0].ip, "203.0.113.5");
  assert.ok(r.alertas.length >= 4);
});

test("JWT, base64 y huella", async () => {
  const t = [{ alg: "none", typ: "JWT" }, { sub: "1", exp: 1 }].map((o) => Buffer.from(JSON.stringify(o)).toString("base64url")).join(".") + ".";
  const r = H.decodificarJWT(t);
  assert.equal(r.carga.sub, "1"); assert.equal(r.avisos.length, 2);
  assert.equal(H.base64.decodificar(H.base64.codificar("México ñ")), "México ñ");
  assert.equal(await H.huella("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("DNS y política de correo del dominio", () => {
  assert.deepEqual(H.leerDoH({ Answer: [{ type: 16, data: "\"v=spf1 ~all\"", TTL: 60 }] }), [{ tipo: "TXT", valor: "v=spf1 ~all", ttl: 60 }]);
  const r = H.revisarCorreoDominio(["v=spf1 include:_spf.google.com ~all"], ["v=DMARC1; p=none; rua=mailto:x@y"]);
  assert.equal(r.politica, "none"); assert.equal(r.hallazgos.length, 2);
  assert.equal(H.revisarCorreoDominio([], []).hallazgos.length, 2);
});

test("análisis: ICD 203, ACH, CARVER y poder-interés", () => {
  assert.equal(H.terminoICD(70).es, "Probable"); assert.equal(H.terminoICD(97).es, "Casi seguro");
  const ach = H.puntuarACH(["H1", "H2"], [{ celdas: ["C", "II"], peso: 1 }, { celdas: ["I", "C"], peso: 1 }]);
  assert.deepEqual(ach.map((x) => x.hipotesis), ["H1", "H2"]);
  assert.equal(H.diagnostica({ celdas: ["C", "CC"] }, 2), false); assert.equal(H.diagnostica({ celdas: ["C", "I"] }, 2), true);
  const c = H.puntuarCARVER([{ nombre: "Subestación", C: 10, A: 5, R: 8, V: 6, E: 9, R2: 7 }, { nombre: "Bodega", C: 2 }]);
  assert.equal(c[0].nombre, "Subestación"); assert.equal(c[0].total, 45);
  assert.equal(H.cuadranteActor(5, 1), "Mantener satisfecho");
  assert.match(H.marcoAMarkdown("dafo", ["Marca fuerte"]), /## Fortalezas\n\nMarca fuerte/);
});

import { readFileSync } from "node:fs";
test("plantillas de auditoría: estructura, cumplimiento e informe", () => {
  const cfg = JSON.parse(readFileSync(new URL("../../config/auditorias.json", import.meta.url)));
  assert.ok(Object.keys(cfg.sectores).length >= 14);
  for (const [k, s] of Object.entries(cfg.sectores)) {
    assert.ok(s.nombre && s.normas.length && s.areas.length, k);
    for (const a of s.areas) for (const c of a.controles) assert.ok(c.c && c.e && c.r, `${k}: ${a.area}`);
  }
  assert.equal(H.cumplimiento(["cumple", "parcial", "no", "na", undefined]), 50);
  assert.equal(H.cumplimiento(["na"]), null);
  assert.equal(H.semaforo(90), "verde"); assert.equal(H.semaforo(50), "rojo");
  const areas = H.areasDe(cfg, "bancos");
  assert.equal(areas.length, cfg.comunes.length + cfg.sectores.bancos.areas.length);
  const id = areas.at(-1).controles[0].id;
  const md = H.informeAuditoria(cfg, "bancos", { empresa: "Banco X", respuestas: { [id]: { estado: "no", nota: "Sin RECA" } } });
  assert.match(md, /# Informe de auditoría: Banco X/); assert.match(md, /\[No cumple\]/); assert.match(md, /Sin RECA/);
});

test("nube: puntaje por función del NIST CSF 2.0", () => {
  const i = H.CONTROLES_NUBE.findIndex(([f]) => f === "PR"), j = H.CONTROLES_NUBE.findIndex(([f], k) => f === "PR" && k > i);
  const p = H.puntajeCSF({ [i]: "si", [j]: "parcial" });
  assert.equal(p.PR, 75); assert.equal(p.GV, null);
  assert.ok(H.CONTROLES_NUBE.every(([f, c, r]) => H.FUNCIONES_CSF[f] && c && r));
  assert.equal(H.RESPONSABILIDAD[0][3], "Cliente");
});

test("normativa por jurisdicción: leyes, trámites, filas y cumplimiento", async () => {
  const H = await import("../../js/herr-logica.js");
  const norma = { generales: [{ area: "Fiscal", leyes: [{ id: "cff", sigla: "CFF", nombre: "Código Fiscal", autoridad: "SAT", obligaciones: ["Emitir CFDI"], tramites: [{ que: "Declaración anual", plazo: "marzo", ante: "SAT" }], preguntas: ["¿Emite CFDI?", "¿Presenta la anual?"] }] }],
    sectores: { bancos: { leyes: [{ id: "lic", sigla: "LIC", nombre: "Ley de Instituciones de Crédito", preguntas: ["¿Reporta a la CNBV?"] }] } } };
  assert.equal(H.leyesDe(norma).length, 1);
  assert.equal(H.leyesDe(norma, "bancos").length, 2);
  assert.deepEqual(H.leyesDe(norma, "bancos", "cfdi").map((x) => x.ley.id), ["cff"]);
  assert.deepEqual(H.leyesDe(norma, "bancos", "declaracion anual").map((x) => x.ley.id), ["cff"]);
  const leyes = H.leyesDe(norma, "bancos");
  assert.equal(H.tramitesDe(leyes)[0].plazo, "marzo");
  const resp = { "MEX:cff:0": { estado: "cumple" }, "MEX:cff:1": { estado: "no", nota: "Atrasada" } };
  const filas = H.filasNormativa("MEX", leyes, resp, { cumple: "Cumple", no: "No cumple" });
  assert.equal(filas.length, 3);
  assert.equal(filas[1].resultado, "No cumple");
  assert.equal(filas[1].hallazgo, "Atrasada");
  const c = H.cumplimientoNormativa("MEX", leyes, resp);
  assert.equal(c.global, 50);
  assert.equal(c.areas.find((a) => a.area === "Fiscal").pct, 50);
});

test("filtro de vulnerabilidades", async () => {
  const H = await import("../../js/herr-logica.js");
  const l = [{ id: "CVE-1", producto: "php:php", descripcion: "RCE in PHP", cvss: 9.2, epss: 0.4 },
    { id: "CVE-2", producto: "gitlab:gitlab", descripcion: "x", cvss: 9.9, epss: 0.01, kev: { proveedor: "GitLab", producto: "GitLab" } },
    { id: "CVE-3", producto: "foo:bar", descripcion: "y", cvss: 7.5, epss: 0.9, kev: { proveedor: "Foo", producto: "Bar" } }];
  assert.deepEqual(H.filtrarVulns(l, { q: "php" }).map((v) => v.id), ["CVE-1"]);
  assert.deepEqual(H.filtrarVulns(l, { minCvss: 9 }).map((v) => v.id), ["CVE-1", "CVE-2"]);
  assert.deepEqual(H.filtrarVulns(l, { soloKev: true, minCvss: 9 }).map((v) => v.id), ["CVE-2", "CVE-3"]);
  assert.deepEqual(H.filtrarVulns(l, { minEpss: 0.5 }).map((v) => v.id), ["CVE-3"]);
});
