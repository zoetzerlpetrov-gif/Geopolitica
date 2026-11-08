import { test } from "node:test";
import assert from "node:assert/strict";
import { esInterno, paginaDe, conVista } from "../../js/vista_enlaces.js";

test("enlaces internos conservan la vista y el plan", () => {
  assert.equal(conVista("./", "demo"), "./?vista=pago&plan=demo");
  assert.equal(conVista("reporte.html?tipo=mexico", "recon"), "reporte.html?vista=pago&plan=recon&tipo=mexico");
  assert.equal(conVista("planes.html#analyst", "demo"), "planes.html?vista=pago&plan=demo#analyst");
  assert.equal(conVista("index.html?vista=pago&plan=command&lat=1", "demo"), "index.html?vista=pago&plan=demo&lat=1", "el plan no se cambia por otro");
  const una = conVista("herramientas.html#x", "analyst");
  assert.equal(conVista(una, "analyst"), una, "idempotente");
});

test("solo cambian los enlaces a páginas del sitio", () => {
  for (const h of ["./", "index.html", "reporte.html?tipo=global", "planes.html#demo", "?id=3"]) assert.ok(esInterno(h), h);
  for (const h of ["#mapa", "https://x.org/a.html", "//cdn.x/a.html", "mailto:a@b.c", "/otro/a.html", "javascript:void(0)", "data/x.json", ""]) assert.ok(!esInterno(h), h);
  assert.equal(paginaDe("./?vista=pago"), "index.html");
  assert.equal(paginaDe("matriz.html#a"), "matriz.html");
});

test("autoauditoría: tendencia contra la semana anterior", async () => {
  const { tendencia, barra } = await import("../../js/autoauditoria.js");
  assert.equal(tendencia([{ global: 40 }, { global: 45 }], "global"), "▲ 5");
  assert.equal(tendencia([{ global: 45 }, { global: 40 }], "global"), "▼ 5");
  assert.equal(tendencia([{ global: 45 }], "global"), "");
  assert.match(barra(72), /72 %/);
});

test("alertas cisne negro: solo activas, ya en vigor y sin desactivar", async () => {
  const { alertasActivas, htmlAlertas } = await import("../../js/alerta_cisne.js");
  const f = (p) => ({ type: "Feature", geometry: { type: "Point", coordinates: [0, 0] }, properties: p });
  const fc = { features: [
    f({ titulo: "FORTRESS America", cisne_negro: true, fecha: "2026-09-30", nivel: 3, emisor: "Estados Unidos", afectacion: "Bases <militares>" }),
    f({ titulo: "Japón", cisne_negro: true, fecha: "2026-11-02", nivel: 1 }),
    f({ titulo: "Retirado", cisne_negro: true, fecha: "2026-01-01", desactivado: "2026-10-01" }),
    f({ titulo: "Aviso de viaje", cisne_negro: false, fecha: "2026-10-01", nivel: 4 }),
  ] };
  assert.deepEqual(alertasActivas(fc, "2026-10-29").map((x) => x.properties.titulo), ["FORTRESS America"]);
  assert.deepEqual(alertasActivas(fc, "2026-11-02").map((x) => x.properties.titulo), ["FORTRESS America", "Japón"], "Japón entra el día anunciado");
  const h = htmlAlertas(alertasActivas(fc, "2026-10-29"));
  assert.match(h, /Emite: <b>Estados Unidos<\/b>/);
  assert.ok(h.includes("Bases &lt;militares&gt;"), "texto escapado");
  assert.equal(htmlAlertas([]), "");
});

test("aviso cisne negro: al arrastrarlo no se sale del mapa", async () => {
  const { acotar } = await import("../../js/alerta_cisne.js");
  assert.deepEqual(acotar(500, 300, 360, 200, 1000, 800), { x: 500, y: 300 });
  assert.deepEqual(acotar(-50, -20, 360, 200, 1000, 800), { x: 0, y: 0 });
  assert.deepEqual(acotar(900, 790, 360, 200, 1000, 800), { x: 640, y: 760 }, "la barra roja sigue visible abajo");
  // posición guardada en la mitad derecha: conserva la distancia al borde derecho aunque el mapa cambie de ancho
  const { posicionGuardada } = await import("../../js/alerta_cisne.js");
  assert.deepEqual(posicionGuardada({ x: 900, y: 10, cw: 1300, ch: 800 }, 1000, 800), { x: 600, y: 10 });
  assert.deepEqual(posicionGuardada({ x: 100, y: 600, cw: 1300, ch: 800 }, 1000, 700), { x: 100, y: 500 }, "abajo a la izquierda: conserva la distancia al borde inferior");
  assert.deepEqual(posicionGuardada({ x: 900, y: 10 }, 1000, 800), { x: 900, y: 10 }, "posición guardada antes de este cambio");
  assert.equal(posicionGuardada(null, 1000, 800), null);
});

test("aviso cisne negro: secciones por tipo, buscador y países con riesgo alto aparte", async () => {
  const { alertasAltas, htmlAlertas } = await import("../../js/alerta_cisne.js");
  const f = (p) => ({ type: "Feature", geometry: { type: "Point", coordinates: [0, 0] }, properties: p });
  const feats = [f({ titulo: "Aviso de viaje: Sudán", tipo: "viaje", cisne_negro: true, iso3: "SDN", paises: "Sudán", nivel: 4 }),
    f({ titulo: "Ciclón en alerta roja", tipo: "desastre", cisne_negro: true, iso3: "IND", nivel: 4 })];
  const fc = { features: [...feats, f({ titulo: "Aviso de viaje: Haití", tipo: "viaje", nivel: 3, iso3: "HTI", paises: "Haití" }), f({ titulo: "México", tipo: "viaje", nivel: 2, iso3: "MEX" })] };
  const altas = alertasAltas(fc);
  assert.equal(altas.length, 1);
  const html = htmlAlertas(feats, altas);
  assert.match(html, /No viajar a todo el país/);
  assert.match(html, /Desastres en alerta roja/);
  assert.match(html, /reconsiderar el viaje <span>\(1 países\)/);
  assert.match(html, /3 países/);
  assert.ok(!html.includes("ac-busca"), "buscador solo con más de 8");
  // Cada sección se pliega: abierta por defecto, «riesgo alto» cerrada, y se respeta lo que la persona eligió.
  assert.match(html, /data-grupo="viaje"><details open>/);
  assert.match(html, /data-grupo="altas"><details>/);
  assert.ok(html.includes("ac-todas"), "botones de expandir y contraer todo");
  const h2 = htmlAlertas(feats, altas, { viaje: false, altas: true });
  assert.match(h2, /data-grupo="viaje"><details>/);
  assert.match(h2, /data-grupo="altas"><details open>/);
});

test("robos de Eurostat: lectura del JSON-stat y nivel frente a la mediana", async () => {
  const R = await import("../../js/inmuebles-logica.js");
  const d = { id: ["freq", "iccs", "unit", "geo", "time"], size: [1, 2, 1, 3, 2],
    dimension: { freq: { category: { index: { A: 0 } } }, iccs: { category: { index: { ICCS0401: 0, ICCS0501: 1 } } }, unit: { category: { index: { P_HTHAB: 0 } } },
      geo: { category: { index: { ES: 0, FR: 1, PL: 2 } } }, time: { category: { index: { 2023: 0, 2024: 1 } } } },
    value: { 0: 130, 1: 125, 2: 90, 3: 80, 4: 12, 5: 11, 6: 300, 8: 450, 9: 440, 10: 170, 11: 150 } };
  const t = R.robosEurostat(d);
  assert.equal(t.ES.robo, 125); assert.equal(t.ES.anio_robo, "2024");
  assert.equal(t.ES.allanamiento, 300); assert.equal(t.ES.anio_allanamiento, "2023");  // 2024 sin dato: toma 2023
  assert.equal(R.riesgoRobosEuropa("PL", t).nivel, null);  // informativo: no mueve la calificación global
  assert.ok(R.riesgoRobosEuropa("PL", t).relativo < 100 && R.riesgoRobosEuropa("FR", t).relativo > 100);
  assert.equal(R.riesgoRobosEuropa("XX", t).nivel, null);
});
