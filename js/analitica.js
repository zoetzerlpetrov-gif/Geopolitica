// Interfaz de analitica.html. Lógica en analitica-logica.js.
import { esc, getJSON } from "./util.js";
import * as A from "./analitica-logica.js";

const $ = (id) => document.getElementById(id);
const descargar = (nombre, texto, tipo = "text/csv") => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([texto], { type: tipo })); a.download = nombre; a.click(); };

document.querySelector(".pestanas").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-p]");
  if (!b) return;
  for (const x of document.querySelectorAll(".pestanas button")) x.setAttribute("aria-selected", String(x === b));
  for (const p of document.querySelectorAll(".panel")) p.hidden = p.id !== `p-${b.dataset.p}`;
});

const [stats, ev, tax, log, capas, idx] = await Promise.all([
  getJSON("data/historial-estadisticas.json", { bust: true }).catch(() => ({ dias: [] })),
  getJSON("data/events.json", { bust: true }).catch(() => ({ eventos: [] })),
  getJSON("config/taxonomy.json").catch(() => ({ areas: [] })),
  getJSON("data/run-log.json", { bust: true }).catch(() => null),
  getJSON("data/capas/manifest.json", { bust: true }).catch(() => ({ familias: {} })),
  getJSON("data/indice-paises.json", { bust: true }).catch(() => ({ paises: {} })),
]);
const dias = stats.dias || [], eventos = ev.eventos || [];
const nombreArea = Object.fromEntries((tax.areas || []).map((a) => [a.id, a.nombre]));

// ------------------------------------------------------------------ tendencias
const topPaises = Object.entries(dias.reduce((s, d) => { for (const [p, n] of Object.entries(d.paises || {})) s[p] = (s[p] || 0) + n; return s; }, {}))
  .sort((a, b) => b[1] - a[1]).slice(0, 40).map(([p]) => p);
$("t-met").innerHTML = `<option value="total">Total de eventos</option><optgroup label="Áreas temáticas">${(tax.areas || []).map((a) => `<option value="area:${a.id}">${esc(a.nombre)}</option>`).join("")}</optgroup>`
  + `<optgroup label="Severidad">${[5, 4, 3].map((s) => `<option value="sev:${s}">Severidad ${s}</option>`).join("")}</optgroup>`
  + `<optgroup label="Países con más eventos">${topPaises.map((p) => `<option value="pais:${p}">${p}</option>`).join("")}</optgroup>`;
let actual = null;
function pintarSerie() {
  const s = A.serie(dias, $("t-met").value), v = s.map((p) => p.n);
  $("t-rango").textContent = s.length ? `${s[0].dia} a ${s.at(-1).dia} · ${s.length} días` : "Aún no hay estadísticas del historial (se generan con la próxima ingesta horaria).";
  const max = Math.max(1, ...v);
  $("t-graf").innerHTML = s.length ? `<polyline points="${A.polilinea(v, 600, 180, 6)}"/><text x="6" y="14">máx. ${max}</text><text x="6" y="176">${s[0].dia}</text><text x="594" y="176" text-anchor="end">${s.at(-1).dia}</text>` : "";
  const al = A.anomalia(v);
  actual = { nombre: $("t-met").selectedOptions[0]?.textContent || "", s, al };
  $("t-alerta").innerHTML = al ? `Últimos 7 días: <b>${al.media_reciente}</b> eventos por día · antes: ${al.media_base} · cambio ${al.cambio_pct ?? "—"} % · z = <b class="${Math.abs(al.z) >= 2 ? "mal" : "ok"}">${al.z}</b>
    <span class="meta">(z mide cuántas desviaciones estándar se aleja de lo normal; |z| ≥ 2 es inusual).</span>` : `<span class="meta">Se necesitan al menos 14 días de historial para calcular la alerta.</span>`;
}
$("t-met").onchange = pintarSerie;
pintarSerie();
const filasAreas = (tax.areas || []).map((a) => ({ a, al: A.anomalia(A.serie(dias, `area:${a.id}`).map((p) => p.n)) })).filter((x) => x.al).sort((x, y) => (y.al.z === Infinity ? 99 : y.al.z) - (x.al.z === Infinity ? 99 : x.al.z));
$("t-areas").innerHTML = `<tr><th>Área</th><th>Por día (antes)</th><th>Por día (7 días)</th><th>Cambio</th><th>z</th></tr>` + (filasAreas.map(({ a, al }) =>
  `<tr><td>${esc(a.nombre)}</td><td>${al.media_base}</td><td>${al.media_reciente}</td><td>${al.cambio_pct ?? "—"} %</td><td class="${Math.abs(al.z) >= 2 ? "mal" : ""}">${al.z}</td></tr>`).join("") || `<tr><td colspan="5" class="meta">Sin historial suficiente.</td></tr>`);
$("t-paises").innerHTML = `<tr><th>País</th><th>Por día (21 días previos)</th><th>Por día (7 días)</th><th>Veces más</th><th>Índice DOMINUS</th></tr>` + (A.paisesAlza(dias).slice(0, 20).map((x) =>
  `<tr><td><a href="./#pais=${x.pais}">${x.pais}</a></td><td>${x.previo}</td><td>${x.reciente}</td><td>${x.razon ?? "nuevo"}</td><td>${idx.paises?.[x.pais]?.indice ?? "—"}</td></tr>`).join("") || `<tr><td colspan="5" class="meta">Sin historial suficiente.</td></tr>`);

$("t-ia").onclick = async () => {
  const C = await import("./chat_ia.js");
  const out = $("t-ia-res"); out.hidden = false;
  const k = C.leerLlave()?.llave;
  if (!k) { out.textContent = "Primero guarda tu llave de Groq en el mapa: menú Herramientas → «Preguntar a la IA sobre las noticias»."; return; }
  out.textContent = "Pensando…";
  try {
    await C.completar([{ role: "system", content: "Eres un analista de datos e inteligencia. Respondes en español, breve y sin inventar." },
      { role: "user", content: A.promptSerie(actual.nombre, actual.s.slice(-45), actual.al) }], k, { onTexto: (t) => { out.textContent = t; } });
  } catch (e) { out.textContent = C.mensajeError ? C.mensajeError(e) : e.message; }
};

// ------------------------------------------------------------------ comparador
$("c-btn").onclick = async () => {
  const isos = $("c-paises").value.toUpperCase().split(/[,\s]+/).filter((p) => /^[A-Z]{3}$/.test(p)).slice(0, 5);
  if (!isos.length) return;
  $("c-res").innerHTML = `<p class="meta">Consultando al Banco Mundial…</p>`;
  const bm = await Promise.all(isos.map((iso) => Promise.all(A.INDICADORES_BM.map(([cod]) =>
    fetch(`https://api.worldbank.org/v2/country/${iso}/indicator/${cod}?format=json&mrnev=1`).then((r) => r.json()).then(A.leerBM).catch(() => null)))));
  const fmt = (x, dec) => (x == null ? "—" : `${x.valor.toLocaleString("es-MX", { maximumFractionDigits: dec, minimumFractionDigits: dec })} <span class="meta">(${x.anio})</span>`);
  const perf = isos.map((iso) => A.perfilPais(eventos, iso));
  const areas = [...new Set(perf.flatMap((p) => Object.keys(p.areas)))].sort((a, b) => perf.reduce((s, p) => s + (p.areas[b] || 0), 0) - perf.reduce((s, p) => s + (p.areas[a] || 0), 0)).slice(0, 8);
  $("c-res").innerHTML = `<table class="t"><tr><th>Indicador</th>${isos.map((i) => `<th>${i}</th>`).join("")}</tr>`
    + A.INDICADORES_BM.map(([, n, u, dec], j) => `<tr><td>${esc(n)}${u ? ` (${u})` : ""}</td>${isos.map((_, i) => `<td>${fmt(bm[i][j], dec)}</td>`).join("")}</tr>`).join("")
    + `<tr><td>Índice DOMINUS (0-100, 30 días)</td>${isos.map((i) => `<td>${idx.paises?.[i]?.indice ?? "—"}</td>`).join("")}</tr>`
    + `<tr><td>Eventos vigentes en el mapa</td>${perf.map((p) => `<td>${p.total} (${p.graves} graves)</td>`).join("")}</tr>`
    + areas.map((a) => `<tr><td class="meta">· ${esc(nombreArea[a] || a)}</td>${perf.map((p) => `<td>${p.areas[a] || 0}</td>`).join("")}</tr>`).join("") + `</table>`;
};

// ------------------------------------------------------------------ SQL con DuckDB-WASM
const EJEMPLOS = [
  ["Eventos por área (vigentes)", "SELECT area_principal, COUNT(*) AS eventos, ROUND(AVG(severidad), 2) AS sev_media\nFROM eventos GROUP BY 1 ORDER BY 2 DESC;"],
  ["Países con más eventos graves", "SELECT pais_iso3, COUNT(*) AS graves\nFROM eventos WHERE severidad >= 4 AND pais_iso3 IS NOT NULL\nGROUP BY 1 ORDER BY 2 DESC LIMIT 20;"],
  ["Tendencia diaria de un país", "SELECT dia, n FROM conteos WHERE tipo = 'pais' AND clave = 'MEX' ORDER BY dia;"],
  ["Semana contra semana por área", "WITH s AS (\n  SELECT clave AS area, date_trunc('week', CAST(dia AS DATE)) AS semana, SUM(n) AS n\n  FROM conteos WHERE tipo = 'area' GROUP BY 1, 2)\nSELECT area, semana, n, n - LAG(n) OVER (PARTITION BY area ORDER BY semana) AS cambio\nFROM s ORDER BY area, semana;"],
  ["Fuentes que más aportan", "SELECT fuente, COUNT(*) AS eventos FROM eventos GROUP BY 1 ORDER BY 2 DESC LIMIT 25;"],
];
$("s-ej").innerHTML = EJEMPLOS.map(([n], i) => `<option value="${i}">Ejemplo: ${esc(n)}</option>`).join("");
$("s-ej").onchange = () => { $("s-q").value = EJEMPLOS[$("s-ej").value][1]; };
$("s-q").value = EJEMPLOS[0][1];
let conexion = null, ultimo = null;
async function duck() {
  if (conexion) return conexion;
  $("s-estado").textContent = "Descargando DuckDB-WASM…";
  const duckdb = await import("https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/+esm");
  const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
  const url = URL.createObjectURL(new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" }));
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), new Worker(url));
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(url);
  const cols = ["id", "fecha_utc", "titulo", "fuente", "url", "pais_iso3", "region", "lat", "lon", "area_principal", "severidad", "tipo_fuente", "verificado", "confianza_clasificacion"];
  await db.registerFileText("eventos.json", JSON.stringify(eventos.map((e) => Object.fromEntries(cols.map((c) => [c, e[c] ?? null])))));
  const filas = dias.flatMap((d) => [...Object.entries(d.areas || {}).map(([k, n]) => ({ dia: d.dia, tipo: "area", clave: k, n })),
    ...Object.entries(d.paises || {}).map(([k, n]) => ({ dia: d.dia, tipo: "pais", clave: k, n })), ...Object.entries(d.sev || {}).map(([k, n]) => ({ dia: d.dia, tipo: "sev", clave: k, n }))]);
  await db.registerFileText("conteos.json", JSON.stringify(filas.length ? filas : [{ dia: null, tipo: null, clave: null, n: 0 }]));
  conexion = await db.connect();
  await conexion.query("CREATE TABLE eventos AS SELECT * FROM read_json_auto('eventos.json')");
  await conexion.query("CREATE TABLE conteos AS SELECT * FROM read_json_auto('conteos.json')");
  return conexion;
}
$("s-btn").onclick = async () => {
  try {
    const c = await duck();
    $("s-estado").textContent = "Ejecutando…";
    const t0 = performance.now();
    const r = await c.query($("s-q").value);
    const cols = r.schema.fields.map((f) => f.name), filas = r.toArray().map((x) => x.toJSON());
    ultimo = { cols, filas };
    $("s-res").innerHTML = `<table class="t"><tr>${cols.map((c2) => `<th>${esc(c2)}</th>`).join("")}</tr>${filas.slice(0, 500).map((f) => `<tr>${cols.map((c2) => `<td>${esc(String(f[c2] ?? ""))}</td>`).join("")}</tr>`).join("")}</table>`;
    $("s-estado").textContent = `${filas.length} filas en ${Math.round(performance.now() - t0)} ms${filas.length > 500 ? " (se muestran 500; el CSV las trae todas)" : ""}`;
    $("s-csv").hidden = false;
  } catch (e) { $("s-estado").textContent = `Error: ${e.message}`; }
};
$("s-csv").onclick = () => {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  descargar("consulta.csv", "﻿" + [ultimo.cols.map(q).join(","), ...ultimo.filas.map((f) => ultimo.cols.map((c) => q(f[c])).join(","))].join("\n"));
};

// ------------------------------------------------------------------ exportar
$("e-area").innerHTML += (tax.areas || []).map((a) => `<option value="${a.id}">${esc(a.nombre)}</option>`).join("");
const filtrados = () => eventos.filter((e) => (!$("e-pais").value || e.pais_iso3 === $("e-pais").value.toUpperCase()) && (!$("e-area").value || e.area_principal === $("e-area").value) && e.severidad >= Number($("e-sev").value));
const contar = () => { $("e-n").textContent = `${filtrados().length} eventos con estos filtros.`; };
for (const id of ["e-pais", "e-area", "e-sev"]) $(id).addEventListener("input", contar);
contar();
$("e-btn").onclick = () => descargar(`eventos-dominus-${new Date().toISOString().slice(0, 10)}.csv`, "﻿" + A.eventosCSV(filtrados()));

// ------------------------------------------------------------------ calidad de datos
if (log) {
  const c = log.calidad || {};
  const fr = A.frescura([{ nombre: "Ingesta de noticias", actualizado: log.generado_utc, cada_h: (log.intervalo_minutos || 60) / 60 }])[0];
  $("q-ingesta").innerHTML = `<b>Ingesta de noticias:</b> <span class="${fr.estado === "al día" ? "ok" : "mal"}">${fr.estado}</span> (hace ${fr.horas} h) · ${log.eventos_total} eventos, ${log.eventos_nuevos} nuevos ·
    sin país: ${c.sin_pais ?? "—"} · clasificación con confianza baja: ${c.confianza_baja ?? "—"} · con varias fuentes: ${c.con_varias_fuentes ?? "—"} · verificados: ${c.verificados ?? "—"}
    · descartados: ${Object.entries(log.descartados || {}).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(", ")}`;
  $("q-fuentes").innerHTML = `<tr><th>Fuente</th><th>Estado</th><th>Eventos</th><th>Segundos</th><th>Error</th></tr>` + (log.fuentes || []).map((f) =>
    `<tr><td>${esc(f.nombre)}</td><td class="${f.estado === "ok" ? "ok" : "mal"}">${esc(f.estado)}</td><td>${f.eventos ?? ""}</td><td>${f.segundos ?? ""}</td><td class="meta">${esc(f.error || "")}</td></tr>`).join("");
} else $("q-ingesta").textContent = "No se encontró data/run-log.json.";
const fams = Object.entries(capas.familias || {}).map(([k, v]) => ({ nombre: k, actualizado: v.actualizado_utc, cada_h: 24 * 31, objetos: v.objetos, estado_capa: v.estado, error: v.error }));
$("q-capas").innerHTML = `<tr><th>Capa</th><th>Estado</th><th>Objetos</th><th>Actualizada</th><th>Frescura</th><th>Error</th></tr>` + A.frescura(fams).sort((a, b) => (b.horas ?? 1e9) - (a.horas ?? 1e9)).map((f) =>
  `<tr><td>${esc(f.nombre)}</td><td class="${f.estado_capa === "ok" ? "ok" : "mal"}">${esc(f.estado_capa || "")}</td><td>${f.objetos ?? ""}</td><td>${esc(String(f.actualizado || "").slice(0, 16).replace("T", " "))}</td>
   <td class="${f.estado === "al día" ? "ok" : f.estado === "atrasada" ? "med" : "mal"}">${f.estado}</td><td class="meta">${esc(f.error || "")}</td></tr>`).join("");
