import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calcular, evaluarDNS, respuestaCorreo, limpiarDominio, DOMINIO, puntaje } from "../../js/ops-ciber-logica.js";

const cat = JSON.parse(readFileSync(new URL("../../config/ciber_diagnostico.json", import.meta.url), "utf8"));

test("el cuestionario cubre las 6 funciones de NIST CSF 2.0 con referencias", () => {
  assert.deepEqual(cat.funciones.map((f) => f.id), ["GV", "ID", "PR", "DE", "RS", "RC"]);
  for (const f of cat.funciones) assert.ok(cat.preguntas.filter((p) => p.funcion === f.id).length >= 3, f.id);
  for (const p of cat.preguntas) assert.ok(p.csf && p.iso && p.accion && [30, 90, 180].includes(p.plazo) && p.peso >= 1, p.id);
  assert.equal(new Set(cat.preguntas.map((p) => p.id)).size, cat.preguntas.length);
  for (const p of cat.preguntas) for (const a of p.amenazas) assert.ok(cat.amenazas[a], `${p.id}: ${a}`);
});

test("puntajes, nivel, amenazas y plan", () => {
  const nada = calcular(cat, {});
  assert.equal(nada.global, 0);
  assert.equal(nada.nivel.nombre, "Nivel 1 · Parcial");
  assert.equal(nada.plan.length, cat.preguntas.length);
  const todo = calcular(cat, Object.fromEntries(cat.preguntas.map((p) => [p.id, 3])));
  assert.equal(todo.global, 100);
  assert.equal(todo.plan.length, 0);
  assert.match(todo.nivel.nombre, /Adaptativo/);
  const r = calcular(cat, { pr7: 3, rc1: 3, pr1: 0 });
  assert.ok(r.amenazas.find((a) => a.id === "ransomware").pct > 0);
  assert.equal(r.plan[0].peso, 3, "lo de más peso va primero");
  assert.equal(puntaje([{ id: "a", peso: 2 }], { a: 3 }), 100);
});

test("revisión de DNS: SPF, DMARC, DNSSEC, CAA y MTA-STS", () => {
  const mal = evaluarDNS({ spf: [], dmarc: [], caa: [], mx: [{}], mtasts: [], dnssec: false });
  assert.equal(mal.find((x) => x.id === "spf").estado, "mal");
  assert.equal(mal.find((x) => x.id === "dmarc").estado, "mal");
  assert.equal(respuestaCorreo(mal), 0);
  const bien = evaluarDNS({ spf: ["v=spf1 include:_spf.google.com -all"], dmarc: ["v=DMARC1; p=reject; rua=mailto:x@y.mx"], caa: [{}], mx: [{}], mtasts: ["v=STSv1; id=1"], dnssec: true });
  assert.ok(bien.every((x) => x.estado === "bien"));
  assert.equal(respuestaCorreo(bien), 2);
  assert.equal(evaluarDNS({ spf: ["v=spf1 +all"], dmarc: [] })[0].estado, "mal");
  assert.equal(evaluarDNS({ spf: ["v=spf1 a", "v=spf1 mx"], dmarc: [] })[0].estado, "mal", "dos SPF es inválido");
  assert.equal(limpiarDominio("https://www.Empresa.com.mx/contacto"), "empresa.com.mx");
  assert.ok(DOMINIO.test("empresa.com.mx") && !DOMINIO.test("<script>") && !DOMINIO.test("localhost"));
});

test("el reporte escapa el texto de la empresa", async () => {
  globalThis.document ??= undefined;
  const { htmlReporte } = await import("../../js/ops-ciber.js");
  const h = htmlReporte(cat, { cliente: "<img src=x onerror=alert(1)>", resp: {}, dns: null }, calcular(cat, {}));
  assert.ok(!h.includes("<img") && h.includes("&lt;img") && h.includes("Plan de acción"));
});
