import { test } from "node:test";
import assert from "node:assert/strict";
import { cargarMosaico, conRespaldo, sinRespaldo, esPngPaleta } from "../../js/gibs.js";

const resp = (ok, tipo, cuerpo = new Uint8Array([1, 2, 3]).buffer) => async () => ({ ok, headers: { get: () => tipo }, arrayBuffer: async () => cuerpo });

test("mosaico de GIBS con error → PNG transparente y aviso; con imagen → la imagen", async () => {
  const u = "https://gibs.earthdata.nasa.gov/wmts/x/1/2/3.png";
  assert.equal(sinRespaldo(conRespaldo(u)), u);
  assert.ok(conRespaldo(u).startsWith("gibsr://"));
  const fallas = [];
  const vacio = await cargarMosaico(conRespaldo(u), undefined, resp(false, "text/xml"), (x) => fallas.push(x));
  assert.equal(new Uint8Array(vacio.data)[1], 0x50);  // «PNG»
  assert.deepEqual(fallas, [u]);
  const bien = await cargarMosaico(conRespaldo(u), undefined, resp(true, "image/png"), (x) => fallas.push(x));
  assert.equal(bien.data.byteLength, 3);
  assert.equal(fallas.length, 1);
  await cargarMosaico(u, undefined, async () => { throw new Error("red"); }, (x) => fallas.push(x));
  assert.equal(fallas.length, 2);
  const ctrl = new AbortController(); ctrl.abort();
  await assert.rejects(cargarMosaico(u, ctrl.signal, async () => { throw new Error("abortado"); }));
});

test("Meteosat: cuadro más reciente que no pase del momento del bucle", async () => {
  const { cuadroMeteosat, esquinas } = await import("../../js/clima.js");
  const l = [{ t: "2026-10-28T10:00:00Z" }, { t: "2026-10-28T10:30:00Z" }, { t: "2026-10-28T11:00:00Z" }];
  assert.equal(cuadroMeteosat(l, "2026-10-28T10:50:00Z").t, "2026-10-28T10:30:00Z");
  assert.equal(cuadroMeteosat(l, "2026-10-28T09:00:00Z").t, "2026-10-28T10:00:00Z");
  assert.equal(cuadroMeteosat([], "x"), null);
  assert.deepEqual(esquinas([-80, -75, 150, 75]), [[-80, 75], [150, 75], [150, -75], [-80, -75]]);
});

test("TEMPO: se prueban las horas exactas publicadas (GIBS ya no acepta horas en punto)", async () => {
  const { mejorHora, horasPublicadas } = await import("../../js/imagenes.js");
  const xml = "<Domain>2026-10-28T13:52:41Z/2026-10-28T13:52:41Z/PT59M41S,2026-10-28T14:52:22Z/2026-10-28T14:52:22Z/PT59M41S</Domain>";
  const pub = await horasPublicadas({ capa: "T", matriz: "M" }, new Date("2026-10-28T16:00:00Z"), async () => xml);
  assert.deepEqual(pub, ["2026-10-28T13:52:41Z", "2026-10-28T14:52:22Z"]);
  const pedidas = [];
  const pedir = async (u) => { pedidas.push(u); return { ok: true, tipo: "image/png", bytes: u.includes("14:52:22") ? 18000 : 17000 }; };
  assert.equal(await mejorHora({ capa: "T", matriz: "M", ext: "png" }, pedir, new Date(), 30, pub), "2026-10-28T14:52:22Z");
  assert.ok(pedidas.every((u) => /T1[34]:52:/.test(u)));
  assert.deepEqual(await horasPublicadas({ capa: "T", matriz: "M" }, new Date(), async () => { throw new Error("red"); }), []);
});

test("productos con paleta: un PNG que no es de paleta (ruido de GIBS fuera de cobertura) se dibuja transparente", async () => {
  const u = "https://gibs.earthdata.nasa.gov/wmts/x/3/4/6.png";
  const p = conRespaldo(u, { paleta: true });
  assert.ok(p.startsWith("gibsp://"));
  assert.equal(sinRespaldo(p), u);
  const png = (tipo) => { const b = new Uint8Array(40); b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); b[25] = tipo; return b.buffer; };
  assert.equal(esPngPaleta(png(3)), true);
  assert.equal(esPngPaleta(png(6)), false);
  assert.equal(esPngPaleta(new Uint8Array([0xff, 0xd8, 0xff]).buffer), false);
  const fallas = [];
  const ruido = await cargarMosaico(p, undefined, resp(true, "image/png", png(6)), (x) => fallas.push(x));
  assert.equal(ruido.data.byteLength, 334);  // el PNG transparente propio
  assert.deepEqual(fallas, []);             // GIBS sí respondió: no cuenta como falla
  const bueno = await cargarMosaico(p, undefined, resp(true, "image/png", png(3)));
  assert.equal(bueno.data.byteLength, 40);
  const sinFiltro = await cargarMosaico(conRespaldo(u), undefined, resp(true, "image/png", png(6)));
  assert.equal(sinFiltro.data.byteLength, 40);  // las demás capas no se filtran
});

test("Imágenes: desmarcar mientras se busca el día no deja la imagen pegada en el mapa", async () => {
  const { Imagenes, IMAGENES } = await import("../../js/imagenes.js");
  const capas = new Set(), fuentes = new Set();
  const map = { getLayer: (i) => capas.has(i), getSource: (i) => fuentes.has(i), addSource: (i) => fuentes.add(i), addLayer: (l) => capas.add(l.id),
    removeLayer: (i) => capas.delete(i), removeSource: (i) => fuentes.delete(i) };
  globalThis.maplibregl = { addProtocol() {} };
  const img = new Imagenes(map);
  let soltar;
  const lento = () => new Promise((r) => { soltar = () => r({ ok: true, tipo: "image/png", bytes: 20000 }); });
  const p = img.activar("modis_color", undefined, lento);   // busca el día más completo (consulta lenta)
  img.desactivar("modis_color");                          // la persona desmarca antes de que termine
  while (true) { await new Promise((r) => setTimeout(r, 0)); if (soltar) { const s = soltar; soltar = null; s(); } if (await Promise.race([p.then(() => true), new Promise((r) => setTimeout(() => r(false), 5))])) break; }
  assert.equal(capas.size, 0, "no debe quedar ninguna capa de imagen");
  assert.equal(img.activas.size, 0);
  // Las capas de aerosoles y ozono apuntan a productos que NASA sigue publicando (Suomi NPP dejó de publicar el 2 nov 2026).
  assert.equal(IMAGENES.aerosoles.capa, "OMPS_NOAA21_NadirMapper_AerosolIndex_380");
  assert.equal(IMAGENES.ozono_total.fecha_fija, "default");
});

test("Trenes: con 0 de madrugada se explica la hora local y el horario de servicio", async () => {
  const { notaSinTrenes } = await import("../../js/riesgos.js");
  const noche = new Date("2026-11-14T02:37:00Z");   // 03:37 en Madrid, 02:37 en Dublín
  assert.match(notaSinTrenes("renfe", noche), /03:37 y no hay servicio/);
  assert.match(notaSinTrenes("irlanda", noche), /02:37 y no hay servicio/);
  assert.match(notaSinTrenes("renfe", new Date("2026-11-13T12:00:00Z")), /^0 ahora \(allá son las 13:00\)/);
  assert.equal(notaSinTrenes("finlandia", noche), null);  // Finlandia: carga y pasajeros las 24 h
});

test("Organigrama: cambios verificados y 8-K 5.02 se aplican sobre Wikidata (NVIDIA, nov 2026)", async () => {
  globalThis.document ??= undefined;
  const { conCambios, htmlOrganigrama } = await import("../../js/corp_mundo.js");
  const nvda = { id: "Q182477", n: "Nvidia", cik: "0001045810", ceo: [["Jen-Hsun Huang", "Q305177", "", 1]],
    consejo: [["Jen-Hsun Huang", "Q305177", "", 1], ["Harvey C. Jones", "Q116376004", "", 1]] };
  const cambios = { empresas: { Q182477: { fecha: "2026-11-12", resumen: "Huang renunció; Kress interina.", ceo: [["Colette Kress (interina)", "", "", 1]],
    salen: ["Q305177"], fuente: "8-K", url: "https://www.sec.gov/x.htm" } } };
  const e = conCambios(nvda, cambios, { cambios: { "0001045810": [{ fecha: "2026-11-12", url: "https://www.sec.gov/x.htm" }, { fecha: "2026-10-01", url: "https://www.sec.gov/y.htm" }] } });
  assert.deepEqual(e.ceo.map((x) => x[0]), ["Colette Kress (interina)"]);
  assert.ok(!e.consejo.some((x) => x[1] === "Q305177"));
  assert.equal(e.avisos.length, 2);                 // el verificado y el otro 8-K (el mismo documento no se repite)
  const html = htmlOrganigrama(e);
  assert.match(html, /Colette Kress \(interina\)/);
  assert.doesNotMatch(html, /Jen-Hsun Huang/);
  assert.equal(conCambios({ id: "Q1", n: "Otra" }, cambios, null).avisos, undefined);  // sin cambios: igual
});
