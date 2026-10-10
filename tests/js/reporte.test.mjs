// Página de reportes: el HTML escapa el texto y muestra el panorama con IA solo si existe.
import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlReporte, htmlEvento } from "../../js/reporte.js";

const ev = { id: "e1", titulo: "<b>Huachicol</b> en Hidalgo", fuente: "La Jornada", url: "https://example.mx/1", fecha_utc: "2026-10-10T16:00:00Z", severidad: 3, resumen: "Resumen propio." };
const rep = {
  titulo: "Panorama diario de México", fecha: "2026-10-10", corte_mx: "12:00", ventana: { horas: 24 },
  cifras: { total: 1, notas: 1, senales_automaticas: 0, por_severidad: { 5: 0, 4: 0, 3: 1, 2: 0, 1: 0 } },
  secciones: [{ nombre: "Combustibles", total: 1, notas: 1, senales_automaticas: 0, alta_severidad: 0, promedio_7d: 0, tendencia: "sin base", eventos: [ev] }],
  destacados: [], panorama_reglas: "Resumen por reglas.", metodo: "Método.", fuentes: [["La Jornada", 1]],
};

test("escapa títulos y enlaza al original", () => {
  const h = htmlEvento(ev);
  assert.match(h, /&lt;b&gt;Huachicol/);
  assert.match(h, /href="https:\/\/example.mx\/1"/);
});

test("sin panorama con IA lo dice; con panorama muestra escenarios y eventos citados", () => {
  assert.match(htmlReporte(rep), /Todavía no hay panorama con IA/);
  const ia = { aviso: "Hipótesis.", modelo: "groq/m", generado_utc: "2026-10-10T17:00:00Z",
    horizontes: { corto_plazo: { horizonte: "próximas 4 semanas", escenarios: [{ titulo: "Más operativos", descripcion: "Texto.", probabilidad: "media", senales: ["Decomisos"], eventos: ["e1"] }] } } };
  const h = htmlReporte({ ...rep, panorama_ia: ia });
  assert.match(h, /Más operativos/);
  assert.match(h, /probabilidad media/);
  assert.match(h, /href="#ev-e1"/);
});
