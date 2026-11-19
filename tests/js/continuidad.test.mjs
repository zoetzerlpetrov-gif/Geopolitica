import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validarCambio, estancia, completarFase, datosPersonales, exportarCifrado, importarCifrado, avance, informeMarkdown, nivelActual } from "../../js/continuidad-logica.js";

const texto = readFileSync(new URL("../../data/continuidad/plantilla.json", import.meta.url), "utf8");
const P = JSON.parse(texto);

test("1. la plantilla no contiene datos personales", () => {
  assert.deepEqual(datosPersonales(texto), []);
  // y el detector sí los encuentra cuando existen
  assert.deepEqual(datosPersonales("correo a.b@ejemplo.mx"), ["correo"]);
  assert.ok(datosPersonales("tel 55 1234 5678").includes("telefono"));
  assert.ok(datosPersonales("CURP GODE561231HDFRRN09").includes("curp"));
  assert.ok(datosPersonales("RFC GODE561231AB1").includes("rfc"));
  assert.ok(datosPersonales("pasaporte G12345678").includes("pasaporte"));
});

const bit = [{ fecha: "2026-11-01", nivel: "amarillo", motivo: "x" }];

test("2. no se baja de nivel antes de 14 días sin disparadores", () => {
  const r = validarCambio({ bitacora: bit, nuevo: "verde", motivo: "calma", fecha: "2026-11-10" });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /14 días/);
  assert.match(r.motivo, /faltan 5/);
  assert.equal(validarCambio({ bitacora: bit, nuevo: "verde", motivo: "calma", fecha: "2026-11-15" }).ok, true);
  // con un escenario activo tampoco
  assert.match(validarCambio({ bitacora: bit, escenarios: { a: { activo: true, fecha: "2026-10-01" } }, nuevo: "verde", motivo: "m", fecha: "2026-12-30" }).motivo, /escenario/);
  // solo un nivel a la vez
  const naranja = [...bit, { fecha: "2026-11-02", nivel: "naranja", motivo: "y" }];
  assert.match(validarCambio({ bitacora: naranja, nuevo: "verde", motivo: "m", fecha: "2026-12-30" }).motivo, /un nivel a la vez/);
});

test("3. Rojo exige dos aprobadores distintos", () => {
  assert.equal(validarCambio({ bitacora: bit, nuevo: "rojo", motivo: "riesgo", fecha: "2026-11-02", aprobadores: ["A"] }).ok, false);
  assert.equal(validarCambio({ bitacora: bit, nuevo: "rojo", motivo: "riesgo", fecha: "2026-11-02", aprobadores: ["A", "a"] }).ok, false);
  assert.equal(validarCambio({ bitacora: bit, nuevo: "rojo", motivo: "riesgo", fecha: "2026-11-02", aprobadores: ["A", "B"] }).ok, true);
  assert.equal(validarCambio({ bitacora: [], nuevo: "naranja", motivo: "evento", fecha: "2026-11-02" }).ok, true);   // cualquier adulto sube a Naranja
  assert.equal(nivelActual(bit), "amarillo");
});

test("4. el contador de estancia avisa en el día 150 y a 15 días del límite", () => {
  const op = { diaDecision: P.avisos_estancia.dia_decision, antes: P.avisos_estancia.dias_antes_del_limite };
  const d149 = estancia("2026-01-01", 180, "2026-05-29", op), d150 = estancia("2026-01-01", 180, "2026-05-30", op);
  assert.equal(d149.transcurridos, 149);
  assert.equal(d149.avisos.length, 0);
  assert.equal(d150.transcurridos, 150);
  assert.ok(d150.avisos.some((a) => a.tipo === "decision"));
  const d165 = estancia("2026-01-01", 180, "2026-06-14", op);
  assert.equal(d165.restantes, 15);
  assert.ok(d165.avisos.some((a) => a.tipo === "limite"));
  assert.equal(estancia("2026-01-01", 180, "2026-06-13", op).avisos.some((a) => a.tipo === "limite"), false);
  assert.equal(estancia("2026-01-01", null, "2026-06-13", op).restantes, null);   // México: sin límite
});

test("5. exportar e importar cifrado; otra contraseña falla con el mensaje de web-cripto", async () => {
  const estado = { bitacora: bit, pace: { primario: "dato local" }, hechos: { "f0.documentos": "2026-11-01" } };
  const pkg = await exportarCifrado(estado, "contraseña-larga-123");
  assert.equal(pkg.format, "dominus-web-backup-v1");
  assert.ok(!JSON.stringify(pkg).includes("dato local"));
  assert.deepEqual(await importarCifrado(pkg, "contraseña-larga-123"), estado);
  await assert.rejects(importarCifrado(pkg, "otra-contraseña-456"), /No se pudo abrir: contraseña incorrecta o respaldo alterado\./);
  await assert.rejects(exportarCifrado(estado, "corta"), /12 caracteres/);
});

test("6. una fase con pendientes no se marca completa", () => {
  const f = P.fases[0];
  const algunos = { [`f0.${f.checklist[0].id}`]: true };
  const r = completarFase(f, algunos);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /pendiente/);
  const todos = Object.fromEntries(f.checklist.map((i) => [`f0.${i.id}`, true]));
  assert.equal(completarFase(f, todos).ok, true);
  assert.equal(avance(f.checklist, algunos, "f0.").hechos, 1);
});

test("el informe en claro solo lleva plantilla y avance", () => {
  const md = informeMarkdown(P, { "f0.documentos": true }, "amarillo", "2026-11-19");
  assert.match(md, /Nivel vigente: amarillo/);
  assert.match(md, /- \[x\] Pasaportes vigentes/);
  assert.deepEqual(datosPersonales(md), []);
  assert.equal(P.escenarios.length, 16);
  assert.equal(P.niveles.map((n) => n.id).join(), "verde,amarillo,naranja,rojo");
});
