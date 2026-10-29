// Versión de pago y versión de quien administra (Fase 7). Funciones puras, salvo vistaActual().
// Regla: en la versión de pago solo se muestra lo que viene de fuentes que permiten uso comercial (config/entities.json,
// uso_comercial === true) y no está en la lista «solo admin» de config/comercial_licencias.json. Lo demás solo lo ve
// quien administra. En el sitio público (sin cobro) se ve todo; con ?vista=pago se simula la versión de pago.

/** Plan que se simula en la vista de pago: ?plan=demo|recon|analyst|command (o window.DOMINUS_PLAN en la versión comercial).
 *  Sin indicarlo, el plan más alto. */
export function planActual(planes, search = globalThis.location?.search || "", global = globalThis.DOMINUS_PLAN) {
  const ids = (planes?.planes || []).map((p) => p.id);
  // Se toma el ÚLTIMO «plan=<válido>» del texto: así funciona aunque el enlace venga pegado dos veces
  // (p. ej. «?vista=pago&plan=index.html?vista=pago&plan=demo»).
  const validos = [...String(search).matchAll(/plan=([a-z]+)/gi)].map((m) => m[1].toLowerCase()).filter((x) => ids.includes(x));
  const pedido = global || validos.at(-1);
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

/** «pago» si la página se abrió con ?vista=pago o si la versión comercial lo fija en window.DOMINUS_VISTA; si no, «completa». */
export function vistaActual(search = globalThis.location?.search || "", global = globalThis.DOMINUS_VISTA) {
  if (global === "pago" || global === "admin") return global === "pago" ? "pago" : "completa";
  // Basta con que «vista=pago» aparezca en el enlace, aunque venga mezclado («?vista=index.html?vista=pago»).
  return /(?:^|[?&])vista=(?:[^&]*[?&])?vista=pago|(?:^|[?&])vista=pago(?:$|[&#])/i.test(String(search)) ? "pago" : "completa";
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
    funciones: new Set(Object.keys(v.funciones_solo_admin || {})),
    paginas: admin("pagina"),
    bloques: admin("bloque"),
    bloquesLic: Object.keys(v.bloques_solo_admin || {}),
    capas: admin("capa"),
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

/** Familias de capas (salida de familiasDibujables) sin las de fuentes no comerciales y sin sus subtipos no comerciales. */
export function familiasPago(familias, r) {
  return familias.filter((f) => r.fuenteOk(f.fuente) && !r.capas.has(f.id))
    .map((f) => ({ ...f, subtipos: f.subtipos.filter((s) => !s.fuente || r.fuenteOk(s.fuente)) }));
}

/** Subtipos de una categoría en movimiento que se pueden mostrar (p. ej. satélites: solo grupos de SatNOGS). */
export const subtiposPago = (subtipos, r) => subtipos.filter((s) => !s.fuente || r.fuenteOk(s.fuente));
