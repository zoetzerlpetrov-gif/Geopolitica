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

test("búsqueda en vivo: Wikidata (solo organizaciones) y organigrama con la misma forma que el catálogo", async () => {
  const V = await import("../../js/corp_vivo.js");
  const respuestas = (url) => {
    if (url.includes("wbsearchentities")) return { search: [{ id: "Q1", label: "Bimbo", description: "empresa" }, { id: "Q2", label: "Bimbo (canción)" }] };
    const q = decodeURIComponent(url.split("query=")[1] || "");
    if (q.includes("wd:Q43229")) return { results: { bindings: [{ e: { value: "http://www.wikidata.org/entity/Q1" }, pais: { value: "MEX" }, ind: { value: "alimentos" } }] } };
    if (q.includes("?rol ?v")) return { results: { bindings: [
      { rol: { value: "ceo" }, v: { value: "http://www.wikidata.org/entity/Q10" }, vLabel: { value: "Daniel Servitje" }, hum: { value: "1" } },
      { rol: { value: "duenos" }, v: { value: "http://www.wikidata.org/entity/Q20" }, vLabel: { value: "Familia X" }, parte: { value: "0.37" } },
      { rol: { value: "filiales" }, v: { value: "http://www.wikidata.org/entity/Q30" }, vLabel: { value: "Q30" } }] } };
    return { results: { bindings: [{ eLabel: { value: "Grupo Bimbo" }, pais: { value: "MEX" }, lei: { value: "5493000RIXURZEBFEV60" }, bolsaLabel: { value: "BMV" }, tick: { value: "BIMBOA" } }] } };
  };
  const fetcher = async (url) => ({ ok: true, json: async () => respuestas(url) });
  const c = await V.buscarWD("bimbo", fetcher);
  assert.deepEqual(c.map((x) => x.id), ["Q1"]);  // la canción no es organización
  const e = await V.organigramaWD("Q1", fetcher);
  assert.equal(e.n, "Grupo Bimbo");
  assert.deepEqual(e.ceo, [["Daniel Servitje", "Q10", "", 1]]);
  assert.equal(e.duenos[0][2], "37 %");
  assert.equal(e.filiales, undefined);  // sin nombre legible no se muestra
  assert.equal(e.lei, "5493000RIXURZEBFEV60");
  assert.deepEqual(e.bolsas, [["BMV", "BIMBOA"]]);
  await assert.rejects(() => V.organigramaWD("Q1; DROP", fetcher));
  const h = htmlOrganigrama(e, {});
  assert.match(h, /consultada en este momento/);
  assert.match(h, /data-lei="5493000RIXURZEBFEV60"/);
  assert.match(h, /data-wd="Q20"/);  // un dueño que es organización se abre en vivo
});

test("GLEIF: estructura legal con matriz última, directa y filiales", async () => {
  const V = await import("../../js/corp_vivo.js");
  const reg = (lei, n, pais) => ({ id: lei, attributes: { lei, entity: { legalName: { name: n }, legalAddress: { country: pais, city: "X" }, status: "ACTIVE" } } });
  const fetcher = async (url) => ({ ok: !url.endsWith("/direct-parent"), status: 404, json: async () => (
    url.includes("direct-children") ? { meta: { pagination: { total: 18 } }, data: [reg("984500FEES8936E86D53", "GRUPO BIMBO UK LIMITED", "GB")] }
      : url.includes("ultimate-parent") ? { data: reg("5493000RIXURZEBFEV60", "GRUPO BIMBO S A B DE C V", "MX") }
        : url.includes("filter") ? { meta: { pagination: { total: 2 } }, data: [reg("984500FEES8936E86D53", "GRUPO BIMBO UK LIMITED", "GB")] }
          : { data: reg("984500FEES8936E86D53", "GRUPO BIMBO UK LIMITED", "GB") }) });
  const b = await V.buscarGLEIF("grupo bimbo", fetcher);
  assert.equal(b.total, 2);
  const s = await V.estructuraGLEIF("984500FEES8936E86D53", fetcher);
  assert.equal(s.ultima.n, "GRUPO BIMBO S A B DE C V");
  assert.equal(s.directa, null);  // 404: sin matriz directa declarada
  assert.equal(s.totalFiliales, 18);
  const h = V.htmlEstructuraGLEIF(s);
  assert.ok(h.indexOf("Matriz última") < h.indexOf("Filiales directas"));
  assert.match(h, /18, se muestran 1/);
  await assert.rejects(() => V.estructuraGLEIF("../x", fetcher));
});
