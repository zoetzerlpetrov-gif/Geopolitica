// Capa de clima tipo Windy: viento animado con partículas, temperatura a 2 m y lluvia del modelo GFS de
// NOAA (tools/clima/gfs.py los prepara cada 6 h en data/vivos/clima/).
//
// Viento: la textura viento_fXXX.png guarda U (canal rojo) y V (canal verde) en una rejilla de 1°.
// Cada partícula vive en coordenadas de pantalla; en cada cuadro se busca el viento en su lon/lat
// (interpolación bilineal), se mueve unos píxeles en esa dirección y se dibuja un trazo que se desvanece.
// Se pausa mientras el mapa se mueve y cuando la pestaña no está visible.
// Temperatura y lluvia: imágenes ya proyectadas a Web Mercator, como fuente "image" de MapLibre.
import { getJSON, pinturaEtiqueta, layoutEtiqueta } from "./util.js";

const BASE = "data/vivos/clima/";
const LAT_MAX = 85.05112878;
const COORDS = [[-180, LAT_MAX], [180, LAT_MAX], [180, -LAT_MAX], [-180, -LAT_MAX]];
export const VELOCIDADES = [[0, "#9fd3ef"], [3, "#62c2a2"], [8, "#f2d24b"], [14, "#f08c3a"], [20, "#d23b3b"], [30, "#a5367a"]];

/** Color de un trazo según la velocidad del viento (m/s). */
export function colorVelocidad(ms) {
  let c = VELOCIDADES[0][1];
  for (const [v, col] of VELOCIDADES) if (ms >= v) c = col;
  return c;
}

/** Viento (u, v en m/s) en lon/lat por interpolación bilineal de una rejilla de 1° (−180…179, 90…−90). */
export function muestrear(campo, lon, lat) {
  const { u, v, ancho, alto } = campo;
  let x = ((lon + 180) % 360 + 360) % 360;
  const y = Math.max(0, Math.min(alto - 1, 90 - lat));
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = (x0 + 1) % ancho, y1 = Math.min(y0 + 1, alto - 1);
  const tx = x - x0, ty = y - y0;
  const at = (a, xi, yi) => a[yi * ancho + xi];
  const bil = (a) => (at(a, x0, y0) * (1 - tx) + at(a, x1, y0) * tx) * (1 - ty) + (at(a, x0, y1) * (1 - tx) + at(a, x1, y1) * tx) * ty;
  return [bil(u), bil(v)];
}

/** Texto del horizonte: «ahora», «+12 h», etc., y hora local de validez. */
export function etiquetaPaso(validoUtc, ahora = Date.now()) {
  const h = Math.round((Date.parse(validoUtc) - ahora) / 3600000);
  const rel = Math.abs(h) <= 2 ? "≈ ahora" : h > 0 ? `+${h} h` : `${h} h`;
  const local = new Date(validoUtc).toLocaleString("es-MX", { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return `${rel} · ${local}`;
}

/** Decodifica la textura de viento (ImageData RGBA) a dos Float32Array en m/s. */
export function decodificar(rgba, ancho, alto, maximo) {
  const u = new Float32Array(ancho * alto), v = new Float32Array(ancho * alto);
  for (let i = 0; i < ancho * alto; i++) {
    u[i] = (rgba[i * 4] / 255) * 2 * maximo - maximo;
    v[i] = (rgba[i * 4 + 1] / 255) * 2 * maximo - maximo;
  }
  return { u, v, ancho, alto };
}

async function cargarViento(url, meta) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  const { ancho, alto } = meta.rejilla_viento;
  const c = document.createElement("canvas");
  c.width = ancho; c.height = alto;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  return decodificar(g.getImageData(0, 0, ancho, alto).data, ancho, alto, meta.viento_escala_ms);
}

class Particulas {
  constructor(map) {
    this.map = map;
    this.campo = null;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "clima-particulas";
    Object.assign(this.canvas.style, { position: "absolute", inset: "0", pointerEvents: "none" });
    map.getCanvasContainer().appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    this.p = [];
    this.vivo = false;
    this.alMover = () => this.#limpiar();
    this.alParar = () => { this.#ajustar(); this.#sembrar(); };
    map.on("movestart", this.alMover);
    map.on("moveend", this.alParar);
    map.on("resize", this.alParar);
  }

  setCampo(campo) { this.campo = campo; this.#ajustar(); this.#sembrar(); if (!this.vivo) { this.vivo = true; requestAnimationFrame((t) => this.#cuadro(t)); } }

  destruir() {
    this.vivo = false;
    this.map.off("movestart", this.alMover); this.map.off("moveend", this.alParar); this.map.off("resize", this.alParar);
    this.canvas.remove();
  }

  #ajustar() {
    const r = this.map.getCanvas().getBoundingClientRect();
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.ancho = r.width; this.alto = r.height;
    this.canvas.width = Math.round(r.width * this.dpr); this.canvas.height = Math.round(r.height * this.dpr);
    this.canvas.style.width = `${r.width}px`; this.canvas.style.height = `${r.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  #sembrar() {
    this.globo = (this.map.getProjection?.()?.type ?? "mercator") === "globe";
    const n = Math.round(Math.min(matchMedia("(max-width: 760px)").matches ? 1200 : 3500, (this.ancho * this.alto) / 250));
    this.p = Array.from({ length: n }, () => this.#nueva());
    this.#limpiar();
  }

  /**
   * ¿El punto geográfico se ve en pantalla? En el globo, un punto del lado oculto también tiene píxel; se descarta si al
   * volver de píxel a coordenada no da el mismo lugar (≤ 0.5°). Fuera del globo (el espacio) nunca hay partículas.
   */
  #visible(lng, lat) {
    const q = this.map.project([lng, lat]);
    if (q.x < 0 || q.y < 0 || q.x > this.ancho || q.y > this.alto) return null;
    if (this.globo) {
      const r = this.map.unproject(q);
      if (Math.abs(r.lat - lat) > 0.5 || Math.abs(((r.lng - lng + 540) % 360) - 180) > 0.5) return null;
    }
    return q;
  }

  #nueva() {
    // Se siembra en un píxel al azar; si ese píxel cae fuera de la Tierra se prueba otro (hasta 8 veces).
    for (let i = 0; i < 8; i++) {
      const ll = this.map.unproject([Math.random() * this.ancho, Math.random() * this.alto]);
      if (Math.abs(ll.lat) > 85) continue;
      const q = this.#visible(ll.lng, ll.lat);
      if (q) return { lng: ll.lng, lat: ll.lat, x: q.x, y: q.y, edad: Math.floor(Math.random() * 80) };
    }
    return { lng: 0, lat: 0, x: -1, y: -1, edad: 999 };
  }

  #limpiar() { this.ctx.clearRect(0, 0, this.ancho, this.alto); }

  #cuadro() {
    if (!this.vivo) return;
    requestAnimationFrame((t) => this.#cuadro(t));
    if (!this.campo || document.hidden || this.map.isMoving()) return;
    const g = this.ctx;
    // Desvanecer los trazos anteriores (estela).
    g.globalCompositeOperation = "destination-in";
    g.fillStyle = "rgba(0,0,0,0.92)";
    g.fillRect(0, 0, this.ancho, this.alto);
    g.globalCompositeOperation = "source-over";
    g.lineWidth = 1.3;
    const lotes = new Map();
    // El avance se hace en grados (no en píxeles): así respeta la curvatura del globo y la inclinación del mapa.
    // 0.35 px por cuadro por m/s a la escala del zoom actual (512 px por vuelta completa en zoom 0).
    this.globo = (this.map.getProjection?.()?.type ?? "mercator") === "globe";
    const gradosPorPaso = 0.35 * (360 / (512 * 2 ** this.map.getZoom()));
    for (const q of this.p) {
      if (q.edad > 90 || q.x < 0) { Object.assign(q, this.#nueva(), { edad: 0 }); continue; }
      const [u, v] = muestrear(this.campo, q.lng, q.lat);
      const s = Math.hypot(u, v);
      const lat = q.lat + v * gradosPorPaso;
      const lng = q.lng + (u * gradosPorPaso) / Math.max(0.1, Math.cos((q.lat * Math.PI) / 180));
      const n = Math.abs(lat) < 85 ? this.#visible(lng, lat) : null;
      if (!n || s < 0.2) { Object.assign(q, this.#nueva(), { edad: 0 }); continue; }
      const col = colorVelocidad(s);
      if (!lotes.has(col)) lotes.set(col, []);
      lotes.get(col).push(q.x, q.y, n.x, n.y);
      Object.assign(q, { lng: ((lng + 540) % 360) - 180, lat, x: n.x, y: n.y });
      q.edad++;
    }
    for (const [col, seg] of lotes) {
      g.strokeStyle = col;
      g.beginPath();
      for (let i = 0; i < seg.length; i += 4) { g.moveTo(seg[i], seg[i + 1]); g.lineTo(seg[i + 2], seg[i + 3]); }
      g.stroke();
    }
  }
}

export class Clima {
  constructor(map) { this.map = map; this.meta = null; this.paso = 0; this.activas = new Set(); this.particulas = null; this.extras = new Map(); this.onMomento = null; this.onProgreso = null; }

  async cargar() { this.meta = await getJSON(`${BASE}meta.json`, { bust: true }); return this.meta; }

  get pasoActual() { return this.meta?.pasos?.[this.paso]; }

  async setPaso(i) {
    this.paso = i;
    for (const t of ["temp", "lluvia", "polar"]) if (this.activas.has(t) && this.pasoActual[t]) this.map.getSource(`clima-${t}`)?.updateImage({ url: BASE + this.pasoActual[t], coordinates: COORDS });
    if (this.activas.has("polar") && this.pasoActual.isotermas) this.map.getSource("clima-polar-lineas")?.setData(BASE + this.pasoActual.isotermas);
    if (this.activas.has("viento")) this.particulas.setCampo(await cargarViento(BASE + this.pasoActual.viento, this.meta));
  }

  async activar(tipo) {
    if (tipo === "rayos") { const r = new Rayos(this.map); this.extras.set(tipo, r); this.activas.add(tipo); await r.cargar(); return; }
    if (BUCLES[tipo]) { this.extras.set(tipo, new BucleSatelite(this.map, tipo, (m) => this.onMomento?.(tipo, m), (n, total) => this.onProgreso?.(tipo, n, total))); this.activas.add(tipo); return; }
    if (!this.meta) await this.cargar();
    this.activas.add(tipo);
    if (tipo === "viento") {
      this.particulas ??= new Particulas(this.map);
      this.particulas.setCampo(await cargarViento(BASE + this.pasoActual.viento, this.meta));
    } else {
      try { this.#instalar(tipo); } catch (e) { this.activas.delete(tipo); throw e; }
    }
  }

  desactivar(tipo) {
    this.activas.delete(tipo);
    if (this.extras.has(tipo)) { this.extras.get(tipo).destruir(); this.extras.delete(tipo); return; }
    if (tipo === "viento") { this.particulas?.destruir(); this.particulas = null; return; }
    for (const id of [`clima-${tipo}-etiquetas`, `clima-${tipo}-lineas`, `clima-${tipo}`]) if (this.map.getLayer(id)) this.map.removeLayer(id);
    for (const id of [`clima-${tipo}-lineas`, `clima-${tipo}`]) if (this.map.getSource(id)) this.map.removeSource(id);
  }

  reinstalar() {
    for (const t of this.activas) {
      if (this.extras.has(t)) { this.extras.get(t).destruir(); this.extras.delete(t); this.activas.delete(t); this.activar(t).catch(() => null); }
      else if (t !== "viento") this.#instalar(t);
    }
  }

  #instalar(tipo) {
    const id = `clima-${tipo}`;
    if (this.map.getSource(id)) return;
    if (!this.pasoActual[tipo]) throw new Error("la corrida actual del modelo todavía no trae esta capa; aparecerá en la siguiente (cada 6 h)");
    this.map.addSource(id, { type: "image", url: BASE + this.pasoActual[tipo], coordinates: COORDS });
    const antes = ["choke-anillo", "clusters"].find((l) => this.map.getLayer(l));
    this.map.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": tipo === "temp" ? 0.6 : 0.85, "raster-fade-duration": 0, "raster-resampling": "linear" } }, antes);
    if (tipo === "polar" && this.pasoActual.isotermas) {
      // Isotermas de 0, −10 y −20 °C a 850 hPa: el borde de la masa de aire frío y su núcleo.
      this.map.addSource(`${id}-lineas`, { type: "geojson", data: BASE + this.pasoActual.isotermas });
      this.map.addLayer({ id: `${id}-lineas`, type: "line", source: `${id}-lineas`, paint: {
        "line-color": ["match", ["get", "t"], 0, "#7FC8F8", -10, "#2F6FDB", "#6A1B9A"], "line-width": ["match", ["get", "t"], 0, 1.6, 2.2],
        "line-dasharray": ["literal", [3, 1.5]] } }, antes);
      this.map.addLayer({ id: `${id}-etiquetas`, type: "symbol", source: `${id}-lineas`, layout: { ...layoutEtiqueta(this.map), "symbol-placement": "line", "symbol-spacing": 320,
        "text-field": ["concat", ["to-string", ["get", "t"]], " °C"], "text-size": 11, "text-font": ["Noto Sans Regular"] },
        paint: pinturaEtiqueta() }, antes);
    }
  }
}

/** Barra de leyenda (HTML) a partir de [[valor, color], …]. */
export function leyenda(paradas, unidad) {
  const grad = paradas.map(([, c], i) => `${c} ${Math.round((i / (paradas.length - 1)) * 100)}%`).join(", ");
  return `<div class="clima-leyenda"><div class="barra" style="background:linear-gradient(90deg, ${grad})"></div>
    <div class="marcas">${paradas.map(([v]) => `<span>${v}</span>`).join("")}<span>${unidad}</span></div></div>`;
}

// ------------------------------------------------------------------ rayos reales (GOES GLM)
/** Color de una celda de rayos según los minutos desde el último destello (blanco = ahora, rojo = hace 20 min). */
export function colorRayo(minutos) { return minutos <= 2 ? "#FFFFFF" : minutos <= 5 ? "#FFF176" : minutos <= 10 ? "#FFB300" : minutos <= 15 ? "#FF7043" : "#C62828"; }
export const LEYENDA_RAYOS = [[0, "#FFFFFF"], [5, "#FFF176"], [10, "#FFB300"], [15, "#FF7043"], [20, "#C62828"]];

/** Rayo ramificado de `largo` px hacia abajo desde (x, y): puntos del tronco y de 0-2 ramas. Determinista con `azar`. */
export function trazoRayo(x, y, largo, azar = Math.random) {
  const tronco = [[x, y]];
  let cx = x, cy = y;
  const pasos = 6 + Math.floor(azar() * 4);
  for (let i = 0; i < pasos; i++) { cx += (azar() - 0.5) * largo * 0.35; cy += largo / pasos; tronco.push([cx, cy]); }
  const ramas = [];
  for (let r = 0; r < Math.floor(azar() * 3); r++) {
    const [bx, by] = tronco[1 + Math.floor(azar() * (tronco.length - 2))];
    const rama = [[bx, by]];
    let rx = bx, ry = by;
    for (let i = 0; i < 3; i++) { rx += (azar() - 0.5) * largo * 0.4 + (azar() < 0.5 ? -1 : 1) * largo * 0.08; ry += largo / 8; rama.push([rx, ry]); }
    ramas.push(rama);
  }
  return { tronco, ramas };
}

class Rayos {
  constructor(map) {
    this.map = map;
    this.datos = null;
    this.vivos = [];       // destellos dibujándose: {x, y, t0, trazo}
    this.canvas = document.createElement("canvas");
    this.canvas.className = "clima-rayos";
    Object.assign(this.canvas.style, { position: "absolute", inset: "0", pointerEvents: "none" });
    map.getCanvasContainer().appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    this.activo = true;
    this.ultimo = 0;
    requestAnimationFrame((t) => this.#cuadro(t));
  }

  async cargar() {
    this.datos = await getJSON(`${BASE.replace("clima/", "")}rayos.json`, { bust: true });
    const fc = { type: "FeatureCollection", features: this.datos.celdas.map(([lon, lat, n, m]) => ({ type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] },
      properties: { n, m, c: colorRayo(m) } })) };
    if (this.map.getSource("clima-rayos")) this.map.getSource("clima-rayos").setData(fc);
    else {
      this.map.addSource("clima-rayos", { type: "geojson", data: fc });
      this.map.addLayer({ id: "clima-rayos", type: "circle", source: "clima-rayos", paint: {
        "circle-color": ["get", "c"], "circle-opacity": 0.85, "circle-blur": 0.35,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, ["+", 1.5, ["*", 0.5, ["ln", ["+", 1, ["get", "n"]]]]], 7, ["+", 3, ["*", 1.6, ["ln", ["+", 1, ["get", "n"]]]]]],
        "circle-stroke-width": 0.5, "circle-stroke-color": "rgba(0,0,0,0.4)" } });
    }
    clearTimeout(this.reloj);
    this.reloj = setTimeout(() => this.cargar().catch(() => null), 5 * 60000); // el servidor actualiza cada 20 min
    return this.datos;
  }

  #cuadro(t) {
    if (!this.activo) return;
    requestAnimationFrame((tt) => this.#cuadro(tt));
    const dt = Math.min(0.1, (t - this.ultimo) / 1000 || 0);
    this.ultimo = t;
    const r = this.map.getCanvas().getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    if (this.canvas.width !== Math.round(r.width * dpr)) { this.canvas.width = Math.round(r.width * dpr); this.canvas.height = Math.round(r.height * dpr);
      this.canvas.style.width = `${r.width}px`; this.canvas.style.height = `${r.height}px`; }
    const g = this.ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, r.width, r.height);
    if (!this.datos || document.hidden || this.map.isMoving()) { this.vivos = []; return; }
    // Nuevos destellos: cada celda reciente dispara al ritmo real de su conteo (destellos / 20 min), acelerado ×20 para que se vea.
    const globo = (this.map.getProjection?.()?.type ?? "mercator") === "globe";
    for (const [lon, lat, n, m] of this.datos.celdas) {
      if (m > 10 || this.vivos.length > 60) continue;
      if (Math.random() > (n / (this.datos.ventana_min * 60)) * 20 * dt) continue;
      const q = this.map.project([lon, lat]);
      if (q.x < 0 || q.y < 0 || q.x > r.width || q.y > r.height) continue;
      if (globo) { const b = this.map.unproject(q); if (Math.abs(b.lat - lat) > 0.5 || Math.abs(((b.lng - lon + 540) % 360) - 180) > 0.5) continue; }
      const largo = 10 + Math.min(40, this.map.getZoom() * 5);
      this.vivos.push({ x: q.x, y: q.y - largo, t0: t, trazo: trazoRayo(q.x, q.y - largo, largo) });
    }
    // Dibujo: resplandor + rayo, que se apagan en 0.35 s con un parpadeo.
    this.vivos = this.vivos.filter((v) => t - v.t0 < 350);
    for (const v of this.vivos) {
      const k = (t - v.t0) / 350, a = (1 - k) * (k < 0.15 || (k > 0.3 && k < 0.45) ? 1 : 0.55);
      const gr = g.createRadialGradient(v.x, v.y + 20, 0, v.x, v.y + 20, 38);
      gr.addColorStop(0, `rgba(255,255,240,${0.55 * a})`); gr.addColorStop(1, "rgba(180,200,255,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(v.x, v.y + 20, 38, 0, 2 * Math.PI); g.fill();
      g.strokeStyle = `rgba(255,255,255,${a})`; g.shadowColor = "rgba(190,210,255,0.9)"; g.shadowBlur = 8; g.lineWidth = 1.6;
      for (const linea of [v.trazo.tronco, ...v.trazo.ramas]) {
        g.beginPath(); linea.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); g.lineWidth = 1;
      }
      g.shadowBlur = 0;
    }
  }

  destruir() {
    this.activo = false;
    clearTimeout(this.reloj);
    this.canvas.remove();
    if (this.map.getLayer("clima-rayos")) this.map.removeLayer("clima-rayos");
    if (this.map.getSource("clima-rayos")) this.map.removeSource("clima-rayos");
  }
}

// ------------------------------------------------------------------ bucles animados de satélite (NASA GIBS)
// Imágenes reales de satélites geoestacionarios (cada 10 min) y lluvia IMERG (cada 30 min). Se pide una serie de
// momentos recientes y se pasan en bucle. «retraso» = cuánto tarda GIBS en publicar (medido en oct 2026).
export const BUCLES = {
  nubes_ir: { capas: [["Himawari_AHI_Band13_Clean_Infrared", "GoogleMapsCompatible_Level6"], ["GOES-West_ABI_Band13_Clean_Infrared", "GoogleMapsCompatible_Level6"],
    ["GOES-East_ABI_Band13_Clean_Infrared", "GoogleMapsCompatible_Level6"]], paso: 10, cuadros: 8, retraso: 70, opacidad: 0.75, maxzoom: 6 },
  geocolor: { capas: [["GOES-West_ABI_GeoColor", "GoogleMapsCompatible_Level7"], ["GOES-East_ABI_GeoColor", "GoogleMapsCompatible_Level7"]],
    paso: 10, cuadros: 8, retraso: 80, opacidad: 0.9, maxzoom: 7 },
  lluvia_sat: { capas: [["IMERG_Precipitation_Rate_30min", "GoogleMapsCompatible_Level6"]], paso: 30, cuadros: 6, retraso: 420, opacidad: 0.8, maxzoom: 6 },
};

/** Momentos (ISO, UTC) del bucle: del más antiguo al más reciente publicado, en múltiplos del paso. */
export function momentosBucle(def, ahora = new Date()) {
  const paso = def.paso * 60000;
  const ultimo = Math.floor((ahora.getTime() - def.retraso * 60000) / paso) * paso;
  return Array.from({ length: def.cuadros }, (_, i) => new Date(ultimo - (def.cuadros - 1 - i) * paso).toISOString().replace(/\.\d{3}Z$/, "Z"));
}

export const urlBucle = (capa, matriz, momento) => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${capa}/default/${momento}/${matriz}/{z}/{y}/{x}.png`;

class BucleSatelite {
  constructor(map, id, onMomento, onProgreso) {
    this.map = map; this.id = id; this.def = BUCLES[id]; this.onMomento = onMomento; this.onProgreso = onProgreso;
    this.momentos = momentosBucle(this.def);
    this.i = this.momentos.length - 1;
    this.agregados = new Set();
    // Primero el cuadro más reciente; los anteriores se piden de uno en uno cuando el previo terminó de bajar,
    // para que no compitan entre sí y la primera imagen aparezca cuanto antes.
    this.#agregar(this.i);
    this.onMomento?.(this.momentos[this.i]);
    this.#avisar();
    this.reloj = setInterval(() => this.#siguiente(), 700);
  }

  #agregar(k) {
    const antes = ["choke-anillo", "clusters"].find((l) => this.map.getLayer(l));
    this.def.capas.forEach(([capa, matriz], j) => {
      const sid = `bucle-${this.id}-${k}-${j}`;
      if (this.map.getSource(sid)) return;
      this.map.addSource(sid, { type: "raster", tiles: [urlBucle(capa, matriz, this.momentos[k])], tileSize: 256, maxzoom: this.def.maxzoom, attribution: "Imágenes: NASA GIBS / NOAA / JMA" });
      this.map.addLayer({ id: sid, type: "raster", source: sid, paint: { "raster-opacity": k === this.i ? this.def.opacidad : 0,
        "raster-opacity-transition": { duration: 250 }, "raster-fade-duration": 0 } }, antes);
    });
    this.agregados.add(k);
  }

  /** Un cuadro está listo cuando todas sus imágenes de la vista actual ya se descargaron. */
  #listo(k) {
    if (!this.agregados.has(k)) return false;
    return this.def.capas.every((_, j) => { try { return this.map.isSourceLoaded(`bucle-${this.id}-${k}-${j}`); } catch (e) { return false; } });
  }

  #avisar() {
    // Si todo lo pedido ya bajó, se pide el siguiente cuadro hacia atrás en el tiempo.
    if ([...this.agregados].every((k) => this.#listo(k))) {
      const siguiente = [...this.momentos.keys()].reverse().find((k) => !this.agregados.has(k));
      if (siguiente != null) this.#agregar(siguiente);
    }
    const listos = this.momentos.filter((_, k) => this.#listo(k)).length;
    this.onProgreso?.(listos, this.momentos.length);
    return listos;
  }

  #siguiente() {
    if (document.hidden) return;
    const listos = this.#avisar();
    if (this.map.isMoving() || !listos) return;
    const anterior = this.i;
    // Pausa más larga en el cuadro más reciente: es el que importa.
    if (anterior === this.momentos.length - 1 && this.#listo(anterior) && (this.pausa = (this.pausa || 0) + 1) < 3) return;
    this.pausa = 0;
    // Solo se avanza a cuadros ya descargados: así la animación no se «despinta» mientras bajan las imágenes.
    let k = anterior;
    for (let n = 0; n < this.momentos.length; n++) { k = (k + 1) % this.momentos.length; if (this.#listo(k)) break; }
    if (k === anterior) return;
    this.i = k;
    this.def.capas.forEach((_, j) => {
      this.map.setPaintProperty(`bucle-${this.id}-${anterior}-${j}`, "raster-opacity", 0);
      this.map.setPaintProperty(`bucle-${this.id}-${this.i}-${j}`, "raster-opacity", this.def.opacidad);
    });
    this.onMomento?.(this.momentos[this.i]);
  }

  destruir() {
    clearInterval(this.reloj);
    this.agregados.forEach((k) => this.def.capas.forEach((__, j) => {
      const sid = `bucle-${this.id}-${k}-${j}`;
      if (this.map.getLayer(sid)) this.map.removeLayer(sid);
      if (this.map.getSource(sid)) this.map.removeSource(sid);
    }));
  }
}
