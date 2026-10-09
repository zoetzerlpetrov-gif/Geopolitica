// Hacia dónde iría la ceniza de un volcán: viento del modelo GFS de NOAA a 500, 300 y 200 hPa (≈ 5.5, 9 y
// 12 km), que tools/clima/gfs.py guarda como texturas (R = U, G = V) en data/vivos/clima/. Se lee el píxel del
// volcán y se dibuja un cono por altura con el recorrido en 6 h.
// Es una aproximación de trayectoria, no un modelo de dispersión: la referencia oficial para aviación son
// los avisos del VAAC (Washington para México) y, en tierra, CENAPRED y Protección Civil.
import { esc, getJSON } from "./util.js";
import { conoCeniza, nombreRumbo, haciaDonde } from "./amenazas.js";

const BASE = "data/vivos/clima/";
const COLORES = { 500: "#E0A100", 300: "#E2711D", 200: "#C0392B" };
const SRC = "ceniza";

/** Píxel RGBA de una imagen (rejilla lat/lon de 1°: columna 0 = −180°, fila 0 = 90° N) en [lon, lat]. */
async function pixel(url, lon, lat) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const x = ((Math.round(lon + 180) % 360) + 360) % 360, y = Math.min(img.height - 1, Math.max(0, Math.round(90 - lat)));
  return g.getImageData(x, y, 1, 1).data;
}

/** U y V (m/s) → velocidad (km/h) y dirección meteorológica «desde» (grados). */
export function vientoDeUV(u, v) {
  return { kmh: Math.hypot(u, v) * 3.6, desde: ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360 };
}

export function limpiarCeniza(map) {
  for (const id of [`${SRC}-relleno`, `${SRC}-borde`]) if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(SRC)) map.removeSource(SRC);
}

export async function mostrarCeniza(map, div) {
  const lon = Number(div.dataset.lon), lat = Number(div.dataset.lat);
  const meta = await getJSON(`${BASE}meta.json`, { bust: true });
  const ahora = Date.now();
  const paso = (meta.pasos || []).filter((p) => p.alturas && Object.keys(p.alturas).length)
    .sort((a, b) => Math.abs(Date.parse(a.valido_utc) - ahora) - Math.abs(Date.parse(b.valido_utc) - ahora))[0];
  if (!paso) { div.innerHTML = `<p class="meta">Aún no hay viento en altura del modelo GFS (se prepara cada 6 h en «Datos en movimiento»).</p>`; return; }
  const max = meta.viento_altura_escala_ms || 90;
  const filas = [];
  for (const [lev, a] of Object.entries(paso.alturas).sort((x, y) => Number(y[0]) - Number(x[0]))) {
    const px = await pixel(BASE + a.archivo, lon, lat);
    const u = (px[0] / 255) * 2 * max - max, v = (px[1] / 255) * 2 * max - max;
    const w = vientoDeUV(u, v);
    filas.push({ lev, km: a.km, color: COLORES[lev] || "#888", ...w, hacia: haciaDonde(w.desde), cono: conoCeniza([lon, lat], w.desde, w.kmh, 6) });
  }
  limpiarCeniza(map);
  map.addSource(SRC, { type: "geojson", data: { type: "FeatureCollection", features: filas.map((x) => ({ type: "Feature", geometry: { type: "Polygon", coordinates: x.cono.coordinates }, properties: { color: x.color } })) } });
  map.addLayer({ id: `${SRC}-relleno`, type: "fill", source: SRC, paint: { "fill-color": ["get", "color"], "fill-opacity": 0.18 } });
  map.addLayer({ id: `${SRC}-borde`, type: "line", source: SRC, paint: { "line-color": ["get", "color"], "line-width": 1.5, "line-dasharray": [2, 2] } });
  div.innerHTML = `<h4>🌬️ Hacia dónde iría la ceniza (GFS de NOAA, ${esc(paso.valido_utc.replace("T", " ").slice(0, 16))} UTC)</h4>
    <table class="tabla-ceniza"><thead><tr><th>Si la ceniza sube a…</th><th>Va hacia</th><th>Viento</th><th>Alcance en 3 h / 6 h</th></tr></thead><tbody>
    ${filas.map((x) => `<tr><td><span class="ley-c" style="background:${x.color};width:10px;height:10px"></span> ~${x.km} km (${x.lev} hPa)</td>
      <td>${esc(nombreRumbo(x.hacia))} (${Math.round(x.hacia)}°)</td><td>${Math.round(x.kmh)} km/h</td><td>${Math.round(x.kmh * 3)} / ${Math.round(x.kmh * 6)} km</td></tr>`).join("")}</tbody></table>
    <p class="meta">Los conos del mapa muestran el recorrido en 6 h a cada altura (±15°). Modelo GFS a 1° (~110 km): es el viento de la zona, no del cráter exacto.
      La altura real de la columna la reportan CENAPRED (p. ej. «columna de 1.5 km sobre el cráter») y el
      <a href="https://www.ssd.noaa.gov/VAAC/washington.html" target="_blank" rel="noopener noreferrer">VAAC de Washington</a>; súmala a la altura del cráter para saber qué fila aplica.
      No considera cambios del viento, caída de partículas ni lluvia. No sustituye los avisos oficiales.</p>
    <button type="button" class="txt-btn" id="ceniza-quitar">Quitar conos del mapa</button>`;
  div.querySelector("#ceniza-quitar").onclick = () => limpiarCeniza(map);
}
