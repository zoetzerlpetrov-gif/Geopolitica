import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { vistaActual, restricciones, aplicarARiesgos, familiasPago, subtiposPago, fuenteComercial, camaraComercial } from "../../js/licencias.js";
import { CAPAS } from "../../js/riesgos.js";

const leer = (p) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url)));
const lic = leer("config/comercial_licencias.json"), cat = leer("config/entities.json"), planes = leer("config/planes.json");
const r = restricciones(lic, cat, planes);

test("vista: solo ?vista=pago (o la versión comercial) activa la versión de pago", () => {
  assert.equal(vistaActual("?vista=pago", undefined), "pago");
  assert.equal(vistaActual("", undefined), "completa");
  assert.equal(vistaActual("?vista=admin", undefined), "completa");
  assert.equal(vistaActual("", "pago"), "pago");
  assert.equal(vistaActual("?vista=pago", "admin"), "completa");
});

test("fuentes: solo uso comercial confirmado; «por verificar» queda para admin", () => {
  assert.ok(fuenteComercial(cat, "wikidata") && fuenteComercial(cat, "satnogs"));
  for (const f of ["telegeography", "opensky", "celestrak", "adsblol", "aisstream", "bitnodes", "camaras_publicas"]) assert.ok(!fuenteComercial(cat, f), f);
});

test("riesgos: se quitan los de solo admin y botnets pasa al archivo de abuse.ch", () => {
  const ids = new Set(CAPAS.map((c) => c.id));
  for (const id of r.riesgos) assert.ok(ids.has(id), `${id} no es una capa de riesgo`);
  const copia = CAPAS.map((c) => ({ ...c }));
  const quitados = aplicarARiesgos(copia, r);
  assert.ok(quitados.includes("gfw_apagados") && quitados.includes("aire") && quitados.includes("emergencias_aereas"));
  for (const id of ["pronostico", "nortes", "mar_fondo"]) assert.ok(copia.some((c) => c.id === id), `${id} ya usa fuentes comerciales (MET Norway / NOAA)`);
  for (const id of ["pronostico", "nortes", "mar_fondo"]) assert.ok(!/Open-Meteo/.test(copia.find((c) => c.id === id).fuente), id);
  assert.ok(!copia.some((c) => r.riesgos.has(c.id)));
  const c2 = copia.find((c) => c.id === "c2_botnets");
  assert.equal(c2.url, "data/vivos/red_c2_comercial.geojson");
  assert.ok(!/C2Intel/i.test(c2.fuente));
  assert.ok(copia.some((c) => c.id === "sismos"), "lo comercial se queda");
});

test("capas y movimiento: sin fuentes no comerciales ni subtipos de CelesTrak", () => {
  const fams = [{ id: "cables", fuente: "telegeography", subtipos: [] }, { id: "cables_osm", fuente: "osm", sustituye: "cables", subtipos: [] },
    { id: "aeropuertos", fuente: "ourairports", subtipos: [{ fuente: "ourairports" }] },
    { id: "inmuebles_seguimiento", fuente: "wikidata", subtipos: [] }, { id: "nodos_bitcoin", fuente: "bitnodes", subtipos: [] }];
  // Cables: TeleGeography (no comercial) se cambia por OpenStreetMap en el mismo lugar; Bitcoin e inmuebles: solo admin.
  assert.deepEqual(familiasPago(fams, r).map((f) => f.id), ["cables_osm", "aeropuertos"]);
  const sats = cat.categorias.find((c) => c.id === "satelites").subtipos;
  assert.deepEqual(subtiposPago(sats, r).map((s) => s.fuente), ["satnogs"]);
  assert.ok(r.movimiento.has("aeronaves") && r.movimiento.has("buques") && !r.movimiento.has("satelites"));
  assert.ok(r.paginas.has("noticiero.html") && !r.bloques.has("b-capas-ent"), "el bloque ya no es solo admin: va por plan");
  assert.ok(r.capas.has("nodos_bitcoin") && r.capas.has("inmuebles_seguimiento"));
});

test("cámaras: solo licencias abiertas y enlaces oficiales de organismos públicos", () => {
  const sub = (id, fuente) => ({ id, fuente });
  const fam = { id: "camaras", fuente: "camaras_publicas", licencia: "x", manifest: { archivo: "a.geojson", grupos: "g.json", objetos: 9, por_subtipo: { trafico: 9 } },
    subtipos: [sub("trafico", "camaras_publicas"), sub("wcmx_cdmx", "webcamsdemexico"), sub("yt_ciudades", "youtube_en_vivo")] };
  const [f] = familiasPago([fam], r);
  assert.equal(f.fuente, "camaras_abiertas");
  assert.deepEqual(f.subtipos.map((s) => s.id), ["trafico"], "sin YouTube ni Webcams de México");
  assert.equal(f.manifest.grupos, null, "los grupos del servidor cuentan todas las cámaras");
  assert.equal(f.manifest.objetos, null);
  assert.ok(f.filtroObjeto({ id: "dt:C01", t: "organismo_publico" }), "Digitraffic (CC BY 4.0) por prefijo");
  assert.ok(f.filtroObjeto({ id: "x:1", fuente: "tfl" }));
  assert.ok(f.filtroObjeto({ id: "cam:kilauea", t: "organismo_publico" }), "enlace a página oficial");
  assert.ok(!f.filtroObjeto({ id: "cam:x", t: "operador_turistico" }));
  for (const p of [{ id: "yt:abc" }, { id: "wy:1", fuente: "windy" }, { id: "wdm:1" }, { id: "ct:1", fuente: "caltrans" }, { id: "hk:1", fuente: "hong_kong" }])
    assert.ok(!camaraComercial(p, lic.version_pago.capas_filtradas.camaras), p.id);
});

test("planes: el grupo de un plan superior pide ese plan; el propio o inferior no", async () => {
  const { planActual, planFaltante, fixDeIndicadores } = await import("../../js/licencias.js");
  const { precioCorto, filasComparacion } = await import("../../js/planes.js");
  assert.equal(planActual(planes, "?vista=pago&plan=recon", undefined), "recon");
  assert.equal(planActual(planes, "?vista=pago", undefined), "command", "sin plan: el más alto");
  assert.equal(planActual(planes, "?plan=xyz", undefined), "command");
  assert.equal(planFaltante(planes, "recon", "grupos", "herramientas").id, "analyst");
  assert.equal(planFaltante(planes, "recon", "grupos", "seguimiento").id, "command");
  assert.equal(planFaltante(planes, "recon", "grupos", "riesgos"), null);
  assert.equal(planFaltante(planes, "demo", "paginas", "matriz.html").id, "analyst");
  assert.equal(planFaltante(planes, "command", "paginas", "matriz.html"), null);
  assert.equal(planFaltante(planes, "demo", "paginas", "noticiero.html"), null, "sin regla: lo decide la lista de solo admin");
  const fix = fixDeIndicadores({ grupos: [{ datos: [{ id: "SF46410", valor: 21 }, { id: "SF43718", valor: 18.4215, fecha: "2026-10-28" }] }] });
  assert.deepEqual(fix, { fecha: "2026-10-28", valor: 18.4215 });
  assert.equal(precioCorto(planes.planes.find((p) => p.id === "analyst"), fix), "166 MXN al mes");
  assert.equal(precioCorto(planes.planes[0], fix), "Gratis");
  assert.equal(precioCorto(planes.planes[1], null), "USD 4.99 al mes");
  const filas = filasComparacion(planes);
  assert.deepEqual(filas.find((f) => f.clave === "seguimiento").incluido, [false, false, false, true]);
  assert.deepEqual(filas.find((f) => f.clave === "eventos").incluido, [true, true, true, true]);
  for (const g of Object.keys(planes.acceso_por_plan.grupos)) assert.ok(planes.acceso_por_plan.nombres[g], g);
});

test("enlaces mezclados o pegados dos veces siguen llevando a la vista de pago y al plan pedido", async () => {
  const { vistaActual, planActual } = await import("../../js/licencias.js");
  assert.equal(vistaActual("?vista=pago&plan=index.html?vista=pago&plan=demo", undefined), "pago");
  assert.equal(planActual(planes, "?vista=pago&plan=index.html?vista=pago&plan=demo", undefined), "demo");
  assert.equal(vistaActual("?vista=index.html?vista=pago&plan=recon", undefined), "pago");
  assert.equal(planActual(planes, "?vista=index.html?vista=pago&plan=recon", undefined), "recon");
  assert.equal(vistaActual("?vista=pagos", undefined), "completa");
  assert.equal(vistaActual("?vista=admin", undefined), "completa");
  assert.equal(vistaActual("?q=vista=pago", undefined), "completa");
});
