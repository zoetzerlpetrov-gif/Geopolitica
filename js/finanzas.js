// Análisis financiero de empresas (finanzas.html, solo admin). Lee data/finanzas/indice.json y data/finanzas/<TICKER>.json
// (workflow «Estados financieros»: SEC EDGAR, reglas fijas en tools/finanzas/edgar.py). Nada es asesoría de inversión.

export const RENGLONES = {
  resultados: [["ingresos", "Ingresos"], ["costo_ventas", "Costo de ventas"], ["utilidad_bruta", "Utilidad bruta"],
    ["utilidad_operativa", "Utilidad operativa (EBIT)"], ["intereses", "Gasto por intereses"], ["utilidad_neta", "Utilidad neta"],
    ["uxa_diluida", "Utilidad por acción diluida"]],
  balance: [["activos", "Activos totales"], ["activo_circulante", "Activo circulante (corto plazo)"], ["efectivo", "Efectivo y equivalentes"],
    ["inventarios", "Inventarios"], ["pasivos", "Pasivos totales"], ["pasivo_circulante", "Pasivo circulante (corto plazo)"],
    ["deuda_corto_plazo", "Deuda de corto plazo"], ["deuda_largo_plazo", "Deuda de largo plazo"], ["capital_contable", "Capital contable"],
    ["utilidades_retenidas", "Utilidades retenidas"], ["acciones", "Acciones en circulación"]],
  flujos: [["flujo_operativo", "Flujo de la operación"], ["capex", "Inversión en activo fijo (CapEx)"], ["dividendos_pagados", "Dividendos pagados"],
    ["recompras", "Recompra de acciones"], ["depreciacion", "Depreciación y amortización"]],
};

export const RAZONES = [
  ["margen_bruto", "Margen bruto", "pct", "De cada 100 de ventas, cuánto queda después del costo directo de lo vendido."],
  ["margen_operativo", "Margen operativo", "pct", "Lo que queda después de todos los gastos de operación; mide qué tan eficiente es el negocio."],
  ["margen_neto", "Margen neto", "pct", "La utilidad final por cada 100 de ventas, después de intereses e impuestos."],
  ["crecimiento_ingresos", "Crecimiento de ingresos", "pct", "Cuánto cambiaron las ventas frente al año anterior."],
  ["razon_circulante", "Razón circulante", "x", "Activos de corto plazo ÷ deudas de corto plazo. Arriba de 1.5 suele ser holgado; abajo de 1, ajustado."],
  ["prueba_acida", "Prueba ácida", "x", "Como la razón circulante pero sin inventarios (lo que tarda en volverse efectivo)."],
  ["deuda_capital", "Deuda / capital", "x", "Cuánta deuda financiera hay por cada unidad de capital de los accionistas."],
  ["pasivo_activo", "Pasivo / activo", "pct", "Qué parte de los activos está financiada con deuda u obligaciones."],
  ["deuda_neta_ebitda", "Deuda neta / EBITDA", "x", "Años de flujo operativo para pagar la deuda menos el efectivo. Menos de 2 es cómodo; más de 4, alto."],
  ["cobertura_intereses", "Cobertura de intereses", "x", "Veces que la utilidad operativa paga los intereses. Menos de 2 es una señal de alerta."],
  ["roe", "ROE", "pct", "Utilidad ÷ capital: cuánto gana la empresa con el dinero de sus accionistas (muy alto puede deberse a recompras)."],
  ["roa", "ROA", "pct", "Utilidad ÷ activos: cuánto rinde todo lo que la empresa posee."],
  ["flujo_libre", "Flujo libre", "dinero", "Flujo de la operación menos inversión en activo fijo: el efectivo que queda para dividendos, deuda o recompras."],
  ["margen_flujo_libre", "Margen de flujo libre", "pct", "Flujo libre por cada 100 de ventas."],
  ["conversion_efectivo", "Conversión a efectivo", "x", "Flujo operativo ÷ utilidad neta. Cerca o arriba de 1 indica utilidades «reales» en efectivo."],
  ["payout_utilidad", "Dividendo / utilidad", "pct", "Qué parte de la utilidad se reparte. Arriba de 100 % se paga con algo más que la utilidad del año."],
  ["payout_flujo_libre", "Dividendo / flujo libre", "pct", "Qué parte del flujo libre se reparte; es la medida más estricta de si el dividendo es sostenible."],
];

const EMOJI = { verde: "🟢", ambar: "🟡", rojo: "🔴", sin_datos: "⚪" };
const ETIQUETA = { verde: "sólida", ambar: "mixta", rojo: "con alertas", sin_datos: "sin datos" };

/** Millones con separador de miles (formato de México); acciones en millones; UPA con 2 decimales. */
export function formato(valor, tipo = "dinero") {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "—";
  if (tipo === "pct") return `${(valor * 100).toFixed(1)} %`;
  if (tipo === "x") return valor.toFixed(2);
  if (tipo === "upa") return valor.toFixed(2);
  return (valor / 1e6).toLocaleString("es-MX", { maximumFractionDigits: 0 });
}

/** Opciones del buscador: primero las que tienen datos; «Nombre (TICKER)». */
export function opciones(indice) {
  return (indice?.empresas || []).filter((e) => e.estado === "ok").sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
    .map((e) => ({ valor: `${e.nombre} (${e.ticker})`, ticker: e.ticker }));
}

/** Solo enlaces a documentos de la SEC (https://www.sec.gov/…). */
export function esSec(url) {
  try { const u = new URL(url); return u.protocol === "https:" && u.hostname === "www.sec.gov"; } catch (e) { return false; }
}

export function tickerDe(texto, indice) {
  const t = String(texto || "").trim();
  const m = t.match(/\(([^)]+)\)\s*$/);
  const clave = (m ? m[1] : t).toUpperCase();
  return (indice?.empresas || []).find((e) => e.ticker === clave || e.nombre.toUpperCase() === t.toUpperCase())?.ticker || null;
}

// ------------------------------------------------------------------ página
const $ = (id) => document.getElementById(id);
function el(tag, attrs = {}, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (k === "class") e.className = v; else e.setAttribute(k, v);
  for (const h of hijos) e.append(h instanceof Node ? h : document.createTextNode(String(h ?? "")));
  return e;
}

function tabla(titulo, filas, anios, valor) {
  const t = el("table", { class: "t" });
  t.append(el("tr", {}, el("th", {}, titulo), ...anios.map((a) => el("th", {}, a))));
  for (const [clave, nombre] of filas) {
    const tr = el("tr", {}, el("td", {}, nombre));
    for (const a of anios) {
      const v = valor(clave, a);
      const td = el("td", {}, v.texto);
      if (v.negativo) td.className = "neg";
      tr.append(td);
    }
    t.append(tr);
  }
  return el("div", { class: "desliza" }, t);
}

function pintar(d) {
  const caja = $("fi-empresa");
  caja.replaceChildren();
  const ultimo = d.anios[d.anios.length - 1];
  caja.append(el("div", { class: "tarjeta" },
    el("h2", {}, `${d.nombre} (${d.ticker}) `, el("span", { class: `chip ${d.calificacion}` }, `${EMOJI[d.calificacion] || ""} ${ETIQUETA[d.calificacion] || d.calificacion}`)),
    el("p", { class: "meta" }, `${d.empresa_sec} · ${d.sector || ""} · cifras en millones de ${d.moneda} · último ejercicio: cierre ${d.cierres?.[ultimo] || ultimo}`)));

  const diag = el("ul", { class: "diag" });
  for (const x of d.diagnostico) diag.append(el("li", {}, `${EMOJI[x.semaforo]} `, el("b", {}, x.tema + ": "), x.texto));
  caja.append(el("div", { class: "tarjeta" }, el("h2", {}, "Diagnóstico"), diag,
    el("p", { class: "meta" }, "Semáforo general: «con alertas» (🔴) si dos o más temas están en rojo; «sólida» (🟢) si no hay rojos y la mitad o más son verdes; «mixta» (🟡) en otro caso. Una alerta no significa que la empresa esté mal: indica qué revisar en sus reportes.")));

  const val = (c, a) => {
    const v = d.estados[c]?.[a];
    return { texto: formato(v, c === "uxa_diluida" ? "upa" : "dinero"), negativo: typeof v === "number" && v < 0 };
  };
  caja.append(el("h2", {}, "Estado de resultados"), tabla("Concepto", RENGLONES.resultados, d.anios, val));
  caja.append(el("h2", {}, "Balance general (al cierre de cada ejercicio)"), tabla("Concepto", RENGLONES.balance, d.anios, val));
  caja.append(el("h2", {}, "Flujo de efectivo"), tabla("Concepto", RENGLONES.flujos, d.anios, val));

  const tr = el("table", { class: "t" });
  tr.append(el("tr", {}, el("th", {}, "Razón"), ...d.anios.map((a) => el("th", {}, a)), el("th", {}, "Qué significa")));
  for (const [c, nombre, tipo, exp] of RAZONES) {
    tr.append(el("tr", {}, el("td", {}, nombre), ...d.anios.map((a) => el("td", {}, formato(d.razones[a]?.[c], tipo))), el("td", { class: "exp" }, exp)));
  }
  caja.append(el("h2", {}, "Razones financieras"), el("div", { class: "desliza" }, tr));

  const p = el("div", { class: "tarjeta" }, el("h2", {}, "Puntajes"));
  if (d.piotroski) {
    const ul = el("ul");
    for (const [k, v] of Object.entries(d.piotroski.pruebas)) ul.append(el("li", {}, `${v ? "✅" : "❌"} ${k}`));
    p.append(el("p", {}, el("b", {}, `Piotroski F: ${d.piotroski.puntos} de 9. `), "Nueve pruebas de salud financiera del último año contra el anterior (Piotroski, 2000). 7-9 es fuerte; 0-3, débil."), ul);
  }
  p.append(el("p", {}, el("b", {}, "Altman Z: "), d.altman?.aplica ? `${d.altman.z} (zona ${d.altman.zona}). Más de 2.99 segura; 1.81-2.99 gris; menos de 1.81, riesgo de insolvencia según el modelo (Altman, 1968).` : (d.altman?.motivo || "—")));
  caja.append(p);

  const docs = el("ul");
  for (const x of (d.documentos || []).filter((x) => esSec(x.url))) docs.append(el("li", {}, el("a", { href: x.url, target: "_blank", rel: "noopener noreferrer" }, `${x.forma} · presentado ${x.fecha}${x.periodo ? ` · periodo ${x.periodo}` : ""}`)));
  caja.append(el("div", { class: "tarjeta" }, el("h2", {}, "Documentos originales (SEC EDGAR)"),
    el("p", { class: "meta" }, "10-K: informe anual · 10-Q: trimestral · 20-F/40-F: anual de emisoras extranjeras · 6-K/8-K: eventos relevantes · DEF 14A: asamblea y sueldos de directivos."), docs,
    el("p", { class: "meta" }, `Fuente: ${d.fuente}. No es asesoría de inversión.`)));
}

function glosario() {
  const ul = el("ul");
  for (const [, nombre, , exp] of RAZONES) ul.append(el("li", {}, el("b", {}, nombre + ": "), exp));
  $("fi-glosario").append(
    el("p", {}, "Orden recomendado para leer una empresa: 1) ¿crece? 2) ¿gana dinero? 3) ¿ese dinero llega en efectivo? 4) ¿puede pagar sus deudas de corto plazo? 5) ¿cuánto debe? 6) ¿el dividendo es sostenible?"),
    ul,
    el("p", { class: "meta" }, "Reglas del semáforo: crecimiento promedio > 5 % verde, 0-5 % ámbar, negativo rojo · margen neto > 10 % verde, 0-10 % ámbar · razón circulante ≥ 1.5 verde, 1-1.5 ámbar · deuda neta/EBITDA < 2 verde, 2-4 ámbar · cobertura de intereses > 5 verde, 2-5 ámbar · dividendo/flujo libre < 60 % verde, 60-100 % ámbar · Piotroski 7-9 verde, 4-6 ámbar."));
}

async function iniciar() {
  glosario();
  let indice = { empresas: [] };
  try { const r = await fetch("data/finanzas/indice.json", { cache: "no-store" }); if (r.ok) indice = await r.json(); } catch (e) { /* aún sin datos */ }
  const ops = opciones(indice);
  $("fi-lista").replaceChildren(...ops.map((o) => el("option", { value: o.valor })));
  const sin = (indice.empresas || []).filter((e) => e.estado !== "ok");
  $("fi-estado").textContent = indice.generado_utc
    ? `${ops.length} empresas con estados financieros; actualizado ${indice.generado_utc.slice(0, 10)}.`
    : "Aún no hay datos: el proceso «Estados financieros» corre cada semana.";
  const ts = $("fi-sin");
  ts.append(el("tr", {}, el("th", {}, "Instrumento"), el("th", {}, "Motivo")));
  for (const e of sin) ts.append(el("tr", {}, el("td", {}, `${e.nombre} (${e.ticker})`), el("td", { class: "exp" }, e.motivo || e.estado)));
  const abrir = async (ticker) => {
    if (!ticker) return;
    $("fi-estado").textContent = "Cargando…";
    try {
      const r = await fetch(`data/finanzas/${encodeURIComponent(ticker)}.json`, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      pintar(await r.json());
      $("fi-estado").textContent = "";
      const q = new URLSearchParams(location.search); q.set("t", ticker);
      history.replaceState(null, "", `?${q}`);
    } catch (e) { $("fi-estado").textContent = "No se pudo cargar: " + e.message; }
  };
  $("fi-buscar").addEventListener("change", () => abrir(tickerDe($("fi-buscar").value, indice)));
  // Solo claves que existen en el índice: el parámetro ?t= nunca arma una ruta arbitraria.
  abrir(tickerDe(new URLSearchParams(location.search).get("t"), indice));
}

if (typeof document !== "undefined" && document.getElementById("fi-empresa")) iniciar();
