import test from "node:test";
import assert from "node:assert/strict";
import { modeloPara, formaAvion, colaAerolinea, botonModelo } from "../../js/modelos3d.js";

test("forma del avión según el tipo OACI y la categoría", () => {
  assert.equal(formaAvion("B738", "A3"), "angosto");
  assert.equal(formaAvion("A388", "A5"), "ancho4");
  assert.equal(formaAvion("B789", ""), "ancho");
  assert.equal(formaAvion("E190", ""), "regional");
  assert.equal(formaAvion("AT76", ""), "turbohelice");
  assert.equal(formaAvion("", "A7"), "helicoptero");
  assert.equal(formaAvion("F16", "", "militar"), "caza");
});

test("color de cola por aerolínea y gris para militares", () => {
  assert.equal(colaAerolinea("AMX402", "civil_comercial"), "#0B2343");
  assert.equal(colaAerolinea("VOI881", "civil_comercial"), "#A12B8F");
  assert.equal(colaAerolinea("RCH123", "militar"), "#4B5560");
  assert.equal(colaAerolinea("ZZZ1", "civil_comercial"), "#2B4C7E");
});

test("aviación general no tiene modelo 3D", () => {
  assert.equal(modeloPara({ fuente: "aeronave", subtipo: "aviacion_general", tipo_av: "C172" }), null);
  assert.equal(botonModelo({ fuente: "aeronave", subtipo: "aviacion_general" }), "");
});

test("riesgos e instalaciones con modelo", () => {
  assert.equal(modeloPara({ fuente: "riesgo", capa: "severo", props: { kind: "TORNADO" } }).tipo, "tornado");
  assert.equal(modeloPara({ fuente: "riesgo", capa: "severo", props: { kind: "TROMBA" } }).agua, true);
  assert.equal(modeloPara({ fuente: "riesgo", capa: "sismos", props: { mag: 6.4 } }).mag, 6.4);
  assert.equal(modeloPara({ fuente: "riesgo", capa: "sismos", props: { _enjambre: true, mag: 4 } }), null);
  const c = modeloPara({ fuente: "riesgo", capa: "ciclones", props: { layer: "storm", intensity_kt: 120 }, lat: -15 });
  assert.equal(c.cat, 4); assert.equal(c.sur, true);
  assert.equal(modeloPara({ fuente: "riesgo", capa: "volcanes", props: { semaforo: "Amarillo" } }).nivel, 3);
  assert.equal(modeloPara({ fuente: "entidad", st: "presa_hidro" }).hidro, true);
  assert.equal(modeloPara({ fuente: "entidad", st: "central_nuclear" }).tipo, "nuclear");
  assert.equal(modeloPara({ fuente: "entidad", st: "embajadas_consulados" }), null);
  assert.equal(modeloPara({ fuente: "satelite", st: "estaciones" }).forma, "estacion");
  assert.equal(modeloPara({ fuente: "buque", subtipo: "tanqueros" }).forma, "tanquero");
});

test("el botón lleva el modelo escapado como JSON", () => {
  const html = botonModelo({ fuente: "riesgo", capa: "lanzamientos", props: { nombre: 'Falcon 9 "Block 5"' } });
  assert.match(html, /data-modelo3d="/);
  assert.doesNotMatch(html, /"Block/);
});
