// Capa de clima tipo Windy: viento animado con partículas, temperatura a 2 m y lluvia del modelo GFS de
// NOAA (tools/clima/gfs.py los prepara cada 6 h en data/vivos/clima/).
//
// Viento: la textura viento_fXXX.png guarda U (canal rojo) y V (canal verde) en una rejilla de 1°.
// Cada partícula vive en coordenadas de pantalla; en cada cuadro se busca el viento en su lon/lat
// (interpolación bilineal), se mueve unos píxeles en esa dirección y se dibuja un trazo que se desvanece.
// Se pausa mientras el mapa se mueve y cuando la pestaña no está visible.
// Temperatura y lluvia: imágenes ya proyectadas a Web Mercator, como fuente "image" de MapLibre.
import { getJSON } from "./util.js";

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
    const n = Math.round(Math.min(matchMedia("(max-width: 760px)").matches ? 1200 : 3500, (this.ancho * this.alto) / 250));
    this.p = Array.from({ length: n }, () => this.#nueva());
    this.#limpiar();
  }

  #nueva() { return { x: Math.random() * this.ancho, y: Math.random() * this.alto, edad: Math.floor(Math.random() * 80) }; }

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
    const factor = 0.35; // píxeles por cuadro por m/s
    for (const q of this.p) {
      const ll = this.map.unproject([q.x, q.y]);
      if (Math.abs(ll.lat) > 85) { Object.assign(q, this.#nueva(), { edad: 0 }); continue; }
      const [u, v] = muestrear(this.campo, ll.lng, ll.lat);
      const s = Math.hypot(u, v);
      const nx = q.x + u * factor, ny = q.y - v * factor;
      const col = colorVelocidad(s);
      if (!lotes.has(col)) lotes.set(col, []);
      lotes.get(col).push(q.x, q.y, nx, ny);
      q.x = nx; q.y = ny; q.edad++;
      if (q.edad > 90 || s < 0.2 || q.x < 0 || q.y < 0 || q.x > this.ancho || q.y > this.alto) Object.assign(q, this.#nueva(), { edad: 0 });
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
  constructor(map) { this.map = map; this.meta = null; this.paso = 0; this.activas = new Set(); this.particulas = null; }

  async cargar() { this.meta = await getJSON(`${BASE}meta.json`, { bust: true }); return this.meta; }

  get pasoActual() { return this.meta?.pasos?.[this.paso]; }

  async setPaso(i) {
    this.paso = i;
    for (const t of ["temp", "lluvia"]) if (this.activas.has(t)) this.map.getSource(`clima-${t}`)?.updateImage({ url: BASE + this.pasoActual[t], coordinates: COORDS });
    if (this.activas.has("viento")) this.particulas.setCampo(await cargarViento(BASE + this.pasoActual.viento, this.meta));
  }

  async activar(tipo) {
    if (!this.meta) await this.cargar();
    this.activas.add(tipo);
    if (tipo === "viento") {
      this.particulas ??= new Particulas(this.map);
      this.particulas.setCampo(await cargarViento(BASE + this.pasoActual.viento, this.meta));
    } else this.#instalar(tipo);
  }

  desactivar(tipo) {
    this.activas.delete(tipo);
    if (tipo === "viento") { this.particulas?.destruir(); this.particulas = null; return; }
    if (this.map.getLayer(`clima-${tipo}`)) this.map.removeLayer(`clima-${tipo}`);
    if (this.map.getSource(`clima-${tipo}`)) this.map.removeSource(`clima-${tipo}`);
  }

  reinstalar() { for (const t of this.activas) if (t !== "viento") this.#instalar(t); }

  #instalar(tipo) {
    const id = `clima-${tipo}`;
    if (this.map.getSource(id)) return;
    this.map.addSource(id, { type: "image", url: BASE + this.pasoActual[tipo], coordinates: COORDS });
    const antes = ["choke-anillo", "clusters"].find((l) => this.map.getLayer(l));
    this.map.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": tipo === "temp" ? 0.6 : 0.85, "raster-fade-duration": 0, "raster-resampling": "linear" } }, antes);
  }
}

/** Barra de leyenda (HTML) a partir de [[valor, color], …]. */
export function leyenda(paradas, unidad) {
  const grad = paradas.map(([, c], i) => `${c} ${Math.round((i / (paradas.length - 1)) * 100)}%`).join(", ");
  return `<div class="clima-leyenda"><div class="barra" style="background:linear-gradient(90deg, ${grad})"></div>
    <div class="marcas">${paradas.map(([v]) => `<span>${v}</span>`).join("")}<span>${unidad}</span></div></div>`;
}
