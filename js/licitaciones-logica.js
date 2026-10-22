// Investigación → Licitaciones: filtro de los avisos abiertos (data/licitaciones.json, de la ingesta), enlaces de
// búsqueda en los portales oficiales y consulta de contratos ya adjudicados en EUA (USAspending, desde el navegador).

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Avisos que contienen todas las palabras de `q` (título, comprador o clasificación), con filtros opcionales. */
export function filtrarAvisos(avisos, { q = "", fuente = "", pais = "", soloAbiertas = true, hoy = new Date().toISOString().slice(0, 10) } = {}, max = 200) {
  const palabras = norm(q).split(/\s+/).filter((p) => p.length > 1);
  return (avisos || []).filter((a) => {
    if (fuente && !a.fuente.startsWith(fuente)) return false;
    if (pais && a.pais !== pais) return false;
    if (soloAbiertas && a.cierre && a.cierre < hoy) return false;
    const t = norm(`${a.titulo} ${a.comprador} ${(a.cpv || []).join(" ")} ${a.id}`);
    return palabras.every((p) => t.includes(p));
  }).sort((x, y) => (x.cierre || "9999").localeCompare(y.cierre || "9999")).slice(0, max);
}

/** Días que faltan para el cierre (negativo si ya cerró; null sin fecha). */
export function diasParaCierre(cierre, hoy = new Date()) {
  const t = Date.parse(cierre);
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())) / 86400000);
}

/** Portales oficiales con la búsqueda ya armada (los que no aceptan búsqueda por enlace abren su buscador). */
export function enlacesBusqueda(q) {
  const e = encodeURIComponent(q.trim());
  return [
    ["🇲🇽 ComprasMX (contrataciones federales vigentes)", "https://comprasmx.buengobierno.gob.mx/sitiopublico/#/", "El buscador no acepta enlaces con texto: pega la palabra en «Búsqueda»."],
    ["🇲🇽 CompraNet histórico (expedientes hasta 2025)", "https://upcp-compranet.buengobierno.gob.mx/", "Consulta de procedimientos anteriores a ComprasMX."],
    ["🇲🇽 Plataforma Nacional de Transparencia (contratos de estados y municipios)", "https://www.plataformadetransparencia.org.mx/", "Obligaciones de transparencia: fracción XXVIII (licitaciones y adjudicaciones)."],
    ["🇺🇸 SAM.gov (oportunidades federales)", `https://sam.gov/search/?index=opp&page=1&pageSize=25&sort=-modifiedDate&sfm%5Bstatus%5D%5Bis_active%5D=true&sfm%5BsimpleSearch%5D%5BkeywordRadio%5D=ALL&sfm%5BsimpleSearch%5D%5BkeywordTags%5D%5B0%5D%5Bkey%5D=${e}&sfm%5BsimpleSearch%5D%5BkeywordTags%5D%5B0%5D%5Bvalue%5D=${e}`, "Para ofertar se requiere registro y UEI en SAM.gov."],
    ["🇺🇸 Grants.gov (subvenciones federales)", `https://www.grants.gov/search-grants?keywords=${e}`, ""],
    ["🇺🇸 USAspending (contratos ya adjudicados)", `https://www.usaspending.gov/keyword_search/${e}`, "Sirve para conocer quién gana, cuánto y con qué agencia."],
    ["🇪🇺 TED (licitaciones de la Unión Europea)", `https://ted.europa.eu/es/search/result?search-scope=ACTIVE&FT=${e}`, "Diario Oficial de la UE, suplemento S."],
  ];
}

/** Cuerpo de la consulta de USAspending: contratos (A–D) adjudicados en los últimos `meses` con esas palabras. */
export function consultaUSAspending(q, meses = 12, hoy = new Date()) {
  const fin = hoy.toISOString().slice(0, 10);
  const ini = new Date(hoy.getTime() - meses * 30.44 * 86400000).toISOString().slice(0, 10);
  return {
    filters: { keywords: [q.trim()], award_type_codes: ["A", "B", "C", "D"], time_period: [{ start_date: ini, end_date: fin }] },
    fields: ["Award ID", "Recipient Name", "Award Amount", "Awarding Agency", "Start Date", "Description"],
    limit: 15, page: 1, sort: "Award Amount", order: "desc",
  };
}
