import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { vistaActual, restricciones, aplicarARiesgos, familiasPago, subtiposPago, fuenteComercial, camaraComercial, camaraParaVistaComercial } from "../../js/licencias.js";
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
  // Aeronaves: en la vista de pago se cambian por el archivo de adsb.lol (ODbL); buques siguen solo para admin.
  assert.ok(!r.movimiento.has("aeronaves") && r.movimientoSust.aeronaves.archivo === "aeronaves_comercial" && r.movimiento.has("buques") && !r.movimiento.has("satelites"));
  assert.ok(r.paginas.has("noticiero.html") && !r.bloques.has("b-capas-ent"), "el bloque ya no es solo admin: va por plan");
  assert.ok(r.capas.has("nodos_bitcoin") && r.capas.has("inmuebles_seguimiento"));
});

test("cámaras: conserva fichas, subtipos y grupos, con medios solo de fuentes aprobadas", async () => {
  const { htmlFichaCamara } = await import("../../js/capas.js");
  const { filtrarCamaras } = await import("../../js/camaras_catalogo.js");
  const filtro = lic.version_pago.capas_filtradas.camaras;
  const sub = (id, fuente) => ({ id, fuente });
  const fam = { id: "camaras", fuente: "camaras_publicas", manifest: { archivo: "a.geojson", grupos: "g.json", objetos: 3 },
    subtipos: [sub("trafico", "camaras_publicas"), sub("wcmx_cdmx", "webcamsdemexico"), sub("yt_ciudades", "youtube_en_vivo")] };
  const [f] = familiasPago([fam], r);
  assert.deepEqual(f.subtipos, fam.subtipos);
  assert.deepEqual(f.manifest, fam.manifest);
  const abierta = { id: "dt:C01", n: "Cámara de tráfico", imgs: ["https://example.com/1.jpg"] };
  const youtube = { id: "yt:abcdefg1234", fuente: "youtube", n: "Ciudad de ejemplo", st: "yt_ciudades",
    x: "https://www.youtube.com/watch?v=abcdefg1234", yt: "abcdefg1234", canal: "https://www.youtube.com/",
    imgs: ["https://example.com/restringida.jpg"], mp4: "https://example.com/a.mp4", hls: "https://example.com/a.m3u8",
    embed: "https://webcams.windy.com/webcams/public/embed/player/123/day", embed_tipo: "windy", sg: "1234" };
  const cita = { id: "cita:1", fuente: "cita", n: "CITA", x: "https://www.cita.lu/webcam/map/1" };
  const fichas = [abierta, youtube, cita].map(p => f.prepararObjeto(p));
  assert.deepEqual(fichas.map(p => p.id), [abierta.id, youtube.id, cita.id]);
  assert.deepEqual(fichas[0], abierta);
  assert.deepEqual(fichas[2], cita);
  assert.deepEqual(fichas[1], camaraParaVistaComercial(youtube, filtro));
  assert.equal(fichas[1].x, youtube.x);
  for (const medio of ["imgs", "mp4", "hls", "yt", "canal", "embed", "embed_tipo", "sg"]) assert.ok(!(medio in fichas[1]), medio);
  const html = htmlFichaCamara(fichas[1]);
  assert.match(html, /Acceso externo/);
  assert.ok(html.includes(youtube.x));
  assert.doesNotMatch(html, /<img|<video|<iframe|data-sg|data-camara/);
  assert.match(htmlFichaCamara(fichas[0]), /<img/);
  assert.equal(filtrarCamaras(fichas).length, 3);
  assert.deepEqual(filtrarCamaras(fichas, "ciudad", "enlace").map(p => p.id), [youtube.id]);
  assert.ok(camaraComercial({ id: "cam:kilauea", t: "organismo_publico" }, filtro));
  assert.ok(!camaraComercial(youtube, filtro));
  assert.ok(camaraParaVistaComercial(abierta).solo_enlace_comercial, "si la configuración falla se usa el enlace");
  for (const x of ["javascript:alert(1)", "https://127.0.0.1/camara", "https://user:pass@example.com/camara", "https://example.com/?api_key=privada"]) {
    assert.equal(camaraParaVistaComercial({ ...youtube, x }, filtro).x, "");
  }
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
  for (const { id } of planes.planes) {
    assert.equal(planFaltante(planes, id, "grupos", "capas"), null, id);
    assert.equal(planFaltante(planes, id, "bloques", "b-capas-img"), null, id);
    assert.equal(planFaltante(planes, id, "paginas", "camaras.html"), null, id);
  }
  assert.equal(planFaltante(planes, "demo", "bloques", "b-capas-ent").id, "recon");
  assert.ok(!r.paginas.has("camaras.html") && !r.capas.has("camaras") && !r.bloques.has("b-capas-img") && !r.bloquesLic.includes("b-capas-img"));
  assert.equal(planFaltante(planes, "demo", "paginas", "noticiero.html"), null, "sin regla: lo decide la lista de solo admin");
  const fix = fixDeIndicadores({ grupos: [{ datos: [{ id: "SF46410", valor: 21 }, { id: "SF43718", valor: 18.4215, fecha: "2026-10-28" }] }] });
  assert.deepEqual(fix, { fecha: "2026-10-28", valor: 18.4215 });
  assert.equal(precioCorto(planes.planes.find((p) => p.id === "analyst"), fix), "166 MXN al mes");
  assert.equal(precioCorto(planes.planes[0], fix), "Gratis");
  assert.equal(precioCorto(planes.planes[1], null), "USD 4.99 al mes");
  const filas = filasComparacion(planes);
  assert.deepEqual(filas.find((f) => f.clave === "seguimiento").incluido, [false, false, false, true]);
  assert.deepEqual(filas.find((f) => f.clave === "eventos").incluido, [true, true, true, true]);
  for (const clave of ["camaras.html", "b-capas-img"]) {
    assert.deepEqual(filas.find((f) => f.clave === clave).incluido, [true, true, true, true]);
  }
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
