// Interfaz de analitica.html. Lógica en analitica-logica.js.
import { esc, getJSON } from "./util.js";
import * as A from "./analitica-logica.js";
import { exportar, htmlSelectorExportar } from "./exportar.js";
import { REGION } from "./card.js";

const $ = (id) => document.getElementById(id);

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
const paises = (await getJSON("config/gazetteer.json").catch(() => ({ paises: {} }))).paises || {};
const np = (iso) => A.nombrePais(paises, iso);
const enlacePais = (iso) => `<a href="./#pais=${esc(iso)}" title="Ver ${esc(paises[iso]?.es || iso)} en el mapa">${esc(np(iso))}</a>`;
const dias = stats.dias || [], eventos = ev.eventos || [];
const nombreArea = Object.fromEntries((tax.areas || []).map((a) => [a.id, a.nombre]));

// ------------------------------------------------------------------ tendencias
const topPaises = Object.entries(dias.reduce((s, d) => { for (const [p, n] of Object.entries(d.paises || {})) s[p] = (s[p] || 0) + n; return s; }, {}))
  .sort((a, b) => b[1] - a[1]).slice(0, 40).map(([p]) => p);
$("t-met").innerHTML = `<option value="total">Total de eventos</option><optgroup label="Áreas temáticas">${(tax.areas || []).map((a) => `<option value="area:${a.id}">${esc(a.nombre)}</option>`).join("")}</optgroup>`
  + `<optgroup label="Severidad">${[5, 4, 3].map((s) => `<option value="sev:${s}">Severidad ${s}</option>`).join("")}</optgroup>`
  + `<optgroup label="Países con más eventos">${topPaises.map((p) => `<option value="pais:${p}">${esc(np(p))}</option>`).join("")}</optgroup>`;
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
  `<tr><td>${enlacePais(x.pais)}</td><td>${x.previo}</td><td>${x.reciente}</td><td>${x.razon ?? "nuevo"}</td><td>${idx.paises?.[x.pais]?.indice ?? "—"}</td></tr>`).join("") || `<tr><td colspan="5" class="meta">Sin historial suficiente.</td></tr>`);

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
  const isos = A.resolverPaises($("c-paises").value, paises);
  if (!isos.length) { $("c-res").innerHTML = `<p class="meta">No reconocí ningún país. Escribe el nombre (México) o el código ISO de 3 letras (MEX).</p>`; return; }
  $("c-res").innerHTML = `<p class="meta">Consultando al Banco Mundial…</p>`;
  const bm = await Promise.all(isos.map((iso) => Promise.all(A.INDICADORES_BM.map(([cod]) =>
    fetch(`https://api.worldbank.org/v2/country/${iso}/indicator/${cod}?format=json&mrnev=1`).then((r) => r.json()).then(A.leerBM).catch(() => null)))));
  const fmt = (x, dec) => (x == null ? "—" : `${x.valor.toLocaleString("es-MX", { maximumFractionDigits: dec, minimumFractionDigits: dec })} <span class="meta">(${x.anio})</span>`);
  const perf = isos.map((iso) => A.perfilPais(eventos, iso));
  const areas = [...new Set(perf.flatMap((p) => Object.keys(p.areas)))].sort((a, b) => perf.reduce((s, p) => s + (p.areas[b] || 0), 0) - perf.reduce((s, p) => s + (p.areas[a] || 0), 0)).slice(0, 8);
  $("c-res").innerHTML = `<table class="t"><tr><th>Indicador</th>${isos.map((i) => `<th>${enlacePais(i)}</th>`).join("")}</tr>`
    + A.INDICADORES_BM.map(([, n, u, dec], j) => `<tr><td>${esc(n)}${u ? ` (${u})` : ""}</td>${isos.map((_, i) => `<td>${fmt(bm[i][j], dec)}</td>`).join("")}</tr>`).join("")
    + `<tr><td>Índice DOMINUS (0-100, 30 días)</td>${isos.map((i) => `<td>${idx.paises?.[i]?.indice ?? "—"}</td>`).join("")}</tr>`
    + `<tr><td>Eventos vigentes en el mapa</td>${perf.map((p) => `<td>${p.total} (${p.graves} graves)</td>`).join("")}</tr>`
    + areas.map((a) => `<tr><td class="meta">· ${esc(nombreArea[a] || a)}</td>${perf.map((p) => `<td>${p.areas[a] || 0}</td>`).join("")}</tr>`).join("") + `</table>`;
};

// ------------------------------------------------------------------ SQL con DuckDB-WASM
$("s-ej").innerHTML = A.EJEMPLOS.map(([n], i) => `<option value="${i}">Ejemplo: ${esc(n)}</option>`).join("");
$("s-ej").onchange = () => { $("s-q").value = A.EJEMPLOS[$("s-ej").value][1]; };
$("s-q").value = A.EJEMPLOS[0][1];
$("s-er").innerHTML = A.diagramaER() + `<p class="meta">Línea continua: relación directa. Línea punteada: relación que depende de <code>conteos.tipo</code> (‘pais’ o ‘area’). Pasa el puntero sobre una línea para ver la unión.</p>`;
$("s-cols").innerHTML = Object.entries(A.ESQUEMA).map(([t, d]) => `<h3>${t} <span class="meta">— ${esc(d.desc)}</span></h3><div class="desliza"><table class="t"><tr><th>Columna</th><th>Tipo</th><th>Qué es</th></tr>${d.cols.map(([c, ti, de]) => `<tr><td><code>${c}</code></td><td>${ti}</td><td>${esc(de)}</td></tr>`).join("")}</table></div>`).join("")
  + `<p class="meta">Ejemplo de unión: <code>SELECT p.nombre, COUNT(*) FROM eventos e JOIN paises p ON p.iso3 = e.pais_iso3 GROUP BY 1</code></p>`;
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
  const cols = A.ESQUEMA.eventos.cols.map(([c]) => c);
  await db.registerFileText("eventos.json", JSON.stringify(eventos.map((e) => Object.fromEntries(cols.map((c) => [c, e[c] ?? null])))));
  const filas = dias.flatMap((d) => [...Object.entries(d.areas || {}).map(([k, n]) => ({ dia: d.dia, tipo: "area", clave: k, n })),
    ...Object.entries(d.paises || {}).map(([k, n]) => ({ dia: d.dia, tipo: "pais", clave: k, n })), ...Object.entries(d.sev || {}).map(([k, n]) => ({ dia: d.dia, tipo: "sev", clave: k, n }))]);
  await db.registerFileText("conteos.json", JSON.stringify(filas.length ? filas : [{ dia: null, tipo: null, clave: null, n: 0 }]));
  await db.registerFileText("paises.json", JSON.stringify(Object.entries(paises).map(([iso3, p]) => ({ iso3, nombre: p.es, nombre_en: p.en, region: p.region ?? null, region_nombre: REGION[p.region] ?? p.region ?? null, lat: p.lat ?? null, lon: p.lon ?? null }))));
  await db.registerFileText("areas.json", JSON.stringify((tax.areas || []).map((a) => ({ id: a.id, nombre: a.nombre }))));
  conexion = await db.connect();
  // Días y horas en UTC (como el resto del sitio) aunque el navegador esté en otra zona horaria.
  try { await conexion.query("SET TimeZone = 'UTC'"); } catch { /* sin ICU no hay zonas: ya trabaja en UTC */ }
  for (const t of ["eventos", "conteos", "paises", "areas"]) await conexion.query(`CREATE TABLE ${t} AS SELECT * FROM read_json_auto('${t}.json')`);
  return conexion;
}

// Mapa pequeño del resultado: MapLibre del propio sitio y el contorno de países local (sin teselas de terceros).
let mini = null;
async function mapaResultado(pts) {
  const caja = $("s-mapa");
  caja.hidden = !pts;
  if (!pts) return;
  if (!window.maplibregl) {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "vendor/maplibre-gl/maplibre-gl.css"; document.head.appendChild(css);
    await new Promise((ok, mal) => { const sc = document.createElement("script"); sc.src = "vendor/maplibre-gl/maplibre-gl.js"; sc.onload = ok; sc.onerror = mal; document.head.appendChild(sc); });
  }
  const max = Math.max(1, ...pts.map((p) => p.valor || 0));
  const datos = { type: "FeatureCollection", features: pts.map((p) => ({ type: "Feature", geometry: { type: "Point", coordinates: [p.lon, p.lat] }, properties: { e: p.etiqueta, v: p.valor, r: 4 + 14 * Math.sqrt((p.valor || 0) / max) } })) };
  if (!mini) {
    mini = new maplibregl.Map({ container: caja, attributionControl: false, style: { version: 8, sources: { p: { type: "geojson", data: "data/base/countries-110m.geojson" } },
      layers: [{ id: "fondo", type: "background", paint: { "background-color": "#cfe3f2" } }, { id: "p", type: "fill", source: "p", paint: { "fill-color": "#f4f1ea", "fill-outline-color": "#9aa" } }] }, center: [0, 20], zoom: 0.6 });
    await new Promise((ok) => mini.once("load", ok));
    mini.addSource("r", { type: "geojson", data: datos });
    mini.addLayer({ id: "r", type: "circle", source: "r", paint: { "circle-radius": ["get", "r"], "circle-color": "#C8102E", "circle-opacity": 0.7, "circle-stroke-color": "#fff", "circle-stroke-width": 1 } });
    mini.on("click", "r", (e) => new maplibregl.Popup().setLngLat(e.lngLat).setText(`${e.features[0].properties.e}: ${e.features[0].properties.v}`).addTo(mini));
  } else mini.getSource("r").setData(datos);
  mini.resize();
  const xs = pts.map((p) => p.lon), ys = pts.map((p) => p.lat);
  if (pts.length > 1) mini.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 30, maxZoom: 6, duration: 0 });
  else mini.jumpTo({ center: [pts[0].lon, pts[0].lat], zoom: 5 });
}

$("s-exp").innerHTML = htmlSelectorExportar("sx");
$("s-btn").onclick = async () => {
  try {
    const c = await duck();
    $("s-estado").textContent = "Ejecutando…";
    const t0 = performance.now();
    const r = await c.query($("s-q").value);
    const cols = r.schema.fields.map((f) => f.name), filas = A.filasJS(r.schema.fields, r.toArray().map((x) => x.toJSON()));
    const sug = A.sugerirGrafico(cols, filas);
    const svg = A.graficoSVG(sug, filas, (v) => (sug && /pais|iso3|clave/i.test(sug.x) && paises[v] ? paises[v].es : String(v ?? "")));
    ultimo = { cols, filas, svg };
    $("s-graf").innerHTML = svg;
    $("s-res").innerHTML = `<table class="t"><tr>${cols.map((c2) => `<th>${esc(c2)}</th>`).join("")}</tr>${filas.slice(0, 500).map((f) => `<tr>${cols.map((c2) => {
      const v = f[c2];
      return `<td>${typeof v === "string" && /^https?:\/\//.test(v) ? `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(v)}</a>` : typeof v === "string" && /^[A-Z]{3}$/.test(v) && paises[v] ? enlacePais(v) : esc(String(v ?? ""))}</td>`;
    }).join("")}</tr>`).join("")}</table>`;
    $("s-estado").textContent = `${filas.length} filas en ${Math.round(performance.now() - t0)} ms${filas.length > 500 ? " (se muestran 500; la exportación las trae todas)" : ""}`;
    $("s-exp").hidden = false;
    await mapaResultado(A.puntosMapa(cols, filas, paises)).catch(() => { $("s-mapa").hidden = true; });
  } catch (e) { $("s-estado").textContent = `Error: ${e.message}`; }
};
$("sx-btn").addEventListener("click", async () => {
  if (!ultimo) return;
  try { await exportar($("sx-fmt").value, ultimo.cols, ultimo.filas, { titulo: "Consulta DOMINUS", nota: $("s-q").value, svg: ultimo.svg, tabla: "resultado" }); }
  catch (err) { $("s-estado").textContent = `No se pudo exportar: ${err.message}`; }
});

// ------------------------------------------------------------------ exportar
$("e-area").innerHTML += (tax.areas || []).map((a) => `<option value="${a.id}">${esc(a.nombre)}</option>`).join("");
$("lista-paises").innerHTML = Object.entries(paises).map(([iso, p]) => `<option value="${esc(p.es)}">${iso}</option>`).join("");
const isoFiltro = () => A.resolverPaises($("e-pais").value, paises, 1)[0] || "";
const filtrados = () => eventos.filter((e) => (!$("e-pais").value.trim() || e.pais_iso3 === isoFiltro()) && (!$("e-area").value || e.area_principal === $("e-area").value) && e.severidad >= Number($("e-sev").value));
const contar = () => { $("e-n").textContent = `${filtrados().length} eventos con estos filtros.`; };
for (const id of ["e-pais", "e-area", "e-sev"]) $(id).addEventListener("input", contar);
contar();
$("e-exp").innerHTML = htmlSelectorExportar("ex");
$("ex-btn").onclick = () => {
  const cols = ["fecha_utc", "pais_iso3", "pais", "area_principal", "severidad", "titulo", "fuente", "url", "lat", "lon"];
  const filas = filtrados().map((e) => ({ ...e, pais: paises[e.pais_iso3]?.es || "", fuente: typeof e.fuente === "string" ? e.fuente : e.fuente?.nombre || "" }));
  exportar($("ex-fmt").value, cols, filas, { titulo: "Eventos DOMINUS", tabla: "eventos" }).catch((err) => { $("e-n").textContent = `No se pudo exportar: ${err.message}`; });
};

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
