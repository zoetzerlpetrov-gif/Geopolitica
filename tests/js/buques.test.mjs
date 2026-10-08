// Ficha de buques: tipo AIS, estado de navegación, bandera, destino y trayectoria.
// Ejecutar:  node --test "tests/js/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { tipoAis, estadoNav, paisIso2, paisDestino, geojsonBuque, htmlBuque, SIN_TRAYECTORIA } from "../../js/buques.js";
import { proyectar } from "../../js/movimiento.js";

const b = (over = {}) => ({
  mmsi: 345070300, nombre: "MAR", lon: -104.3, lat: 19.05, rumbo: 90, vel_nudos: 12, subtipo: "carga", imo: 9187629, edad_s: 0,
  indicativo: "XCAB", tipo_ais: 71, eslora_m: 180, manga_m: 28, calado_m: 9.4, destino: "MX ZLO", eta: "10-09 14:00", estado_nav: 0, bandera: "MX", ...over,
});

test("tipo AIS: códigos exactos, familias y mercancía peligrosa", () => {
  assert.equal(tipoAis(30), "Pesquero");
  assert.equal(tipoAis(60), "Pasaje");
  assert.equal(tipoAis(71), "Carga (mercancía peligrosa, categoría A)");
  assert.equal(tipoAis(84), "Tanquero (mercancía peligrosa, categoría D)");
  assert.equal(tipoAis(0), null);
  assert.equal(tipoAis(12), null);
});

test("estado de navegación y bandera en español", () => {
  assert.equal(estadoNav(1), "Fondeado");
  assert.equal(estadoNav(15), null);
  assert.equal(paisIso2("MX"), "México");
  assert.equal(paisIso2(""), null);
});

test("país del destino solo si parece UN/LOCODE", () => {
  assert.equal(paisDestino("MX ZLO"), "MX");
  assert.equal(paisDestino("MXZLO"), "MX");
  assert.equal(paisDestino("US LAX>CN SHA"), "CN");
  assert.equal(paisDestino("FOR ORDERS"), null);
  assert.equal(paisDestino(""), null);
});

test("trayectoria: recorrido con el rastro y rumbo de 2 h si se mueve", () => {
  const gj = geojsonBuque(b(), { rastro: [[-105, 19, 12, 1], [-104.6, 19.02, 12, 2]] }, proyectar);
  const k = gj.features.map((f) => f.properties.k);
  assert.deepEqual(k, ["recorrido", "punto", "punto", "rumbo"]);
  assert.equal(gj.features[0].geometry.coordinates.length, 3);
  const quieto = geojsonBuque(b({ vel_nudos: 0 }), { rastro: [] }, proyectar);
  assert.equal(quieto.features.length, 0);
});

test("ficha: bandera, medidas, destino declarado y aviso de que no hay origen", () => {
  const html = htmlBuque(b(), { rastro: [] }, { subtipoNombre: "Carga", edadMin: 5 });
  assert.match(html, /bandera de México/);
  assert.match(html, /180 m de eslora × 28 m de manga/);
  assert.match(html, /MX ZLO<\/b> \(México\) · ETA 10-09 14:00 UTC/);
  assert.match(html, /no transmite el puerto de salida/);
  assert.match(html, /Navegando con motor/);
  assert.doesNotMatch(html, /propietario:/i);
});

test("ficha: recreo sin trayectoria; SDN y SART como alerta; sin estáticos no falla", () => {
  assert.ok(SIN_TRAYECTORIA.has("vela_recreo"));
  assert.match(htmlBuque(b({ subtipo: "vela_recreo" }), { rastro: [] }, { subtipoNombre: "Recreo" }), /recreo \(privacidad\)/);
  assert.match(htmlBuque(b({ subtipo: "sancionados" }), null, { subtipoNombre: "x" }), /lista SDN/);
  assert.match(htmlBuque(b({ estado_nav: 14 }), null, { subtipoNombre: "x" }), /alerta-FLASH">Alarma de búsqueda/);
  const vacio = htmlBuque(b({ nombre: "", tipo_ais: 0, eslora_m: 0, destino: "", bandera: "", imo: 0 }), null, { subtipoNombre: "Otros" });
  assert.match(vacio, /MMSI 345070300/);
  assert.match(vacio, /aún no llegan/);
});

test("ficha: buque conservado de una instantánea anterior muestra su última señal", () => {
  assert.match(htmlBuque(b({ edad_s: 1800 }), null, { subtipoNombre: "Carga", edadMin: 5 }), /Última señal<\/dt><dd>hace 35 min/);
  assert.doesNotMatch(htmlBuque(b({ edad_s: 30 }), null, { subtipoNombre: "Carga", edadMin: 5 }), /Última señal/);
});
