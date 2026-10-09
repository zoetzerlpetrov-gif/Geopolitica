// Hacia dónde iría la ceniza de un volcán: viento pronosticado a tres alturas (Open-Meteo, modelo GFS/ICON,
// sin llave; se pide solo al abrir la ficha) y un cono en el mapa por cada altura con el recorrido en 6 h.
// Es una aproximación de trayectoria, no un modelo de dispersión: la referencia oficial para aviación son
// los avisos del VAAC (Washington para México) y, en tierra, CENAPRED y Protección Civil.
import { esc } from "./util.js";
import { conoCeniza, nombreRumbo, haciaDonde } from "./amenazas.js";

const NIVELES = [["500hPa", "#E0A100"], ["300hPa", "#E2711D"], ["200hPa", "#C0392B"]];
const SRC = "ceniza";

function horaActual(tiempos) {
  const ahora = Date.now();
  let mejor = 0;
  tiempos.forEach((t, i) => { if (Math.abs(Date.parse(`${t}Z`) - ahora) < Math.abs(Date.parse(`${tiempos[mejor]}Z`) - ahora)) mejor = i; });
  return mejor;
}

export function limpiarCeniza(map) {
  for (const id of [`${SRC}-relleno`, `${SRC}-borde`]) if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(SRC)) map.removeSource(SRC);
}

export async function mostrarCeniza(map, div) {
  const lon = Number(div.dataset.lon), lat = Number(div.dataset.lat);
  const vars = NIVELES.flatMap(([n]) => [`wind_speed_${n}`, `wind_direction_${n}`, `geopotential_height_${n}`]).join(",");
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=${vars}&forecast_hours=12&timezone=UTC`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Open-Meteo respondió ${r.status}`);
  const d = await r.json();
  const i = horaActual(d.hourly.time);
  const filas = NIVELES.map(([n, color]) => {
    const kmh = d.hourly[`wind_speed_${n}`][i], desde = d.hourly[`wind_direction_${n}`][i], alt = d.hourly[`geopotential_height_${n}`][i];
    return { n, color, kmh, desde, hacia: haciaDonde(desde), alt_km: alt / 1000, cono: conoCeniza([lon, lat], desde, kmh, 6) };
  }).filter((x) => Number.isFinite(x.kmh) && Number.isFinite(x.desde));
  limpiarCeniza(map);
  map.addSource(SRC, { type: "geojson", data: { type: "FeatureCollection", features: filas.map((x) => ({ type: "Feature", geometry: { type: "Polygon", coordinates: x.cono.coordinates }, properties: { color: x.color } })) } });
  map.addLayer({ id: `${SRC}-relleno`, type: "fill", source: SRC, paint: { "fill-color": ["get", "color"], "fill-opacity": 0.18 } });
  map.addLayer({ id: `${SRC}-borde`, type: "line", source: SRC, paint: { "line-color": ["get", "color"], "line-width": 1.5, "line-dasharray": [2, 2] } });
  div.innerHTML = `<h4>🌬️ Hacia dónde iría la ceniza (viento pronosticado ${esc(d.hourly.time[i].replace("T", " "))} UTC)</h4>
    <table class="tabla-ceniza"><thead><tr><th>Si la ceniza sube a…</th><th>Va hacia</th><th>Viento</th><th>Alcance en 3 h / 6 h</th></tr></thead><tbody>
    ${filas.map((x) => `<tr><td><span class="ley-c" style="background:${x.color};width:10px;height:10px"></span> ~${x.alt_km.toFixed(1)} km</td>
      <td>${esc(nombreRumbo(x.hacia))} (${Math.round(x.hacia)}°)</td><td>${Math.round(x.kmh)} km/h</td><td>${Math.round(x.kmh * 3)} / ${Math.round(x.kmh * 6)} km</td></tr>`).join("")}</tbody></table>
    <p class="meta">Los conos del mapa muestran el recorrido en 6 h a cada altura (±15°). La altura real de la columna la reportan CENAPRED (p. ej. «columna de 1.5 km sobre el cráter») y el
      <a href="https://www.ssd.noaa.gov/VAAC/washington.html" target="_blank" rel="noopener noreferrer">VAAC de Washington</a>; súmala a la altura del cráter para saber qué fila aplica.
      Es una estimación con el viento de un solo momento: no considera cambios del viento, caída de partículas ni lluvia. No sustituye los avisos oficiales.</p>
    <button type="button" class="txt-btn" id="ceniza-quitar">Quitar conos del mapa</button>`;
  div.querySelector("#ceniza-quitar").onclick = () => limpiarCeniza(map);
}
