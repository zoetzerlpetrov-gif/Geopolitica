// Interfaz de inmuebles.html: evaluador de riesgo por ubicación, lista propia y fuentes oficiales por país.
import { esc, safeUrl, getJSON } from "./util.js";
import * as R from "./inmuebles-logica.js";

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

// ------------------------------------------------------------------ evaluar
let volcanes = null;
const json = async (u) => (await fetch(u)).json();
async function indicadorBM(iso, ind) {
  const d = await json(`https://api.worldbank.org/v2/country/${iso}/indicator/${ind}?format=json&mrnev=1`);
  const v = d?.[1]?.[0];
  return v && v.value != null ? { valor: Number(v.value), anio: v.date } : null;
}
let ultimo = null;
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
