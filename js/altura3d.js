// Animación 3D: aviones y satélites a su altura, y vista desde la cabina de un avión.
//
// MapLibre no eleva puntos ni íconos, así que cada objeto se dibuja como una columna extruida (la misma técnica de
// los edificios 3D): un «poste» delgado desde el suelo y una «cabeza» a la altura del objeto. Funciona en el plano y
// en el globo; se ve al inclinar el mapa. La escala vertical está EXAGERADA para que se aprecie desde lejos:
//  - aviones: altitud real × 25 (un avión a 10 km se dibuja a 250 km);
//  - satélites: 150 km + 0.4 × su altitud (tope en 2,000 km de altitud real): la Estación Espacial (~420 km) queda a
//    ~320 km y un geoestacionario (35,786 km) al tope, ~950 km; la órbita real sería demasiado alta para verse.
// La vista de cabina abre una ventana flotante con un mapa propio y ligero; coloca la cámara en la posición y altitud
// del avión, mirando hacia su rumbo, sobre el relieve (modelos de elevación «Terrain Tiles» de Mapzen, datos abiertos en AWS). La posición avanza según la velocidad y el
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

/** El globo ya representa el volumen de la Tierra: inclinarlo desplaza su disco hacia el borde inferior. */
export function camaraAltura3D(map) {
  const globo = map.getProjection?.()?.type === "globe";
  return { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(),
    pitch: globo ? 0 : Math.max(30, map.getPitch() < 30 ? 55 : map.getPitch()),
    padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 800 };
}

export class Altura3D {
  constructor(map, { max = 1500, visible = () => true } = {}) {
    this.map = map;
    this.max = max;
    this.visible = visible;
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
    const leer = (src, fn) => { if (!m.getSource(src)) return; for (const f of m.querySourceFeatures(src)) { if (!this.visible(src, f.properties)) continue; const o = fn(f); if (o && !vistos.has(o.id) && out.length < this.max) { vistos.add(o.id); out.push(o); } } };
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
    if (!this.activo) return; // también se llama al apagar una capa: si ya no hay objetos, la fuente queda vacía
    try { this.#instalar(); this.map.getSource(FUENTE).setData(construir(this.objetos(), this.map.getZoom())); } catch (e) { /* estilo cambiando */ }
  }

  activar() {
    if (this.activo) return;
    this.camaraPrevia = { pitch: this.map.getPitch(), padding: { ...(this.map.getPadding?.() || { top: 0, bottom: 0, left: 0, right: 0 }) } };
    this.activo = true;
    this.map.on("moveend", this.refrescar);
    this.map.on("style.load", this.refrescar);
    this.reloj = setInterval(this.refrescar, 3000);  // los satélites se mueven cada 2 s
    this.map.easeTo(camaraAltura3D(this.map));
    this.refrescar();
  }

  desactivar() {
    if (!this.activo) return;
    this.activo = false;
    clearInterval(this.reloj);
    this.map.off("moveend", this.refrescar);
    this.map.off("style.load", this.refrescar);
    for (const l of [`${FUENTE}-poste`, `${FUENTE}-cabeza`]) if (this.map.getLayer(l)) this.map.removeLayer(l);
    if (this.map.getSource(FUENTE)) this.map.removeSource(FUENTE);
    // Recupera la inclinación y márgenes del usuario, sin deshacer sus desplazamientos por el mapa.
    if (this.camaraPrevia) this.map.easeTo({ ...this.camaraPrevia, duration: 800 });
    this.camaraPrevia = null;
  }
}

/** Punto a `km` de distancia con rumbo `grados` (aproximación esférica). */
export function adelante(lon, lat, grados, km) {
  const R = 6371, d = km / R, b = (grados * Math.PI) / 180, f1 = (lat * Math.PI) / 180, l1 = (lon * Math.PI) / 180;
  const f2 = Math.asin(Math.sin(f1) * Math.cos(d) + Math.cos(f1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(f1), Math.cos(d) - Math.sin(f1) * Math.sin(f2));
  return [((l2 * 180) / Math.PI + 540) % 360 - 180, (f2 * 180) / Math.PI];
}

const SAT_CABINA = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg";
const SAT_CABINA_ATRIB = 'Sentinel-2 cloudless by EOX IT Services GmbH (CC BY 4.0) · Relieve: Terrain Tiles (Mapzen, AWS)';

/** Estilo mínimo de la ventana de cabina: imagen de satélite, relieve y cielo (sin las capas del mapa principal). */
export function estiloCabina() {
  return {
    version: 8,
    sources: {
      sat: { type: "raster", tiles: [SAT_CABINA], tileSize: 256, maxzoom: 13, attribution: SAT_CABINA_ATRIB },
      dem: { type: "raster-dem", tiles: [DEM], tileSize: 256, encoding: "terrarium", maxzoom: 11 },
    },
    layers: [{ id: "fondo", type: "background", paint: { "background-color": "#6fa8dc" } },
      { id: "sat", type: "raster", source: "sat", paint: { "raster-fade-duration": 0 } }],
    terrain: { source: "dem", exaggeration: 1.2 },
    sky: { "sky-color": "#6fa8dc", "horizon-color": "#d9e7f5", "sky-horizon-blend": 0.6, "fog-color": "#d9e7f5" },
  };
}

/**
 * Vista desde la cabina en una ventana flotante con su propio mapa ligero (solo satélite y relieve, densidad de píxel 1).
 * El mapa principal no cambia: la ficha del avión sigue abierta y su trayectoria o modelo se quitan desde ella.
 */
export class Cabina {
  constructor(map, { lib = globalThis.maplibregl, contenedor = map?.getContainer?.()?.parentElement } = {}) {
    this.map = map; this.lib = lib; this.contenedor = contenedor; this.activa = false;
  }

  crearVentana(info) {
    const w = document.createElement("div");
    w.className = "cabina-pop";
    w.setAttribute("role", "dialog");
    w.setAttribute("aria-label", "Vista desde la cabina (simulación)");
    w.innerHTML = `<div class="cabina-cab"><span class="cabina-info"></span>
      <button type="button" class="cabina-ampliar" aria-pressed="false" title="Ampliar o reducir la ventana">⤢ Ampliar</button>
      <button type="button" class="cabina-salir">✕ Salir de la cabina</button></div>
      <div class="cabina-vista"><div class="cabina-mapa"></div></div>`;
    w.querySelector(".cabina-info").textContent = info || "";
    w.querySelector(".cabina-salir").addEventListener("click", () => this.detener());
    w.querySelector(".cabina-ampliar").addEventListener("click", (e) => {
      const grande = w.classList.toggle("grande");
      e.currentTarget.setAttribute("aria-pressed", String(grande));
      e.currentTarget.textContent = grande ? "⤡ Reducir" : "⤢ Ampliar";
      this.mini?.resize();
    });
    w.addEventListener("keydown", (e) => { if (e.key === "Escape") this.detener(); });
    (this.contenedor || document.body).appendChild(w);
    return w;
  }

  iniciar(v, { onSalir, datos = {}, info = "" } = {}) {
    this.detener(false);
    this.activa = true;
    this.onSalir = onSalir;
    this.ventana = this.crearVentana(info);
    const vista = this.ventana.querySelector(".cabina-vista");
    this.v = { lon: v.lon, lat: v.lat, alt: Math.max(300, Number(v.alt_m) || 1000), rumbo: Number(v.rumbo) || 0, kmh: Math.max(0, Number(v.vel_kmh) || 0),
      vs: Number(v.vs_ms) || 0 };
    const m = this.mini = new this.lib.Map({
      container: this.ventana.querySelector(".cabina-mapa"), style: estiloCabina(), center: [this.v.lon, this.v.lat], zoom: 11, pitch: 80,
      bearing: this.v.rumbo, maxPitch: 85, interactive: false, pixelRatio: 1, fadeDuration: 0, attributionControl: { compact: true },
    });
    // Créditos de las imágenes plegados en el ícono «i» para no tapar la cinta de rumbo.
    m.once("load", () => m.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"));
    this.t0 = performance.now();
    this.giro = 0;
    this.datos = datos;
    this.panel = new PanelCabina(vista);
    this.ventana.querySelector(".cabina-salir").focus();
    const paso = () => {
      if (!this.activa) return;
      const seg = (performance.now() - this.t0) / 1000;
      const e = estadoCabina(this.v, seg, this.giro);
      const mira = adelante(e.lon, e.lat, this.v.rumbo, 25);
      try {
        m.jumpTo(m.calculateCameraOptionsFromTo({ lng: e.lon, lat: e.lat }, e.alt_m, { lng: mira[0], lat: mira[1] }, Math.max(0, e.alt_m - 2500)));
      } catch { /* versión sin cámara libre */ }
      this.panel?.dibujar(e, { ...this.datos, hacia: haciaDestino(e, this.datos.destinoCoord) });
      this.raf = requestAnimationFrame(paso);
    };
    this.raf = requestAnimationFrame(paso);
  }

  /** Nueva instantánea del mismo avión: corrige posición, altitud, rumbo y velocidad. */
  actualizar(v) {
    if (!this.activa) return;
    const dt = (performance.now() - this.t0) / 1000, nuevo = Number(v.rumbo) || this.v.rumbo;
    // Ritmo de giro solo con señales cercanas (≤ 2 min): con instantáneas de 20 min no dice nada del alabeo.
    this.giro = dt > 0 && dt <= 120 ? ((((nuevo - this.v.rumbo) % 360) + 540) % 360 - 180) / dt : 0;
    Object.assign(this.v, { lon: v.lon, lat: v.lat, alt: Math.max(300, Number(v.alt_m) || this.v.alt), rumbo: nuevo, kmh: Number(v.vel_kmh) || this.v.kmh,
      vs: Number(v.vs_ms) || 0 });
    this.t0 = performance.now();
  }

  detener(avisar = true) {
    if (!this.activa) return;
    this.activa = false;
    cancelAnimationFrame(this.raf);
    this.panel = null;
    try { this.mini?.remove(); } catch { /* ya quitado */ }
    this.mini = null;
    this.ventana?.remove();
    this.ventana = null;
    if (avisar) this.onSalir?.();
  }
}

// ------------------------------------------------------------------ panel de instrumentos (cabina)
const G = 9.81;

/**
 * Estado del vuelo simulado `seg` segundos después de la última señal: posición y altitud avanzan con la velocidad
 * y la velocidad vertical. La inclinación (pitch) es el ángulo de la trayectoria más ~2.5° de ángulo de ataque típico;
 * el alabeo (bank) sale del ritmo de giro entre dos señales cercanas (si las señales están a más de 2 min, 0°).
 */
export function estadoCabina(v, seg, giroGradosSeg = 0) {
  const kmh = Math.max(0, Number(v.kmh) || 0), ms = kmh / 3.6, vs = Number(v.vs) || 0;
  const [lon, lat] = adelante(v.lon, v.lat, v.rumbo, (kmh * seg) / 3600);
  const alt = Math.max(0, v.alt + vs * Math.min(seg, 600));
  const trayectoria = ms > 1 ? (Math.atan2(vs, ms) * 180) / Math.PI : 0;
  const pitch = Math.max(-25, Math.min(25, trayectoria + (alt > 50 ? 2.5 : 0)));
  const bank = Math.max(-35, Math.min(35, (Math.atan((ms * giroGradosSeg * Math.PI) / 180 / G) * 180) / Math.PI));
  return { lon, lat, alt_m: alt, alt_ft: alt / 0.3048, gs_kmh: kmh, gs_kt: kmh / 1.852, vs_ms: vs, vs_fpm: vs * 196.85,
    rumbo: ((v.rumbo % 360) + 360) % 360, pitch, bank, seg };
}

/** Distancia (km) y hora estimada de llegada en línea recta a un destino [lon, lat]. */
export function haciaDestino(e, destino) {
  if (!destino || !(e.gs_kmh > 50)) return null;
  const R = 6371, rad = Math.PI / 180;
  const dLat = (destino[1] - e.lat) * rad, dLon = (destino[0] - e.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(e.lat * rad) * Math.cos(destino[1] * rad) * Math.sin(dLon / 2) ** 2;
  const km = 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  return { km, min: (km / e.gs_kmh) * 60 };
}

/** Factor de reducción del panel: 1 desde 620 px de ancho; menos en ventanas angostas (teléfono). */
export const escalaPanel = (ancho) => Math.min(1, Math.max(0.4, (Number(ancho) || 620) / 620));

export class PanelCabina {
  constructor(contenedor) {
    this.c = document.createElement("canvas");
    this.c.className = "cabina-pfd";
    this.c.setAttribute("aria-hidden", "true");
    contenedor.appendChild(this.c);
  }

  quitar() { this.c.remove(); }

  dibujar(e, datos = {}) {
    const c = this.c, dpr = Math.min(2, window.devicePixelRatio || 1);
    const W0 = c.clientWidth, H0 = c.clientHeight;
    if (!W0 || !H0) return;
    if (c.width !== Math.round(W0 * dpr) || c.height !== Math.round(H0 * dpr)) { c.width = Math.round(W0 * dpr); c.height = Math.round(H0 * dpr); }
    // En una ventana angosta se dibuja sobre 620 px lógicos y se reduce, para que las cintas no se salgan.
    const k = escalaPanel(W0), W = W0 / k, H = H0 / k, compacto = H < 450;
    const g = c.getContext("2d");
    g.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
    g.clearRect(0, 0, W, H);
    const verde = "#7CFC9A", blanco = "#F4F7FA", ambar = "#FFC857";
    g.font = "12px ui-monospace, Menlo, monospace"; g.textBaseline = "middle"; g.lineWidth = 1.5;

    // Horizonte artificial (centro).
    const R = Math.min(W, H) * 0.22, cx = W / 2, cy = compacto ? H * 0.45 : H / 2; // ventana chica: sube para dejar ver el rumbo
    g.save();
    g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.clip();
    g.translate(cx, cy); g.rotate((-e.bank * Math.PI) / 180);
    const pxGrado = R / 22, dy = e.pitch * pxGrado;
    g.fillStyle = "rgba(52,120,200,0.45)"; g.fillRect(-2 * R, -2 * R + dy, 4 * R, 2 * R);
    g.fillStyle = "rgba(140,90,40,0.45)"; g.fillRect(-2 * R, dy, 4 * R, 2 * R);
    g.strokeStyle = blanco; g.beginPath(); g.moveTo(-2 * R, dy); g.lineTo(2 * R, dy); g.stroke();
    g.fillStyle = blanco; g.textAlign = "left";
    for (let p = -20; p <= 20; p += 5) {
      if (!p) continue;
      const y = dy - p * pxGrado, w = p % 10 ? R * 0.18 : R * 0.32;
      g.beginPath(); g.moveTo(-w, y); g.lineTo(w, y); g.stroke();
      if (!(p % 10)) g.fillText(String(Math.abs(p)), w + 4, y);
    }
    g.restore();
    g.strokeStyle = ambar; g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx - R * 0.55, cy); g.lineTo(cx - R * 0.18, cy); g.lineTo(cx - R * 0.12, cy + 8);
    g.moveTo(cx + R * 0.55, cy); g.lineTo(cx + R * 0.18, cy); g.lineTo(cx + R * 0.12, cy + 8); g.stroke();
    g.fillStyle = ambar; g.fillRect(cx - 2, cy - 2, 4, 4);
    g.lineWidth = 1.5; g.strokeStyle = "rgba(244,247,250,0.6)"; g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.stroke();

    // Cintas de velocidad (izquierda) y altitud (derecha).
    const cinta = (x, valor, paso, etiqueta, unidad2) => {
      const h = R * 2.1, y0 = cy - h / 2, ancho = 74;
      g.fillStyle = "rgba(10,16,24,0.55)"; g.fillRect(x, y0, ancho, h);
      g.save(); g.beginPath(); g.rect(x, y0, ancho, h); g.clip();
      g.strokeStyle = blanco; g.fillStyle = blanco; g.textAlign = "center";
      const px = h / (paso * 8), base = Math.round(valor / paso) * paso;
      for (let k = -6; k <= 6; k++) {
        const val = base + k * paso, y = cy - (val - valor) * px;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + 8, y); g.stroke();
        if (val >= 0) g.fillText(Math.round(val).toLocaleString("es-MX"), x + ancho / 2 + 4, y);
      }
      g.restore();
      g.fillStyle = "#0B1118"; g.fillRect(x - 2, cy - 13, ancho + 4, 26);
      g.strokeStyle = verde; g.strokeRect(x - 2, cy - 13, ancho + 4, 26);
      g.fillStyle = verde; g.font = "bold 15px ui-monospace, Menlo, monospace"; g.textAlign = "center";
      g.fillText(Math.round(valor).toLocaleString("es-MX"), x + ancho / 2, cy);
      g.font = "11px ui-monospace, Menlo, monospace"; g.fillStyle = blanco;
      g.fillText(etiqueta, x + ancho / 2, y0 - 10); g.fillText(unidad2, x + ancho / 2, y0 + h + 10);
      g.font = "12px ui-monospace, Menlo, monospace";
    };
    cinta(cx - R - 110, e.gs_kt, 20, "GS (nudos)", `${Math.round(e.gs_kmh)} km/h`);
    cinta(cx + R + 36, e.alt_ft, 500, "ALT (pies)", `${Math.round(e.alt_m).toLocaleString("es-MX")} m`);

    // Velocidad vertical.
    const xv = cx + R + 118, hv = R * 1.6;
    g.fillStyle = "rgba(10,16,24,0.55)"; g.fillRect(xv, cy - hv / 2, 34, hv);
    const yv = cy - Math.max(-1, Math.min(1, e.vs_fpm / 4000)) * (hv / 2);
    g.strokeStyle = verde; g.lineWidth = 3; g.beginPath(); g.moveTo(xv + 2, cy); g.lineTo(xv + 30, yv); g.stroke(); g.lineWidth = 1.5;
    g.fillStyle = blanco; g.textAlign = "center";
    g.fillText("VS", xv + 17, cy - hv / 2 - 10); g.fillText(`${Math.round(e.vs_fpm / 10) * 10}`, xv + 17, cy + hv / 2 + 10);

    // Rumbo (abajo).
    const yh = cy + R + 40, wh = R * 2.4;
    g.fillStyle = "rgba(10,16,24,0.55)"; g.fillRect(cx - wh / 2, yh - 16, wh, 32);
    g.save(); g.beginPath(); g.rect(cx - wh / 2, yh - 16, wh, 32); g.clip();
    const pxH = wh / 60;
    for (let d = Math.floor((e.rumbo - 35) / 5) * 5; d <= e.rumbo + 35; d += 5) {
      const x = cx + (d - e.rumbo) * pxH, dd = ((d % 360) + 360) % 360;
      g.strokeStyle = blanco; g.beginPath(); g.moveTo(x, yh - 16); g.lineTo(x, yh - (dd % 10 ? 10 : 6)); g.stroke();
      if (!(dd % 30)) { g.fillStyle = blanco; g.fillText({ 0: "N", 90: "E", 180: "S", 270: "O" }[dd] ?? String(dd / 10), x, yh + 6); }
    }
    g.restore();
    g.fillStyle = verde; g.font = "bold 14px ui-monospace, Menlo, monospace";
    g.fillText(`${String(Math.round(e.rumbo) % 360).padStart(3, "0")}°`, cx, yh + 30);
    g.font = "12px ui-monospace, Menlo, monospace";

    // Bloque de datos (esquina superior izquierda).
    const filas = [
      `${datos.indicativo || "—"}${datos.tipo ? ` · ${datos.tipo}` : ""}`,
      `Inclinación ${e.pitch >= 0 ? "+" : ""}${e.pitch.toFixed(1)}° · alabeo ${e.bank.toFixed(0)}°`,
      `Pos ${e.lat.toFixed(3)}, ${e.lon.toFixed(3)}`,
      datos.squawk ? `Squawk ${datos.squawk}` : "",
      datos.destino ? `${datos.destino}${datos.hacia ? ` · ${Math.round(datos.hacia.km)} km · ${Math.round(datos.hacia.min)} min` : ""}` : "",
      `Simulado desde la última señal: ${Math.round(e.seg)} s`,
    ].filter(Boolean);
    // Ventana pequeña: solo indicativo, destino y tiempo simulado, arriba para no tapar el horizonte.
    const lista = compacto ? [filas[0], filas.find((t) => t.startsWith("Destino")), filas[filas.length - 1]].filter(Boolean) : filas;
    const y0 = compacto ? 8 : 56;
    g.textAlign = "left";
    g.fillStyle = "rgba(10,16,24,0.6)"; g.fillRect(12, y0, 300, lista.length * 17 + 12);
    lista.forEach((t, i) => { g.fillStyle = i ? blanco : verde; g.fillText(t, 20, y0 + 12 + i * 17); });
  }
}
