import { test } from "node:test";
import assert from "node:assert/strict";
import { problemas, vigentes, estado, calendario, vozCompleta, armarArchivo, revisarLogo, slug, urlEditar } from "../../js/patrocinios_admin.js";

const reglas = { max_por_video: 2, categorias_prohibidas: ["apuestas"] };
const ok = { id: "a", activo: true, marca: "Marca A", categoria: "servicios", posicion: "pausa", desde: "2026-12-01", hasta: "2026-12-31", voz: "Hola.", pantalla: "Texto", enlace: "https://a.mx", contrato: "OI-1" };

test("reglas iguales a las del video", () => {
  assert.deepEqual(problemas(ok, reglas), []);
  assert.ok(problemas({ ...ok, categoria: "apuestas" }, reglas).some((x) => x.includes("categoría")));
  assert.ok(problemas({ ...ok, voz: "Última hora: compra" }, reglas).some((x) => x.includes("noticia")));
  assert.ok(problemas({ ...ok, enlace: "http://a.mx" }, reglas).some((x) => x.includes("https")));
  assert.ok(problemas({ ...ok, contrato: "" }, reglas).some((x) => x.includes("contrato")));
  assert.ok(problemas({ ...ok, voz: "x".repeat(321) }, reglas).length);
});

test("vigencia, días y tope por video", () => {
  const cfg = { reglas: { ...reglas, max_por_video: 1 }, campanias: [ok, { ...ok, id: "b", marca: "B" }, { ...ok, id: "c", marca: "C", dias: ["lun"] }] };
  assert.deepEqual(vigentes(cfg, "2026-12-02").map((c) => c.marca), ["Marca A"]);   // tope 1
  assert.equal(vigentes(cfg, "2026-11-30").length, 0);                                // antes de la fecha
  assert.equal(estado(cfg.campanias[1], cfg, "2026-12-02").cls, "prox");             // vigente pero no sale (tope)
  assert.equal(estado(ok, cfg, "2027-01-05").t, "✔️ Terminada");
  const cal = calendario(cfg, "2026-12-01", 7);
  assert.equal(cal.length, 7);
  assert.equal(cal[0].dia, "mar");                                                   // 1 dic 2026 es martes
});

test("voz completa, archivo y utilidades", () => {
  assert.match(vozCompleta(ok), /^Mensaje patrocinado por Marca A\. Hola\. Fin del mensaje patrocinado/);
  assert.doesNotMatch(vozCompleta({ ...ok, posicion: "cierre" }), /Fin del mensaje/);
  const txt = armarArchivo({ _instrucciones: "x", reglas, campanias: [{ ...ok, alias: [], logo: "" }] });
  const j = JSON.parse(txt);
  assert.equal(j.campanias[0].alias, undefined);
  assert.equal(j.reglas.max_por_video, 2);
  assert.equal(revisarLogo({ name: "a.gif", size: 10 }), "El logo debe ser PNG, JPG, WEBP o SVG.");
  assert.match(revisarLogo({ name: "a.png", size: 600 * 1024 }), /512 KB/);
  assert.equal(revisarLogo({ name: "a.png", size: 1000 }), "");
  assert.equal(slug("Café Ñandú S.A."), "cafe-nandu-s-a");
  assert.equal(urlEditar(), "https://github.com/zoetzerlpetrov-gif/Geopolitica/edit/main/config/patrocinios.json");
});
