// Mundo corporativo: lista de noticias de empresas con filtros (categoría, sector, país, palabras) y organigrama público
// de cada empresa (dueños, matriz, consejo, dirección, fundadores y filiales) desde Wikidata (CC0).
// Datos: data/vivos/corporativo_estado.json (notas de 30 días) y data/vivos/corporativo_empresas.json (catálogo semanal).
// De las personas solo se muestra el nombre y el cargo que ocupan en la empresa, con enlace a Wikidata.
import { esc, safeUrl, getJSON, sinAcentos } from "./util.js";
import { CATEGORIAS_CORP, htmlEmpresasCorp } from "./riesgos.js";
import * as V from "./corp_vivo.js";

const URL_NOTAS = "data/vivos/corporativo_estado.json";
const URL_EMPRESAS = "data/vivos/corporativo_empresas.json";
const URL_MAPA = "data/vivos/corporativo.geojson";
const URL_CAMBIOS = "config/corporativo_cambios.json";   // cambios verificados que Wikidata aún no tiene
const URL_8K = "data/vivos/corporativo_8k.json";        // 8-K con punto 5.02 (salida o nombramiento de directivos)

/**
 * Aplica a una empresa del catálogo los cambios verificados (config/corporativo_cambios.json): reemplaza la dirección
 * general y la presidencia del consejo, quita a quien salió de las demás cajas y deja el aviso con su fuente. También
 * agrega los 8-K con punto 5.02 de los últimos 45 días (aviso automático; el detalle está en el documento).
 */
export function conCambios(e, cambios, ochoK) {
  if (!e) return e;
  const c = cambios?.empresas?.[e.id];
  const k = e.cik ? ochoK?.cambios?.[String(e.cik).padStart(10, "0")] : null;
  if (!c && !k?.length) return e;
  const out = { ...e, avisos: [] };
  if (c) {
    const sale = new Set(c.salen || []);
    for (const campo of ["ceo", "pres", "consejo", "dir"]) if (out[campo]) out[campo] = out[campo].filter((x) => !sale.has(x[1]));
    if (c.ceo) out.ceo = c.ceo;
    if (c.pres) out.pres = c.pres;
    out.avisos.push({ fecha: c.fecha, texto: c.resumen, fuente: c.fuente, url: c.url, verificado: true });
  }
  for (const x of k || []) {
    if (c && x.url === c.url) continue;
    out.avisos.push({ fecha: x.fecha, texto: `La empresa reportó a la SEC un cambio de directivos o del consejo (8-K, punto 5.02). El organigrama puede estar desactualizado hasta que Wikidata lo refleje.`, fuente: `SEC EDGAR, ${x.forma || "8-K"}`, url: x.url });
  }
  return out;
}
const WD = (q) => `https://www.wikidata.org/wiki/${encodeURIComponent(q)}`;
const MAX_LISTA = 60;
// ISO3 → ISO2 (GLEIF usa ISO2) para elegir sola la entidad legal del país de la empresa.
const ISO2 = { MEX: "MX", USA: "US", CAN: "CA", BRA: "BR", ARG: "AR", CHL: "CL", COL: "CO", PER: "PE", ESP: "ES", PRT: "PT", GBR: "GB", IRL: "IE",
  FRA: "FR", DEU: "DE", ITA: "IT", NLD: "NL", BEL: "BE", LUX: "LU", CHE: "CH", AUT: "AT", SWE: "SE", NOR: "NO", DNK: "DK", FIN: "FI", POL: "PL",
  RUS: "RU", TUR: "TR", ISR: "IL", SAU: "SA", ARE: "AE", ZAF: "ZA", IND: "IN", CHN: "CN", HKG: "HK", TWN: "TW", JPN: "JP", KOR: "KR", SGP: "SG", AUS: "AU" };
const CAT = Object.fromEntries(CATEGORIAS_CORP.map(([k, n, ic, g]) => [k, { n, ic, g }]));
// Nombre corto para las etiquetas de la lista.
const CORTO = { quiebra: "Quiebra", fraude: "Fraude", despidos: "Despidos", competencia: "Competencia", litigio: "Demanda", regulacion: "Multa o regulador",
  directivos: "Directivos", consejo: "Consejo y accionistas", fusiones: "Fusión o compra", inversion: "Inversión", resultados: "Resultados", bolsa: "Bolsa y deuda",
  precios: "Precios", laboral: "Laboral", operaciones: "Plantas y operación", ciber: "Ciber", esg: "ESG", marca: "Marca"};

/** Notas que pasan los filtros, lo más reciente primero. `f` = {cat, sector, pais, q, dias, empresa}. */
export function filtrarNotas(notas, f = {}, ahora = Date.now()) {
  const desde = f.dias ? new Date(ahora - f.dias * 86400000).toISOString() : "";
  const palabras = sinAcentos(f.q || "").split(/\s+/).filter((p) => p.length >= 3);
  return (notas || []).filter((n) => (!f.cat || (n.cats || []).includes(f.cat))
      && (!f.sector || (n.sectores || []).includes(f.sector))
      && (!f.pais || (f.pais === "_sin" ? !(n.paises || []).length : (n.paises || [])[0] === f.pais))
      && (!f.empresa || (n.empresas || []).some((e) => e[1] === f.empresa))
      && (!desde || (n.fecha || "") >= desde)
      && (!palabras.length || palabras.every((p) => sinAcentos(`${n.t} ${(n.empresas || []).map((e) => e[0]).join(" ")} ${n.f}`).includes(p))))
    .sort((a, b) => ((a.fecha || "") < (b.fecha || "") ? 1 : -1));
}

/** Conteo de notas por categoría (para las opciones del filtro). */
export function contarPorCategoria(notas) {
  const c = {};
  for (const n of notas || []) for (const k of n.cats || []) c[k] = (c[k] || 0) + 1;
  return c;
}

const ROLES_PERSONA = [["ceo", "Director general (CEO)"], ["pres", "Presidente del consejo"], ["consejo", "Consejo de administración"],
  ["dir", "Directivos"], ["fund", "Fundadores"]];

/** Empresas cuyo nombre, clave de cotización o alguna persona con cargo coincide con `q`. */
export function buscarEmpresas(cat, q, max = 30) {
  const t = sinAcentos(q || "").trim();
  if (t.length < 2) return [];
  const out = [];
  for (const e of cat?.empresas || []) {
    const nombres = sinAcentos(`${e.n} ${e.en || ""}`);
    const ticks = (e.bolsas || []).map((b) => sinAcentos(b[1] || ""));
    if (nombres.includes(t) || ticks.includes(t)) { out.push({ e, por: "", peso: nombres.startsWith(t) || ticks.includes(t) ? 0 : 1 }); continue; }
    for (const [clave, etiqueta] of ROLES_PERSONA) {
      const p = (e[clave] || []).find((x) => sinAcentos(x[0]).includes(t));
      if (p) { out.push({ e, por: `${p[0]} · ${etiqueta.toLowerCase()}`, peso: 2 }); break; }
    }
    if (out.length >= max * 4) break;
  }
  return out.sort((a, b) => a.peso - b.peso || b.e.s - a.e.s).slice(0, max);
}

/** Enlaces para confirmar en registros oficiales; dependen del país y de los datos de la empresa. */
export function enlacesOficiales(e) {
  const n = encodeURIComponent(e.en || e.n);
  const out = [["Wikidata (fuente de este organigrama)", WD(e.id)]];
  if (e.web) out.push(["Sitio oficial de la empresa (informe anual, gobierno corporativo)", e.web]);
  if (e.cik) {
    const cik = String(e.cik).padStart(10, "0");
    out.push(["SEC EDGAR: reportes 10-K y DEF 14A (consejo y sueldos de directivos)", `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=DEF+14A&dateb=&owner=include&count=40`]);
    out.push(["SEC EDGAR: dueños con más de 5 % (formas 13D/13G) y compras de directivos (forma 4)", `https://www.sec.gov/edgar/browse/?CIK=${cik}`]);
  }
  if (e.pais === "MEX") {
    out.push(["BMV: información de emisoras (reporte anual, eventos relevantes)", "https://www.bmv.com.mx/es/emisoras/informacion-de-emisoras"]);
    out.push(["BIVA: emisoras", "https://www.biva.mx/empresas/emisoras_inscritas/emisoras_inscritas"]);
    out.push(["Registro Público de Comercio (Secretaría de Economía, SIGER)", "https://rpc.economia.gob.mx/siger2/xhtml/login/login.xhtml"]);
  }
  if (e.pais === "GBR") out.push(["Companies House: directores y dueños con control significativo (PSC)", `https://find-and-update.company-information.service.gov.uk/search/companies?q=${n}`]);
  if (e.pais === "ESP") out.push(["CNMV: consejeros y participaciones significativas", "https://www.cnmv.es/portal/Consultas/Busqueda.aspx"]);
  if (e.pais === "BRA") out.push(["CVM: formulário de referência (administradores y accionistas)", "https://www.rad.cvm.gov.br/ENET/frmConsultaExternaCVM.aspx"]);
  out.push(["GLEIF: identificador LEI y matriz última", `https://search.gleif.org/#/search/simpleSearch=${n}`]);
  out.push(["OpenCorporates: registros mercantiles de varios países", `https://opencorporates.com/companies?q=${n}`]);
  return out;
}

const persona = (x, porId) => {
  const enCat = porId?.[x[1]];
  // Empresa del catálogo: su organigrama; otra organización: se arma en vivo desde Wikidata; persona: enlace a la fuente.
  // Sin id de Wikidata (cambio verificado que Wikidata aún no tiene): solo el nombre.
  const nombre = !x[1] ? esc(x[0]) : enCat ? `<button type="button" class="txt-btn corp-org" data-org="${esc(x[1])}">${esc(x[0])}</button>`
    : !x[3] ? `<button type="button" class="txt-btn corp-wd" data-wd="${esc(x[1])}">${esc(x[0])}</button>`
      : `<a href="${esc(WD(x[1]))}" target="_blank" rel="noopener noreferrer">${esc(x[0])}</a>`;
  return `<li>${x[3] ? "👤 " : "🏢 "}${nombre}${x[2] ? ` <span class="meta">· ${esc(x[2])}</span>` : ""}</li>`;
};
const caja = (titulo, filas, porId, clase = "") => (filas?.length ? `<div class="org-caja ${clase}"><h5>${titulo}</h5><ul>${filas.map((x) => persona(x, porId)).join("")}</ul></div>` : "");

/** Organigrama público de una empresa, de arriba (dueños) hacia abajo (filiales). */
export function htmlOrganigrama(e, { porId = {}, notas = [], nombrePais = (i) => i } = {}) {
  if (!e) return `<p class="meta">No encontré la empresa en el catálogo.</p>`;
  const arriba = caja("Dueños y accionistas registrados", e.duenos, porId) + caja("Empresa matriz", e.matriz, porId);
  const consejo = caja("Presidencia del consejo", e.pres, porId) + caja("Miembros del consejo", e.consejo, porId);
  const direccion = caja("Dirección general (CEO)", e.ceo, porId) + caja("Otros directivos", e.dir, porId);
  const abajo = caja("Filiales principales", e.filiales, porId) + caja("Fundadores", e.fund, porId, "org-lado");
  const flecha = `<div class="org-flecha" aria-hidden="true">▼</div>`;
  // Niveles de arriba (dueños) hacia abajo (filiales), con una flecha solo ENTRE niveles que existen.
  const niveles = [arriba, `<b>${esc(e.n)}</b>`, consejo, direccion, abajo].map((h, i) => (h ? `<div class="org-nivel${i === 1 ? " org-empresa" : ""}">${h}</div>` : "")).filter(Boolean);
  const notasE = notas.filter((n) => (n.empresas || []).some((x) => x[1] === e.id)).slice(0, 8);
  const vacio = !(e.ceo || e.pres || e.consejo || e.dir || e.duenos || e.matriz || e.filiales || e.fund);
  const avisos = (e.avisos || []).map((a) => `<p class="aviso-org">⚠️ <b>${esc(a.fecha)}</b> · ${esc(a.texto)} <a href="${esc(safeUrl(a.url))}" target="_blank" rel="noopener noreferrer">${esc(a.fuente)}</a>${a.verificado ? " · cambio aplicado a este organigrama" : ""}</p>`).join("");
  return `<div class="organigrama">
    <h4>👔 ${esc(e.n)}</h4>
    ${avisos}
    <p class="meta">${[e.pais ? nombrePais(e.pais) : "", e.ind, e.sede ? `sede: ${e.sede}` : "", ...(e.bolsas || []).map(([b, t]) => (t ? `${t} (${b})` : b))].filter(Boolean).map(esc).join(" · ")}</p>
    ${niveles.join(flecha)}
    ${vacio ? `<p class="meta">Wikidata no tiene cargos vigentes registrados para esta empresa. Abajo va su estructura legal según GLEIF; revisa también su informe anual o los registros oficiales.</p>` : ""}
    <p><button type="button" class="mini corp-gleif-q" data-q="${esc(e.en || e.n)}" data-lei="${esc(e.lei || "")}" data-pais="${esc(ISO2[e.pais] || "")}">🏛️ Estructura legal en GLEIF (matriz y filiales registradas)</button></p>
    <div class="corp-gleif-res" aria-live="polite"></div>
    <p class="meta">Fuente: Wikidata (CC0)${e.vivo ? ", consultada en este momento" : ", catálogo semanal"}; la editan voluntarios: puede faltar gente o haber cargos atrasados. Solo se muestran cargos sin fecha de término.
      Confirma en los reportes oficiales antes de usar el dato.</p>
    ${notasE.length ? `<h5>Noticias recientes de la empresa</h5><ul class="fuentes">${notasE.map((n) => `<li><a href="${esc(safeUrl(n.url))}" target="_blank" rel="noopener noreferrer">${esc(n.t)}</a> <span class="meta">${esc(n.f)} · ${esc((n.fecha || "").slice(0, 10))}</span></li>`).join("")}</ul>` : ""}
    <h5>Dónde confirmar</h5><ul class="fuentes">${enlacesOficiales(e).map(([t, u]) => `<li><a href="${esc(safeUrl(u))}" target="_blank" rel="noopener noreferrer">${esc(t)}</a></li>`).join("")}</ul>
  </div>`;
}

export function htmlNotas(lista, { nombrePais = (i) => i, total = lista.length } = {}) {
  if (!lista.length) return `<p class="meta">No hay notas con estos filtros.</p>`;
  return `<p class="meta">${lista.length > MAX_LISTA ? `Mostrando ${MAX_LISTA} de ${lista.length}` : `${lista.length}`} ${lista.length === 1 ? "nota" : "notas"}${total !== lista.length ? ` (de ${total} en 30 días)` : ""}.</p>
    <ul class="fuentes corp-notas">${lista.slice(0, MAX_LISTA).map((n) => `<li>${(n.cats || []).map((c) => `<span class="chip" title="${esc(CAT[c]?.n || c)}">${CAT[c]?.ic || ""} ${esc(CORTO[c] || c)}</span>`).join(" ")}
      <a href="${esc(safeUrl(n.url))}" target="_blank" rel="noopener noreferrer">${esc(n.t)}</a>
      <span class="meta">${esc(n.f)} · ${esc((n.fecha || "").slice(0, 16).replace("T", " "))} UTC${(n.paises || []).length ? ` · ${esc(nombrePais(n.paises[0]))}` : ""}</span>
      ${(n.empresas || []).length ? `<div>${htmlEmpresasCorp(n.empresas)}</div>` : ""}</li>`).join("")}</ul>`;
}

// Registros y reportes públicos para investigar empresas (enlaces fijos del bloque «Dónde confirmar»).
export const FUENTES_CORP = [
  ["SEC EDGAR (EUA): reportes de empresas que cotizan, dueños y compras de directivos", "https://www.sec.gov/edgar/search/"],
  ["BMV (México): emisoras y eventos relevantes", "https://www.bmv.com.mx/es/emisoras/informacion-de-emisoras"],
  ["CNBV (México): sanciones a entidades financieras", "https://www.gob.mx/cnbv"],
  ["COFECE / Comisión Nacional Antimonopolio (México): resoluciones de competencia", "https://www.cofece.mx/"],
  ["Concursos mercantiles en México (IFECOM)", "https://www.ifecom.cjf.gob.mx/"],
  ["SAT 69-B (México): empresas que facturan operaciones simuladas", "http://omawww.sat.gob.mx/cifras_sat/Paginas/datos/vinculo.html?page=ListCompleta69B.html"],
  ["Companies House (Reino Unido): directores y dueños con control significativo", "https://find-and-update.company-information.service.gov.uk/"],
  ["GLEIF: identificador LEI y matriz de cada empresa en el mundo", "https://search.gleif.org/"],
  ["OpenCorporates: registros mercantiles de más de 140 jurisdicciones", "https://opencorporates.com/"],
  ["Comisión Europea: decisiones de competencia", "https://competition-cases.ec.europa.eu/search"],
  ["FTC (EUA): casos de competencia y protección al consumidor", "https://www.ftc.gov/legal-library/browse/cases-proceedings"],
  ["Despidos masivos en EUA: avisos WARN por estado (Departamento del Trabajo)", "https://www.dol.gov/agencies/eta/layoffs/warn"],
  ["Quiebras en EUA: PACER (expedientes federales)", "https://pacer.uscourts.gov/"],
  ["OFAC (EUA): lista de sancionados SDN", "https://sanctionssearch.ofac.treas.gov/"],
];

/** Monta el panel. `abrirFicha(html)` muestra un organigrama en la ficha del mapa (clic desde la ficha). */
export function iniciarCorporativo({ abrirFicha } = {}) {
  const $ = (id) => document.getElementById(id);
  if (!$("g-corporativo")) return;
  let datos = null, cat = null, mapa = null, cambiosOrg = null, ochoK = null;
  const cargar = async () => {
    [datos, cat, mapa, cambiosOrg, ochoK] = await Promise.all([getJSON(URL_NOTAS, { bust: true }).catch(() => null), cat ? cat : getJSON(URL_EMPRESAS).catch(() => null),
      getJSON(URL_MAPA, { bust: true }).catch(() => null), cambiosOrg ? cambiosOrg : getJSON(URL_CAMBIOS, { bust: true }).catch(() => null),
      ochoK ? ochoK : getJSON(URL_8K, { bust: true }).catch(() => null)]);
    return datos;
  };
  const nombres = () => Object.fromEntries((mapa?.features || []).map((f) => [f.properties.iso3, f.properties.pais]));
  const porId = () => Object.fromEntries((cat?.empresas || []).map((e) => [e.id, e]));
  $("corp-fuentes").innerHTML = FUENTES_CORP.map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a></li>`).join("");
  const pintar = () => {
    const notas = datos?.notas || [];
    const np = nombres();
    const f = { cat: $("corp-cat").value, sector: $("corp-sector").value, pais: $("corp-pais").value, q: $("corp-q").value, dias: Number($("corp-dias").value) || 0 };
    $("corp-res").innerHTML = datos ? htmlNotas(filtrarNotas(notas, f), { nombrePais: (i) => np[i] || i, total: notas.length })
      : `<p class="meta">Las noticias corporativas aún no están disponibles (se actualizan cada hora).</p>`;
  };
  const llenarFiltros = () => {
    const notas = datos?.notas || [];
    const c = contarPorCategoria(notas);
    $("corp-cat").innerHTML = `<option value="">Todas las categorías (${notas.length})</option>` + CATEGORIAS_CORP.map(([k, n, ic]) => `<option value="${k}">${ic} ${esc(n)} (${c[k] || 0})</option>`).join("");
    const sect = {};
    for (const n of notas) for (const s of n.sectores || []) sect[s] = (sect[s] || 0) + 1;
    $("corp-sector").innerHTML = `<option value="">Todos los sectores</option>` + Object.entries(datos?.sectores || {}).sort((a, b) => a[1].localeCompare(b[1], "es"))
      .map(([k, n]) => `<option value="${k}">${esc(n)} (${sect[k] || 0})</option>`).join("");
    const np = nombres(), pa = {};
    for (const n of notas) { const i = (n.paises || [])[0] || "_sin"; pa[i] = (pa[i] || 0) + 1; }
    $("corp-pais").innerHTML = `<option value="">Todos los países</option>` + Object.entries(pa).filter(([i]) => i !== "_sin").map(([i, k]) => [i, np[i] || i, k])
      .sort((a, b) => a[1].localeCompare(b[1], "es")).map(([i, n, k]) => `<option value="${esc(i)}">${esc(n)} (${k})</option>`).join("")
      + (pa._sin ? `<option value="_sin">Sin país en el titular (${pa._sin})</option>` : "");
  };
  let listo = null;
  const asegurar = () => (listo ??= cargar().then(() => { llenarFiltros(); pintar(); }));
  for (const id of ["b-corp-noticias", "b-corp-org"]) $(id).addEventListener("toggle", () => { if ($(id).open) asegurar(); });
  for (const id of ["corp-cat", "corp-sector", "corp-pais", "corp-dias"]) $(id).addEventListener("change", pintar);
  $("corp-q").addEventListener("input", pintar);
  const mostrarOrg = (qid, destino) => {
    const e = porId()[qid];
    const np = nombres();
    const html = cat ? htmlOrganigrama(conCambios(e, cambiosOrg, ochoK), { porId: porId(), notas: datos?.notas || [], nombrePais: (i) => np[i] || i })
      : `<p class="meta">El catálogo de empresas aún no está disponible (se renueva cada semana).</p>`;
    mostrar(html, destino === "ficha");
  };
  $("corp-org-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    await asegurar();
    const r = buscarEmpresas(cat, $("corp-org-q").value);
    $("corp-org-res").innerHTML = !cat ? `<p class="meta">El catálogo de empresas aún no está disponible (se renueva cada semana).</p>`
      : r.length ? `<h5>📒 Catálogo semanal (${r.length})</h5><ul class="lista-corta corp-resultados">${r.map(({ e, por }) => `<li><button type="button" class="mini corp-org" data-org="${esc(e.id)}">👔 Ver organigrama</button> <b>${esc(e.n)}</b>
          <span class="meta">${esc([e.ind, ...(e.bolsas || []).slice(0, 2).map((b) => b[1]).filter(Boolean)].filter(Boolean).join(" · "))}${por ? ` · ${esc(por)}` : ""}</span></li>`).join("")}</ul>`
        : `<p class="meta">Sin coincidencias en las ${cat.empresas.length.toLocaleString("es-MX")} empresas del catálogo semanal.</p>`;
    // Más allá del catálogo: Wikidata y GLEIF en vivo (solo al pulsar «Buscar»).
    const q = $("corp-org-q").value.trim();
    if (q.length < 3) { $("corp-org-vivo").innerHTML = ""; return; }
    $("corp-org-vivo").innerHTML = `<p class="meta">Buscando «${esc(q)}» en Wikidata y GLEIF…</p>`;
    const [wd, gl] = await Promise.allSettled([V.buscarWD(q), V.buscarGLEIF(q)]);
    if ($("corp-org-q").value.trim() !== q) return;  // ya se escribió otra búsqueda
    $("corp-org-vivo").innerHTML = V.htmlResultadosVivos({ wd: wd.value, gleif: gl.value, errWD: wd.reason?.message, errGLEIF: gl.reason?.message,
      local: new Set(r.map((x) => x.e.id)) });
  });
  // Clic en «👔 Empresa» en la lista, en un organigrama o en la ficha de un punto del mapa.
  // El organigrama aparece ARRIBA de los resultados, con una barra para cerrarlo, y pide solo su estructura
  // legal a GLEIF (así una empresa sin cargos en Wikidata no se ve vacía).
  const BARRA = `<div class="org-barra"><b>👔 Organigrama</b><button type="button" class="mini corp-org-cerrar">✕ Cerrar y volver a los resultados</button></div>`;
  const mostrar = (html, enFicha) => {
    let cont;
    if (enFicha && abrirFicha) { abrirFicha(html); cont = document.getElementById("ficha-cuerpo"); }
    else {
      cont = $("corp-org-ficha");
      cont.innerHTML = BARRA + html;
      cont.classList.add("activo");
      cont.scrollIntoView({ block: "start", behavior: "smooth" });
    }
    const g = cont?.querySelector(".corp-gleif-q");
    if (g && !g.dataset.auto) { g.dataset.auto = "1"; g.click(); }
  };
  document.addEventListener("click", async (ev) => {
    if (ev.target.closest(".corp-org-cerrar")) {
      $("corp-org-ficha").innerHTML = ""; $("corp-org-ficha").classList.remove("activo");
      $("corp-org-res").scrollIntoView({ block: "start" });
      return;
    }
    const enFicha = !!ev.target.closest("#ficha");
    const w = ev.target.closest(".corp-wd");
    if (w) {
      await asegurar();
      const local = porId()[w.dataset.wd];
      if (local) { mostrarOrg(local.id, enFicha ? "ficha" : "panel"); return; }
      mostrar(`<p class="meta">Consultando el organigrama en Wikidata…</p>`, enFicha);
      try {
        const e = await V.organigramaWD(w.dataset.wd);
        const np = nombres();
        mostrar(htmlOrganigrama(conCambios(e, cambiosOrg, ochoK), { porId: porId(), notas: datos?.notas || [], nombrePais: (i) => np[i] || i }), enFicha);
      } catch (err) { mostrar(`<p class="meta">Wikidata no respondió (${esc(err.message)}). Intenta de nuevo en un minuto.</p>`, enFicha); }
      return;
    }
    const l = ev.target.closest(".corp-lei");
    if (l) {
      mostrar(`<p class="meta">Consultando la estructura legal en GLEIF…</p>`, enFicha);
      try { mostrar(V.htmlEstructuraGLEIF(await V.estructuraGLEIF(l.dataset.lei)), enFicha); }
      catch (err) { mostrar(`<p class="meta">GLEIF no respondió (${esc(err.message)}).</p>`, enFicha); }
      return;
    }
    const g = ev.target.closest(".corp-gleif-q");
    if (g) {
      g.hidden = true;  // ya se consultó (sola o con clic): no se repite
      const destino = g.closest(".organigrama")?.querySelector(".corp-gleif-res");
      if (!destino) return;
      destino.innerHTML = `<p class="meta">Consultando GLEIF…</p>`;
      try {
        if (g.dataset.lei) { destino.innerHTML = V.htmlEstructuraGLEIF(await V.estructuraGLEIF(g.dataset.lei)); return; }
        const r = await V.buscarGLEIF(g.dataset.q);
        const delPais = g.dataset.pais ? r.lista.filter((x) => x.pais === g.dataset.pais) : [];
        if (delPais.length === 1) {  // una sola entidad con ese nombre en el país de la empresa: se abre sola
          destino.innerHTML = V.htmlEstructuraGLEIF(await V.estructuraGLEIF(delPais[0].lei))
            + (r.lista.length > 1 ? `<p class="meta">Otras entidades con nombre parecido: ${r.lista.filter((x) => x !== delPais[0]).map((x) => `<button type="button" class="txt-btn corp-lei" data-lei="${esc(x.lei)}">${esc(x.n)} (${esc(x.pais)})</button>`).join(" · ")}</p>` : "");
          return;
        }
        destino.innerHTML = r.lista.length ? `<p class="meta">Elige la entidad legal (puede haber varias con nombre parecido):</p><ul class="lista-corta">${r.lista.map((x) => `<li><button type="button" class="mini corp-lei" data-lei="${esc(x.lei)}">🏛️ Ver estructura</button> <b>${esc(x.n)}</b> <span class="meta">${esc(x.pais)}</span></li>`).join("")}</ul>`
          : `<p class="meta">GLEIF no tiene una entidad con ese nombre exacto. Búscala por su razón social en el buscador de arriba.</p>`;
      } catch (err) { destino.innerHTML = `<p class="meta">GLEIF no respondió (${esc(err.message)}).</p>`; }
      return;
    }
    const b = ev.target.closest(".corp-org");
    if (!b) return;
    await asegurar();
    mostrarOrg(b.dataset.org, b.closest("#ficha") ? "ficha" : "panel");
  });
}
