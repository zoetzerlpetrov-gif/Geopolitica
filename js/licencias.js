// Versión de pago y versión de quien administra (Fase 7). Funciones puras, salvo vistaActual().
// La vista comercial aplica las reglas de uso de las fuentes y las secciones reservadas a administración.
// Las cámaras conservan su ficha y enlace al operador. La incorporación de sus medios se decide por fuente.
// El sitio público permite simular la vista comercial con ?vista=pago.

// ---------------------------------------------------------------- dominio: público o administración
// dominusosint.com (y dominus-osint.pages.dev) es el sitio PÚBLICO: siempre muestra la vista de pago con el plan de la
// cuenta verificada (o Demo si nadie inició sesión). La versión completa solo existe en el sitio de administración
// (admin.dominusosint.com, detrás del inicio de sesión), en /ops/ (detrás de Cloudflare Access) y en local (pruebas).
export const PLAN_SESION = "gp_plan_sesion";
export function esSitioAdmin(host = globalThis.location?.hostname || "", ruta = globalThis.location?.pathname || "") {
  return host === "admin.dominusosint.com" || /\.workers\.dev$/.test(host) || host === "localhost" || host === "127.0.0.1" || host === "" || ruta.startsWith("/ops/");
}
/** Plan verificado por el Worker para esta pestaña (lo guarda vista_enlaces.js tras consultar /cuenta/sesion). */
export function planDeSesion(ids, almacen = globalThis.sessionStorage) {
  try { const p = almacen?.getItem(PLAN_SESION); return ids.includes(p) ? p : null; } catch { return null; }
}

/** Plan de la vista de pago. En el sitio público: el plan verificado de la cuenta o «demo» (no se acepta ?plan=, para que
 *  no se pueda abrir un plan superior escribiendo el enlace). En administración: ?plan=demo|recon|analyst|command para
 *  simularlo (sin indicarlo, el más alto). window.DOMINUS_PLAN lo fija la versión comercial. */
export function planActual(planes, search = globalThis.location?.search || "", global = globalThis.DOMINUS_PLAN, admin = esSitioAdmin()) {
  const ids = (planes?.planes || []).map((p) => p.id);
  if (ids.includes(global)) return global;
  if (!admin) return planDeSesion(ids) || (ids.includes("demo") ? "demo" : ids[0]);
  // Se toma el ÚLTIMO «plan=<válido>» del texto: así funciona aunque el enlace venga pegado dos veces
  // (p. ej. «?vista=pago&plan=index.html?vista=pago&plan=demo»).
  const validos = [...String(search).matchAll(/plan=([a-z]+)/gi)].map((m) => m[1].toLowerCase()).filter((x) => ids.includes(x));
  const pedido = validos.at(-1);
  return ids.includes(pedido) ? pedido : ids.at(-1);
}

/** Plan que hace falta para un grupo del menú o una página, si el plan actual no alcanza; si alcanza (o no hay regla), null. */
export function planFaltante(planes, actual, tipo, clave) {
  const lista = planes?.planes || [];
  const ids = lista.map((p) => p.id);
  const req = planes?.acceso_por_plan?.[tipo]?.[clave];
  if (!req || ids.indexOf(req) <= ids.indexOf(actual)) return null;
  return lista.find((p) => p.id === req) || null;
}

/** FIX vigente desde vivos/indicadores.json (serie SF43718 de Banxico), o null. */
export function fixDeIndicadores(ind) {
  for (const g of ind?.grupos || []) for (const x of g.datos || []) if (x.id === "SF43718" && x.valor > 0) return { fecha: x.fecha, valor: x.valor };
  return null;
}

/** «pago» en el sitio público (siempre), si la página se abrió con ?vista=pago o si la versión comercial lo fija en
 *  window.DOMINUS_VISTA; «completa» solo en administración sin ?vista=pago. */
export function vistaActual(search = globalThis.location?.search || "", global = globalThis.DOMINUS_VISTA, admin = esSitioAdmin()) {
  if (global === "pago" || global === "admin") return global === "pago" ? "pago" : "completa";
  if (!admin) return "pago";
  // Basta con que «vista=pago» aparezca en el enlace, aunque venga mezclado («?vista=index.html?vista=pago»).
  return /(?:^|[?&])vista=(?:[^&]*[?&])?vista=pago|(?:^|[?&])vista=pago(?:$|[&#])/i.test(String(search)) ? "pago" : "completa";
}

/** Plan mínimo para descargar, exportar e imprimir reportes y documentos (config/planes.json → acceso_por_plan.acciones). */
export function puedeDescargar(planes, plan) {
  const ids = (planes?.planes || []).map((p) => p.id), req = planes?.acceso_por_plan?.acciones?.descargar || "command";
  return ids.indexOf(plan) >= ids.indexOf(req);
}

/** ¿La fuente permite uso comercial? Solo «sí» confirmado; «no» y «por verificar» (null) quedan para admin. */
export const fuenteComercial = (catalogo, id) => catalogo?.fuentes?.[id]?.uso_comercial === true;

/** Restricciones de la versión de pago: comercial_licencias.json («version_pago»), catálogo de fuentes y planes.json
 *  (páginas, bloques y capas que el plan reserva a quien administra). */
export function restricciones(lic, catalogo, planes = {}) {
  const v = lic?.version_pago || {};
  const admin = (tipo) => new Set((planes.solo_admin || []).filter((s) => s.tipo === tipo).map((s) => s.href || s.id));
  return {
    riesgos: new Set(Object.keys(v.riesgos_solo_admin || {})),
    sustituciones: v.riesgos_sustituidos || {},
    movimiento: new Set(Object.keys(v.movimiento_solo_admin || {})),
    movimientoSust: v.movimiento_sustituidos || {},
    funciones: new Set(Object.keys(v.funciones_solo_admin || {})),
    paginas: admin("pagina"),
    bloques: admin("bloque"),
    bloquesLic: Object.keys(v.bloques_solo_admin || {}),
    capas: admin("capa"),
    sustitutas: v.capas_sustituidas || {},
    filtradas: v.capas_filtradas || {},
    fuenteOk: (id) => fuenteComercial(catalogo, id),
  };
}

/** Quita del arreglo de capas de riesgo (en su lugar, para que todos los módulos vean lo mismo) las de solo admin
 *  y aplica las sustituciones (otro archivo u otra fuente). Devuelve los ids quitados. */
export function aplicarARiesgos(capas, r) {
  const quitados = [];
  for (let i = capas.length - 1; i >= 0; i--) {
    const c = capas[i];
    if (r.riesgos.has(c.id)) { quitados.push(c.id); capas.splice(i, 1); continue; }
    const s = r.sustituciones[c.id];
    if (s) Object.assign(c, s);
  }
  return quitados.reverse();
}

// Prefijo del id de cámaras de catálogos antiguos que aún no traen «fuente» (tools/capas/camaras_mundo.py).
const PREFIJO_CAMARA = { dt: "digitraffic", sg: "singapur" };
const fuenteCamara = (p) => p?.fuente || PREFIJO_CAMARA[String(p?.id || "").split(":")[0]];
const fuenteConVistaPrevia = (p, filtro) => (filtro?.fuentes_ok || []).includes(fuenteCamara(p));

/** La lista aprobada autoriza los medios disponibles. Las fichas oficiales curadas son enlaces al operador. */
export function camaraComercial(p, filtro) {
  const id = String(p?.id || "");
  if (fuenteConVistaPrevia(p, filtro)) return true;
  return Boolean(filtro?.enlaces_oficiales && id.startsWith("cam:") && p.t === "organismo_publico");
}

function enlaceCamara(valor) {
  try {
    const url = new URL(valor);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password ||
        !url.hostname.includes(".") || /^(?:0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(url.hostname) ||
        /\.(?:localhost|local|internal)$/.test(url.hostname)) return "";
    const credencial = /^(?:key|api_key|apikey|accesscode|token|access_token|signature|x-amz-signature)$/i;
    if ([...url.searchParams.keys()].some((clave) => credencial.test(clave))) return "";
    return url.href;
  } catch { return ""; }
}

/** Conserva los datos de búsqueda y el destino publicado. Los medios quedan fuera de la ficha de enlace. */
export function camaraParaVistaComercial(p, filtro) {
  if (fuenteConVistaPrevia(p, filtro)) return p;
  const fuente = fuenteCamara(p);
  const { id, n, st, p: pais, o, t, z, lugar, aprox } = p;
  const x = enlaceCamara(p.x);
  return { id, n, st, p: pais, o, t, z, lugar, aprox, fuente, x, solo_enlace_comercial: true };
}

export function capaCamarasComercial(familia, filtro) {
  return {
    ...familia,
    licencia: "Vistas previas según licencia. Las demás cámaras abren en el sitio del operador",
    prepararObjeto: (p) => camaraParaVistaComercial(p, filtro),
  };
}

/** Aplica permisos y sustituciones a las familias. Las cámaras conservan sus subtipos y ubicaciones. */
export function familiasPago(familias, r) {
  const porId = new Map(familias.map((f) => [f.id, f]));
  const sustitutas = new Set(Object.values(r.sustitutas || {}));
  const out = [];
  for (const f of familias) {
    if (r.capas.has(f.id) || sustitutas.has(f.id) || f.sustituye) continue;  // la sustituta entra en el lugar de la original
    if (f.id === "camaras") {
      out.push(capaCamarasComercial(f, r.filtradas?.camaras));
      continue;
    }
    if (r.fuenteOk(f.fuente)) { out.push(f); continue; }
    const s = porId.get(r.sustitutas?.[f.id]);
    if (s && r.fuenteOk(s.fuente) && !r.capas.has(s.id)) out.push(s);
  }
  return out.map((f) => f.id === "camaras" ? f : { ...f, subtipos: subtiposPago(f.subtipos, r) });
}

/** Subtipos de una categoría en movimiento que se pueden mostrar (satélites: fuentes aprobadas y acceso expreso a las efemérides públicas del operador). */
// Acceso a los datos públicos del operador solicitado por administración; no cambia la verificación de licencia de otras fuentes.
export const subtiposPago = (subtipos, r) => subtipos.filter((s) => !s.fuente || r.fuenteOk(s.fuente) || (s.fuente === "spacex_public" && s.acceso_publico_operador === true));
