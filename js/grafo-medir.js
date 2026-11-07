// Mediciones objetivas de una muestra de escritura o firma a partir de los píxeles de una imagen (sin red, sin IA).
// Entrada: { width, height, data } como ImageData (RGBA). Todo en píxeles; con `mmPorPx` se convierte a milímetros.
// Lo que se mide aquí es geometría (tamaño, inclinación, dirección de renglones, márgenes, espacios, grosor del trazo).
// La lectura grafológica de esas medidas está en grafo-logica.js.

const RAD = 180 / Math.PI;
const mediana = (xs) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const percentil = (xs, p) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))]; };
const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const desv = (xs) => { if (xs.length < 2) return 0; const m = media(xs); return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)); };
export { mediana, percentil, media, desv };

/** Luminancia 0–255 de cada píxel. */
export function gris({ width, height, data }) {
  const g = new Float32Array(width * height);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) {
    const a = data[j + 3] / 255; // transparente = papel blanco
    g[i] = (0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]) * a + 255 * (1 - a);
  }
  return g;
}

/** Umbral de Otsu sobre valores 0–255. */
export function otsu(g) {
  const h = new Float64Array(256);
  for (const v of g) h[Math.max(0, Math.min(255, v | 0))]++;
  const n = g.length; let suma = 0; for (let i = 0; i < 256; i++) suma += i * h[i];
  let sB = 0, wB = 0, mejor = 0, umbral = 128;
  for (let t = 0; t < 256; t++) {
    wB += h[t]; if (!wB) continue; const wF = n - wB; if (!wF) break;
    sB += t * h[t]; const mB = sB / wB, mF = (suma - sB) / wF, entre = wB * wF * (mB - mF) ** 2;
    if (entre > mejor) { mejor = entre; umbral = t; }
  }
  return umbral;
}

/** Recorta y binariza: 1 = tinta. Compensa iluminación desigual (foto de celular) restando el fondo local. */
export function mascara(img, recorte = null) {
  const r = recorte || { x: 0, y: 0, w: img.width, h: img.height };
  const x0 = Math.max(0, Math.round(r.x)), y0 = Math.max(0, Math.round(r.y));
  const w = Math.max(1, Math.min(img.width - x0, Math.round(r.w))), h = Math.max(1, Math.min(img.height - y0, Math.round(r.h)));
  const g0 = gris(img), g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = g0[(y + y0) * img.width + x + x0];
  // Fondo local: máximo en bloques (el papel es lo más claro), suavizado. Normaliza a papel = 255.
  const B = Math.max(16, Math.round(Math.min(w, h) / 12)), bw = Math.ceil(w / B), bh = Math.ceil(h / B), fondo = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const vals = [];
    for (let y = by * B; y < Math.min(h, (by + 1) * B); y += 2) for (let x = bx * B; x < Math.min(w, (bx + 1) * B); x += 2) vals.push(g[y * w + x]);
    fondo[by * bw + bx] = percentil(vals, 0.9);
  }
  const n = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const f = Math.max(40, fondo[Math.min(bh - 1, (y / B) | 0) * bw + Math.min(bw - 1, (x / B) | 0)]);
    n[y * w + x] = Math.min(255, (g[y * w + x] / f) * 255);
  }
  const t = Math.min(otsu(n), 200); // un papel casi vacío no debe volverse todo «tinta»
  const m = new Uint8Array(w * h);
  let tinta = 0, sumaT = 0, sumaP = 0, nP = 0;
  for (let i = 0; i < m.length; i++) {
    if (n[i] <= t) { m[i] = 1; tinta++; sumaT += g[i]; } else { sumaP += g[i]; nP++; }
  }
  return { w, h, m, g, umbral: t, tinta, grisTinta: tinta ? sumaT / tinta : NaN, grisPapel: nP ? sumaP / nP : NaN };
}

/** Dirección dominante de los renglones (grados, + asciende hacia la derecha): la que deja la proyección más «afilada». */
export function sesgo({ w, h, m }) {
  const pts = [];
  const paso = Math.max(1, Math.round(Math.sqrt((w * h) / 400000)));
  for (let y = 0; y < h; y += paso) for (let x = 0; x < w; x += paso) if (m[y * w + x]) pts.push(x, y);
  if (pts.length < 40) return 0;
  const puntuar = (a) => {
    // cubetas del tamaño del muestreo: si no, a 0° todas las filas muestreadas caen en cubetas pares y el puntaje se infla
    const t = Math.tan((a * Math.PI) / 180), off = Math.ceil((w * Math.abs(t)) / paso) + 2, hist = new Float64Array(Math.ceil(h / paso) + 2 * off + 2);
    for (let i = 0; i < pts.length; i += 2) hist[Math.round((pts[i + 1] + pts[i] * t) / paso) + off]++;
    let s = 0; for (const v of hist) s += v * v; return s;
  };
  let mejor = 0, pm = -1;
  for (let a = -15; a <= 15; a += 0.5) { const v = puntuar(a); if (v > pm) { pm = v; mejor = a; } }
  for (let a = mejor - 0.5; a <= mejor + 0.5; a += 0.1) { const v = puntuar(a); if (v > pm) { pm = v; mejor = a; } }
  return Math.round(mejor * 10) / 10; // tan>0 → y + x·t constante: el renglón sube hacia la derecha
}

/** Cizalla vertical: endereza renglones con dirección `a` (grados) sin mover columnas. */
export function enderezar(M, a) {
  const { w, h } = M, t = Math.tan((a * Math.PI) / 180), off = Math.ceil(w * Math.abs(t)), H = h + off;
  const m = new Uint8Array(w * H), g = new Float32Array(w * H).fill(255);
  for (let x = 0; x < w; x++) {
    const d = Math.round(x * t) + (t < 0 ? off : 0);
    for (let y = 0; y < h; y++) { const yy = y + d; if (yy < 0 || yy >= H) continue; m[yy * w + x] = M.m[y * w + x]; g[yy * w + x] = M.g[y * w + x]; }
  }
  return { ...M, h: H, m, g };
}

/** Renglones: bandas de la zona media (filas densas) extendidas a hampas y jambas. */
export function renglones({ w, h, m }) {
  const fila = new Float64Array(h);
  for (let y = 0; y < h; y++) { let c = 0; for (let x = 0; x < w; x++) c += m[y * w + x]; fila[y] = c; }
  const conTinta = [...fila].filter((c) => c > 0);
  if (!conTinta.length) return [];
  // suavizado leve
  const s = fila.map((_, y) => { let a = 0, k = 0; for (let d = -2; d <= 2; d++) if (y + d >= 0 && y + d < h) { a += fila[y + d]; k++; } return a / k; });
  const umbral = 0.3 * percentil(conTinta, 0.9);
  const nucleos = [];
  for (let y = 0; y < h; y++) {
    if (s[y] >= umbral) { const u = nucleos[nucleos.length - 1]; if (u && y - u.y1 <= 2) u.y1 = y; else nucleos.push({ y0: y, y1: y }); }
  }
  const lin = nucleos.filter((b) => b.y1 - b.y0 >= 2);
  // unir núcleos muy próximos (una i con punto, un renglón con hueco)
  for (let i = lin.length - 1; i > 0; i--) {
    const a = lin[i - 1], b = lin[i], alt = Math.max(a.y1 - a.y0, b.y1 - b.y0);
    if (b.y0 - a.y1 < 0.35 * alt) { a.y1 = b.y1; lin.splice(i, 1); }
  }
  return lin.map((b, i) => {
    const arriba = i ? Math.round((lin[i - 1].y1 + b.y0) / 2) : 0, abajo = i < lin.length - 1 ? Math.round((b.y1 + lin[i + 1].y0) / 2) : h - 1;
    let e0 = b.y0, e1 = b.y1;
    for (let y = b.y0 - 1; y >= arriba && fila[y] > 0; y--) e0 = y;
    for (let y = b.y1 + 1; y <= abajo && fila[y] > 0; y++) e1 = y;
    return { nucleo: { y0: b.y0, y1: b.y1 }, y0: e0, y1: e1 };
  });
}

function regresion(pts) { // [{x,y,w}] → pendiente, ordenada
  let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const { x, y, w = 1 } of pts) { sw += w; sx += w * x; sy += w * y; sxx += w * x * x; sxy += w * x * y; }
  const d = sw * sxx - sx * sx; if (!d) return { m: 0, b: sy / (sw || 1) };
  const m = (sw * sxy - sx * sy) / d; return { m, b: (sy - m * sx) / sw };
}

/** Mide un renglón: altura de la zona media, hampas, jambas, dirección (grados, + asciende), curvatura y palabras. */
export function medirRenglon(M, r, incl = 90) {
  const { w, m } = M, xh = r.nucleo.y1 - r.nucleo.y0 + 1;
  // columnas con tinta dentro del renglón; con letra inclinada se «enderezan» los trazos antes de buscar huecos entre palabras
  const k = Number.isFinite(incl) && Math.abs(incl - 90) > 3 && Math.abs(incl - 90) < 45 ? 1 / Math.tan((incl * Math.PI) / 180) : 0;
  const col = new Float64Array(w); let x0 = w, x1 = -1;
  for (let y = r.y0; y <= r.y1; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) {
    const xs = Math.round(x - (r.nucleo.y1 - y) * k); if (xs < 0 || xs >= w) continue;
    col[xs]++; if (xs < x0) x0 = xs; if (xs > x1) x1 = xs;
  }
  if (x1 < 0) return null;
  // centro de masa de la zona media por rebanadas → dirección del renglón
  const paso = Math.max(4, xh * 2), pts = [];
  for (let a = x0; a <= x1; a += paso) {
    let c = 0, sy = 0;
    for (let y = Math.max(r.y0, r.nucleo.y0 - xh); y <= Math.min(r.y1, r.nucleo.y1 + xh); y++) for (let x = a; x < Math.min(x1 + 1, a + paso); x++) if (m[y * w + x]) { c++; sy += y; }
    if (c > xh) pts.push({ x: a + paso / 2, y: sy / c, w: c });
  }
  const { m: pend } = regresion(pts);
  const angulo = -Math.atan(pend) * RAD; // y crece hacia abajo
  // curvatura: ajuste cuadrático simple con 3 tercios
  let curva = 0, finalSube = 0;
  if (pts.length >= 6) {
    const t = Math.floor(pts.length / 3), y1 = media(pts.slice(0, t).map((p) => p.y)), y2 = media(pts.slice(t, 2 * t).map((p) => p.y)), y3 = media(pts.slice(2 * t).map((p) => p.y));
    curva = ((y1 + y3) / 2 - y2) / xh; // + = el centro queda más alto (convexa)
    const resto = regresion(pts.slice(0, 2 * t)), fin = regresion(pts.slice(2 * t));
    finalSube = (-Math.atan(fin.m) + Math.atan(resto.m)) * RAD; // + = sube al final
  }
  // palabras: huecos de columnas vacías. Entre letras también hay huecos; uno es de palabra si mide ≥ 0,45 × zona media
  // y al menos 2,2 veces el hueco típico entre letras de ese renglón.
  const todos = []; let ini = -1;
  for (let x = x0; x <= x1 + 1; x++) {
    const vacio = x > x1 || col[x] === 0;
    if (vacio && ini < 0) ini = x;
    if (!vacio && ini >= 0) { todos.push({ x0: ini, x1: x - 1, ancho: x - ini }); ini = -1; }
  }
  const chicos = todos.map((g) => g.ancho).filter((a) => a < 0.45 * xh);
  const umbralPalabra = Math.max(0.45 * xh, chicos.length >= 3 ? 2.2 * mediana(chicos) : 0);
  const huecos = todos.filter((g) => g.ancho >= umbralPalabra);
  // tramos de cada palabra (en x «enderezada» por la inclinación)
  const tramos = []; let desde = x0;
  for (const g of huecos) { tramos.push([desde, g.x0 - 1]); desde = g.x1 + 1; }
  tramos.push([desde, x1]);
  return { xh, hampa: r.nucleo.y0 - r.y0, jamba: r.y1 - r.nucleo.y1, x0, x1, angulo, curva, finalSube, huecos, palabras: huecos.length + 1, tramos, pts, k };
}

/** Inclinación de los trazos (grados respecto del renglón: 90 = vertical, <90 hacia la derecha, >90 hacia la izquierda). */
export function inclinacion(M, r, anguloRenglon = 0) {
  const { w, g, m } = M, angs = [], pesos = [];
  for (let y = Math.max(1, r.y0); y < Math.min(M.h - 1, r.y1); y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x; if (!m[i] && !m[i - 1] && !m[i + 1]) continue;
    const gx = (g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1]) - (g[i - w - 1] + 2 * g[i - 1] + g[i + w - 1]);
    const gy = (g[i + w - 1] + 2 * g[i + w] + g[i + w + 1]) - (g[i - w - 1] + 2 * g[i - w] + g[i - w + 1]);
    const mag = Math.hypot(gx, gy); if (mag < 60) continue;
    // dirección del borde (perpendicular al gradiente) en coordenadas con y hacia arriba
    let a = Math.atan2(-gx, -gy) * RAD; // vector (−gy, −gx) en (x, y↑)
    a = ((a % 180) + 180) % 180;
    if (a < 30 || a > 150) continue; // solo trazos más bien verticales
    angs.push(a); pesos.push(mag);
  }
  if (angs.length < 20) return { angulo: NaN, n: angs.length };
  // mediana ponderada
  const idx = angs.map((_, i) => i).sort((p, q) => angs[p] - angs[q]); const tot = pesos.reduce((s, v) => s + v, 0);
  let acc = 0, med = angs[idx[0]];
  for (const i of idx) { acc += pesos[i]; if (acc >= tot / 2) { med = angs[i]; break; } }
  return { angulo: med - anguloRenglon, n: angs.length };
}

/** Grosor típico del trazo (px): rachas cortas de tinta horizontales y verticales. */
export function grosor({ w, h, m }) {
  const rachas = [];
  for (let y = 0; y < h; y += 2) { let c = 0; for (let x = 0; x <= w; x++) { if (x < w && m[y * w + x]) c++; else if (c) { rachas.push(c); c = 0; } } }
  for (let x = 0; x < w; x += 2) { let c = 0; for (let y = 0; y <= h; y++) { if (y < h && m[y * w + x]) c++; else if (c) { rachas.push(c); c = 0; } } }
  return rachas.length ? percentil(rachas, 0.3) : NaN;
}

/** Márgenes de la tinta respecto del recorte (fracción del ancho o alto). Ignora motas sueltas (<0,1 % de la tinta por fila/columna). */
export function margenesDe({ w, h, m }) {
  const fil = new Float64Array(h), col = new Float64Array(w); let tot = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) { fil[y]++; col[x]++; tot++; }
  const min = Math.max(1, tot * 0.001);
  const pri = (v) => v.findIndex((c) => c >= min), ult = (v) => v.length - 1 - [...v].reverse().findIndex((c) => c >= min);
  const x0 = pri(col), x1 = ult(col), y0 = pri(fil), y1 = ult(fil);
  if (x0 < 0) return { izquierdo: NaN, derecho: NaN, superior: NaN, inferior: NaN };
  return { izquierdo: x0 / w, derecho: (w - 1 - x1) / w, superior: y0 / h, inferior: (h - 1 - y1) / h };
}

/** Huecos verticales que atraviesan varios renglones (cuchillos, chimeneas). */
export function chimeneas(lineas, xhMed) {
  const cadenas = []; let abiertas = [];
  lineas.forEach((l, i) => {
    const nuevas = [];
    for (const hco of l.huecos) {
      const prev = abiertas.find((c) => Math.min(c.x1, hco.x1) - Math.max(c.x0, hco.x0) >= 0.3 * xhMed);
      if (prev) { prev.lineas++; prev.x0 = Math.max(prev.x0, hco.x0); prev.x1 = Math.min(prev.x1, hco.x1); nuevas.push(prev); }
      else nuevas.push({ x0: hco.x0, x1: hco.x1, lineas: 1, desde: i });
    }
    for (const c of abiertas) if (!nuevas.includes(c) && c.lineas >= 2) cadenas.push(c);
    abiertas = nuevas;
  });
  for (const c of abiertas) if (c.lineas >= 2) cadenas.push(c);
  return cadenas;
}

/**
 * Medición completa de una zona (texto o firma).
 * @param img ImageData; @param recorte {x,y,w,h} en píxeles de la imagen; @param mmPorPx escala (null si se desconoce).
 */
export function medir(img, recorte = null, mmPorPx = null) {
  const M0 = mascara(img, recorte);
  const global = sesgo(M0);
  const M = Math.abs(global) >= 0.3 ? enderezar(M0, global) : M0;
  const rs = renglones(M);
  const lineas = rs.map((r) => {
    const inc = inclinacion(M, r, 0).angulo;
    const l = medirRenglon(M, r, inc); if (!l) return null;
    return { ...l, y0: r.y0, y1: r.y1, nucleo: r.nucleo, inclinacion: Number.isFinite(inc) ? inc - l.angulo : NaN };
  }).filter(Boolean);
  if (!lineas.length) return { vacio: true, w: M.w, h: M.h };
  const grosorPx = grosor(M);
  // la banda densa incluye medio grosor arriba y abajo
  for (const l of lineas) l.xh = Math.max(1, l.xh - grosorPx);
  const xh = mediana(lineas.map((l) => l.xh));
  const incl = lineas.map((l) => l.inclinacion).filter(Number.isFinite);
  const dirs = lineas.map((l) => l.angulo + global);
  const gaps = lineas.flatMap((l) => l.huecos.map((g) => g.ancho));
  const inter = lineas.slice(1).map((l, i) => (l.nucleo.y0 + l.nucleo.y1) / 2 - (lineas[i].nucleo.y0 + lineas[i].nucleo.y1) / 2);
  const enredos = lineas.slice(1).filter((l, i) => l.y0 <= lineas[i].y1).length;
  const bx0 = Math.min(...lineas.map((l) => l.x0)), bx1 = Math.max(...lineas.map((l) => l.x1)), by0 = lineas[0].y0, by1 = lineas[lineas.length - 1].y1;
  const inicioPend = lineas.length >= 3 ? regresion(lineas.map((l, i) => ({ x: i, y: l.x0 }))).m / xh : 0; // + = margen izq. crece hacia abajo
  const mm = (px) => (mmPorPx ? px * mmPorPx : null);
  const cad = chimeneas(lineas, xh);
  return {
    w: M0.w, h: M0.h, sesgo: global, renglones: lineas.length, palabras: lineas.reduce((s, l) => s + l.palabras, 0),
    zonaMediaPx: xh, zonaMediaMm: mm(xh),
    hampa: mediana(lineas.map((l) => l.hampa)) / xh, jamba: mediana(lineas.map((l) => l.jamba)) / xh,
    variacionTamano: desv(lineas.map((l) => l.xh)) / xh,
    inclinacion: mediana(incl), variacionInclinacion: desv(incl),
    direccion: mediana(dirs), variacionDireccion: desv(dirs),
    curva: mediana(lineas.map((l) => l.curva)), finalSube: mediana(lineas.map((l) => l.finalSube)),
    espacioPalabras: gaps.length ? mediana(gaps) / xh : null,
    interlineado: inter.length ? mediana(inter) / xh : null,
    enredos,
    margenes: margenesDe(M0),
    margenIzqTendencia: inicioPend,
    grosorPx, grosorMm: mm(grosorPx),
    contraste: (M.grisPapel - M.grisTinta) / 255,
    tintaPct: M.tinta / (M.w * M.h),
    cuchillos: cad.filter((c) => c.lineas >= 2 && c.lineas <= 3).length,
    chimeneas: cad.filter((c) => c.lineas >= 4).length,
    cascadas: cad.filter((c) => c.lineas >= 5).length,
    huecosDerecha: cad.filter((c) => c.x0 > (bx0 + bx1) / 2).length,
    caja: { x0: bx0, x1: bx1, y0: by0, y1: by1 },
    avanzado: avanzado(M, lineas, xh, grosorPx),
    lineas: lineas.map((l) => ({ xh: l.xh, angulo: l.angulo, inclinacion: l.inclinacion, palabras: l.palabras, y0: l.y0, y1: l.y1, x0: l.x0, x1: l.x1 })),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Medidas avanzadas: componentes conectados (ligazón), bucles, bolsas de tinta, relieve, angulosidad, guirnaldas y
// arcos, sinuosidad, imbricación, desarrollo de las palabras, subrayados y regularidad. Son aproximaciones: el
// informe las marca como «estimadas» y la persona las confirma o las quita viendo el original.

/** Etiqueta componentes 8-conexos de `valor` en una máscara. Devuelve [{n, x0,x1,y0,y1, cx, cy, borde}]. */
export function componentes(m, w, h, valor = 1, con8 = true) {
  const et = new Int32Array(w * h).fill(-1), out = [], pila = [];
  const vec = con8 ? [-1, 1, -w, w, -w - 1, -w + 1, w - 1, w + 1] : [-1, 1, -w, w];
  for (let i = 0; i < m.length; i++) {
    if (m[i] !== valor || et[i] >= 0) continue;
    const c = { n: 0, x0: w, x1: 0, y0: h, y1: 0, sx: 0, sy: 0, borde: false }, id = out.length;
    et[i] = id; pila.push(i);
    while (pila.length) {
      const j = pila.pop(), x = j % w, y = (j / w) | 0;
      c.n++; c.sx += x; c.sy += y; if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) c.borde = true;
      for (const d of vec) {
        const q = j + d; if (q < 0 || q >= m.length) continue;
        const qx = q % w; if (Math.abs(qx - x) > 1) continue;
        if (m[q] === valor && et[q] < 0) { et[q] = id; pila.push(q); }
      }
    }
    c.cx = c.sx / c.n; c.cy = c.sy / c.n; out.push(c);
  }
  return out;
}

/** Erosión con un cuadrado de lado 2r+1 (imagen integral): cuenta zonas de tinta más gruesas que el trazo. */
function manchas(m, w, h, r) {
  const I = new Int32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) { let fila = 0; for (let x = 0; x < w; x++) { fila += m[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + fila; } }
  const lado = 2 * r + 1, total = lado * lado, e = new Uint8Array(w * h);
  for (let y = r; y < h - r; y++) for (let x = r; x < w - r; x++) {
    const a = I[(y - r) * (w + 1) + x - r], b = I[(y - r) * (w + 1) + x + r + 1], c = I[(y + r + 1) * (w + 1) + x - r], d = I[(y + r + 1) * (w + 1) + x + r + 1];
    if (d - b - c + a === total) e[y * w + x] = 1;
  }
  return componentes(e, w, h, 1).filter((c) => c.n >= 2);
}

export function avanzado(M, lineas, xh, grosorPx) {
  const { w, h, m, g } = M, out = {};
  const enLinea = (y) => lineas.findIndex((l) => y >= l.y0 && y <= l.y1);
  const gr = Number.isFinite(grosorPx) ? grosorPx : 2;
  // 1) Componentes de tinta → ligazón (piezas por palabra frente a letras estimadas)
  const comps = componentes(m, w, h, 1).filter((c) => c.n >= gr * gr * 2 && Math.max(c.x1 - c.x0, c.y1 - c.y0) >= xh * 0.4);
  const puntos = componentes(m, w, h, 1).filter((c) => c.n < gr * gr * 2 || Math.max(c.x1 - c.x0, c.y1 - c.y0) < xh * 0.4).length;
  let piezas = 0, letras = 0, palabras = 0;
  for (const [li, l] of lineas.entries()) for (const [a, b] of l.tramos) {
    const ancho = b - a + 1; if (ancho < xh * 0.6) continue;
    const en = comps.filter((c) => enLinea(c.cy) === li && (c.cx - (l.nucleo.y1 - c.cy) * l.k) >= a - 1 && (c.cx - (l.nucleo.y1 - c.cy) * l.k) <= b + 1).length;
    if (!en) continue;
    piezas += en; letras += Math.max(1, ancho / (0.8 * xh)); palabras++;
  }
  out.piezasPorPalabra = palabras ? piezas / palabras : null;
  out.piezasPorLetra = letras ? piezas / letras : null;
  out.puntosPorPalabra = palabras ? puntos / palabras : null;
  // 2) Huecos cerrados (bucles y óvalos): fondo que no toca el borde, por zona
  const fondo = new Uint8Array(m.length); for (let i = 0; i < m.length; i++) fondo[i] = m[i] ? 0 : 1;
  const huecos = componentes(fondo, w, h, 1, false).filter((c) => !c.borde && c.n >= gr * gr * 1.5 && c.n < xh * xh * 6);
  let arriba = 0, medio = 0, abajo = 0;
  for (const c of huecos) {
    const li = enLinea(c.cy); if (li < 0) continue; const l = lineas[li];
    if (c.cy < l.nucleo.y0) arriba++; else if (c.cy > l.nucleo.y1) abajo++; else medio++;
  }
  out.buclesHampaPorPalabra = palabras ? arriba / palabras : null;
  out.buclesJambaPorPalabra = palabras ? abajo / palabras : null;
  out.ovalosPorPalabra = palabras ? medio / palabras : null;
  // 3) Bolsas de tinta: zonas rellenas más gruesas que 2,5 trazos
  out.bolsas = manchas(m, w, h, Math.max(2, Math.round(gr * 1.25))).length;
  out.bolsasPorPalabra = palabras ? out.bolsas / palabras : null;
  // 4) Relieve: variación del grosor (rachas horizontales cortas de los trazos)
  const rachas = [];
  for (const l of lineas) for (let y = l.nucleo.y0; y <= l.nucleo.y1; y += 2) { let c = 0; for (let x = l.x0; x <= l.x1 + 1; x++) { if (x <= l.x1 && m[y * w + x]) c++; else if (c) { if (c <= 4 * gr) rachas.push(c); c = 0; } } }
  out.variacionGrosor = rachas.length > 20 ? desv(rachas) / media(rachas) : null;
  // 5) Orientación de los bordes en la zona media: angulosidad, guirnaldas y arcos; 6) nitidez del borde
  const hist = new Float64Array(12); let horArriba = 0, horAbajo = 0, borde = 0, transicion = 0, tinta = 0;
  const gp = M.grisPapel, gt = M.grisTinta, rango = Math.max(20, gp - gt);
  for (const l of lineas) {
    const tercio = (l.nucleo.y1 - l.nucleo.y0) / 3;
    for (let y = Math.max(1, l.nucleo.y0); y <= Math.min(h - 2, l.nucleo.y1); y++) for (let x = Math.max(1, l.x0 - 2); x <= Math.min(w - 2, l.x1 + 2); x++) {
      const i = y * w + x;
      const v = (g[i] - gt) / rango; if (m[i]) tinta++; if (v > 0.25 && v < 0.75) transicion++;
      const gx = (g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1]) - (g[i - w - 1] + 2 * g[i - 1] + g[i + w - 1]);
      const gy = (g[i + w - 1] + 2 * g[i + w] + g[i + w + 1]) - (g[i - w - 1] + 2 * g[i - w] + g[i - w + 1]);
      const mag = Math.hypot(gx, gy); if (mag < 60) continue;
      borde++;
      let a = Math.atan2(-gx, -gy) * RAD; a = ((a % 180) + 180) % 180;
      hist[Math.min(11, Math.floor(a / 15))] += mag;
      if (a < 25 || a > 155) { if (y > l.nucleo.y1 - tercio) horAbajo += mag; else if (y < l.nucleo.y0 + tercio) horArriba += mag; }
    }
  }
  const tot = hist.reduce((a, b) => a + b, 0);
  out.entropiaBordes = tot ? -hist.reduce((s, v) => (v ? s + (v / tot) * Math.log(v / tot) : s), 0) / Math.log(12) : null;
  out.guirnalda = horArriba + horAbajo ? horAbajo / (horArriba + horAbajo) : null; // >0,5 más curvas abiertas arriba (guirnalda)
  out.nitidez = tinta ? transicion / tinta : null; // más alto = borde más difuso
  // 7) Separación media entre trazos verticales en la línea media (anchura de las letras)
  const seps = [];
  for (const l of lineas) {
    const y = Math.round((l.nucleo.y0 + l.nucleo.y1) / 2); let runs = 0, tintaX = 0, dentro = false;
    for (const [a, b] of l.tramos) for (let x = a; x <= b; x++) { const on = m[y * w + x] === 1; if (on && !dentro) runs++; dentro = on; tintaX++; }
    if (runs > 3) seps.push(tintaX / runs / xh);
  }
  out.separacionTrazos = seps.length ? mediana(seps) : null;
  // 8) Sinuosidad del renglón e imbricación de las palabras
  const resid = [], difPal = [];
  for (const l of lineas) {
    if (l.pts.length >= 4) {
      const { m: pm, b } = regresion(l.pts);
      for (const p of l.pts) resid.push((p.y - (pm * p.x + b)) / xh);
      for (const [a, z] of l.tramos) {
        // rebanadas finas dentro de la palabra (en x «enderezada»: se corrige con la inclinación)
        const paso = Math.max(3, Math.round(xh / 2)), ps = [];
        for (let x0 = a; x0 + paso <= z + 1; x0 += paso) {
          let c = 0, sy = 0;
          for (let y = l.nucleo.y0; y <= l.nucleo.y1; y++) for (let x = x0; x < x0 + paso; x++) { const xr = Math.round(x + (l.nucleo.y1 - y) * l.k); if (xr >= 0 && xr < w && m[y * w + xr]) { c++; sy += y; } }
          if (c > 2) ps.push({ x: x0 + paso / 2, y: sy / c, w: c });
        }
        if (ps.length < 4) continue;
        difPal.push((-Math.atan(regresion(ps).m) + Math.atan(pm)) * RAD);
      }
    }
  }
  out.sinuosidad = resid.length > 6 ? desv(resid) : null;
  out.imbricacion = difPal.length >= 3 ? mediana(difPal) : null; // + cada palabra sube; − cada palabra baja
  // 9) Desarrollo: altura de la tinta al final de la palabra frente al inicio
  const razones = [];
  for (const l of lineas) for (const [a, z] of l.tramos) {
    const ancho = z - a; if (ancho < xh * 2) continue;
    const alto = (x0, x1) => { let top = Infinity, bot = -Infinity; for (let y = l.nucleo.y0 - Math.round(xh * 0.3); y <= l.nucleo.y1 + Math.round(xh * 0.3); y++) for (let x = x0; x <= x1; x++) if (m[y * w + x]) { if (y < top) top = y; if (y > bot) bot = y; } return bot - top; };
    const i = alto(a, a + Math.round(ancho / 3)), f = alto(z - Math.round(ancho / 3), z);
    if (i > 0 && f > 0) razones.push(f / i);
  }
  out.desarrollo = razones.length >= 3 ? mediana(razones) : null;
  // 10) Subrayados: rachas horizontales largas fuera de la zona media
  let subrayados = 0, previa = false;
  for (let y = 0; y < h; y++) {
    // una raya es una racha larga que concentra casi toda la tinta de la fila (la escritura son muchas rachas cortas)
    let larga = false, c = 0, mayor = 0, total = 0;
    for (let x = 0; x <= w; x++) { if (x < w && m[y * w + x]) { c++; total++; } else { mayor = Math.max(mayor, c); c = 0; } }
    if (mayor > 5 * xh && mayor >= 0.6 * total) larga = true;
    if (larga && !previa) subrayados++; // filas contiguas de una misma raya cuentan como una
    previa = larga;
  }
  out.subrayados = subrayados;
  // 11) Regularidad del orden: inicio de renglón e interlineado
  // renglones de longitud normal (una firma o una línea final corta no cuentan para el orden)
  const largoMed = mediana(lineas.map((l) => l.x1 - l.x0));
  const normales = lineas.filter((l) => l.x1 - l.x0 >= 0.5 * largoMed);
  const inicios = normales.map((l) => l.x0), centros = lineas.map((l) => (l.nucleo.y0 + l.nucleo.y1) / 2), inter = centros.slice(1).map((c, i) => c - centros[i]);
  out.variacionInicio = normales.length >= 3 ? desv(inicios) / xh : null;
  out.variacionInterlineado = inter.length >= 2 ? desv(inter) / media(inter) : null;
  return out;
}
