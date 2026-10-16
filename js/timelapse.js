// Cambio en el tiempo: la misma zona vista año por año con los mosaicos «Sentinel-2 cloudless» de EOX.
// Cada año es un mosaico de todo el planeta sin nubes, armado con imágenes Sentinel-2 (ESA/Copernicus) de 10 m por
// píxel. Sirve para ver cambios grandes: manchas urbanas, minas, presas, deforestación, costas, campos de cultivo.
// No sirve para ver autos ni personas (cada píxel mide 10 × 10 m).
// Licencia: uso no comercial con atribución (CC BY-NC-SA 4.0, años 2018 a 2025; comprobados el 2026-10-16). Los mosaicos se piden
// solo al activar la herramienta y solo los de la zona que se ve. Cada año es una capa: la del año elegido se ve y la
// siguiente se precarga con opacidad 0 para que el «play» no parpadee.

export const ANIOS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
export const urlAnio = (a) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-${a}_3857/default/g/{z}/{y}/{x}.jpg`;
export const atribucion = (a) => `Sentinel-2 cloudless ${a} – <a href="https://s2maps.eu" target="_blank" rel="noopener">s2maps.eu</a> by EOX IT Services GmbH (contiene datos modificados de Copernicus Sentinel ${a})`;
export const MS_PASO = 1500;

/** Índice siguiente en el ciclo (vuelve al primero al terminar). */
export const siguiente = (i, n = ANIOS.length) => (i + 1) % n;

export class Timelapse {
  constructor(map, { onCambio = () => {} } = {}) {
    this.map = map; this.onCambio = onCambio;
    this.activo = false; this.i = ANIOS.length - 1; this.reloj = null; this.instaladas = new Set();
  }

  activar() { this.activo = true; this.#mostrar(this.i); }

  desactivar() {
    this.pausar(); this.activo = false;
    for (const a of this.instaladas) {
      if (this.map.getLayer(`tl-${a}`)) this.map.removeLayer(`tl-${a}`);
      if (this.map.getSource(`tl-${a}`)) this.map.removeSource(`tl-${a}`);
    }
    this.instaladas.clear();
  }

  /** Tras cambiar el mapa base (setStyle) las capas se pierden: se vuelven a poner. */
  reinstalar() { if (this.activo) { this.instaladas.clear(); this.#mostrar(this.i); } }

  setIndice(i) { if (this.activo) this.#mostrar(Math.max(0, Math.min(ANIOS.length - 1, i))); }

  reproducir() {
    if (this.reloj || !this.activo) return;
    this.reloj = setInterval(() => this.#mostrar(siguiente(this.i)), MS_PASO);
    this.onCambio(this.estado());
  }

  pausar() { clearInterval(this.reloj); this.reloj = null; this.onCambio(this.estado()); }

  estado() { return { i: this.i, anio: ANIOS[this.i], reproduciendo: Boolean(this.reloj), activo: this.activo }; }

  #instalar(a) {
    if (this.map.getSource(`tl-${a}`)) { this.instaladas.add(a); return; }
    this.map.addSource(`tl-${a}`, { type: "raster", tiles: [urlAnio(a)], tileSize: 256, maxzoom: 14, attribution: atribucion(a) });
    // Debajo de chokepoints, capas y eventos (igual que las demás imágenes satelitales).
    const antes = ["choke-anillo", "clusters"].find((l) => this.map.getLayer(l));
    this.map.addLayer({ id: `tl-${a}`, type: "raster", source: `tl-${a}`,
      paint: { "raster-opacity": 0, "raster-opacity-transition": { duration: 250 }, "raster-fade-duration": 0 } }, antes);
    this.instaladas.add(a);
  }

  #mostrar(i) {
    this.i = i;
    const a = ANIOS[i], sig = ANIOS[siguiente(i)];
    this.#instalar(a);
    this.#instalar(sig);  // precarga del siguiente año
    for (const x of this.instaladas) if (this.map.getLayer(`tl-${x}`)) this.map.setPaintProperty(`tl-${x}`, "raster-opacity", x === a ? 1 : 0);
    // Para no acumular capas: se quitan las que no son el año actual ni el siguiente.
    for (const x of [...this.instaladas]) {
      if (x === a || x === sig) continue;
      if (this.map.getLayer(`tl-${x}`)) this.map.removeLayer(`tl-${x}`);
      if (this.map.getSource(`tl-${x}`)) this.map.removeSource(`tl-${x}`);
      this.instaladas.delete(x);
    }
    this.onCambio(this.estado());
  }
}

/** Barra flotante sobre el mapa: ▶/⏸, deslizador de años y año actual. */
export function htmlBarra() {
  return `<button type="button" class="tl-play" aria-label="Reproducir" title="Reproducir año por año">▶</button>
    <input type="range" class="tl-rango" min="0" max="${ANIOS.length - 1}" step="1" value="${ANIOS.length - 1}" aria-label="Año de la imagen">
    <span class="tl-anio" aria-live="polite">${ANIOS[ANIOS.length - 1]}</span>
    <button type="button" class="tl-cerrar" aria-label="Cerrar cambio en el tiempo" title="Cerrar">✕</button>
    <div class="tl-marcas" aria-hidden="true">${ANIOS.map((a) => `<span>${String(a).slice(2)}</span>`).join("")}</div>`;
}
