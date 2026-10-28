// Fase 3 (Investigación): patentes públicas, tecnologías que publican las agencias, tecnologías usadas por el crimen
// (enfoque defensivo) y empresas extranjeras que operan en México. Funciones puras: arman enlaces y HTML a partir de
// los catálogos de config/ y de vivos/empresas_extranjeras_mx.json; no copian bases ajenas.
import { esc, safeUrl, sinAcentos, MIN_BUSQUEDA } from "./util.js";

const enlace = (t, u) => `<a href="${esc(safeUrl(u))}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>`;
const contiene = (txt, q) => sinAcentos(txt).includes(sinAcentos(q));

// ---------------------------------------------------------------- Patentes

/** {q, titular, pais, cpc, desde} → [[nombre, url]] para cada buscador del catálogo. */
export function enlacesPatentes(cat, { q = "", titular = "", pais = "", cpc = "", desde = "" } = {}) {
  q = q.trim(); titular = titular.trim(); pais = pais.trim().toUpperCase(); cpc = cpc.trim().toUpperCase();
  const anio = /^\d{4}$/.test(String(desde).trim()) ? String(desde).trim() : "";
  const e = encodeURIComponent;
  // Espacenet usa CQL: ctxt (texto), cpc, pa (titular), pd (fecha de publicación).
  const cql = [q && `ctxt all "${q.replace(/"/g, "")}"`, cpc && `cpc any "${cpc}"`, titular && `pa all "${titular.replace(/"/g, "")}"`,
    anio && `pd >= ${anio}0101`].filter(Boolean).join(" AND ");
  // PATENTSCOPE: campos IC (clasificación; las subclases CPC de defensa también existen en la IPC) y PA (titular).
  const ps = [q, cpc && `IC:${cpc}`, titular && `PA:(${titular})`, pais && `OF:${pais}`].filter(Boolean).join(" AND ");
  const v = {
    q: e(q), espacenet: e(cql), patentscope: e(ps),
    cpc_google: cpc ? `&cpc=${e(cpc)}` : "", titular_google: titular ? `&assignee=${e(titular)}` : "",
    pais_google: pais ? `&country=${e(pais)}` : "", desde_google: anio ? `&after=priority:${anio}0101` : "",
  };
  return (cat?.buscadores || []).map((b) => [b.nombre, b.url.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "")]);
}

export function htmlPatentes(cat, filtros) {
  const vacio = !filtros.q?.trim() && !filtros.titular?.trim() && !filtros.cpc;
  if (vacio) return `<p class="meta">Escribe una palabra, un titular o elige una clase para armar la búsqueda.</p>`;
  return `<ul class="fuentes">${enlacesPatentes(cat, filtros).map(([n, u]) => `<li>${enlace(n, u)}</li>`).join("")}</ul>`;
}

/** Opciones del selector de clases CPC, agrupadas. */
export const opcionesCpc = (cat) => `<option value="">Cualquier clase</option>` + (cat?.grupos || []).map((g) =>
  `<optgroup label="${esc(g.nombre)}">${g.clases.map(([c, n]) => `<option value="${esc(c)}">${esc(c)} · ${esc(n)}</option>`).join("")}</optgroup>`).join("");

// ---------------------------------------------------------------- Tecnologías de agencias

export const TIPOS_AGENCIA = { defensa: "Defensa", inteligencia: "Inteligencia", seguridad: "Seguridad", espacio: "Espacio" };

export function filtrarAgencias(cat, { q = "", tipo = "" } = {}) {
  q = q.trim();
  return (cat?.agencias || []).filter((a) => (!tipo || a.tipo === tipo)
    && (q.length < MIN_BUSQUEDA || contiene([a.nombre, ...(a.ejemplos || []).flat()].join(" "), q)));
}

export function htmlAgencias(lista) {
  if (!lista.length) return `<p class="meta">Sin coincidencias.</p>`;
  return `<ul class="fuentes">${lista.map((a) => `<li>${enlace(a.nombre, a.url)} <span class="meta">· ${esc(TIPOS_AGENCIA[a.tipo] || a.tipo)} · ${esc(a.pais)}</span>${
    a.ejemplos?.length ? `<ul class="lista-corta">${a.ejemplos.map(([n, d]) => `<li><b>${esc(n)}</b>: ${esc(d)}</li>`).join("")}</ul>` : ""}</li>`).join("")}</ul>`;
}

// ---------------------------------------------------------------- Tecnologías en el crimen (defensivo)

export function filtrarCrimen(cat, q = "") {
  q = q.trim();
  return (cat?.tecnologias || []).filter((t) => q.length < MIN_BUSQUEDA
    || contiene([t.nombre, t.region, t.uso, t.norma, ...(t.indicadores || []), ...(t.contramedidas || [])].join(" "), q));
}

export function htmlCrimen(lista) {
  if (!lista.length) return `<p class="meta">Sin coincidencias.</p>`;
  const ul = (xs) => `<ul class="lista-corta">${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
  return lista.map((t) => `<details class="guia-inv"><summary><b>${esc(t.nombre)}</b> <span class="meta">· ${esc(t.region)}</span></summary>
    <p>${esc(t.uso)}</p>
    <p class="meta">Cómo reconocerla</p>${ul(t.indicadores || [])}
    <p class="meta">Qué hace la autoridad o la empresa</p>${ul(t.contramedidas || [])}
    ${t.norma ? `<p class="meta">Norma: ${esc(t.norma)}</p>` : ""}${t.capa ? `<p class="meta">En el mapa: ${esc(t.capa)}</p>` : ""}</details>`).join("");
}

// ---------------------------------------------------------------- Empresas extranjeras en México

/** Países de las matrices con su número de registros, de mayor a menor. */
export function paisesExtranjeras(d) {
  const n = {};
  for (const r of d?.empresas || []) if (r.iso) (n[r.iso] ??= { iso: r.iso, pais: r.pais, n: 0 }).n++;
  return Object.values(n).sort((a, b) => b.n - a.n || a.pais.localeCompare(b.pais, "es"));
}

/** Industrias distintas (las 60 más frecuentes). */
export function industriasExtranjeras(d) {
  const n = {};
  for (const r of d?.empresas || []) for (const i of r.industrias || []) n[i] = (n[i] || 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es")).slice(0, 60).map(([i]) => i);
}

export function filtrarExtranjeras(d, { q = "", iso = "", industria = "" } = {}, max = 200) {
  q = q.trim();
  const res = (d?.empresas || []).filter((r) => (!iso || r.iso === iso) && (!industria || (r.industrias || []).includes(industria))
    && (q.length < MIN_BUSQUEDA || contiene(`${r.matriz} ${r.filial} ${(r.industrias || []).join(" ")}`, q)));
  return { total: res.length, filas: res.slice(0, max) };
}

const VIAS = { filial_en_mexico: "filial registrada en México", declara_filial: "la matriz declara filial en México", opera_en_mexico: "la matriz declara operar en México" };

export function htmlExtranjeras(d, { total, filas }, nombrePais = (iso, p) => p) {
  if (!total) return `<p class="meta">Sin coincidencias en el catálogo. Wikidata está incompleta: prueba la búsqueda en GLEIF de abajo.</p>`;
  const wd = (q) => `https://www.wikidata.org/wiki/${encodeURIComponent(q)}`;
  return `<p class="meta">${total} registro(s)${total > filas.length ? `, se muestran ${filas.length}` : ""} · fuente: ${esc(d.fuente || "Wikidata")}</p><ul class="fuentes">${filas.map((r) =>
    `<li>${enlace(r.matriz, r.web || wd(r.matriz_qid))} <span class="meta">(${esc(nombrePais(r.iso, r.pais))})</span>${r.filial ? ` → ${enlace(r.filial, wd(r.filial_qid))}` : ""}
      <br><span class="meta">${r.industrias?.length ? `${esc(r.industrias.slice(0, 3).join(", "))} · ` : ""}${esc((r.vias || []).map((v) => VIAS[v] || v).join("; "))} · ${enlace("Wikidata", wd(r.matriz_qid))}</span></li>`).join("")}</ul>`;
}

// GLEIF (Global Legal Entity Identifier Foundation): API pública sin llave, con CORS.
export const GLEIF_API = "https://api.gleif.org/api/v1";

export function urlGleifMx(q, n = 20) {
  const p = new URLSearchParams({ "filter[fulltext]": q.trim(), "filter[entity.legalAddress.country]": "MX", "page[size]": String(n) });
  return `${GLEIF_API}/lei-records?${p}`;
}

/** Registro LEI → {lei, nombre, ciudad, estado} */
export const filaGleif = (x) => ({ lei: x.id, nombre: x.attributes?.entity?.legalName?.name || x.id,
  ciudad: x.attributes?.entity?.legalAddress?.city || "", estado: x.attributes?.entity?.status || "" });

/** Respuesta de /ultimate-parent → {lei, nombre, pais} o null. */
export function matrizGleif(r) {
  const x = r?.data;
  if (!x?.id) return null;
  return { lei: x.id, nombre: x.attributes?.entity?.legalName?.name || x.id, pais: x.attributes?.entity?.legalAddress?.country || "" };
}

export function htmlGleif(filas) {
  if (!filas.length) return `<p class="meta">GLEIF no tiene entidades registradas en México con ese nombre.</p>`;
  const g = (lei) => `https://search.gleif.org/#/record/${encodeURIComponent(lei)}`;
  return `<ul class="fuentes">${filas.map((f) => `<li>${enlace(f.nombre, g(f.lei))} <span class="meta">· ${esc(f.ciudad)} · LEI ${esc(f.lei)}</span><br><span class="meta">${
    f.matriz === undefined ? "Buscando matriz…" : f.matriz ? `Matriz última: ${enlace(f.matriz.nombre, g(f.matriz.lei))} (${esc(f.matriz.pais)})${f.matriz.pais && f.matriz.pais !== "MX" ? " · <b>extranjera</b>" : ""}`
      : "Sin matriz reportada a GLEIF"}</span></li>`).join("")}</ul>`;
}

export const FUENTES_EXTRANJERAS = [
  ["Secretaría de Economía: inversión extranjera directa por país y sector", "https://www.gob.mx/se/acciones-y-programas/competitividad-y-normatividad-inversion-extranjera-directa"],
  ["Data México: inversión extranjera por estado, país y actividad", "https://www.economia.gob.mx/datamexico/"],
  ["Bolsa Mexicana de Valores: emisoras (incluye extranjeras listadas)", "https://www.bmv.com.mx/es/emisoras/informacion-de-emisoras"],
  ["INEGI DENUE: establecimientos por nombre y actividad", "https://www.inegi.org.mx/app/mapa/denue/"],
  ["GLEIF: buscador de identificadores LEI", "https://search.gleif.org/"],
];
