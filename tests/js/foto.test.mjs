// Herramienta de fotos: qué metadatos se muestran, aviso sin metadatos y botón «Ir a la localización».
import { test } from "node:test";
import assert from "node:assert/strict";
import { filasExif, htmlFoto } from "../../js/foto.js";

test("solo muestra los metadatos que trae la foto, con formato legible", () => {
  const f = Object.fromEntries(filasExif({ marca: "Apple", modelo: "iPhone 15", fecha_toma: "2024:05:01 13:22:10", zona_toma: "-06:00",
    exposicion: 0.004, apertura: 1.78, iso: [64], focal: 6.86, focal_35: 24, flash: 16, ancho: 4032, alto: 3024, orientacion: 6,
    lat: 19.4326, lon: -99.1332, altitud: 2240.4, direccion: 87.6, error_gps: 4.7, fecha_gps: "2024:05:01", hora_gps: "19:22:09" }));
  assert.equal(f["Cámara o teléfono"], "Apple · iPhone 15");
  assert.equal(f["Tomada"], "2024-05-01 13:22:10 (UTC-06:00)");
  assert.equal(f["Exposición"], "1/250 s");
  assert.equal(f["ISO"], "64");
  assert.equal(f["Flash"], "No se disparó");
  assert.equal(f["Orientación de la imagen"], "Girada 90° a la derecha");
  assert.equal(f["Coordenadas GPS"], "19.432600, -99.133200");
  assert.equal(f["Fecha y hora del GPS"], "2024-05-01 19:22:09 UTC");
  assert.ok(!("Autor" in f) && !("Lente" in f));
});

test("sin metadatos lo dice y no muestra botón", () => {
  const h = htmlFoto({ formato: "jpeg" }, { name: "captura.jpg", size: 2048 });
  assert.match(h, /no cuenta con metadatos/);
  assert.doesNotMatch(h, /foto-ir/);
});

test("con metadatos pero sin GPS: los muestra y avisa que no hay ubicación", () => {
  const h = htmlFoto({ formato: "heic", marca: "HUAWEI", modelo: "P30" }, { name: "a.heic", size: 3e6 });
  assert.match(h, /HUAWEI · P30/);
  assert.match(h, /no trae ubicación GPS/);
  assert.doesNotMatch(h, /foto-ir/);
});

test("con GPS aparece «Ir a la localización»", () => {
  const h = htmlFoto({ formato: "jpeg", lat: 40.6892, lon: -74.0445 }, { name: "b.jpg", size: 1 });
  assert.match(h, /id="foto-ir"[^>]*>📍 Ir a la localización/);
});

test("formato ilegible muestra el error", () => {
  assert.match(htmlFoto({ formato: "gif", error: "Los GIF no guardan metadatos de ubicación." }), /GIF no guardan/);
});
