// Cielo real detrás del globo: estrellas, constelaciones, Vía Láctea, galaxias, Sol, Luna y planetas en su
// posición de este momento, vistos desde el lado opuesto de la Tierra al que mira la cámara.
//
// Cómo se calcula la vista:
//   - La cámara del globo está sobre el punto central del mapa (lon, lat), mirando al centro de la Tierra.
//   - Un punto de la Tierra con longitud λ está, en el cielo, en la ascensión recta λ + TSMG (tiempo sidéreo medio de
//     Greenwich). Así se pasa de la vista del mapa a coordenadas celestes, y el cielo gira junto con la Tierra.
//   - Las estrellas están «en el infinito»: el cielo no cambia de tamaño con el zoom; solo gira con el globo, la
//     orientación (bearing) y la inclinación (pitch).
//   - El Sol y la Luna aparecen solo cuando de verdad quedan detrás de la Tierra (por ejemplo, el Sol al mirar el lado
//     nocturno); si están a espaldas de la cámara no se ven, como en la realidad.
// Precisión: Sol ~0.01°, Luna ~0.3° (algoritmos de baja precisión del Astronomical Almanac), planetas con elementos
// keplerianos de JPL (Standish), de sobra para un fondo. Catálogo: data/base/cielo.json (tools/cielo/catalogo.py).

const RAD = Math.PI / 180;
const OBLICUIDAD = 23.43928 * RAD;
const FOV_VERTICAL = 60; // grados: amplitud fija del cielo en pantalla, sin importar el zoom del mapa
const ZOOM_MAX = 5;      // con más zoom el globo llena la pantalla y no se ve el espacio

export const jd = (fecha) => fecha.getTime() / 86400000 + 2440587.5;
const norm360 = (x) => ((x % 360) + 360) % 360;

/** Tiempo sidéreo medio de Greenwich en grados. */
export function tsmg(fecha) { return norm360(280.46061837 + 360.98564736629 * (jd(fecha) - 2451545)); }

/** Ascensión recta y declinación (grados) → vector unitario ecuatorial. */
export function vector(ra, dec) {
  const a = ra * RAD, d = dec * RAD;
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
}

export function radec(v) {
  const n = Math.hypot(v[0], v[1], v[2]);
  return [norm360(Math.atan2(v[1], v[0]) / RAD), Math.asin(v[2] / n) / RAD];
}

const ecuatorial = ([x, y, z]) => [x, y * Math.cos(OBLICUIDAD) - z * Math.sin(OBLICUIDAD), y * Math.sin(OBLICUIDAD) + z * Math.cos(OBLICUIDAD)];
const punto = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Separación angular en grados entre dos posiciones [ra, dec]. */
export function separacion(a, b) { return Math.acos(Math.max(-1, Math.min(1, punto(vector(...a), vector(...b))))) / RAD; }

/** Sol: algoritmo de baja precisión del Astronomical Almanac (el mismo de js/sol.js). */
export function sol(fecha) {
  const n = jd(fecha) - 2451545;
  const L = 280.46 + 0.9856474 * n, g = (357.528 + 0.9856003 * n) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  return radec(ecuatorial([Math.cos(lambda), Math.sin(lambda), 0]));
}

/** Luna: fórmulas de baja precisión del Astronomical Almanac (≈0.3°). */
export function luna(fecha) {
  const T = (jd(fecha) - 2451545) / 36525;
  const s = (a, b) => Math.sin((a + b * T) * RAD);
  const lambda = (218.32 + 481267.881 * T + 6.29 * s(135.0, 477198.87) - 1.27 * s(259.3, -413335.36) + 0.66 * s(235.7, 890534.22)
    + 0.21 * s(269.9, 954397.74) - 0.19 * s(357.5, 35999.05) - 0.11 * s(186.5, 966404.03)) * RAD;
  const beta = (5.13 * s(93.3, 483202.02) + 0.28 * s(228.2, 960400.89) - 0.28 * s(318.3, 6003.15) - 0.17 * s(217.6, -407332.21)) * RAD;
  return radec(ecuatorial([Math.cos(beta) * Math.cos(lambda), Math.cos(beta) * Math.sin(lambda), Math.sin(beta)]));
}

/** Posición heliocéntrica eclíptica (UA) a partir de elementos keplerianos de JPL (a, e, i, L, ϖ=W, Ω=N y sus tasas por siglo). */
export function heliocentrica(el, fecha) {
  const T = (jd(fecha) - 2451545) / 36525;
  const a = el.a + el.da * T, e = el.e + el.de * T, I = (el.i + el.di * T) * RAD;
  const L = el.L + el.dL * T, W = el.W + el.dW * T, N = el.N + el.dN * T;
  const M = norm360(L - W) * RAD, w = (W - N) * RAD, O = N * RAD;
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 8; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const [cw, sw, cO, sO, cI, sI] = [Math.cos(w), Math.sin(w), Math.cos(O), Math.sin(O), Math.cos(I), Math.sin(I)];
  return [(cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    sw * sI * xp + cw * sI * yp];
}

/** Planeta visto desde la Tierra: [ra, dec]. */
export function planeta(el, tierra, fecha) {
  const p = heliocentrica(el, fecha), t = heliocentrica(tierra, fecha);
  return radec(ecuatorial([p[0] - t[0], p[1] - t[1], p[2] - t[2]]));
}

/**
 * Base de la cámara en coordenadas ecuatoriales para la vista actual del mapa.
 * f: hacia dónde mira (detrás de la Tierra); r: derecha de la pantalla; u: arriba de la pantalla.
 */
export function camara({ lng, lat, bearing = 0, pitch = 0 }, fecha) {
  const a = (lng + tsmg(fecha)) * RAD, d = lat * RAD;
  const D = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
  const este = [-Math.sin(a), Math.cos(a), 0];
  const norte = [-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)];
  const b = bearing * RAD, p = pitch * RAD;
  const comb = (x, y, cx, cy) => [x[0] * cx + y[0] * cy, x[1] * cx + y[1] * cy, x[2] * cx + y[2] * cy];
  const u0 = comb(norte, este, Math.cos(b), Math.sin(b));   // la dirección del bearing queda arriba
  const r = comb(este, norte, Math.cos(b), -Math.sin(b));
  const f0 = D.map((x) => -x);
  return { f: comb(f0, u0, Math.cos(p), Math.sin(p)), u: comb(u0, f0, Math.cos(p), -Math.sin(p)), r };
}

/** Vector celeste → píxel; null si queda a espaldas de la cámara. `forzar` acerca al borde lo que está detrás (para rellenos). */
export function aPantalla(cam, v, ancho, alto, forzar = false) {
  let z = punto(v, cam.f);
  if (z < 0.02) { if (!forzar) return null; z = 0.02; }
  const foco = alto / 2 / Math.tan((FOV_VERTICAL / 2) * RAD);
  return [ancho / 2 + (foco * punto(v, cam.r)) / z, alto / 2 - (foco * punto(v, cam.u)) / z];
}

/**
 * Contorno en el cielo → contorno visible: densifica cada lado por el gran círculo (pasos de ≤ 2°) y recorta contra el
 * plano frontal de la cámara (z ≥ 0.05), para rellenar zonas grandes como la Vía Láctea sin deformarlas.
 */
export function recortarContorno(vectores, f, minZ = 0.05) {
  const denso = [];
  for (let i = 0; i < vectores.length; i++) {
    const a = vectores[i], b = vectores[(i + 1) % vectores.length];
    const ang = Math.acos(Math.max(-1, Math.min(1, punto(a, b))));
    const n = Math.max(1, Math.ceil(ang / (2 * RAD)));
    for (let k = 0; k < n; k++) {
      const t = k / n, sa = Math.sin((1 - t) * ang), sb = Math.sin(t * ang), s0 = Math.sin(ang) || 1;
      denso.push(ang < 1e-6 ? a : [0, 1, 2].map((j) => (a[j] * sa + b[j] * sb) / s0));
    }
  }
  const fuera = [];
  for (let i = 0; i < denso.length; i++) {
    const a = denso[i], b = denso[(i + 1) % denso.length];
    const za = punto(a, f), zb = punto(b, f);
    if (za >= minZ) fuera.push(a);
    if ((za >= minZ) !== (zb >= minZ)) { const t = (minZ - za) / (zb - za); fuera.push([0, 1, 2].map((j) => a[j] + (b[j] - a[j]) * t)); }
  }
  return fuera;
}

/** Color aproximado de una estrella según su índice B−V (azul → blanco → naranja). */
export function colorBV(bv) {
  const t = Math.max(0, Math.min(1, (bv + 0.3) / 2.0));
  const r = Math.round(170 + 85 * Math.min(1, t * 2)), g = Math.round(195 + 45 * (1 - Math.abs(t - 0.35) * 2)), b = Math.round(255 - 140 * t);
  return `rgb(${r},${Math.min(255, g)},${b})`;
}

const PLANETA_ESTILO = { mer: [2.2, "#c9b8a6"], ven: [3.6, "#fff4d6"], mar: [2.7, "#ff8a5c"], jup: [3.4, "#f1dcb3"], sat: [3.0, "#e8d29a"], ura: [1.8, "#9fe3ee"], nep: [1.8, "#7f9dff"] };

export class Universo {
  constructor(map) {
    this.map = map;
    this.datos = null;
    this.activo = false;
    this.pendiente = false;
    this.lienzo = document.createElement("canvas");
    this.lienzo.className = "universo-fondo";
    this.lienzo.setAttribute("aria-hidden", "true");
    Object.assign(this.lienzo.style, { position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none", display: "none" });
    const cont = map.getContainer();
    cont.insertBefore(this.lienzo, cont.firstChild);
    this.alPintar = () => this.#programar();
    map.on("render", this.alPintar);
    map.on("resize", this.alPintar);
    this.reloj = setInterval(this.alPintar, 20000); // el cielo gira 0.08° cada 20 s
  }

  async activar(si) {
    this.activo = si;
    if (si && !this.datos) {
      const r = await fetch("data/base/cielo.json");
      this.datos = await r.json();
      this.datos.estrellasV = this.datos.estrellas.map(([ra, dec, mag, bv]) => [vector(ra, dec), mag, colorBV(bv)]);
      this.datos.viaV = this.datos.via_lactea.map(([nivel, anillo]) => [nivel, anillo.map(([ra, dec]) => vector(ra, dec))]);
    }
    this.#programar();
  }

  #programar() {
    if (this.pendiente) return;
    this.pendiente = true;
    requestAnimationFrame(() => { this.pendiente = false; this.#dibujar(); });
  }

  #visible() {
    const tipo = this.map.getProjection?.()?.type ?? this.map.style?.projection?.name;
    return this.activo && !!this.datos && tipo === "globe" && this.map.getZoom() < ZOOM_MAX;
  }

  #dibujar() {
    const c = this.lienzo;
    if (!this.#visible()) { c.style.display = "none"; return; }
    c.style.display = "block";
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = c.clientWidth, H = c.clientHeight;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fecha = new Date();
    const centro = this.map.getCenter();
    const cam = camara({ lng: centro.lng, lat: centro.lat, bearing: this.map.getBearing(), pitch: this.map.getPitch() }, fecha);
    const P = (ra, dec, forzar) => aPantalla(cam, vector(ra, dec), W, H, forzar);
    const d = this.datos;

    const fondo = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) / 2);
    fondo.addColorStop(0, "#070b18"); fondo.addColorStop(1, "#010205");
    g.fillStyle = fondo; g.fillRect(0, 0, W, H);

    // Vía Láctea: contornos superpuestos, más brillantes hacia el centro galáctico.
    for (const [nivel, anillo] of d.viaV) {
      const visible = recortarContorno(anillo, cam.f);
      if (visible.length < 3) continue;
      g.beginPath();
      visible.forEach((v, i) => { const q = aPantalla(cam, v, W, H); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); });
      g.fillStyle = `rgba(185,200,255,${0.02 + nivel * 0.012})`; g.fill();
    }

    // Líneas de constelaciones.
    g.strokeStyle = "rgba(120,160,255,0.22)"; g.lineWidth = 0.7;
    g.beginPath();
    for (const tramo of d.lineas) {
      let prev = null;
      for (const [ra, dec] of tramo) { const q = P(ra, dec); if (q && prev) { g.moveTo(prev[0], prev[1]); g.lineTo(q[0], q[1]); } prev = q; }
    }
    g.stroke();

    // Estrellas: tamaño y opacidad según magnitud, color según B−V.
    for (const [v, mag, color] of d.estrellasV) {
      const q = aPantalla(cam, v, W, H);
      if (!q || q[0] < -5 || q[1] < -5 || q[0] > W + 5 || q[1] > H + 5) continue;
      const r = Math.max(0.35, 2.4 - 0.38 * mag);
      g.globalAlpha = Math.max(0.25, Math.min(1, 1.15 - mag * 0.14));
      g.fillStyle = color;
      g.beginPath(); g.arc(q[0], q[1], r, 0, 2 * Math.PI); g.fill();
    }
    g.globalAlpha = 1;

    const etiqueta = (texto, q, color, dy = -7, tam = 10) => {
      g.font = `${tam}px system-ui, sans-serif`; g.fillStyle = color; g.textAlign = "center"; g.fillText(texto, q[0], q[1] + dy);
    };
    for (const [nombre, ra, dec, rango] of d.constelaciones) {
      if (rango > 2) continue;
      const q = P(ra, dec);
      if (q) etiqueta(nombre.toUpperCase(), q, "rgba(150,180,255,0.42)", 0, 9);
    }
    for (const [nombre, ra, dec] of d.nombres) { const q = P(ra, dec); if (q) etiqueta(nombre, q, "rgba(230,235,255,0.7)", -6, 9); }

    // Galaxias, nebulosas y cúmulos: mancha difusa con nombre.
    for (const [nombre, tipo, ra, dec] of d.objetos) {
      const q = P(ra, dec);
      if (!q) continue;
      const tam = tipo === "galaxia" && /Magallanes/.test(nombre) ? 14 : tipo === "centro" ? 10 : 7;
      const gr = g.createRadialGradient(q[0], q[1], 0, q[0], q[1], tam);
      const c0 = { galaxia: "220,210,255", nebulosa: "255,150,190", cumulo: "200,220,255", centro: "255,220,170" }[tipo];
      gr.addColorStop(0, `rgba(${c0},0.55)`); gr.addColorStop(1, `rgba(${c0},0)`);
      g.fillStyle = gr; g.beginPath(); g.ellipse(q[0], q[1], tam, tam * 0.6, 0.5, 0, 2 * Math.PI); g.fill();
      etiqueta(nombre, q, "rgba(215,205,255,0.75)", -tam - 2, 9);
    }

    // Planetas.
    const tierra = d.planetas.ter.el;
    for (const [id, [r, color]] of Object.entries(PLANETA_ESTILO)) {
      const q = P(...planeta(d.planetas[id].el, tierra, fecha));
      if (!q) continue;
      g.fillStyle = color; g.shadowColor = color; g.shadowBlur = 6;
      g.beginPath(); g.arc(q[0], q[1], r, 0, 2 * Math.PI); g.fill();
      g.shadowBlur = 0;
      etiqueta(d.planetas[id].nombre, q, color, -r - 4, 10);
    }

    // Sol: núcleo y resplandor.
    const pSol = sol(fecha);
    const qs = P(...pSol);
    if (qs) {
      // Halo amplio (luz dispersa): si el Sol queda justo detrás de la Tierra, asoma por el borde como un amanecer orbital.
      const R = Math.min(W, H) * 0.38;
      const gr = g.createRadialGradient(qs[0], qs[1], 0, qs[0], qs[1], R);
      gr.addColorStop(0, "rgba(255,250,225,1)"); gr.addColorStop(0.05, "rgba(255,232,160,0.95)"); gr.addColorStop(0.2, "rgba(255,190,90,0.28)"); gr.addColorStop(1, "rgba(255,160,60,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(qs[0], qs[1], R, 0, 2 * Math.PI); g.fill();
      etiqueta("Sol", qs, "rgba(255,235,170,0.95)", -50, 11);
    }

    // Luna con su fase: la parte iluminada mira hacia el Sol.
    const pLuna = luna(fecha);
    const ql = P(...pLuna);
    if (ql) {
      const R = 9, k = (1 - Math.cos(separacion(pLuna, pSol) * RAD)) / 2; // fracción iluminada
      const haciaSol = aPantalla(cam, vector(...pSol), W, H, true);
      const ang = Math.atan2(haciaSol[1] - ql[1], haciaSol[0] - ql[0]);
      g.save(); g.translate(ql[0], ql[1]); g.rotate(ang);
      g.fillStyle = "#3a3d46"; g.beginPath(); g.arc(0, 0, R, 0, 2 * Math.PI); g.fill();
      g.fillStyle = "#f2efe4";
      g.beginPath(); g.arc(0, 0, R, -Math.PI / 2, Math.PI / 2); g.fill();          // mitad hacia el Sol
      g.fillStyle = k >= 0.5 ? "#f2efe4" : "#3a3d46";                              // terminador: elipse clara u oscura
      g.beginPath(); g.ellipse(0, 0, R * Math.abs(1 - 2 * k), R, 0, 0, 2 * Math.PI); g.fill();
      g.restore();
      etiqueta(`Luna · ${Math.round(k * 100)} % iluminada`, ql, "rgba(240,238,228,0.9)", -R - 5, 10);
    }
  }

  destruir() {
    clearInterval(this.reloj);
    this.map.off("render", this.alPintar);
    this.map.off("resize", this.alPintar);
    this.lienzo.remove();
  }
}
