// Tests proyectivos de dibujo: catálogo, medidas de la foto y redacción del informe.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lienzo, trazo } from "./sintetico-escritura.mjs";
import { zonaDe, dimensionDe, fuerzaDe, medirDibujo, preMarcar, redactarDibujo } from "../../js/dibujo-logica.js";

const CAT = JSON.parse(readFileSync(new URL("../../config/dibujo_proyectivo.json", import.meta.url), "utf8"));

test("catálogo: los 17 tests del manual más el H-T-P, valores, partes, garabatos y colores", () => {
  assert.equal(CAT.tests.length, 18);
  for (const n of ["Karen Machover", "bajo la lluvia", "Bender", "árbol", "familia", "Garabatos", "H-T-P"]) assert.ok(CAT.tests.some((t) => t.nombre.includes(n)), n);
  assert.deepEqual(CAT.valores.map((v) => v.id), ["situacion", "dimension", "direccion", "forma", "fuerza", "continuidad", "desarrollo", "dinamismo", "armonia"]);
  assert.equal(CAT.valores[0].opciones.length, 9);
  for (const t of CAT.tests) for (const p of t.partes) assert.ok(p === "garabatos" || CAT.partes[p], `${t.id}: ${p}`);
  assert.ok(CAT.partes.figura.flatMap((g) => g.partes).length >= 30 && CAT.partes.arbol[0].partes.length === 5 && CAT.partes.casa[0].partes.length === 6);
  assert.ok(CAT.garabatos.length >= 30 && CAT.colores.length === 11);
  // sin lecturas clínicas
  const todo = JSON.stringify(CAT).toLowerCase();
  for (const x of ["retraso mental", "enuresis", "megalomanía"]) assert.ok(!todo.includes(x), x);
  assert.match(CAT.aviso, /no de diagnóstico/);
});

test("zonas, dimensión y presión estimada", () => {
  assert.equal(zonaDe(0.5, 0.5), "centro"); assert.equal(zonaDe(0.1, 0.1), "superior_izquierda"); assert.equal(zonaDe(0.9, 0.5), "derecha"); assert.equal(zonaDe(0.5, 0.9), "inferior");
  assert.equal(dimensionDe(0.5), "normal"); assert.equal(dimensionDe(0.25), "pequeno"); assert.equal(dimensionDe(0.1), "muy_pequeno"); assert.equal(dimensionDe(0.8), "grande"); assert.equal(dimensionDe(0.6, 2), "muy_grande");
  assert.equal(fuerzaDe(0.2), "fina"); assert.equal(fuerzaDe(0.5), "firme"); assert.equal(fuerzaDe(0.9), "fuerte"); assert.equal(fuerzaDe(NaN), "");
  for (const g of ["situacion", "dimension", "fuerza"]) for (const id of g === "situacion" ? ["centro", "superior_izquierda", "derecha", "inferior"] : g === "dimension" ? ["normal", "pequeno", "muy_pequeno", "grande", "muy_grande"] : ["fina", "firme", "fuerte"])
    assert.ok(CAT.valores.find((v) => v.id === g).opciones.some((o) => o.id === id), `${g}/${id}`);
});

test("medir una foto: dibujo pequeño arriba a la izquierda y otro grande al centro", () => {
  const a = lienzo(600, 800); // hoja vertical
  for (let i = 0; i < 6; i++) trazo(a, 40 + i * 20, 60, 50 + i * 20, 200, 4); // figurita en la esquina superior izquierda
  trazo(a, 40, 60, 160, 60, 4);
  const m = medirDibujo(a);
  assert.equal(m.zona, "superior_izquierda"); assert.equal(m.dimension, "muy_pequeno"); assert.equal(m.bordes, 0);
  const p = preMarcar(m);
  assert.equal(p["situacion/superior_izquierda"].origen, "medido"); assert.equal(p["dimension/muy_pequeno"].origen, "medido");
  const b = lienzo(600, 800);
  for (let y = 120; y <= 680; y += 40) trazo(b, 100, y, 500, y, 3);
  trazo(b, 100, 120, 100, 680, 3); trazo(b, 500, 120, 500, 680, 3);
  const n = medirDibujo(b);
  assert.equal(n.zona, "centro"); assert.equal(n.dimension, "normal");
  assert.equal(medirDibujo(lienzo(300, 300)), null);
});

test("informe: valores, elementos con modificadores, garabatos, colores y alcance", () => {
  const estado = { test: "htp", valores: { "situacion/izquierda": { origen: "medido", valor: "centro a 20 % del ancho" }, "forma/curva": { origen: "manual" } },
    partes: { "figura/ojos": { mods: ["omitida"], nota: "sin pupilas" }, "arbol/raices": { mods: ["exagerada"], nota: "" }, "casa/puerta": { mods: [], nota: "" } },
    garabatos: ["espiral_centrifuga"], colores: ["azul"], etapa: "ninos", observaciones: "Borró varias veces la cara." };
  const doc = redactarDibujo(CAT, estado, { persona: "Luis", edad: "9" });
  const titulos = doc.secciones.map((s) => s.titulo), todo = doc.secciones.flatMap((s) => s.parrafos).join(" ");
  assert.match(doc.titulo, /H-T-P/);
  for (const t of ["Datos", "Valores gráficos", "Elementos del dibujo", "Colores", "Observaciones del analista", "Síntesis", "Alcance"]) assert.ok(titulos.includes(t), t);
  assert.ok(!titulos.includes("Garabatos") || todo.includes("Espiral"));
  assert.match(todo, /Situación en la hoja \(dónde se acumula el dibujo\): zona izquierda \(medido: centro a 20 % del ancho\), que según tu manual remite al pasado/);
  assert.match(todo, /Ojos — omitida: representa el contacto con el entorno/); assert.match(todo, /Observación: sin pupilas/); assert.match(todo, /lectura complementaria/);
  assert.match(todo, /Raíces — exagerada o muy grande: representa los instintos/);
  assert.ok(!/Puerta/.test(todo), "una parte sin marcar no aparece");
  assert.match(todo, /niños y adolescentes/); assert.match(todo, /gran control de sí/);
  assert.equal(doc.secciones[0].filas.find(([a]) => a === "Persona")[1], "Luis");
  assert.ok(doc.palabras > 150);
  assert.match(redactarDibujo(CAT, { test: "arbol" }).secciones.find((s) => s.titulo === "Síntesis").parrafos[0], /Aún no hay/);
});

test("la pestaña está en la página de conducta (solo administración)", () => {
  const h = readFileSync(new URL("../../conducta.html", import.meta.url), "utf8");
  assert.ok(h.includes('data-panel="p-dibujo"') && h.includes('id="p-dibujo"') && h.includes("js/dibujo.js"));
  for (const id of ["d-test", "d-archivo", "d-valores", "d-partes", "d-garabatos", "d-colores", "d-redactar"]) assert.ok(h.includes(`id="${id}"`), id);
});
