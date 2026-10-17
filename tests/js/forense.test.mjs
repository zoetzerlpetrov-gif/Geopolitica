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
