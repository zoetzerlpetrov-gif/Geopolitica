// Interfaz de inmuebles.html: evaluador de riesgo por ubicación, lista propia y fuentes oficiales por país.
import { esc, safeUrl, getJSON } from "./util.js";
import * as R from "./inmuebles-logica.js";
import * as Z from "./inmuebles-zonas.js";

const $ = (id) => document.getElementById(id);
const leer = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch (e) { return def; } };
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* modo privado */ } };
const descargar = (nombre, texto, tipo) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([texto], { type: tipo })); a.download = nombre; a.click(); };

document.querySelector(".pestanas").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-p]");
  if (!b) return;
  for (const x of document.querySelectorAll(".pestanas button")) x.setAttribute("aria-selected", String(x === b));
  for (const p of document.querySelectorAll(".panel")) p.hidden = p.id !== `p-${b.dataset.p}`;
});

const fuentes = await getJSON("config/inmuebles_fuentes.json");
$("ev-pais").innerHTML = fuentes.paises.map((p) => `<option value="${p.iso3}">${esc(p.nombre)}</option>`).join("") + `<option value="">Otro país (sin fuentes)</option>`;

// ------------------------------------------------------------------ fuentes por país
$("fu-nota").textContent = fuentes.nota;
const enlaces = (l) => l.length ? l.map(([n, u]) => `<a href="${esc(safeUrl(u))}" target="_blank" rel="noopener">${esc(n)}</a>`).join(" · ") : "<span class='meta'>sin fuente oficial identificada</span>";
$("fu-paises").innerHTML = fuentes.paises.map((p) => `<details class="tarjeta"><summary><b>${esc(p.nombre)}</b></summary>
  <p><b>Precios oficiales y transacciones:</b> ${enlaces(p.precios)}</p><p><b>Subastas y bienes adjudicados:</b> ${enlaces(p.subastas)}</p>
  <p><b>Riesgos por dirección:</b> ${enlaces(p.riesgo)}</p><p><b>Portales privados (solo enlace):</b> ${enlaces(p.portales)}</p>
  <p class="meta"><b>Compradores extranjeros:</b> ${esc(p.extranjeros)}</p></details>`).join("");

// ------------------------------------------------------------------ desarrollos en seguimiento
const ARCHIVOS_DES = ["america", "europa_sur", "europa_norte", "mx_cdmx", "mx_estados", "mx_veracruz", "mediterraneo_ita_hrv", "mediterraneo_fra_esp", "europa_centro_este", "caribe"];
const desarrollos = await Promise.all(ARCHIVOS_DES.map((n) => getJSON(`config/inmuebles_desarrollos/${n}.json`).catch(() => ({ paises: {}, inmuebles: [] }))));
const reglas = R.unirReglas(desarrollos.map((d) => d.paises || {}));
const ofertas = desarrollos.flatMap((d) => d.inmuebles || []).map((x) => ({ ...x, compra: reglas[x.pais_iso3]?.compra_mexicanos?.puede || "" }));
try {
  const [ar, corr] = await Promise.all([getJSON("https://raw.githubusercontent.com/zoetzerlpetrov-gif/InmueblesAraSadasi/main/data/developments.json"),
    getJSON("config/inmuebles_desarrollos/_ara_sadasi_geo.json").then((x) => x.coords || {}).catch(() => ({}))]);
  for (const d of ar.developments || []) if (corr[d.id]) [d.lat, d.lon] = corr[d.id];
  for (const d of ar.developments || []) ofertas.push({ id: d.id, pais_iso3: "MEX", ciudad: d.city, estado: d.state, zona: d.city, lat: d.lat, lon: d.lon, tipo: "casa o departamento",
    nuevo: true, rehabilitacion: "no", desarrolladora: d.developer, proyecto: d.name, precio_desde: d.precio_min, precio_hasta: d.precio_max, moneda: "MXN", url: d.url,
    fuente: "InmueblesAraSadasi", visto: (ar.generated || "").slice(0, 10), compra: "sí" });
} catch (e) { /* sin ARA/SADASI: se muestran los demás */ }
const nombrePaisDe = (iso) => reglas[iso]?.nombre || fuentes.paises.find((p) => p.iso3 === iso)?.nombre || iso;
const opciones = (id, vals) => { $(id).innerHTML += [...new Set(vals.filter(Boolean))].sort().map((v) => `<option value="${esc(v)}">${esc(id === "de-pais" ? nombrePaisDe(v) : v)}</option>`).join(""); };
opciones("de-pais", ofertas.map((o) => o.pais_iso3));
opciones("de-tipo", ofertas.map((o) => o.tipo));
opciones("de-zona", ofertas.map((o) => o.zona_objetivo));
opciones("de-dev", ofertas.map((o) => o.desarrolladora));
const REHAB = { no: "No", ligera: "Ligera", integral: "Integral", desconocido: "—" };
const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("es-MX"));
const filtradas = () => ofertas.filter((o) => (!$("de-pais").value || o.pais_iso3 === $("de-pais").value) && (!$("de-zona").value || o.zona_objetivo === $("de-zona").value) && (!$("de-tipo").value || o.tipo === $("de-tipo").value)
  && (!$("de-dev").value || o.desarrolladora === $("de-dev").value) && (!$("de-nuevo").checked || o.nuevo) && (!$("de-compra").checked || o.compra === "sí"));
function pintarDes() {
  const f = filtradas();
  $("de-n").textContent = `${f.length} de ${ofertas.length} ofertas.`;
  $("de-tabla").innerHTML = `<tr><th>País</th><th>Ciudad / zona</th><th>Tipo</th><th>Desarrolladora y proyecto</th><th>Precio desde</th><th>Nuevo</th><th>Rehabilitación</th><th>¿Mexicano compra?</th><th>Consultado</th><th></th><th>Calle</th></tr>`
    + f.map((o) => `<tr><td>${esc(nombrePaisDe(o.pais_iso3))}</td><td>${esc([o.zona, o.ciudad].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", "))}</td><td>${esc(o.tipo || "")}</td>
      <td>${o.url ? `<a href="${esc(safeUrl(o.url))}" target="_blank" rel="noopener">${esc(`${o.desarrolladora || ""} · ${o.proyecto || ""}`)}</a>` : esc(`${o.desarrolladora || ""} · ${o.proyecto || ""}`)}</td>
      <td>${fmt(o.precio_desde)} ${esc(o.moneda || "")}</td><td>${o.nuevo ? "Sí" : "No"}</td><td>${esc(REHAB[o.rehabilitacion] || o.rehabilitacion || "—")}</td><td>${esc(o.compra || "—")}</td><td>${esc(o.visto || "")}</td>
      <td>${o.lat != null ? `<button type="button" class="btn" data-evaluar="${o.lat},${o.lon},${esc(o.pais_iso3)}" data-nombre="${esc(`${o.proyecto || o.ciudad}`)}">Evaluar</button>` : ""}</td>
      <td>${o.lat != null ? `<a href="${esc(R.urlCalle(o.lat, o.lon))}" target="_blank" rel="noopener noreferrer" title="Abre Google Street View en ese punto${o.precision && o.precision !== "proyecto" ? " (centro aproximado de la colonia)" : ""}">🚶 Ver</a>` : ""}</td></tr>`).join("");
}
for (const id of ["de-pais", "de-zona", "de-tipo", "de-dev", "de-nuevo", "de-compra"]) $(id).addEventListener("change", pintarDes);
pintarDes();
import("./exportar.js").then((X) => {
  $("de-exp").innerHTML = X.htmlSelectorExportar("dex");
  $("dex-btn").onclick = () => X.exportar($("dex-fmt").value, ["pais_iso3", "ciudad", "zona", "tipo", "desarrolladora", "proyecto", "precio_desde", "precio_hasta", "moneda", "nuevo", "rehabilitacion", "compra", "lat", "lon", "visto", "url"],
    filtradas(), { titulo: "Desarrollos inmobiliarios en seguimiento", nota: "Precios publicados por las desarrolladoras en la fecha de consulta; confirmar antes de decidir." });
});
$("de-tabla").addEventListener("click", (e) => {
  const b = e.target.closest("[data-evaluar]");
  if (!b) return;
  const [la, lo, iso] = b.dataset.evaluar.split(",");
  prellenar({ lat: la, lon: lo, pais: iso, nombre: b.dataset.nombre });
});

// ------------------------------------------------------------------ zonas en seguimiento (Fase 5: México y otros 27 países)
const [zonasMx, zonasMundo] = await Promise.all(["mx", "mundo"].map((n) => getJSON(`config/inmuebles_zonas_${n}.json`).catch(() => ({ zonas: [], portales: [], paises: {} }))));
const zonas = Z.unirCatalogos(zonasMx, zonasMundo);
// Reglas de compra para mexicanos: la primera lista de desarrollos que las trae (otras listas del mismo país pueden no tenerlas).
const compraMx = {};
for (const d of desarrollos) for (const [iso, r] of Object.entries(d.paises || {})) if (r?.compra_mexicanos?.detalle) compraMx[iso] ??= r.compra_mexicanos.detalle;
$("zo-nota").textContent = `${zonasMx.nota || ""} ${zonasMundo.nota || ""} Revisado: ${zonasMundo.revisado || zonasMx.revisado || "—"}.`;
$("zo-pais").innerHTML += [...new Set(zonas.zonas.map((z) => z.pais_iso3))].map((iso) => [iso, zonas.paises[iso]?.nombre || iso])
  .sort((x, y) => (x[0] === "MEX" ? -1 : y[0] === "MEX" ? 1 : x[1].localeCompare(y[1], "es"))).map(([iso, n]) => `<option value="${esc(iso)}">${esc(n)}</option>`).join("");
const llenarCiudades = () => { $("zo-ciudad").innerHTML = `<option value="">Todas</option>` + Z.ciudadesZonas(zonas, $("zo-pais").value).map((c) => `<option>${esc(c)}</option>`).join(""); };
llenarCiudades();
$("zo-tipo").innerHTML += [...new Set(zonas.zonas.flatMap((z) => z.tipos))].sort().map((t) => `<option>${esc(t)}</option>`).join("");
$("zo-oficiales").innerHTML = enlaces(zonas.oficiales || []);
function pintarZonas() {
  if (!$("zo-pais").value) { $("zo-lista").innerHTML = `<p class="meta">${zonas.zonas.length} zonas en ${new Set(zonas.zonas.map((z) => z.pais_iso3)).size} países. Elige un país para verlas.</p>`; return; }
  const f = Z.filtrarZonas(zonas, { pais: $("zo-pais").value, ciudad: $("zo-ciudad").value, tipo: $("zo-tipo").value });
  $("zo-lista").innerHTML = f.length ? f.map((z) => Z.htmlZona(z, zonas.paises[z.pais_iso3]?.portales || [], ofertas, $("zo-tipo").value, {
    idioma: zonas.idiomaDe(z.pais_iso3), pais: zonas.paises[z.pais_iso3],
    compra: z.pais_iso3 === "MEX" ? "" : compraMx[z.pais_iso3] || zonas.paises[z.pais_iso3]?.compra || "" })).join("") : `<p class="meta">Sin zonas con ese filtro.</p>`;
}
$("zo-pais").addEventListener("change", () => { llenarCiudades(); pintarZonas(); });
for (const id of ["zo-ciudad", "zo-tipo"]) $(id).addEventListener("change", pintarZonas);
// inmuebles.html?zona=<id> (ficha de la zona en el mapa): abre la pestaña con esa zona desplegada.
const zonaPedida = zonas.zonas.find((z) => z.id === new URLSearchParams(location.search).get("zona"));
$("zo-pais").value = zonaPedida?.pais_iso3 || "MEX";
llenarCiudades();
if (zonaPedida) $("zo-ciudad").value = zonaPedida.ciudad;
pintarZonas();
if (zonaPedida) {
  document.querySelector('.pestanas button[data-p="zonas"]').click();
  const d = $("zo-lista").querySelector(`[data-zona="${CSS.escape(zonaPedida.id)}"]`);
  if (d) { d.open = true; d.scrollIntoView({ block: "start" }); }
}
$("zo-lista").addEventListener("click", (e) => {
  const b = e.target.closest("[data-evaluar]");
  if (!b) return;
  const [la, lo, iso] = b.dataset.evaluar.split(",");
  prellenar({ lat: la, lon: lo, pais: iso, nombre: b.dataset.nombre });
});

// Reglas para compradores mexicanos y desarrolladoras, dentro de «Fuentes por país».
for (const [iso, r] of Object.entries(reglas)) {
  const caja = [...$("fu-paises").querySelectorAll("details")].find((d) => d.querySelector("summary b")?.textContent === fuentes.paises.find((p) => p.iso3 === iso)?.nombre);
  const c = r.compra_mexicanos || {};
  const html = `<div class="tarjeta"><p><b>🇲🇽 Para una persona mexicana: ${esc(c.puede || "—")}.</b> ${esc(c.detalle || "")}</p>
    ${c.costa ? `<p><b>Costa y playa:</b> ${esc(c.costa)}</p>` : ""}${c.terrenos_rurales ? `<p><b>Terrenos rurales:</b> ${esc(c.terrenos_rurales)}</p>` : ""}
    ${c.impuestos_y_costos ? `<p><b>Impuestos y costos de compra:</b> ${esc(c.impuestos_y_costos)}</p>` : ""}${c.financiamiento ? `<p><b>Financiamiento:</b> ${esc(c.financiamiento)}</p>` : ""}
    ${c.residencia ? `<p><b>Residencia:</b> ${esc(c.residencia)}</p>` : ""}${(c.fuentes || []).length ? `<p class="meta">Fuentes: ${enlaces(c.fuentes)}</p>` : ""}
    ${(r.desarrolladoras || []).length ? `<p><b>Principales desarrolladoras:</b> ${r.desarrolladoras.map((d) => d.url ? `<a href="${esc(safeUrl(d.url))}" target="_blank" rel="noopener">${esc(d.nombre)}</a> <span class="meta">(${esc(d.segmento || "")}; ${esc(d.regiones || "")})</span>` : esc(d.nombre)).join(" · ")}</p>` : ""}
    ${(r.busqueda || []).length ? `<p><b>Buscar en portales (solo enlace):</b> ${enlaces(r.busqueda)}</p>` : ""}</div>`;
  caja?.insertAdjacentHTML("beforeend", html);
}

// ------------------------------------------------------------------ evaluar
let volcanes = null;
const json = async (u) => (await fetch(u)).json();
async function indicadorBM(iso, ind) {
  const d = await json(`https://api.worldbank.org/v2/country/${iso}/indicator/${ind}?format=json&mrnev=1`);
  const v = d?.[1]?.[0];
  return v && v.value != null ? { valor: Number(v.value), anio: v.date } : null;
}
let ultimo = null;
// Ciudad + colonia → coordenadas (Nominatim). Si hay varias coincidencias, se elige una de la lista.
let iso2De = null;
$("ev-geo").onclick = async () => {
  const caja = $("ev-geo-res");
  iso2De ??= await getJSON("config/gazetteer.json").then((g) => Object.fromEntries(Object.entries(g.iso2_a_iso3 || {}).map(([a, b]) => [b, a]))).catch(() => ({}));
  const url = R.urlGeocodificar($("ev-ciudad").value, $("ev-colonia").value, iso2De[$("ev-pais").value] || "");
  if (!url) { caja.innerHTML = `<p class="meta">Escribe al menos la ciudad.</p>`; return; }
  caja.innerHTML = `<p class="meta">Buscando en OpenStreetMap…</p>`;
  try {
    const ops = R.opcionesGeocodificacion(await (await fetch(url)).json());
    if (!ops.length) { caja.innerHTML = `<p class="meta">Sin resultados. Prueba sin la colonia, con el nombre oficial o con otro país elegido.</p>`; return; }
    const poner = (o) => { $("ev-lat").value = o.lat.toFixed(6); $("ev-lon").value = o.lon.toFixed(6); caja.innerHTML = `<p class="meta">📍 ${esc(o.nombre)} — coordenadas puestas. Datos © OpenStreetMap (ODbL).</p>`; };
    if (ops.length === 1) return poner(ops[0]);
    caja.innerHTML = `<p class="meta">Elige el lugar correcto:</p><ul class="fuentes">${ops.map((o, i) => `<li><button type="button" class="btn" data-geo="${i}">${esc(o.nombre)}</button> <span class="meta">${esc(o.tipo)}</span></li>`).join("")}</ul><p class="meta">Datos © OpenStreetMap (ODbL).</p>`;
    caja.onclick = (e) => { const b = e.target.closest("[data-geo]"); if (b) poner(ops[Number(b.dataset.geo)]); };
  } catch (err) { caja.innerHTML = `<p class="meta">No se pudo consultar OpenStreetMap: ${esc(err.message)}</p>`; }
};

/** Llena el evaluador (desde la ficha del mapa o la tabla de desarrollos) y lo ejecuta. */
function prellenar({ lat, lon, pais, nombre }) {
  if (!lat || !lon) return;
  $("ev-lat").value = lat; $("ev-lon").value = lon;
  if (nombre) $("ev-nombre").value = nombre;
  if (pais && [...$("ev-pais").options].some((o) => o.value === pais)) $("ev-pais").value = pais;
  document.querySelector('.pestanas button[data-p="evaluar"]').click();
  setTimeout(() => $("ev-btn").click(), 0);
}

$("ev-btn").onclick = async () => {
  const lat = Number($("ev-lat").value), lon = Number($("ev-lon").value), iso = $("ev-pais").value;
  const out = $("ev-res");
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180) || !$("ev-lat").value || !$("ev-lon").value) { out.innerHTML = `<p class="tarjeta">Escribe latitud y longitud en grados decimales.</p>`; return; }
  out.innerHTML = `<p class="meta">Consultando USGS, Open-Meteo, Banco Mundial y los datos de DOMINUS…</p>`;
  const pts = R.puntosPendiente(lat, lon);
  const [sis, elev, pv, hom, ev, vol] = await Promise.all([
    json(`https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=${lat}&longitude=${lon}&maxradiuskm=150&minmagnitude=5&starttime=1975-01-01`).catch(() => null),
    json(`https://api.open-meteo.com/v1/elevation?latitude=${pts.map((p) => p[0].toFixed(5)).join(",")}&longitude=${pts.map((p) => p[1].toFixed(5)).join(",")}`).catch(() => null),
    iso ? indicadorBM(iso, "PV.EST").catch(() => null) : null,
    iso ? indicadorBM(iso, "VC.IHR.PSRC.P5").catch(() => null) : null,
    getJSON("data/events.json", { bust: true }).catch(() => ({ eventos: [] })),
    volcanes || getJSON("data/capas/volcanes_lista.json").then((d) => (volcanes = d.volcanes)).catch(() => null),
  ]);
  const dims = [];
  dims.push({ nombre: "Sismos", ...(sis ? R.riesgoSismico(sis.features || []) : { nivel: null, texto: "USGS no respondió." }) });
  dims.push({ nombre: "Volcanes", ...(vol ? R.riesgoVolcanico(lat, lon, vol) : { nivel: null, texto: "Lista de volcanes no disponible todavía (se genera con la próxima reconstrucción de capas)." }) });
  const e = elev?.elevation || [];
  dims.push({ nombre: "Deslaves e inundación (terreno)", ...R.riesgoTerreno(R.pendiente(e), e[0] != null ? Math.round(e[0]) : null) });
  dims.push({ nombre: "Estabilidad política", ...R.riesgoPolitico(pv?.valor ?? null), anio: pv?.anio });
  const cerca = (ev.eventos || []).filter((x) => x.area_principal === "seguridad" && x.lat != null && R.distanciaKm(lat, lon, x.lat, x.lon) <= 50);
  dims.push({ nombre: "Inseguridad", ...R.riesgoInseguridad(hom?.valor ?? null, cerca) });
  const global = R.riesgoGlobal(dims);
  const pm2 = R.precioM2($("ev-precio").value, $("ev-m2").value, $("ev-ref").value);
  ultimo = { id: Date.now().toString(36), nombre: $("ev-nombre").value || `${lat.toFixed(4)}, ${lon.toFixed(4)}`, pais: iso, lat, lon, tipo: $("ev-tipo").value,
    precio: $("ev-precio").value, moneda: $("ev-moneda").value, m2: $("ev-m2").value, link: $("ev-link").value, global,
    dims: dims.map((d) => ({ nombre: d.nombre, nivel: d.nivel })), fecha: new Date().toISOString().slice(0, 10) };
  out.innerHTML = `<div class="tarjeta ${global ? `n${global}` : ""}"><div class="grande">Riesgo de la ubicación: ${global ? R.NIVELES[global] : "sin datos"}</div>
    ${pm2 ? `<p>Precio por m²: <b>${pm2.m2.toLocaleString("es-MX")} ${esc($("ev-moneda").value)}</b>${pm2.dif != null ? ` · ${pm2.dif >= 0 ? "+" : ""}${pm2.dif} % frente a tu referencia de la zona` : ""}</p>` : ""}
    <p class="meta">La calificación global da más peso a la peor dimensión: un riesgo muy alto no se compensa con otros bajos.</p></div>
    <div class="desliza"><table class="t"><tr><th>Dimensión</th><th>Nivel</th><th>Por qué</th></tr>${dims.map((d) => `<tr class="${d.nivel ? `n${d.nivel}` : ""}"><td>${esc(d.nombre)}</td><td>${d.nivel ? R.NIVELES[d.nivel] : "—"}</td><td>${esc(d.texto)}${d.anio ? ` (${d.anio})` : ""}</td></tr>`).join("")}</table></div>
    <p><button type="button" class="btn" id="ev-guardar">⭐ Guardar en mi lista</button> <a class="btn" href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}" target="_blank" rel="noopener">Ver en OpenStreetMap</a></p>
    <p class="meta">Siguiente paso: revisa el atlas de riesgos oficial del país (pestaña «Fuentes por país»), el uso de suelo con el municipio y el certificado de libertad de gravamen antes de pagar.</p>`;
  $("ev-guardar").onclick = () => { const l = leer("gp_inmuebles", []); l.push(ultimo); guardar("gp_inmuebles", l); pintarLista(); $("ev-guardar").textContent = "Guardado ✓"; };
};

// ------------------------------------------------------------------ mi lista
function pintarLista() {
  const l = leer("gp_inmuebles", []);
  $("li-tabla").innerHTML = `<tr><th>Inmueble</th><th>País</th><th>Tipo</th><th>Precio</th><th>m²</th><th>Riesgo</th><th>Fecha</th><th></th></tr>` + (l.length ? l.map((x, i) => `<tr class="${x.global ? `n${x.global}` : ""}">
    <td>${x.link ? `<a href="${esc(safeUrl(x.link))}" target="_blank" rel="noopener noreferrer">${esc(x.nombre)}</a>` : esc(x.nombre)}<br><span class="meta">${x.lat}, ${x.lon}</span></td>
    <td>${esc(x.pais)}</td><td>${esc(x.tipo)}</td><td>${esc(x.precio)} ${esc(x.moneda)}</td><td>${esc(x.m2)}</td><td>${x.global ? R.NIVELES[x.global] : "—"}</td><td>${esc(x.fecha)}</td>
    <td><button type="button" class="btn" data-x="${i}" aria-label="Quitar">×</button></td></tr>`).join("") : `<tr><td colspan="8" class="meta">Aún no guardas inmuebles. Evalúa uno y presiona «Guardar en mi lista».</td></tr>`);
}
$("li-tabla").addEventListener("click", (e) => { const b = e.target.closest("[data-x]"); if (!b) return; const l = leer("gp_inmuebles", []); l.splice(Number(b.dataset.x), 1); guardar("gp_inmuebles", l); pintarLista(); });
$("li-csv").onclick = () => {
  const l = leer("gp_inmuebles", []), q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  descargar("mis-inmuebles.csv", "﻿" + [["nombre", "pais", "lat", "lon", "tipo", "precio", "moneda", "m2", "riesgo", "enlace", "fecha"], ...l.map((x) => [x.nombre, x.pais, x.lat, x.lon, x.tipo, x.precio, x.moneda, x.m2, x.global ? R.NIVELES[x.global] : "", x.link, x.fecha])].map((f) => f.map(q).join(",")).join("\n"), "text/csv");
};
$("li-json").onclick = () => descargar("mis-inmuebles.json", JSON.stringify(leer("gp_inmuebles", []), null, 1), "application/json");
$("li-imp").onchange = async (e) => { try { const d = JSON.parse(await e.target.files[0].text()); if (Array.isArray(d)) { guardar("gp_inmuebles", d); pintarLista(); } } catch (err) { alert("Archivo no válido"); } };
pintarLista();

// inmuebles.html?lat=…&lon=…&pais=…&nombre=… (botón «Evaluar riesgo completo» de la ficha del mapa)
{ const q = new URLSearchParams(location.search); if (q.get("lat") && q.get("lon")) prellenar({ lat: q.get("lat"), lon: q.get("lon"), pais: q.get("pais"), nombre: q.get("nombre") }); }
