// Mundo corporativo, búsqueda en vivo más allá del catálogo semanal:
// 1. Wikidata (CC0): cualquier organización registrada; su organigrama (dueños, matriz, consejo, dirección, filiales)
//    se arma al momento con una consulta SPARQL. De las personas solo nombre y cargo vigente.
// 2. GLEIF (CC0): 3.4 millones de personas morales con identificador LEI y su estructura legal declarada
//    (matriz directa, matriz última y filiales directas). No contiene personas.
// Las consultas salen del navegador de quien busca, solo al pulsar «Buscar» o abrir una empresa; no usan llaves.
import { esc, safeUrl } from "./util.js";

export const WD_API = "https://www.wikidata.org/w/api.php";
export const WD_SPARQL = "https://query.wikidata.org/sparql";
export const GLEIF_API = "https://api.gleif.org/api/v1";
const TIEMPO_MS = 20000;
// Cargo → propiedad de Wikidata (las mismas del catálogo semanal: tools/corporativo/empresas.py).
const ROLES = [["ceo", "P169"], ["pres", "P488"], ["consejo", "P3320"], ["dir", "P1037"], ["fund", "P112"], ["duenos", "P127"], ["matriz", "P749"], ["filiales", "P355"]];
const MAX = { consejo: 20, dir: 15, filiales: 20, duenos: 12, fund: 8 };
const qidDe = (uri) => String(uri || "").split("/").pop();
const v = (b, k) => b?.[k]?.value || "";

async function json(url, fetcher = fetch) {
  const r = await fetcher(url, { signal: AbortSignal.timeout(TIEMPO_MS), credentials: "omit", referrerPolicy: "no-referrer",
    headers: { Accept: "application/json, application/sparql-results+json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ---------- Wikidata ----------
export function urlBusquedaWD(q) {
  const u = new URL(WD_API);
  for (const [k, x] of Object.entries({ action: "wbsearchentities", search: q, language: "es", uselang: "es", type: "item", limit: "20", format: "json", origin: "*" })) u.searchParams.set(k, x);
  return u.toString();
}

/** De los candidatos de la búsqueda, solo organizaciones (empresa, banco, conglomerado…), con país e industria. */
export function consultaTipos(ids) {
  return `SELECT ?e ?pais ?ind WHERE { VALUES ?e { ${ids.map((i) => `wd:${i}`).join(" ")} }
  ?e wdt:P31/wdt:P279* wd:Q43229.
  OPTIONAL { ?e wdt:P17/wdt:P298 ?pais } OPTIONAL { ?e wdt:P452 ?i. ?i rdfs:label ?ind FILTER(lang(?ind) IN ("es")) } }`;
}

export const urlSparql = (q) => `${WD_SPARQL}?format=json&query=${encodeURIComponent(q)}`;

/** Resultados de wbsearchentities + tipos → [{id, n, desc, pais, ind}] solo de organizaciones, en el orden de la búsqueda. */
export function candidatosWD(busqueda, tipos) {
  const info = {};
  for (const b of tipos?.results?.bindings || []) {
    const q = qidDe(v(b, "e"));
    info[q] ??= { pais: v(b, "pais"), ind: v(b, "ind") };
    info[q].pais ||= v(b, "pais");
    info[q].ind ||= v(b, "ind");
  }
  return (busqueda?.search || []).filter((s) => info[s.id]).map((s) => ({ id: s.id, n: s.label || s.id, desc: s.description || "", ...info[s.id] }));
}

/** Una sola consulta con todo el organigrama de una empresa (cargos vigentes, sin fecha de término). */
export function consultaOrganigrama(qid) {
  const filas = ROLES.map(([c, p]) => `("${c}" p:${p} ps:${p})`).join(" ");
  return `SELECT ?rol ?v ?vLabel ?parte ?cargoLabel ?hum WHERE { VALUES (?rol ?p ?ps) { ${filas} }
  wd:${qid} ?p ?st. ?st ?ps ?v. FILTER NOT EXISTS { ?st pq:P582 ?fin } FILTER NOT EXISTS { ?st wikibase:rank wikibase:DeprecatedRank }
  OPTIONAL { ?st pq:P1107 ?parte } OPTIONAL { ?st pq:P2868 ?cargo } OPTIONAL { ?v wdt:P31 wd:Q5. BIND(1 AS ?hum) }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en,mul". } }`;
}

export function consultaFicha(qid) {
  return `SELECT ?eLabel ?pais ?indLabel ?sedeLabel ?web ?cik ?lei ?bolsaLabel ?tick WHERE {
  BIND(wd:${qid} AS ?e)
  OPTIONAL { ?e wdt:P17/wdt:P298 ?pais } OPTIONAL { ?e wdt:P452 ?ind } OPTIONAL { ?e wdt:P159 ?sede } OPTIONAL { ?e wdt:P856 ?web }
  OPTIONAL { ?e wdt:P5531 ?cik } OPTIONAL { ?e wdt:P1278 ?lei }
  OPTIONAL { ?e p:P414 ?sb. ?sb ps:P414 ?bolsa. FILTER NOT EXISTS { ?sb pq:P582 ?f } OPTIONAL { ?sb pq:P249 ?tick } }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en,mul". } }`;
}

/** Respuestas SPARQL → empresa con la misma forma que el catálogo semanal (htmlOrganigrama la dibuja igual). */
export function empresaDeWD(qid, ficha, organigrama) {
  const e = { id: qid, n: "", pais: "", bolsas: [], vivo: true };
  for (const b of ficha?.results?.bindings || []) {
    e.n ||= v(b, "eLabel");
    e.pais ||= v(b, "pais");
    e.ind ||= v(b, "indLabel") || undefined;
    e.sede ||= v(b, "sedeLabel") || undefined;
    if (v(b, "web").startsWith("http")) e.web ||= v(b, "web");
    e.cik ||= v(b, "cik") || undefined;
    e.lei ||= v(b, "lei") || undefined;
    const par = [v(b, "bolsaLabel"), v(b, "tick")];
    if (par[0] && !e.bolsas.some((x) => x[0] === par[0] && x[1] === par[1])) e.bolsas.push(par);
  }
  const por = {};
  for (const b of organigrama?.results?.bindings || []) {
    const rol = v(b, "rol"), q = qidDe(v(b, "v")), nombre = v(b, "vLabel");
    if (!rol || !nombre || /^Q\d+$/.test(nombre)) continue;  // sin nombre en español ni inglés: no se muestra
    let extra = v(b, "parte") ? `${(Number(v(b, "parte")) * 100).toLocaleString("es-MX", { maximumSignificantDigits: 4 })} %` : v(b, "cargoLabel");
    if (/^Q\d+$/.test(extra)) extra = "";
    const lista = (por[rol] ??= new Map());
    if (!lista.has(q)) lista.set(q, [nombre, q, extra, v(b, "hum") ? 1 : 0]);
  }
  for (const [rol, m] of Object.entries(por)) e[rol] = [...m.values()].slice(0, MAX[rol] || 6);
  e.n ||= qid;
  return e;
}

export async function buscarWD(q, fetcher = fetch) {
  const busqueda = await json(urlBusquedaWD(q), fetcher);
  const ids = (busqueda.search || []).map((s) => s.id).filter((i) => /^Q\d+$/.test(i));
  if (!ids.length) return [];
  return candidatosWD(busqueda, await json(urlSparql(consultaTipos(ids)), fetcher));
}

export async function organigramaWD(qid, fetcher = fetch) {
  if (!/^Q\d+$/.test(qid)) throw new Error("identificador no válido");
  const [ficha, org] = await Promise.all([json(urlSparql(consultaFicha(qid)), fetcher), json(urlSparql(consultaOrganigrama(qid)), fetcher)]);
  return empresaDeWD(qid, ficha, org);
}

// ---------- GLEIF ----------
const LEI_RX = /^[A-Z0-9]{20}$/;
export const urlBusquedaGLEIF = (q) => `${GLEIF_API}/lei-records?filter%5Bentity.legalName%5D=${encodeURIComponent(q)}&page%5Bsize%5D=20`;

/** Registro LEI → {lei, n, pais, ciudad, estado, forma, registrado}. */
export function entidadGLEIF(x) {
  const a = x?.attributes || {}, e = a.entity || {}, d = e.legalAddress || {};
  return { lei: a.lei || x?.id || "", n: e.legalName?.name || "", pais: d.country || e.jurisdiction || "", ciudad: d.city || "",
    estado: e.status || "", forma: e.legalForm?.other || "", registrado: a.registration?.initialRegistrationDate?.slice(0, 10) || "" };
}

export async function buscarGLEIF(q, fetcher = fetch) {
  const d = await json(urlBusquedaGLEIF(q), fetcher);
  return { total: d?.meta?.pagination?.total ?? (d.data || []).length, lista: (d.data || []).map(entidadGLEIF).filter((x) => x.lei && x.n) };
}

/** Estructura legal declarada: registro, matriz directa, matriz última y filiales directas (las primeras 30). */
export async function estructuraGLEIF(lei, fetcher = fetch) {
  if (!LEI_RX.test(lei)) throw new Error("LEI no válido");
  const uno = (ruta) => json(`${GLEIF_API}/lei-records/${lei}${ruta}`, fetcher).then((d) => d.data || null).catch(() => null);
  const [reg, directa, ultima, hijas] = await Promise.all([uno(""), uno("/direct-parent"), uno("/ultimate-parent"),
    json(`${GLEIF_API}/lei-records/${lei}/direct-children?page%5Bsize%5D=30`, fetcher).catch(() => null)]);
  return { entidad: reg ? entidadGLEIF(reg) : { lei, n: lei }, directa: directa ? entidadGLEIF(directa) : null, ultima: ultima ? entidadGLEIF(ultima) : null,
    filiales: (hijas?.data || []).map(entidadGLEIF), totalFiliales: hijas?.meta?.pagination?.total ?? (hijas?.data || []).length };
}

const btnLei = (x) => `<button type="button" class="txt-btn corp-lei" data-lei="${esc(x.lei)}">${esc(x.n)}</button> <span class="meta">${esc([x.pais, x.ciudad].filter(Boolean).join(", "))}</span>`;

export function htmlEstructuraGLEIF(s) {
  if (!s) return "";
  const e = s.entidad;
  const misma = (a) => a && a.lei === e.lei;
  return `<div class="organigrama org-gleif">
    <h4>🏛️ ${esc(e.n)}</h4>
    <p class="meta">LEI ${esc(e.lei)}${e.pais ? ` · ${esc(e.pais)}` : ""}${e.ciudad ? ` (${esc(e.ciudad)})` : ""}${e.estado ? ` · ${esc(e.estado === "ACTIVE" ? "activa" : e.estado.toLowerCase())}` : ""}${e.registrado ? ` · LEI desde ${esc(e.registrado)}` : ""}</p>
    ${s.ultima && !misma(s.ultima) ? `<div class="org-nivel"><div class="org-caja"><h5>Matriz última (quien consolida)</h5><ul><li>🏢 ${btnLei(s.ultima)}</li></ul></div></div><div class="org-flecha" aria-hidden="true">▼</div>` : ""}
    ${s.directa && !misma(s.directa) && s.directa.lei !== s.ultima?.lei ? `<div class="org-nivel"><div class="org-caja"><h5>Matriz directa</h5><ul><li>🏢 ${btnLei(s.directa)}</li></ul></div></div><div class="org-flecha" aria-hidden="true">▼</div>` : ""}
    <div class="org-nivel org-empresa"><b>${esc(e.n)}</b></div>
    ${s.filiales.length ? `<div class="org-flecha" aria-hidden="true">▼</div><div class="org-nivel"><div class="org-caja"><h5>Filiales directas (${s.totalFiliales.toLocaleString("es-MX")}${s.totalFiliales > s.filiales.length ? `, se muestran ${s.filiales.length}` : ""})</h5><ul>${s.filiales.map((f) => `<li>🏢 ${btnLei(f)}</li>`).join("")}</ul></div></div>` : ""}
    ${!s.ultima && !s.directa && !s.filiales.length ? `<p class="meta">GLEIF no tiene matriz ni filiales declaradas para esta entidad (puede no tenerlas o no haberlas reportado).</p>` : ""}
    <p class="meta">Fuente: <a href="${esc(safeUrl(`https://search.gleif.org/#/record/${e.lei}`))}" target="_blank" rel="noopener noreferrer">GLEIF</a> (CC0). Relaciones declaradas por la propia empresa al registrar su LEI; solo incluye entidades con LEI.</p>
  </div>`;
}

export function htmlResultadosVivos({ wd, gleif, errWD, errGLEIF, local }) {
  const wdL = (wd || []).filter((x) => !local?.has(x.id));
  return `<h5>🌐 Wikidata: todas las organizaciones registradas</h5>${errWD ? `<p class="meta">No respondió (${esc(errWD)}). Intenta de nuevo en un minuto.</p>`
      : wdL.length ? `<ul class="lista-corta corp-resultados">${wdL.map((x) => `<li><button type="button" class="mini corp-wd" data-wd="${esc(x.id)}">👔 Ver organigrama</button> <b>${esc(x.n)}</b>
        <span class="meta">${esc([x.pais, x.ind, x.desc].filter(Boolean).join(" · "))}</span></li>`).join("")}</ul>` : `<p class="meta">Sin organizaciones con ese nombre (aparte de las del catálogo).</p>`}
    <h5>🏛️ GLEIF: 3.4 millones de personas morales con LEI</h5>${errGLEIF ? `<p class="meta">No respondió (${esc(errGLEIF)}).</p>`
      : gleif?.lista?.length ? `<ul class="lista-corta corp-resultados">${gleif.lista.map((x) => `<li><button type="button" class="mini corp-lei" data-lei="${esc(x.lei)}">🏛️ Ver estructura</button> <b>${esc(x.n)}</b> <span class="meta">${esc([x.pais, x.ciudad].filter(Boolean).join(", "))}</span></li>`).join("")}</ul>${gleif.total > gleif.lista.length ? `<p class="meta">${gleif.total.toLocaleString("es-MX")} coincidencias; se muestran ${gleif.lista.length}. Escribe el nombre más completo para acotar.</p>` : ""}`
        : `<p class="meta">Sin entidades con ese nombre legal. Prueba con la razón social (p. ej. «Grupo Bimbo S A B de C V»).</p>`}`;
}
