// Lenguaje corporal: rasgos por cuadro (a partir de los puntos de MediaPipe), eventos frente a la línea base y cúmulos.
// No detecta mentiras: señala cambios de tensión o emoción y en qué segundo ocurren, para que la persona pregunte ahí.
// Funciones puras (sin DOM) para probarlas con datos sintéticos.

export const AVISO_CONDUCTA = "No existe una señal corporal de la mentira: en 206 estudios, las personas aciertan 54 % al distinguir verdad de mentira (Bond y DePaulo, 2006) y las señales no verbales se relacionan poco con el engaño (DePaulo et al., 2003). Esta herramienta marca cambios de tensión o emoción frente a la línea base de la persona y en qué segundo ocurren. La causa puede ser mentir, pero también miedo a no ser creído, vergüenza, cansancio o la cámara. Úsala para decidir qué preguntar, no para concluir. Analizar el rostro de alguien sin su conocimiento puede violar su privacidad: en México la imagen es un dato personal (LFPDPPP) y en la Unión Europea el reconocimiento de emociones está prohibido en trabajo y escuelas (Reglamento de IA, art. 5).";

const prom = (a, b) => ((a || 0) + (b || 0)) / 2;
const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
const mitad = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const desv = (xs) => { if (xs.length < 2) return 0; const m = media(xs); return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)); };
const mediana = (xs) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Blendshapes de MediaPipe ([{categoryName, score}]) → objeto nombre → valor. */
export function mapaBlend(categorias = []) { const o = {}; for (const c of categorias) o[c.categoryName] = c.score; return o; }

/**
 * Rasgos de un cuadro.
 * @param b blendshapes (objeto), @param cara 478 puntos normalizados (o null), @param pose 33 puntos normalizados (o null),
 * @param ancho, alto: tamaño del cuadro en píxeles (para no deformar distancias).
 */
export function rasgosCuadro({ b = null, cara = null, pose = null, ancho = 1, alto = 1 }) {
  const f = {};
  if (b) {
    f.ojos = prom(b.eyeBlinkLeft, b.eyeBlinkRight);
    f.ceno = prom(b.browDownLeft, b.browDownRight);
    f.labios_apretados = Math.max(prom(b.mouthPressLeft, b.mouthPressRight), prom(b.mouthRollLower, b.mouthRollUpper));
    const sI = b.mouthSmileLeft || 0, sD = b.mouthSmileRight || 0, sonrisa = (sI + sD) / 2, mejillas = prom(b.cheekSquintLeft, b.cheekSquintRight);
    f.sonrisa_genuina = sonrisa > 0.45 && mejillas > 0.25 ? sonrisa : 0;
    f.sonrisa_social = sonrisa > 0.45 && mejillas < 0.15 ? sonrisa : 0;
    f.media_sonrisa = Math.max(sI, sD) > 0.3 && Math.abs(sI - sD) > 0.25 ? Math.abs(sI - sD) : 0;
    f.nariz_arrugada = Math.max(prom(b.noseSneerLeft, b.noseSneerRight), prom(b.mouthUpperUpLeft, b.mouthUpperUpRight) * 0.8);
    f.comisuras_abajo = prom(b.mouthFrownLeft, b.mouthFrownRight);
    f.cejas_arriba = Math.max(b.browInnerUp || 0, prom(b.browOuterUpLeft, b.browOuterUpRight));
    f.boca_abierta = b.jawOpen || 0;
    f.mirada_abajo = prom(b.eyeLookDownLeft, b.eyeLookDownRight);
    f.mirada_lateral = Math.max(prom(b.eyeLookOutLeft, b.eyeLookInRight), prom(b.eyeLookInLeft, b.eyeLookOutRight));
  }
  if (cara && cara.length > 263) {
    const P = (i) => ({ x: cara[i].x * ancho, y: cara[i].y * alto });
    const oI = P(33), oD = P(263), nariz = P(1), boca = mitad(P(13), P(14)), io = dist(oI, oD) || 1, ojos = mitad(oI, oD);
    f.roll = (Math.atan2(oD.y - oI.y, oD.x - oI.x) * 180) / Math.PI;
    f.yaw = (nariz.x - ojos.x) / io;
    f.pitch = (nariz.y - ojos.y) / Math.max(1, boca.y - ojos.y);
  }
  if (pose && pose.length >= 25) {
    const ok = (i) => pose[i] && (pose[i].visibility ?? 1) > 0.5;
    const P = (i) => ({ x: pose[i].x * ancho, y: pose[i].y * alto });
    if (ok(11) && ok(12)) {
      const hI = P(11), hD = P(12), sw = dist(hI, hD) || 1, cx = (hI.x + hD.x) / 2;
      const nariz = P(0), boca = mitad(P(9), P(10)), menton = { x: boca.x + (boca.x - nariz.x) * 1.2, y: boca.y + (boca.y - nariz.y) * 1.2 };
      const cuello = { x: boca.x + (mitad(hI, hD).x - boca.x) * 0.6, y: boca.y + (mitad(hI, hD).y - boca.y) * 0.6 };
      const manos = [15, 16, 19, 20].filter(ok).map(P);
      const cerca = (q, r) => manos.some((m) => dist(m, q) < r * sw);
      f.mano_boca = cerca(boca, 0.28) ? 1 : 0;
      f.tocar_nariz = !f.mano_boca && cerca(nariz, 0.22) ? 1 : 0;
      f.mano_menton = !f.mano_boca && cerca(menton, 0.3) ? 1 : 0;
      f.tocar_oreja = (ok(7) && cerca(P(7), 0.25)) || (ok(8) && cerca(P(8), 0.25)) ? 1 : 0;
      f.tocar_cuello = !f.mano_boca && !f.mano_menton && cerca(cuello, 0.3) ? 1 : 0;
      if (ok(15) && ok(16)) {
        const mI = P(15), mD = P(16), lado = (p) => Math.sign(p.x - cx);
        const altura = (m) => m.y > hI.y - 0.1 * sw && (!ok(23) || m.y < P(23).y + 0.2 * sw);
        f.brazos_cruzados = lado(mI) === lado(hD) && lado(mD) === lado(hI) && Math.abs(mI.x - cx) > 0.1 * sw && Math.abs(mD.x - cx) > 0.1 * sw && altura(mI) && altura(mD) ? 1 : 0;
        const orejas = Math.min(ok(7) ? P(7).y : Infinity, ok(8) ? P(8).y : Infinity);
        f.manos_cabeza = mI.y < orejas && mD.y < orejas && Math.abs(mI.x - nariz.x) < 1.2 * sw && Math.abs(mD.x - nariz.x) < 1.2 * sw ? 1 : 0;
        if (ok(23) && ok(24) && ok(13) && ok(14)) {
          const codoFuera = Math.abs(P(13).x - cx) > Math.abs(hI.x - cx) * 1.15 && Math.abs(P(14).x - cx) > Math.abs(hD.x - cx) * 1.15;
          f.manos_cadera = dist(mI, P(23)) < 0.4 * sw && dist(mD, P(24)) < 0.4 * sw && codoFuera ? 1 : 0;
        }
        f.munecas = [mI.x / sw, mI.y / sw, mD.x / sw, mD.y / sw];
      }
      if (ok(7) && ok(8)) f.hombros = ((hI.y - P(7).y) + (hD.y - P(8).y)) / 2 / sw;
      f.escala = sw;
    }
  }
  return f;
}

// Umbral absoluto por rasgo continuo (0–1 de los blendshapes) y duración mínima del evento (s).
export const REGLAS = {
  ceno: { umbral: 0.35, min: 0.3 }, labios_apretados: { umbral: 0.35, min: 0.3 }, sonrisa_genuina: { umbral: 0.45, min: 0.3 },
  sonrisa_social: { umbral: 0.45, min: 0.5 }, media_sonrisa: { umbral: 0.25, min: 0.2 }, nariz_arrugada: { umbral: 0.3, min: 0.2 },
  comisuras_abajo: { umbral: 0.3, min: 0.4 }, cejas_arriba: { umbral: 0.5, min: 0.2 }, boca_abierta: { umbral: 0.55, min: 0.2 },
  mirada_abajo: { umbral: 0.5, min: 1 }, mirada_lateral: { umbral: 0.55, min: 0.5 },
  mano_boca: { umbral: 0.5, min: 0.4 }, tocar_nariz: { umbral: 0.5, min: 0.3 }, mano_menton: { umbral: 0.5, min: 0.8 },
  tocar_oreja: { umbral: 0.5, min: 0.3 }, tocar_cuello: { umbral: 0.5, min: 0.3 }, brazos_cruzados: { umbral: 0.5, min: 1.5 },
  manos_cadera: { umbral: 0.5, min: 1.5 }, manos_cabeza: { umbral: 0.5, min: 1 },
};

function segmentos(muestras, activo, min) {
  const out = []; let ini = null, pico = 0, ult = null;
  for (const m of muestras) {
    if (activo(m)) { if (!ini) { ini = m; pico = 0; } pico = Math.max(pico, m.v); ult = m; }
    else if (ini) { if (ult.t - ini.t >= min) out.push({ t0: ini.t, t1: ult.t, pico }); ini = null; }
  }
  if (ini && ult.t - ini.t >= min) out.push({ t0: ini.t, t1: ult.t, pico });
  return out;
}

/** Ventana de línea base por omisión: primer 20 % (mín. 5 s, máx. 30 s). */
export function lineaBasePorOmision(duracion) { const d = Math.max(5, Math.min(30, duracion * 0.2)); return [0, Math.min(d, duracion)]; }

/**
 * Serie de cuadros [{t, f}] (f = rasgosCuadro) → eventos [{senal, t0, t1, pico, detalle}] y resumen de la línea base.
 * base = [t0, t1] en segundos.
 */
export function eventosDeSerie(cuadros, base = null) {
  if (!cuadros.length) return { eventos: [], base: null };
  const dur = cuadros[cuadros.length - 1].t;
  const [b0, b1] = base || lineaBasePorOmision(dur);
  const enBase = (c) => c.t >= b0 && c.t <= b1;
  const eventos = [];
  const valores = (k) => cuadros.filter((c) => Number.isFinite(c.f[k])).map((c) => ({ t: c.t, v: c.f[k] }));
  const baseDe = (k) => { const xs = cuadros.filter((c) => enBase(c) && Number.isFinite(c.f[k])).map((c) => c.f[k]); return { m: media(xs), s: desv(xs), n: xs.length }; };
  // Rasgos continuos y posturas con umbral
  for (const [k, r] of Object.entries(REGLAS)) {
    const xs = valores(k); if (!xs.length) continue;
    const bs = baseDe(k), umbral = Math.max(r.umbral, bs.n >= 5 ? bs.m + 2 * bs.s : 0);
    for (const s of segmentos(xs, (m) => m.v >= umbral, r.min)) eventos.push({ senal: k, ...s, detalle: bs.m >= r.umbral ? "también en la línea base" : "" });
  }
  // Ojos cerrados más de 0,4 s (un parpadeo dura 0,1–0,4 s)
  const ojos = valores("ojos");
  for (const s of segmentos(ojos, (m) => m.v > 0.5, 0.45)) eventos.push({ senal: "ojos_cerrados", ...s, detalle: `${(s.t1 - s.t0).toFixed(1)} s` });
  // Parpadeo: frecuencia por minuto en ventanas de 10 s frente a la línea base
  if (ojos.length > 10) {
    const parpadeos = []; let cerrado = false;
    for (const m of ojos) { if (!cerrado && m.v > 0.5) { parpadeos.push(m.t); cerrado = true; } else if (cerrado && m.v < 0.35) cerrado = false; }
    const tasa = (a, z) => (parpadeos.filter((t) => t >= a && t < z).length * 60) / Math.max(1, z - a);
    const tBase = tasa(b0, b1);
    for (let a = 0; a + 10 <= dur + 0.01; a += 5) {
      const tz = tasa(a, a + 10);
      if (tz >= Math.max(25, tBase * 1.5) && (a < b0 || a >= b1)) eventos.push({ senal: "parpadeo", t0: a, t1: a + 10, pico: tz, detalle: `${Math.round(tz)}/min (línea base ${Math.round(tBase)}/min)` });
    }
  }
  // Cabeza: cambios frente a la línea base
  const cab = [["roll", "cabeza_ladeada", (v, m) => Math.abs(v - m) > 12, 0.8], ["yaw", "cabeza_girada", (v, m) => Math.abs(v - m) > 0.3, 0.8], ["pitch", "cabeza_abajo", (v, m) => v - m > 0.12, 0.8]];
  for (const [k, senal, regla, min] of cab) {
    const xs = valores(k); if (!xs.length) continue; const bs = baseDe(k); const m0 = bs.n ? bs.m : mediana(xs.map((x) => x.v));
    for (const s of segmentos(xs, (m) => regla(m.v, m0), min)) eventos.push({ senal, ...s, pico: s.pico - m0, detalle: "" });
  }
  // Hombros encogidos: la distancia oreja-hombro baja 20 % frente a la línea base
  { const xs = valores("hombros"), bs = baseDe("hombros"); if (xs.length && bs.n) for (const s of segmentos(xs, (m) => m.v < bs.m * 0.8, 0.8)) eventos.push({ senal: "hombros_arriba", ...s, detalle: "" }); }
  // Movimiento de manos: inquietud (más del doble) y congelarse (menos de la cuarta parte)
  {
    const mov = [];
    for (let i = 1; i < cuadros.length; i++) {
      const a = cuadros[i - 1].f.munecas, z = cuadros[i].f.munecas, dt = cuadros[i].t - cuadros[i - 1].t;
      if (a && z && dt > 0) mov.push({ t: cuadros[i].t, v: (Math.hypot(z[0] - a[0], z[1] - a[1]) + Math.hypot(z[2] - a[2], z[3] - a[3])) / dt });
    }
    if (mov.length > 10) {
      const ventana = 2, porVentana = [];
      for (let a = 0; a + ventana <= dur + 0.01; a += 1) { const xs = mov.filter((m) => m.t >= a && m.t < a + ventana).map((m) => m.v); if (xs.length) porVentana.push({ t: a, v: media(xs) }); }
      const baseMov = mediana(porVentana.filter((w) => w.t >= b0 && w.t + ventana <= b1 + 0.01).map((w) => w.v));
      if (baseMov > 0.05) {
        for (const s of segmentos(porVentana, (w) => w.v > Math.max(0.4, baseMov * 2) && (w.t < b0 || w.t >= b1), 1)) eventos.push({ senal: "inquietud", t0: s.t0, t1: s.t1 + ventana, pico: s.pico, detalle: `${(s.pico / baseMov).toFixed(1)} × la línea base` });
        for (const s of segmentos(porVentana, (w) => w.v < baseMov * 0.25 && (w.t < b0 || w.t >= b1), 1)) eventos.push({ senal: "congelarse", t0: s.t0, t1: s.t1 + ventana, pico: s.pico, detalle: "" });
      }
    }
  }
  eventos.sort((a, b) => a.t0 - b.t0);
  return { eventos: eventos.map((e) => ({ ...e, origen: "automático", enBase: e.t0 >= b0 && e.t1 <= b1 })), base: [b0, b1] };
}

/** Señal del catálogo para un rasgo automático. */
export function senalDeAuto(catalogo, auto) { return catalogo.senales.find((s) => s.auto === auto || s.id === auto) || null; }

/**
 * Lectura del conjunto: estados con más señales distintas y momentos con cúmulos (≥ minimo señales distintas en `ventana` s).
 * eventos: [{senal (id o auto), t0, t1, origen, enBase}].
 */
export function lectura(catalogo, eventos, { ventana = 5, minimo = 3 } = {}) {
  const S = (e) => senalDeAuto(catalogo, e.senal);
  const validos = eventos.map((e) => ({ ...e, s: S(e) })).filter((e) => e.s);
  const fuera = validos.filter((e) => !e.enBase);
  const estados = Object.entries(catalogo.estados).map(([id, est]) => {
    const evs = fuera.filter((e) => e.s.estados.includes(id));
    const distintas = [...new Set(evs.map((e) => e.s.id))];
    return { id, nombre: est.nombre, texto: est.texto, senales: distintas.map((d) => catalogo.senales.find((s) => s.id === d).nombre), eventos: evs.length, peso: distintas.length };
  }).filter((x) => x.eventos).sort((a, b) => b.peso - a.peso || b.eventos - a.eventos);
  // cúmulos
  const orden = [...fuera].sort((a, b) => a.t0 - b.t0), momentos = [];
  for (let i = 0; i < orden.length; i++) {
    const t = orden[i].t0, grupo = orden.filter((e) => e.t0 >= t && e.t0 <= t + ventana);
    const distintas = new Set(grupo.map((e) => e.s.id));
    if (distintas.size < minimo) continue;
    const t1 = Math.max(...grupo.map((e) => e.t1));
    const ult = momentos[momentos.length - 1];
    if (ult && t <= ult.t1) { ult.t1 = Math.max(ult.t1, t1); for (const e of grupo) ult._ev.add(e); continue; }
    momentos.push({ t0: t, t1, _ev: new Set(grupo) });
  }
  for (const m of momentos) {
    const evs = [...m._ev], ids = [...new Set(evs.map((e) => e.s.id))], cuenta = {};
    for (const id of ids) for (const est of catalogo.senales.find((s) => s.id === id).estados) cuenta[est] = (cuenta[est] || 0) + 1;
    m.senales = ids.map((id) => catalogo.senales.find((s) => s.id === id).nombre);
    m.estados = Object.entries(cuenta).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, n]) => ({ id, nombre: catalogo.estados[id].nombre, n }));
    delete m._ev;
  }
  return { estados, momentos, total: fuera.length, enBase: validos.length - fuera.length };
}

/** mm:ss */
export const reloj = (s) => { s = Math.max(0, Math.round(s)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

/** Enlace de video → cómo se puede usar (sin descargar nada de redes sociales). */
export function tipoEnlace(url) {
  let u; try { u = new URL(url); } catch (e) { return { tipo: "invalido" }; }
  if (!/^https?:$/.test(u.protocol)) return { tipo: "invalido" };
  const h = u.hostname.replace(/^www\.|^m\./, "");
  const yt = h === "youtu.be" ? u.pathname.slice(1) : /(^|\.)youtube\.com$/.test(h) ? (u.searchParams.get("v") || (u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/) || [])[1]) : null;
  if (yt && /^[\w-]{6,20}$/.test(yt)) return { tipo: "youtube", id: yt, inserta: `https://www.youtube-nocookie.com/embed/${yt}?enablejsapi=1&rel=0` };
  const vm = h === "vimeo.com" && u.pathname.match(/^\/(\d+)/);
  if (vm) return { tipo: "vimeo", id: vm[1], inserta: `https://player.vimeo.com/video/${vm[1]}` };
  if (/\.(mp4|webm|ogg|ogv|mov|m4v)$/i.test(u.pathname)) return { tipo: "archivo", url: u.href };
  if (/(^|\.)(tiktok|instagram|facebook|fb|x|twitter|threads|linkedin|kwai)\.(com|net|watch)$/.test(h)) return { tipo: "red_social", sitio: h };
  if (/(^|\.)(drive\.google|dropbox|onedrive\.live|1drv|icloud|mega)\.(com|nz|ms)$/.test(h) || h === "1drv.ms") return { tipo: "nube", sitio: h };
  return { tipo: "pagina", sitio: h };
}
