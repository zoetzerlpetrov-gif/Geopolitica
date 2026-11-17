import { test } from "node:test";
import assert from "node:assert/strict";
import { textoAlerta, htmlAlertas, htmlIndicadores, htmlFicha, variacion } from "../../js/monitor_mx.js";

test("alertas legibles y escapadas", () => {
  const t = textoAlerta({ alerta: "salto", que: "Remesas enviadas desde México hacia", donde: "<Cuba>", periodo: "2026-T3", valor: 40, unidad: "millones de USD", razon: 20, promedio_previo: 2 });
  assert.ok(t.includes("Salto") && t.includes("&lt;Cuba&gt;") && t.includes("3.º trim. 2026") && t.includes("×20"));
  assert.ok(htmlAlertas([]).includes("Sin movimientos"));
  assert.ok(htmlAlertas(Array.from({ length: 20 }, () => ({ alerta: "desplome", que: "x", periodo: "2026-09", valor: 1, razon: 0.1, promedio_previo: 10 })), 15).includes("y 5 más"));
});

test("indicadores agrupados y variación anual", () => {
  const h = htmlIndicadores([{ grupo: "Petróleo", nombre: "Exportaciones petroleras", valor: 1200, unidad: "millones de USD", periodo: "2026-09", mismo_periodo_anio_anterior: 1000 }]);
  assert.ok(h.includes("<h4>Petróleo</h4>") && h.includes("sep 2026") && h.includes("▲ 20 %"));
  assert.equal(variacion({ valor: 5, mismo_periodo_anio_anterior: 0 }), "");
});

test("ficha con la serie del mapa (propiedades en texto, como las entrega MapLibre)", () => {
  const h = htmlFicha({ nombre: "Jalisco", serie: JSON.stringify([["2026-T2", 1500], ["2026-T3", 1600]]) }, "remesas_estado");
  assert.ok(h.indexOf("3.º trim. 2026") < h.indexOf("2.º trim. 2026"));   // la más reciente primero
});
