// Cámara de la Estación Espacial Internacional (EEI) apuntando a la Tierra: la transmisión en vivo que publica la NASA
// en su canal oficial de YouTube. Se incrusta el reproductor de YouTube (no se copia ni retransmite nada). Mientras el
// panel está abierto, un punto en el mapa marca dónde va la estación (API pública wheretheiss.at, cada 10 s).
// La señal se va a negro en el lado nocturno de la Tierra y cuando la estación pierde contacto con los satélites de
// relevo; a veces la NASA transmite otra cámara (interior, caminatas espaciales).

export const CANAL_NASA = "UCLA_DiR1FfKNvjuUpBHmylQ";
export const POSICION = "https://api.wheretheiss.at/v1/satellites/25544";
export const urlVideo = (canal = CANAL_NASA) => `https://www.youtube.com/embed/live_stream?channel=${canal}&autoplay=1&mute=1&playsinline=1`;

/** Respuesta de wheretheiss.at → {lat, lon, alt_km, vel_kmh, visibilidad} o null. */
export function leerPosicion(d) {
  const lat = Number(d?.latitude), lon = Number(d?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon, alt_km: Math.round(Number(d.altitude) || 0), vel_kmh: Math.round(Number(d.velocity) || 0),
    luz: d.visibility === "daylight" ? "de día (la cámara ve la Tierra)" : "de noche (la imagen se ve negra o con luces de ciudades)" };
}

export function htmlPanel() {
  return `<div class="eei-cab"><b>🛰️ Estación Espacial Internacional · en vivo (NASA)</b><button type="button" class="eei-cerrar" aria-label="Cerrar">✕</button></div>
    <div class="eei-video"><iframe src="${urlVideo()}" title="Transmisión en vivo de la NASA desde la Estación Espacial" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
    <p class="eei-pos meta" aria-live="polite">Buscando la posición de la estación…</p>
    <p class="meta">Si sale negro: la estación está del lado nocturno o sin enlace (pasa cada ~90 min). Otras vistas:
      <a href="https://www.nasa.gov/live/" target="_blank" rel="noopener">NASA Live</a> ·
      <a href="https://www.youtube.com/@NASA/streams" target="_blank" rel="noopener">transmisiones de la NASA en YouTube</a> ·
      <a href="https://spotthestation.nasa.gov/" target="_blank" rel="noopener">cuándo verla pasar desde tu ciudad</a>.</p>`;
}

export class CamaraEEI {
  constructor(map, contenedor, { onCerrar = () => {} } = {}) {
    this.map = map; this.contenedor = contenedor; this.onCerrar = onCerrar; this.reloj = null; this.panel = null;
  }

  abrir() {
    if (this.panel) return;
    this.panel = document.createElement("div");
    this.panel.className = "eei-panel"; this.panel.setAttribute("role", "dialog"); this.panel.setAttribute("aria-label", "Cámara de la Estación Espacial");
    this.panel.innerHTML = htmlPanel();
    this.panel.querySelector(".eei-cerrar").onclick = () => { this.cerrar(); this.onCerrar(); };
    this.contenedor.appendChild(this.panel);
    this.#posicion();
    this.reloj = setInterval(() => this.#posicion(), 10000);
  }

  cerrar() {
    clearInterval(this.reloj); this.reloj = null;
    this.panel?.remove(); this.panel = null;
    if (this.map.getLayer("eei-punto")) this.map.removeLayer("eei-punto");
    if (this.map.getSource("eei-punto")) this.map.removeSource("eei-punto");
  }

  async #posicion() {
    let p = null;
    try { p = leerPosicion(await (await fetch(POSICION, { cache: "no-store" })).json()); } catch (e) { /* sin red */ }
    const el = this.panel?.querySelector(".eei-pos");
    if (!el) return;
    if (!p) { el.textContent = "No se pudo leer la posición de la estación (wheretheiss.at)."; return; }
    el.textContent = `Va sobre ${p.lat.toFixed(1)}°, ${p.lon.toFixed(1)}° a ${p.alt_km} km de altura y ${p.vel_kmh.toLocaleString("es-MX")} km/h; ahora está ${p.luz}.`;
    const gj = { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [p.lon, p.lat] }, properties: {} }] };
    if (this.map.getSource("eei-punto")) this.map.getSource("eei-punto").setData(gj);
    else {
      this.map.addSource("eei-punto", { type: "geojson", data: gj });
      this.map.addLayer({ id: "eei-punto", type: "circle", source: "eei-punto",
        paint: { "circle-radius": 8, "circle-color": "#FFD54F", "circle-stroke-color": "#000", "circle-stroke-width": 2 } });
    }
  }
}
