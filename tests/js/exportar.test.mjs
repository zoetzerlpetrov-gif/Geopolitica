import { test } from "node:test";
import assert from "node:assert/strict";
import * as X from "../../js/exportar-logica.js";

const cols = ["pais", "n", "fecha", "nota"];
const filas = [{ pais: "MEX", n: 5, fecha: "2026-10-01", nota: 'dice "hola", | y\nmás' }, { pais: "O'Higgins", n: 2n, fecha: null, nota: null }];

test("CSV, JSON y Markdown", () => {
  const csv = X.aCSV(cols, filas);
  assert.ok(csv.startsWith("﻿\"pais\""));
  assert.match(csv, /"dice ""hola"", \| y\nmás"/);
  assert.deepEqual(JSON.parse(X.aJSON(cols, filas))[1], { pais: "O'Higgins", n: 2, fecha: null, nota: null });
  const md = X.aMD(cols, filas, "Prueba");
  assert.match(md, /^# Prueba/);
  assert.match(md, /\\\| y más/);
});

test("SQL con tipos deducidos y comillas escapadas", () => {
  assert.equal(X.tipoSQL([1, 2n, null]), "INTEGER");
  assert.equal(X.tipoSQL([1.5, 2]), "DOUBLE");
  assert.equal(X.tipoSQL(["2026-10-01", ""]), "DATE");
  assert.equal(X.tipoSQL(["2026-10-01T10:00:00Z"]), "TIMESTAMP");
  const sql = X.aSQL(cols, filas, "res");
  assert.match(sql, /CREATE TABLE "res" \(\n  "pais" VARCHAR,\n  "n" INTEGER,\n  "fecha" DATE/);
  assert.match(sql, /VALUES \('O''Higgins', 2, NULL, NULL\);/);
});

test("HTML, Word y nombres de archivo", () => {
  const h = X.aHTML(cols, filas, { titulo: "A <b>", svg: "<svg></svg>" });
  assert.match(h, /<title>A &lt;b&gt;<\/title>/);
  assert.match(h, /<svg><\/svg><table>/);
  assert.match(X.aWord(cols, filas), /urn:schemas-microsoft-com:office:word/);
  assert.equal(Object.keys(X.FORMATOS).length, 9);
  assert.equal(X.nombreArchivo("Consulta: Índice 2026!"), "consulta-indice-2026");
});
