import { test } from "node:test";
import assert from "node:assert/strict";
import { indicios } from "../../js/forense.js";
import { enlaces, ARCHIVOS } from "../../js/documentos.js";

const buf = (s) => new TextEncoder().encode(s).buffer;

test("forense: IA declarada en el archivo", () => {
  assert.equal(indicios(buf("....<Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType>")).nivel, "ia");
  assert.equal(indicios(buf("\x89PNG tEXtparameters\x00a cat, Steps: 20, Sampler: Euler a, CFG scale: 7")).nivel, "ia");
  assert.equal(indicios(buf("digitalsourcetype/compositeWithTrainedAlgorithmicMedia")).nivel, "ia-editada");
  const c = indicios(buf("jumbc2pa claim_generator\":\"Adobe_Firefly/1.0\""));
  assert.equal(c.nivel, "ia");
  assert.match(c.indicios[0].texto, /C2PA/);
});

test("forense: edición y casos sin indicios", () => {
  const e = indicios(buf("JFIF"), { formato: "jpeg", marca: "Apple", modelo: "iPhone 15", software: "Adobe Photoshop 25.0", fecha_toma: "2026:10:01 10:00:00", fecha_archivo: "2026:10:02 09:00:00" });
  assert.equal(e.nivel, "editada");
  assert.ok(e.indicios.some((x) => /fecha de modificación/.test(x.texto)));
  const n = indicios(buf("JFIF"), { formato: "jpeg", marca: "Canon", modelo: "EOS R6" });
  assert.equal(n.nivel, "sin-indicios");
  const s = indicios(buf("JFIF"), { formato: "jpeg", ancho: 1024, alto: 1024 });
  assert.equal(s.nivel, "sin-indicios");  // solo indicios débiles: no cambia el veredicto
  assert.ok(s.indicios.some((x) => /1024×1024/.test(x.texto)));
});

test("documentos: enlaces codificados para cada archivo", () => {
  const l = enlaces("Tlatelolco 1968");
  assert.equal(l.length, ARCHIVOS.length);
  assert.equal(l.find((x) => x.id === "blackvault").url, "https://www.theblackvault.com/documentarchive/?s=Tlatelolco%201968");
  assert.ok(l.every((x) => x.url.startsWith("https://")));
  assert.deepEqual(enlaces(" a "), []);
});

import { noticiasDe, htmlVideos, enlacesVideo } from "../../js/conflictos.js";

test("conflictos: noticias por palabra clave, recientes y sin ejemplos", () => {
  const ahora = Date.parse("2026-10-17T00:00:00Z");
  const ev = [{ titulo: "Ataque con drones en Járkov", resumen: "", fecha_utc: "2026-10-16T10:00:00Z", url: "https://a" },
    { titulo: "Elecciones en Chile", resumen: "", fecha_utc: "2026-10-16T10:00:00Z", url: "https://b" },
    { titulo: "Combates en Donetsk", resumen: "", fecha_utc: "2026-08-01T10:00:00Z", url: "https://c" },
    { titulo: "Kharkiv bajo ataque", resumen: "", fecha_utc: "2026-10-15T10:00:00Z", url: "https://d", es_ejemplo: true }];
  const r = noticiasDe({ palabras: ["járkov", "kharkiv", "donetsk"] }, ev, { ahora });
  assert.deepEqual(r.map((e) => e.url), ["https://a"]);
  assert.match(htmlVideos([], "Ucrania"), /youtube\.com\/results\?search_query=Ucrania/);
  assert.match(htmlVideos([{ video: "abcdefghijk", titulo: "<b>x</b>", canal: "DW", fecha: "2026-10-16" }], "q"), /data-video="abcdefghijk"/);
  assert.equal(enlacesVideo("a b").length, 2);
});
