// Animación 3D: aviones y satélites a su altura, y vista desde la cabina de un avión.
//
// MapLibre no eleva puntos ni íconos, así que cada objeto se dibuja como una columna extruida (la misma técnica de
// los edificios 3D): un «poste» delgado desde el suelo y una «cabeza» a la altura del objeto. Funciona en el plano y
// en el globo; se ve al inclinar el mapa. La escala vertical está EXAGERADA para que se aprecie desde lejos:
//  - aviones: altitud real × 25 (un avión a 10 km se dibuja a 250 km);
//  - satélites: 150 km + 0.4 × su altitud (tope en 2,000 km de altitud real): la Estación Espacial (~420 km) queda a
//    ~320 km y un geoestacionario (35,786 km) al tope, ~950 km; la órbita real sería demasiado alta para verse.
// La vista de cabina coloca la cámara en la posición y altitud del avión, mirando hacia su rumbo, sobre el relieve
// (modelos de elevación «Terrain Tiles» de Mapzen, datos abiertos en AWS). La posición avanza según la velocidad y el
// rumbo de la última señal (se recalcula al llegar la siguiente instantánea), así que es una simulación aproximada.

export const EXAGERA_AVION = 25;
export const DEM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const FUENTE = "alt3d", ID_DEM = "dem-cabina";

/** Altura visual en metros para extruir. */
export function alturaVisual(tipo, alt) {
  if (tipo === "avion") return Math.max(0, Number(alt) || 0) * EXAGERA_AVION;
  return 150000 + 0.4 * Math.min(2000, Math.max(0, Number(alt) || 0)) * 1000;
}

/** Cuadrado de `lado` grados de lado centrado en (lon, lat), corregido por latitud. */
export function cuadro(lon, lat, lado) {
  const h = lado / 2, hl = h / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  return [[[lon - hl, lat - h], [lon + hl, lat - h], [lon + hl, lat + h], [lon - hl, lat + h], [lon - hl, lat - h]]];
}

/** Objetos [{tipo, lon, lat, alt, color}] → GeoJSON de postes y cabezas para el zoom dado. */
export function construir(objetos, zoom) {
  const px = 360 / (512 * 2 ** zoom);  // grados por píxel aproximado
  const feats = [];
  for (const o of objetos) {
    if (!Number.isFinite(o.lon) || !Number.isFinite(o.lat)) continue;
    const top = alturaVisual(o.tipo, o.alt);
    if (top <= 0) continue;
    const grosor = o.tipo === "avion" ? 8000 : 25000;
    feats.push({ type: "Feature", geometry: { type: "Polygon", coordinates: cuadro(o.lon, o.lat, px * 1.5) }, properties: { k: "poste", base: 0, top, c: o.color } });
    feats.push({ type: "Feature", geometry: { type: "Polygon", coordinates: cuadro(o.lon, o.lat, px * (o.tipo === "avion" ? 6 : 5)) }, properties: { k: "cabeza", base: top, top: top + grosor, c: o.color } });
  }
  return { type: "FeatureCollection", features: feats };
}

export class Altura3D {
  constructor(map, { max = 1500 } = {}) {
    this.map = map;
    this.max = max;
    this.activo = false;
    this.refrescar = this.refrescar.bind(this);
  }

  #instalar() {
    const m = this.map;
    if (!m.getSource(FUENTE)) m.addSource(FUENTE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    const capa = (id, k, opacidad) => {
      if (m.getLayer(id)) return;
      m.addLayer({ id, type: "fill-extrusion", source: FUENTE, filter: ["==", ["get", "k"], k],
        paint: { "fill-extrusion-color": ["get", "c"], "fill-extrusion-base": ["get", "base"], "fill-extrusion-height": ["get", "top"], "fill-extrusion-opacity": opacidad } });
    };
    capa(`${FUENTE}-poste`, "poste", 0.35);
    capa(`${FUENTE}-cabeza`, "cabeza", 0.95);
  }

  /** Lee lo que ya dibujan las capas de aviones y satélites (solo lo visible). */
  objetos() {
    const m = this.map, out = [], vistos = new Set();
    const leer = (src, fn) => { if (!m.getSource(src)) return; for (const f of m.querySourceFeatures(src)) { const o = fn(f); if (o && !vistos.has(o.id) && out.length < this.max) { vistos.add(o.id); out.push(o); } } };
    leer("mov-aeronaves", (f) => {
      let fila; try { fila = JSON.parse(f.properties.f); } catch { return null; }
      const [lon, lat] = f.geometry.coordinates;
      return { id: `a${f.properties.id}`, tipo: "avion", lon, lat, alt: fila[4], color: "#E0A100" };
    });
    leer("mov-satelites", (f) => {
      const [lon, lat] = f.geometry.coordinates;
      return { id: `s${f.properties.id}`, tipo: "satelite", lon, lat, alt: Number(f.properties.alt), color: "#4FC3F7" };
    });
    return out;
  }

  refrescar() {
    if (!this.activo) return;
    try { this.#instalar(); this.map.getSource(FUENTE).setData(construir(this.objetos(), this.map.getZoom())); } catch (e) { /* estilo cambiando */ }
  }

  activar() {
    if (this.activo) return;
    this.activo = true;
    this.map.on("moveend", this.refrescar);
    this.map.on("style.load", this.refrescar);
    this.reloj = setInterval(this.refrescar, 3000);  // los satélites se mueven cada 2 s
    if (this.map.getPitch() < 30) this.map.easeTo({ pitch: 55, duration: 1200 });
    this.refrescar();
  }

  desactivar() {
    this.activo = false;
    clearInterval(this.reloj);
    this.map.off("moveend", this.refrescar);
    this.map.off("style.load", this.refrescar);
    for (const l of [`${FUENTE}-poste`, `${FUENTE}-cabeza`]) if (this.map.getLayer(l)) this.map.removeLayer(l);
    if (this.map.getSource(FUENTE)) this.map.removeSource(FUENTE);
  }
}

/** Punto a `km` de distancia con rumbo `grados` (aproximación esférica). */
export function adelante(lon, lat, grados, km) {
  const R = 6371, d = km / R, b = (grados * Math.PI) / 180, f1 = (lat * Math.PI) / 180, l1 = (lon * Math.PI) / 180;
  const f2 = Math.asin(Math.sin(f1) * Math.cos(d) + Math.cos(f1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(f1), Math.cos(d) - Math.sin(f1) * Math.sin(f2));
  return [((l2 * 180) / Math.PI + 540) % 360 - 180, (f2 * 180) / Math.PI];
}

export class Cabina {
  constructor(map) { this.map = map; this.activa = false; }

  iniciar(v, { onSalir } = {}) {
    const m = this.map;
    this.detener(false);
    this.activa = true;
    this.onSalir = onSalir;
    this.previo = { center: m.getCenter(), zoom: m.getZoom(), pitch: m.getPitch(), bearing: m.getBearing(), maxPitch: m.getMaxPitch(), proy: m.getProjection?.()?.type };
    if (this.previo.proy === "globe") try { m.setProjection({ type: "mercator" }); } catch { /* sin cambio */ }
    m.setMaxPitch(85);
    if (!m.getSource(ID_DEM)) m.addSource(ID_DEM, { type: "raster-dem", tiles: [DEM], tileSize: 256, encoding: "terrarium", maxzoom: 12,
      attribution: "Relieve: Terrain Tiles (Mapzen, datos abiertos en AWS)" });
    try { m.setTerrain({ source: ID_DEM, exaggeration: 1.2 }); } catch { /* sin relieve */ }
    try { m.setSky?.({ "sky-color": "#6fa8dc", "horizon-color": "#d9e7f5", "sky-horizon-blend": 0.6, "fog-color": "#d9e7f5" }); } catch { /* sin cielo */ }
    this.v = { lon: v.lon, lat: v.lat, alt: Math.max(300, Number(v.alt_m) || 1000), rumbo: Number(v.rumbo) || 0, kmh: Math.max(0, Number(v.vel_kmh) || 0) };
    this.t0 = performance.now();
    const paso = () => {
      if (!this.activa) return;
      const seg = (performance.now() - this.t0) / 1000;
      const [lon, lat] = adelante(this.v.lon, this.v.lat, this.v.rumbo, (this.v.kmh * seg) / 3600);
      const mira = adelante(lon, lat, this.v.rumbo, 25);
      try {
        const cam = m.calculateCameraOptionsFromTo({ lng: lon, lat }, this.v.alt, { lng: mira[0], lat: mira[1] }, Math.max(0, this.v.alt - 2500));
        m.jumpTo(cam);
      } catch { /* versión sin cámara libre */ }
      this.raf = requestAnimationFrame(paso);
    };
    this.raf = requestAnimationFrame(paso);
  }

  /** Nueva instantánea del mismo avión: corrige posición, altitud, rumbo y velocidad. */
  actualizar(v) {
    if (!this.activa) return;
    Object.assign(this.v, { lon: v.lon, lat: v.lat, alt: Math.max(300, Number(v.alt_m) || this.v.alt), rumbo: Number(v.rumbo) || this.v.rumbo, kmh: Number(v.vel_kmh) || this.v.kmh });
    this.t0 = performance.now();
  }

  detener(avisar = true) {
    if (!this.activa) return;
    this.activa = false;
    cancelAnimationFrame(this.raf);
    const m = this.map, p = this.previo;
    try { m.setTerrain(null); } catch { /* nada */ }
    if (p) {
      m.jumpTo({ center: p.center, zoom: p.zoom, pitch: Math.min(p.pitch, p.maxPitch), bearing: p.bearing });
      m.setMaxPitch(p.maxPitch);
      if (p.proy === "globe") try { m.setProjection({ type: "globe" }); } catch { /* nada */ }
    }
    if (avisar) this.onSalir?.();
  }
}
