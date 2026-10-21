// Vista «Peters (tamaño real)»: proyección cilíndrica equivalente de Gall–Peters (paralelos estándar a 45°).
// Conserva las áreas: cada país ocupa en pantalla una superficie proporcional a la real (a cambio, las formas se
// estiran cerca del ecuador y se aplanan cerca de los polos). MapLibre no la tiene, así que se dibuja aparte en un
// lienzo encima del mapa con las fronteras de Natural Earth 1:110m y los eventos visibles.
//   x = λ · cos 45°      y = sen φ / cos 45°      (λ, φ en radianes; esfera de radio 1)
// El producto de las dos escalas es 1, así que el área en el plano × R² es el área real.

const C45 = Math.cos(Math.PI / 4);
const R_KM = 6371.0088;
const RAD = Math.PI / 180;

/** [lon, lat] en grados → [x, y] en unidades de la esfera unitaria (y hacia el norte). */
export function proyectar(lon, lat) {
  return [lon * RAD * C45, Math.sin(Math.max(-90, Math.min(90, lat)) * RAD) / C45];
}

/** Área real (km²) de un anillo [[lon, lat], …] usando la proyección equivalente (fórmula del cordón). */
export function areaAnilloKm2(anillo) {
  let s = 0;
  for (let i = 0, n = anillo.length; i < n; i++) {
    const [x1, y1] = proyectar(...anillo[i]), [x2, y2] = proyectar(...anillo[(i + 1) % n]);
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s / 2) * R_KM * R_KM;
}

/** Área de un Polygon o MultiPolygon de GeoJSON (los huecos restan). */
export function areaKm2(geom) {
  const polis = geom?.type === "Polygon" ? [geom.coordinates] : geom?.type === "MultiPolygon" ? geom.coordinates : [];
  return polis.reduce((t, p) => t + p.reduce((u, anillo, i) => u + (i ? -1 : 1) * areaAnilloKm2(anillo), 0), 0);
}

const fmtKm2 = (a) => (a >= 1e6 ? `${(a / 1e6).toFixed(2)} millones de km²` : `${Math.round(a).toLocaleString("es-MX")} km²`);

export class VistaPeters {
  /** contenedor: elemento del mapa; datos(): {paises, nombres, puntos: [[lon, lat, color]]} */
  constructor(contenedor, datos) {
    this.cont = contenedor; this.datos = datos; this.k = 1; this.dx = 0; this.dy = 0; this.sobre = null; this.fijo = null;
  }

  async mostrar() {
    if (!this.el) this.#crear();
    this.el.hidden = false;
    this.d = await this.datos();
    this.#medir(); this.dibujar();
  }

  ocultar() { if (this.el) this.el.hidden = true; }
  get visible() { return Boolean(this.el && !this.el.hidden); }

  #crear() {
    this.el = document.createElement("div");
    this.el.className = "vista-peters";
    this.el.innerHTML = `<canvas aria-label="Mapa en proyección de Peters: tamaño real de los países"></canvas>
      <div class="peters-info" role="status" aria-live="polite"></div>
      <p class="peters-nota">Proyección de Gall–Peters: las <b>áreas</b> son proporcionales al tamaño real; las formas se deforman.
        Pasa el puntero sobre un país para ver su superficie; clic para fijarlo y comparar con otro. Rueda: acercar · arrastrar: mover.</p>`;
    this.cont.appendChild(this.el);
    this.cv = this.el.querySelector("canvas");
    this.info = this.el.querySelector(".peters-info");
    new ResizeObserver(() => { if (this.visible) { this.#medir(); this.dibujar(); } }).observe(this.el);
    let arr = null;
    this.cv.addEventListener("pointerdown", (e) => { arr = { x: e.clientX, y: e.clientY, dx: this.dx, dy: this.dy, mov: false }; this.cv.setPointerCapture(e.pointerId); });
    this.cv.addEventListener("pointermove", (e) => {
      if (arr) {
        if (Math.abs(e.clientX - arr.x) + Math.abs(e.clientY - arr.y) > 3) arr.mov = true;
        this.dx = arr.dx + (e.clientX - arr.x); this.dy = arr.dy + (e.clientY - arr.y); this.dibujar(); return;
      }
      this.sobre = this.#paisEn(e.offsetX, e.offsetY); this.#texto(); this.dibujar();
    });
    this.cv.addEventListener("pointerup", (e) => {
      if (arr && !arr.mov) { const p = this.#paisEn(e.offsetX, e.offsetY); this.fijo = p && this.fijo !== p ? p : null; this.#texto(); this.dibujar(); }
      arr = null;
    });
    this.cv.addEventListener("wheel", (e) => {
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.2 : 1 / 1.2, k = Math.max(1, Math.min(12, this.k * f)), r = k / this.k;
      // Acerca alrededor del puntero: el punto bajo el cursor no se mueve.
      const mx = e.offsetX - (this.izq + (this.w - this.izq) / 2), my = e.offsetY - this.h / 2;
      this.dx = mx - (mx - this.dx) * r; this.dy = my - (my - this.dy) * r; this.k = k; this.dibujar();
    }, { passive: false });
  }

  #medir() {
    const dpr = window.devicePixelRatio || 1, w = this.el.clientWidth, h = this.el.clientHeight;
    this.cv.width = w * dpr; this.cv.height = h * dpr; this.cv.style.width = `${w}px`; this.cv.style.height = `${h}px`;
    this.dpr = dpr; this.w = w; this.h = h;
    // En escritorio el panel izquierdo flota sobre el mapa: el mundo se centra en lo que queda libre a su derecha.
    const panel = document.querySelector(".layout:not(.sin-panel) > .panel");
    this.izq = panel && window.innerWidth > 760 ? Math.max(0, panel.getBoundingClientRect().right - this.el.getBoundingClientRect().left) : 0;
    const libre = w - this.izq;
    // El mundo mide 2π·cos45 de ancho y 2/cos45 de alto: se ajusta al lienzo dejando margen.
    this.esc = Math.min((libre * 0.96) / (2 * Math.PI * C45), (h * 0.9) / (2 / C45));
  }

  #pantalla(lon, lat) {
    const [x, y] = proyectar(lon, lat);
    return [this.izq + (this.w - this.izq) / 2 + (x * this.esc) * this.k + this.dx, this.h / 2 - (y * this.esc) * this.k + this.dy];
  }

  #trazo(ctx, geom) {
    const polis = geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
    for (const p of polis) for (const anillo of p) {
      anillo.forEach(([lon, lat], i) => { const [x, y] = this.#pantalla(lon, lat); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.closePath();
    }
  }

  #paisEn(px, py) {
    const ctx = this.cv.getContext("2d");
    for (const f of this.d?.paises?.features || []) {
      ctx.beginPath(); this.#trazo(ctx, f.geometry);
      if (ctx.isPointInPath(px * this.dpr, py * this.dpr, "evenodd")) return f;
    }
    return null;
  }

  #nombre(f) { return this.d?.nombres?.[f?.properties?.iso3] || f?.properties?.iso3 || ""; }

  #texto() {
    const a = this.sobre, b = this.fijo;
    if (!a && !b) { this.info.textContent = ""; return; }
    const linea = (f) => `${this.#nombre(f)}: ${fmtKm2(areaKm2(f.geometry))}`;
    if (b && a && a !== b) {
      const ra = areaKm2(a.geometry) / areaKm2(b.geometry);
      this.info.textContent = `${linea(b)} · ${linea(a)} → ${this.#nombre(a)} es ${ra >= 1 ? `${ra.toFixed(1)} veces más grande` : `${(1 / ra).toFixed(1)} veces más chico`}.`;
    } else this.info.textContent = linea(a || b);
  }

  dibujar() {
    if (!this.cv || !this.d) return;
    const ctx = this.cv.getContext("2d"), oscuro = document.documentElement.dataset.theme === "dark";
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = oscuro ? "#0d1b2a" : "#cfe3f1"; ctx.fillRect(0, 0, this.w, this.h);
    // Retícula cada 30°.
    ctx.strokeStyle = oscuro ? "rgba(255,255,255,.12)" : "rgba(0,40,80,.15)"; ctx.lineWidth = 1; ctx.beginPath();
    for (let lon = -180; lon <= 180; lon += 30) { const [x1, y1] = this.#pantalla(lon, -90), [, y2] = this.#pantalla(lon, 90); ctx.moveTo(x1, y1); ctx.lineTo(x1, y2); }
    for (let lat = -90; lat <= 90; lat += 30) { const [x1, y] = this.#pantalla(-180, lat), [x2] = this.#pantalla(180, lat); ctx.moveTo(x1, y); ctx.lineTo(x2, y); }
    ctx.stroke();
    for (const f of this.d.paises.features) {
      ctx.beginPath(); this.#trazo(ctx, f.geometry);
      ctx.fillStyle = f === this.fijo ? "#C8102E" : f === this.sobre ? "#E2711D" : oscuro ? "#3b4f63" : "#f3efe6";
      ctx.fill("evenodd");
      ctx.strokeStyle = oscuro ? "rgba(255,255,255,.35)" : "rgba(60,60,60,.45)"; ctx.lineWidth = 0.6; ctx.stroke();
    }
    for (const [lon, lat, color] of this.d.puntos || []) {
      const [x, y] = this.#pantalla(lon, lat);
      ctx.beginPath(); ctx.arc(x, y, 3, 0, 2 * Math.PI); ctx.fillStyle = color || "#C8102E"; ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 0.8; ctx.stroke();
    }
  }
}
