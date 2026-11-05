// Mundo corporativo: filtros de la lista, búsqueda en el catálogo, enlaces oficiales y organigrama.
import { test } from "node:test";
import assert from "node:assert/strict";
import { filtrarNotas, contarPorCategoria, buscarEmpresas, enlacesOficiales, htmlOrganigrama, htmlNotas } from "../../js/corp_mundo.js";
import { CAPAS_CORP, CATEGORIAS_CORP, CAPAS } from "../../js/riesgos.js";
import { clasificar } from "../../js/amenazas.js";

const AHORA = Date.parse("2026-11-05T12:00:00Z");
const NOTAS = [
  { t: "Nissan cierra planta en México", f: "Expansión", url: "https://x/1", fecha: "2026-11-05T08:00:00Z", cats: ["operaciones", "despidos"], sectores: ["automotriz"], empresas: [], paises: ["MEX"] },
  { t: "Cemex names new CEO", f: "BBC", url: "https://x/2", fecha: "2026-11-01T08:00:00Z", cats: ["directivos"], sectores: [], empresas: [["Cemex", "Q1"]], paises: ["MEX"] },
  { t: "Startup files for bankruptcy", f: "TechCrunch", url: "https://x/3", fecha: "2026-10-10T08:00:00Z", cats: ["quiebra"], sectores: ["tecnologia"], empresas: [], paises: [] },
];
const CAT = { empresas: [
  { id: "Q1", n: "Cemex", en: "Cemex", pais: "MEX", s: 40, cik: "1076378", web: "https://www.cemex.com", bolsas: [["Mexican Stock Exchange", "CEMEXCPO"], ["NYSE", "CX"]],
    ceo: [["Fernando González Olivieri", "Q10", "", 1]], duenos: [["Fondo <X>", "Q20", "5 %", 0]], filiales: [["Cemex USA", "Q2", "", 0]] },
  { id: "Q2", n: "Cemex USA", en: "Cemex USA", pais: "USA", s: 9 },
  { id: "Q3", n: "Toyota", en: "Toyota Motor Corporation", pais: "JPN", s: 120, pres: [["Akio Toyoda", "Q30", "", 1]] },
] };

test("filtros de la lista: categoría, sector, país, periodo, palabras y empresa", () => {
  assert.deepEqual(filtrarNotas(NOTAS, { cat: "despidos" }, AHORA).map((n) => n.url), ["https://x/1"]);
  assert.deepEqual(filtrarNotas(NOTAS, { pais: "MEX", dias: 7 }, AHORA).map((n) => n.url), ["https://x/1", "https://x/2"]);
  assert.deepEqual(filtrarNotas(NOTAS, { pais: "_sin" }, AHORA).map((n) => n.url), ["https://x/3"]);
  assert.deepEqual(filtrarNotas(NOTAS, { dias: 1 }, AHORA).map((n) => n.url), ["https://x/1"]);
  assert.deepEqual(filtrarNotas(NOTAS, { q: "mexico planta" }, AHORA).map((n) => n.url), ["https://x/1"]);
  assert.deepEqual(filtrarNotas(NOTAS, { empresa: "Q1" }, AHORA).map((n) => n.url), ["https://x/2"]);
  assert.deepEqual(filtrarNotas(NOTAS, { sector: "tecnologia" }, AHORA).map((n) => n.url), ["https://x/3"]);
  assert.deepEqual(contarPorCategoria(NOTAS), { operaciones: 1, despidos: 1, directivos: 1, quiebra: 1 });
});

test("búsqueda por nombre, clave de cotización o persona", () => {
  assert.equal(buscarEmpresas(CAT, "cemex")[0].e.id, "Q1");
  assert.equal(buscarEmpresas(CAT, "CX")[0].e.id, "Q1");
  const p = buscarEmpresas(CAT, "toyoda");
  assert.equal(p[0].e.id, "Q3");
  assert.match(p[0].por, /Akio Toyoda · presidente del consejo/);
  assert.deepEqual(buscarEmpresas(CAT, "x"), []);
});

test("enlaces oficiales según el país y los datos de la empresa", () => {
  const e = enlacesOficiales(CAT.empresas[0]).map(([, u]) => u).join(" ");
  assert.match(e, /CIK=0001076378/);
  assert.match(e, /bmv\.com\.mx/);
  assert.match(e, /wikidata\.org\/wiki\/Q1/);
  assert.doesNotMatch(enlacesOficiales(CAT.empresas[2]).map(([, u]) => u).join(" "), /sec\.gov|bmv/);
});

test("organigrama: de dueños a filiales, escapado y con enlaces internos", () => {
  const porId = Object.fromEntries(CAT.empresas.map((e) => [e.id, e]));
  const h = htmlOrganigrama(CAT.empresas[0], { porId, notas: NOTAS, nombrePais: () => "México" });
  assert.ok(h.indexOf("Dueños y accionistas") < h.indexOf("Dirección general (CEO)") && h.indexOf("Dirección general") < h.indexOf("Filiales principales"));
  assert.match(h, /Fondo &lt;X&gt;/);
  assert.match(h, /data-org="Q2"/);  // la filial está en el catálogo: se puede abrir su organigrama
  assert.match(h, /href="https:\/\/www\.wikidata\.org\/wiki\/Q10"/);  // la persona enlaza a la fuente
  assert.match(h, /Cemex names new CEO/);
  assert.match(htmlOrganigrama(CAT.empresas[1], { porId }), /no tiene cargos vigentes/);
  assert.match(htmlNotas(NOTAS), /3 notas/);
});

test("una capa por categoría, en el menú corporativo, con ícono propio", () => {
  assert.equal(CAPAS_CORP.length, CATEGORIAS_CORP.length);
  for (const c of CAPAS_CORP) assert.ok(CAPAS.includes(c) && c.menu === "corporativo" && c.noAmenaza);
  const fc = { features: [{ properties: { cat: "despidos" } }, { properties: { cat: "quiebra" } }] };
  assert.equal(CAPAS_CORP.find((c) => c.id === "corp_despidos").derivar(fc).features.length, 1);
  assert.equal(clasificar("corp_despidos", { icono: "✂️", n_7d: 7, cat_nombre: "Despidos" }).ic, "✂️");
});
