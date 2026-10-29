// Interfaz de matriz.html. Lógica en matriz-logica.js.
import { esc, getJSON, safeUrl } from "./util.js";
import * as M from "./matriz-logica.js";
import * as LIC from "./licencias.js";
import { exportar, exportarDocumento, htmlSelectorExportar, htmlSelectorDocumento } from "./exportar.js";

const $ = (id) => document.getElementById(id);
const leer = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch (e) { return def; } };
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* modo privado */ } };

const [gz, tax] = await Promise.all([getJSON("config/gazetteer.json"), getJSON("config/taxonomy.json").catch(() => ({ areas: [] }))]);
const paises = gz.paises || {}, iso2De = Object.fromEntries(Object.entries(gz.iso2_a_iso3 || {}).map(([a, b]) => [b, a]));
const areas = Object.fromEntries((tax.areas || []).map((a) => [a.id, a.nombre]));
const q = new URLSearchParams(location.search);
$("mz-pais").innerHTML = Object.entries(paises).sort((a, b) => a[1].es.localeCompare(b[1].es, "es")).map(([i, p]) => `<option value="${i}">${esc(p.es)}</option>`).join("");
$("mz-pais").value = (q.get("pais") || leer("gp_mz_pais", "MEX")).toUpperCase();

// Versión de pago: sin las fuentes de uso no comercial (config/comercial_licencias.json).
if (LIC.vistaActual() === "pago") {
  const [lic, cat, planes] = await Promise.all([getJSON("config/comercial_licencias.json"), getJSON("config/entities.json"), getJSON("config/planes.json")]);
  LIC.aplicarARiesgos(M.FUENTES, LIC.restricciones(lic, cat, planes));
}
const sel = new Set(leer("gp_mz_fuentes", M.FUENTES.filter((f) => f.id !== "anomalias" && f.id !== "bolidos").map((f) => f.id)));
let grupoPrev = "";
$("mz-fuentes").innerHTML = M.FUENTES.map((f) => { const t = f.grupo !== grupoPrev ? `<h3>${esc(f.grupo)}</h3>` : ""; grupoPrev = f.grupo;
  return `${t}<label><input type="checkbox" data-f="${f.id}" ${sel.has(f.id) ? "checked" : ""}> ${esc(f.nombre)}</label>`; }).join("");
const leerSel = () => { const s = [...document.querySelectorAll("[data-f]:checked")].map((x) => x.dataset.f); guardar("gp_mz_fuentes", s); return s; };
$("mz-todas").onclick = () => { for (const x of document.querySelectorAll("[data-f]")) x.checked = true; };
$("mz-ninguna").onclick = () => { for (const x of document.querySelectorAll("[data-f]")) x.checked = false; };

const cache = {};
const cargar = (f) => (cache[f.id] ??= getJSON(f.url, { bust: !f.estatica }).then((d) => (f.tipo === "eventos" ? d.eventos || [] : d.features || [])).catch(() => null));
let poligonos = null, ultimo = null, celdaSel = null;

async function generar() {
  const iso = $("mz-pais").value, nombre = paises[iso]?.es || iso, fs = leerSel();
  guardar("gp_mz_pais", iso);
  if (!fs.length) { $("mz-estado").textContent = "Elige al menos una fuente."; return; }
  $("mz-estado").textContent = "Descargando fuentes…";
  poligonos ??= await getJSON("data/base/countries.geojson").then((g) => Object.fromEntries(g.features.map((f) => [f.properties.iso3, f.geometry]))).catch(() => ({}));
  const datos = {}, faltan = [];
  await Promise.all(M.FUENTES.filter((f) => fs.includes(f.id)).map(async (f) => { const d = await cargar(f); if (d) datos[f.id] = d; else faltan.push(f.nombre); }));
  const ctx = { iso2: iso2De[iso] || "", nombres: [paises[iso]?.en, paises[iso]?.es].filter(Boolean).map((x) => x.toLowerCase()), poligono: poligonos[iso], areas };
  const r = M.construir(datos, iso, ctx, fs);
  ultimo = { iso, nombre, r };
  celdaSel = null;
  $("mz-res").hidden = false;
  $("mz-estado").textContent = `${r.filas.length} datos de ${nombre}${faltan.length ? ` · sin datos de: ${faltan.join(", ")}` : ""}`;
  $("mz-indice").textContent = r.indice;
  $("mz-n").textContent = `${r.filas.length} datos · ${Object.keys(r.porFuente).length} fuentes con datos del país`;
  pintarGrid();
  const tTema = Object.entries(r.porTema).sort((a, b) => b[1].suma - a[1].suma);
  $("mz-temas").innerHTML = `<tr><th>Tema</th><th>Datos</th><th>Puntaje promedio</th><th>Máximo</th><th>Nivel máximo</th></tr>` + tTema.map(([t, v]) =>
    `<tr><td>${esc(t)}</td><td>${v.n}</td><td>${(v.suma / v.n).toFixed(1)}</td><td>${v.max}</td><td class="n-${M.nivelDe(v.max).replace("í", "i")}">${M.nivelDe(v.max)}</td></tr>`).join("");
  $("mz-fuentes-n").innerHTML = `<tr><th>Fuente</th><th>Datos del país</th></tr>` + Object.entries(r.porFuente).sort((a, b) => b[1] - a[1]).map(([f, n]) => `<tr><td>${esc(f)}</td><td>${n}</td></tr>`).join("");
  $("mz-top").innerHTML = filasTabla(r.filas.slice(0, 30));
}
const filasTabla = (fs) => `<tr><th>P</th><th>I</th><th>Nivel</th><th>Dato</th><th>Tema</th><th>Fuente</th><th>Fecha</th></tr>` + fs.map((f) => `<tr><td>${f.p}</td><td>${f.i}</td><td class="n-${M.nivelDe(f.puntaje).replace("í", "i")}">${M.nivelDe(f.puntaje)}</td>
  <td>${f.url ? `<a href="${esc(safeUrl(f.url))}" target="_blank" rel="noopener noreferrer">${esc(f.titulo)}</a>` : esc(f.titulo)}</td><td>${esc(f.tema)}</td><td>${esc(f.fuente)}</td><td>${esc(f.fecha)}</td></tr>`).join("");
function pintarGrid() {
  const c = ultimo.r.celdas;
  let h = "";
  for (let p = 5; p >= 1; p--) {
    h += `<div class="eje">${p}</div>`;
    for (let i = 1; i <= 5; i++) { const n = c[p - 1][i - 1].length; h += `<button type="button" class="n-${M.nivelDe(p * i).replace("í", "i")}" data-c="${p}-${i}" ${n ? "" : "disabled"} aria-label="Probabilidad ${p}, impacto ${i}: ${n} datos">${n || ""}</button>`; }
  }
  $("mz-grid").innerHTML = h + `<div></div>${[1, 2, 3, 4, 5].map((i) => `<div class="eje">${i}</div>`).join("")}`;
}
$("mz-grid").addEventListener("click", (e) => {
  const b = e.target.closest("[data-c]");
  if (!b) return;
  const [p, i] = b.dataset.c.split("-").map(Number);
  celdaSel = [p, i];
  $("mz-celda").innerHTML = `<h3>Probabilidad ${p} × impacto ${i} (${ultimo.r.celdas[p - 1][i - 1].length})</h3><div class="desliza"><table class="t">${filasTabla(ultimo.r.celdas[p - 1][i - 1])}</table></div>`;
});
$("mz-btn").onclick = () => generar().catch((e) => { $("mz-estado").textContent = `Error: ${e.message}`; });

$("mz-exp").innerHTML = htmlSelectorExportar("mzx");
$("mzx-btn").onclick = () => ultimo && exportar($("mzx-fmt").value, ["p", "i", "puntaje", "titulo", "tema", "grupo", "fuente", "fecha", "url"], ultimo.r.filas.map((f) => ({ ...f, nivel: M.nivelDe(f.puntaje) })),
  { titulo: `Matriz de riesgo ${ultimo.nombre}`, nota: `Índice ${ultimo.r.indice}/100 · ${ultimo.r.filas.length} datos`, tabla: "matriz_riesgo" });
$("mz-doc").innerHTML = htmlSelectorDocumento("mzd");
// Colores en línea para el documento exportado (Word, PDF e impresión no cargan la hoja de estilos de la página).
const COLOR_NIVEL = { bajo: "#81C784", medio: "#FFD54F", alto: "#FFB74D", "crítico": "#E57373" };
$("mzd-btn").onclick = () => {
  if (!ultimo) return;
  const { nombre, r } = ultimo;
  const html = `<h1>Matriz de riesgo: ${esc(nombre)}</h1><p class="meta">DOMINUS OSINT · ${new Date().toISOString().slice(0, 10)} · fuentes: ${esc(Object.keys(r.porFuente).join(", "))}</p>
    <p><b>Índice de riesgo:</b> ${r.indice}/100 con ${r.filas.length} datos.</p>${$("mz-ia-res").hidden ? "" : `<h2>Resumen ejecutivo</h2><p>${esc($("mz-ia-res").textContent).replace(/\n/g, "<br>")}</p>`}
    <h2>Matriz 5×5 (número de datos)</h2><table><tr><th>P \\ I</th>${[1, 2, 3, 4, 5].map((i) => `<th>${i}</th>`).join("")}</tr>${[5, 4, 3, 2, 1].map((p) => `<tr><th>${p}</th>${[1, 2, 3, 4, 5].map((i) => `<td style="background:${COLOR_NIVEL[M.nivelDe(p * i)]};text-align:center;font-weight:700">${r.celdas[p - 1][i - 1].length || ""}</td>`).join("")}</tr>`).join("")}</table>
    <h2>Por tema</h2><table>${$("mz-temas").innerHTML}</table><h2>Riesgos principales</h2><table>${filasTabla(r.filas.slice(0, 40))}</table>`
      .replace(/<td class="n-(bajo|medio|alto|critico)">/g, (_, n) => `<td style="background:${COLOR_NIVEL[n === "critico" ? "crítico" : n]};font-weight:600">`);
  exportarDocumento($("mzd-fmt").value, { titulo: `Matriz de riesgo ${nombre}`, html }).catch((e) => alert(e.message));
};
$("mz-ia").onclick = async () => {
  if (!ultimo) return;
  const out = $("mz-ia-res"); out.hidden = false;
  const CH = await import("./chat_ia.js");
  const k = CH.leerLlave()?.llave;
  if (!k) { out.textContent = "Guarda tu llave de Groq en el mapa (Herramientas → «Preguntar a la IA») para usar el resumen."; return; }
  out.textContent = "Redactando…";
  try { await CH.completar(M.promptMatriz(ultimo.nombre, ultimo.r), k, { onTexto: (t) => { out.textContent = t; } }); } catch (e) { out.textContent = CH.mensajeError ? CH.mensajeError(e) : e.message; }
};
if (q.get("pais")) generar();
