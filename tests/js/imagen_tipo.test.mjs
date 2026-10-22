import { test } from "node:test";
import assert from "node:assert/strict";
import { articuloAvion, articuloBuque, articuloSatelite, articuloTren, paginaCommons, huecoImagen, htmlImagen, todosLosArticulos } from "../../js/imagen_tipo.js";

test("avión: designador OACI → modelo; sin designador → categoría o subtipo", () => {
  assert.deepEqual(articuloAvion("B738", "civil_comercial"), { titulo: "Boeing 737 Next Generation", exacto: true });
  assert.equal(articuloAvion("b38m").titulo, "Boeing 737 MAX");
  assert.equal(articuloAvion("A20N").titulo, "Airbus A320neo family");
  assert.equal(articuloAvion("A321").titulo, "Airbus A320 family");
  assert.equal(articuloAvion("A339").titulo, "Airbus A330neo");
  assert.equal(articuloAvion("E75L").titulo, "Embraer E-Jet family");
  assert.equal(articuloAvion("C172", "aviacion_general").titulo, "Cessna 172");
  assert.deepEqual(articuloAvion("ZZZZ", "carga"), { titulo: "Cargo aircraft", exacto: false });
  assert.equal(articuloAvion("", "aviacion_general", "A7").titulo, "Helicopter");
  assert.equal(articuloAvion(null, "desconocido").titulo, "Airliner");
});

test("buque: tipo AIS exacto, por decena y por subtipo", () => {
  assert.equal(articuloBuque("carga", 52).titulo, "Tugboat");
  assert.equal(articuloBuque("carga", 71).titulo, "Cargo ship");
  assert.equal(articuloBuque("tanqueros", 84).titulo, "Oil tanker");
  assert.equal(articuloBuque("pesca").titulo, "Fishing vessel");
  assert.equal(articuloBuque("xx").titulo, "Ship");
});

test("satélite: nombres conocidos, luego grupo (id del sitio o de CelesTrak)", () => {
  assert.equal(articuloSatelite("ISS (ZARYA)", "stations").titulo, "International Space Station");
  assert.equal(articuloSatelite("STARLINK-1234", "starlink").titulo, "Starlink");
  assert.equal(articuloSatelite("SENTINEL-2A", "resource").titulo, "Sentinel-2");
  assert.equal(articuloSatelite("CZ-4C R/B", "visual").titulo, "Multistage rocket");
  assert.equal(articuloSatelite("XYZSAT 1", "weather").titulo, "Weather satellite");
  assert.equal(articuloSatelite("XYZSAT 1", "meteorologicos_eo").titulo, "Weather satellite");
  assert.equal(articuloSatelite("XYZSAT 1", "otro").titulo, "Satellite");
});

test("tren: carga, DART y red", () => {
  assert.equal(articuloTren("finlandia", "Carga").titulo, "Freight train");
  assert.equal(articuloTren("irlanda", "Cercanías", "DART").titulo, "Dublin Area Rapid Transit");
  assert.equal(articuloTren("boston", "Cercanías").titulo, "MBTA Commuter Rail");
  assert.equal(articuloTren("otra", "x").titulo, "Passenger train");
});

test("solo imágenes de Commons, con página del archivo", () => {
  assert.equal(paginaCommons("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Foo_bar.jpg/320px-Foo_bar.jpg"), "https://commons.wikimedia.org/wiki/File:Foo_bar.jpg");
  assert.equal(paginaCommons("https://upload.wikimedia.org/wikipedia/commons/a/ab/Foo.png"), "https://commons.wikimedia.org/wiki/File:Foo.png");
  assert.equal(paginaCommons("https://upload.wikimedia.org/wikipedia/en/thumb/a/ab/Logo.png/320px-Logo.png"), null); // no libre (uso legítimo)
  assert.equal(paginaCommons(""), null);
  assert.equal(paginaCommons("https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f8/22337_Dublin_Connolly.jpg/330px-22337_Dublin_Connolly.jpg?utm_source=x"),
    "https://commons.wikimedia.org/wiki/File:22337_Dublin_Connolly.jpg");
  // La API agrega parámetros de seguimiento: no forman parte del nombre del archivo.
  assert.equal(paginaCommons("https://upload.wikimedia.org/wikipedia/commons/7/7a/Meteosat.svg?utm_source=en.wikipedia.org&utm_content=thumbnail_unscaled"),
    "https://commons.wikimedia.org/wiki/File:Meteosat.svg");
});

test("hueco y HTML escapados, con aviso de que no es la unidad", () => {
  assert.match(huecoImagen({ titulo: 'A"B', exacto: true }), /data-img-tipo="A&quot;B" data-exacto="1"/);
  assert.equal(huecoImagen(null), "");
  const h = htmlImagen({ src: "https://upload.wikimedia.org/x.jpg", ancho: 320, alto: 200, archivo: "https://commons.wikimedia.org/wiki/File:x.jpg", articulo: "https://en.wikipedia.org/wiki/X", titulo: "<X>" }, false);
  assert.match(h, /no es esta unidad/);
  assert.match(h, /&lt;X&gt;/);
  assert.ok(todosLosArticulos().length > 100);
});

test("foto real del avión: elige el archivo de Commons que corresponde y limpia el autor", async () => {
  const { elegirArchivo, autorPlano, CON_FOTO_REAL, fotoAvionReal } = await import("../../js/imagen_tipo.js");
  const res = [{ title: "File:XA-VLE cockpit.pdf" }, { title: "File:Airbus A320 - XA-VLE - Volaris in Guatemala City.jpg" }, { title: "File:XA-VLA.jpg" }];
  const norm = "XAVLE";
  assert.equal(elegirArchivo(res, (t) => t.replace(/[^A-Z0-9]/gi, "").toUpperCase().includes(norm)), "File:Airbus A320 - XA-VLE - Volaris in Guatemala City.jpg");
  assert.equal(elegirArchivo([], () => true), null);
  assert.equal(autorPlano('<a href="//commons.wikimedia.org/wiki/User:X">MHernandezp05</a>'), "MHernandezp05");
  assert.ok(CON_FOTO_REAL.has("civil_comercial") && !CON_FOTO_REAL.has("aviacion_general"));
  assert.equal(await fotoAvionReal({ hex: "abc", subtipo: "aviacion_general" }), null);   // privacidad: no se consulta
});

test("anomalías del catálogo: enlace de Wikipedia en cualquier idioma → imagen del artículo", async () => {
  const { articuloWikipedia } = await import("../../js/imagen_tipo.js");
  assert.deepEqual(articuloWikipedia("https://en.wikipedia.org/wiki/Hessdalen_lights"), { titulo: "Hessdalen lights", exacto: true });
  assert.deepEqual(articuloWikipedia("https://es.wikipedia.org/wiki/Caso_Roswell"), { titulo: "es:Caso Roswell", exacto: true });
  assert.equal(articuloWikipedia("https://www.aaro.mil/"), null);
});

test("foto de avión: rechaza títulos sin relación con aviación (p. ej. un auto con el mismo número)", async () => {
  const { esFotoAvion } = await import("../../js/imagen_tipo.js");
  assert.equal(esFotoAvion("File:Audi A4 3202 (2010).jpg", "C-295", "CASA"), false);
  assert.equal(esFotoAvion("File:Casa Blanca 3202.jpg", "C-295", ""), false);
  assert.equal(esFotoAvion("File:Fuerza Aérea Mexicana C-295 3202.jpg", "C-295", "CASA"), true);
  assert.equal(esFotoAvion("File:XA-AMX Aeromexico Boeing 737.jpg", "737-800", "Boeing"), true);
});

import { hayCubriente } from "../../js/contornos.js";
test("contornos: solo con capas que tapan el mapa base", () => {
  assert.equal(hayCubriente(["fondo", "paises-borde", "clusters"]), false);
  assert.equal(hayCubriente(["fondo", "img-no2_tempo"]), true);
  assert.equal(hayCubriente(["clima-temp"]), true);
  assert.equal(hayCubriente(["tl-eox-2024"]), true);
  assert.equal(hayCubriente(["clima-rayos"]), false);
});

import { mejorHora, haceHoras } from "../../js/imagenes.js";
test("NO₂ TEMPO: salta el barrido incompleto y la noche", async () => {
  const ahora = new Date("2026-10-21T14:30:00Z");
  // 13 UTC: barrido de la mañana a medias; 12 a 23 del día anterior: noche (404); 22 UTC: a medias; 21 y 20: completos.
  const bytes = { "2026-10-21T13": 4000, "2026-10-20T22": 9000, "2026-10-20T21": 18000, "2026-10-20T20": 18200 };
  const pedir = async (url) => {
    const k = url.match(/default\/(\d{4}-\d\d-\d\dT\d\d)/)[1];
    return bytes[k] ? { ok: true, tipo: "image/png", bytes: bytes[k] } : { ok: false, tipo: "text/xml", bytes: 0 };
  };
  assert.equal(await mejorHora({ capa: "TEMPO", matriz: "M", ext: "png" }, pedir, ahora), "2026-10-20T21:00:00Z");
  assert.equal(haceHoras(1, ahora), "2026-10-21T13:00:00Z");
  assert.equal(await mejorHora({ capa: "T", matriz: "M", ext: "png" }, async () => ({ ok: false }), ahora), "default");
});
