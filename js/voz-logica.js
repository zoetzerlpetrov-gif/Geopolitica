// Voz: tono (frecuencia fundamental), volumen, pausas y ritmo a partir del audio, frente a la línea base de la persona.
// Funciones puras (sin DOM): reciben muestras PCM. No se transcribe ni se envía nada.

const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const mediana = (xs) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const desv = (xs) => { if (xs.length < 2) return 0; const m = media(xs); return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)); };

/** Nivel en decibeles (RMS) de un bloque. */
export function nivelDb(x) { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return 10 * Math.log10(s / Math.max(1, x.length) + 1e-12); }

/**
 * Frecuencia fundamental por autocorrelación normalizada (YIN simplificado). Devuelve Hz o null si no hay voz clara.
 * Rango de la voz humana hablada: 70–400 Hz.
 */
export function tono(x, sr, min = 70, max = 400) {
  const n = x.length, tMin = Math.floor(sr / max), tMax = Math.min(n - 2, Math.ceil(sr / min));
  if (tMax <= tMin) return null;
  const d = new Float64Array(tMax + 1);
  for (let tau = 1; tau <= tMax; tau++) { let s = 0; for (let i = 0; i + tau < n; i++) { const v = x[i] - x[i + tau]; s += v * v; } d[tau] = s; }
  // diferencia normalizada acumulada
  let acum = 0; const cmnd = new Float64Array(tMax + 1); cmnd[0] = 1;
  for (let tau = 1; tau <= tMax; tau++) { acum += d[tau]; cmnd[tau] = acum ? (d[tau] * tau) / acum : 1; }
  let mejor = -1;
  for (let tau = tMin; tau <= tMax; tau++) { if (cmnd[tau] < 0.15) { while (tau + 1 <= tMax && cmnd[tau + 1] < cmnd[tau]) tau++; mejor = tau; break; } }
  if (mejor < 0) return null;
  // interpolación parabólica
  const a = cmnd[mejor - 1] ?? cmnd[mejor], b = cmnd[mejor], c = cmnd[mejor + 1] ?? cmnd[mejor];
  const ajuste = (a - c) / (2 * (a - 2 * b + c) || 1);
  return sr / (mejor + (Number.isFinite(ajuste) ? ajuste : 0));
}

/**
 * Cuadros de audio cada `paso` segundos con ventana de 40 ms: [{t, db, f0}].
 * `inicio` desplaza los tiempos (para el audio en vivo).
 */
export function cuadrosAudio(muestras, sr, { paso = 0.02, inicio = 0 } = {}) {
  // se baja a ≈ 8 kHz (promedio por bloques): basta para la voz y hace el cálculo del tono 4 a 6 veces más rápido
  const f = Math.max(1, Math.floor(sr / 8000));
  if (f > 1) { const n = Math.floor(muestras.length / f), y = new Float32Array(n); for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < f; k++) s += muestras[i * f + k]; y[i] = s / f; } muestras = y; sr = sr / f; }
  const ventana = Math.round(sr * 0.04), salto = Math.round(sr * paso), out = [];
  let k = 0;
  for (let i = 0; i + ventana <= muestras.length; i += salto, k++) {
    const x = muestras.subarray(i, i + ventana), db = nivelDb(x);
    // el tono se calcula cada dos cuadros (cada 40 ms); el nivel, en todos (para las sílabas)
    out.push({ t: inicio + i / sr, db, f0: db > -50 && k % 2 === 0 ? tono(x, sr) : null });
  }
  return out;
}

function segmentos(muestras, activo, min) {
  const out = []; let ini = null, ult = null, pico = -Infinity;
  for (const m of muestras) {
    if (activo(m)) { if (!ini) { ini = m; pico = -Infinity; } pico = Math.max(pico, m.v ?? 0); ult = m; }
    else if (ini) { if (ult.t - ini.t >= min) out.push({ t0: ini.t, t1: ult.t, pico }); ini = null; }
  }
  if (ini && ult.t - ini.t >= min) out.push({ t0: ini.t, t1: ult.t, pico });
  return out;
}

/** Umbral de voz: separa voz de silencio con los percentiles del nivel (ruido de fondo y voz). */
export function umbralVoz(cuadros) {
  const dbs = cuadros.map((c) => c.db).sort((a, b) => a - b); if (!dbs.length) return -50;
  const ruido = dbs[Math.floor(dbs.length * 0.1)], voz = dbs[Math.floor(dbs.length * 0.9)];
  return Math.max(-55, ruido + Math.max(6, (voz - ruido) * 0.3));
}

/**
 * Eventos de voz frente a la línea base [b0, b1]: tono más agudo, volumen que sube o baja, pausas largas,
 * habla más rápida o más lenta y voz monótona. Devuelve { eventos, resumen }.
 */
export function eventosVoz(cuadros, [b0, b1]) {
  if (cuadros.length < 50) return { eventos: [], resumen: null };
  const dur = cuadros[cuadros.length - 1].t, U = umbralVoz(cuadros), habla = (c) => c.db >= U;
  const enBase = (t) => t >= b0 && t <= b1, eventos = [];
  const add = (senal, s, detalle) => eventos.push({ senal, t0: s.t0, t1: s.t1, pico: s.pico ?? 0, detalle, origen: "automático (voz)", enBase: s.t0 >= b0 && s.t1 <= b1 });
  // ventanas de 2 s cada 0,5 s
  const ventanas = [];
  for (let a = 0; a + 2 <= dur + 1e-9; a += 0.5) {
    const cs = cuadros.filter((c) => c.t >= a && c.t < a + 2), voz = cs.filter(habla), f0s = voz.map((c) => c.f0).filter((f) => f);
    ventanas.push({ t: a, voz: cs.length ? voz.length / cs.length : 0, db: voz.length ? media(voz.map((c) => c.db)) : null, f0: f0s.length >= 5 ? mediana(f0s) : null, f0d: f0s.length >= 8 ? desv(f0s.map((f) => 12 * Math.log2(f))) : null });
  }
  const vb = ventanas.filter((w) => w.t >= b0 && w.t + 2 <= b1 + 1e-9);
  const f0b = mediana(vb.map((w) => w.f0).filter(Boolean)), dbb = mediana(vb.map((w) => w.db).filter((x) => x != null)), f0db = mediana(vb.map((w) => w.f0d).filter((x) => x != null));
  const fuera = ventanas.filter((w) => !enBase(w.t));
  if (Number.isFinite(f0b)) {
    for (const s of segmentos(fuera.map((w) => ({ t: w.t, v: w.f0 || 0, ok: w.f0 && w.f0 > f0b * 1.12 })), (m) => m.ok, 1.5)) add("tono_sube", { ...s, t1: s.t1 + 2 }, `${Math.round(s.pico)} Hz (línea base ${Math.round(f0b)} Hz)`);
    if (Number.isFinite(f0db) && f0db > 1) for (const s of segmentos(fuera.map((w) => ({ t: w.t, v: w.f0d ?? 99, ok: w.f0d != null && w.voz > 0.5 && w.f0d < f0db * 0.45 })), (m) => m.ok, 3)) add("voz_monotona", { ...s, t1: s.t1 + 2 }, "poca variación del tono");
  }
  if (Number.isFinite(dbb)) {
    for (const s of segmentos(fuera.map((w) => ({ t: w.t, v: w.db ?? -99, ok: w.db != null && w.voz > 0.3 && w.db > dbb + 6 })), (m) => m.ok, 1)) add("volumen_cambia", { ...s, t1: s.t1 + 2 }, `sube ${Math.round(s.pico - dbb)} dB`);
    for (const s of segmentos(fuera.map((w) => ({ t: w.t, v: w.db ?? 0, ok: w.db != null && w.voz > 0.3 && w.db < dbb - 8 })), (m) => m.ok, 1.5)) add("voz_baja", { ...s, t1: s.t1 + 2 }, "baja el volumen");
  }
  // pausas: silencios de 2 s o más entre tramos de voz (más largos que las pausas de la línea base)
  const silencios = segmentos(cuadros.map((c) => ({ t: c.t, ok: !habla(c) })), (m) => m.ok, 0.25).filter((s) => s.t0 > cuadros[0].t + 0.1 && s.t1 < dur - 0.1);
  const pb = silencios.filter((s) => enBase(s.t0)).map((s) => s.t1 - s.t0), limite = Math.max(2, (mediana(pb) || 0) * 2.5);
  for (const s of silencios) if (s.t1 - s.t0 >= limite && !enBase(s.t0)) add("pausas_largas", s, `${(s.t1 - s.t0).toFixed(1)} s de silencio`);
  // ritmo: picos de energía (≈ sílabas) por segundo de voz, en ventanas de 5 s
  const env = cuadros.map((c, i) => ({ t: c.t, v: (cuadros[i - 1]?.db ?? c.db) / 3 + c.db / 3 + (cuadros[i + 1]?.db ?? c.db) / 3 }));
  const picos = []; for (let i = 1; i < env.length - 1; i++) if (env[i].v >= U + 3 && env[i].v > env[i - 1].v && env[i].v >= env[i + 1].v && (!picos.length || env[i].t - picos[picos.length - 1] > 0.08)) picos.push(env[i].t);
  const tasa = (a, z) => { const voz = cuadros.filter((c) => c.t >= a && c.t < z && habla(c)).length * (cuadros[1].t - cuadros[0].t); return voz > 1 ? picos.filter((p) => p >= a && p < z).length / voz : null; };
  const tb = tasa(b0, b1);
  if (tb) for (let a = 0; a + 5 <= dur + 1e-9; a += 2.5) {
    if (a < b1 && a + 5 > b0) continue;
    const tz = tasa(a, a + 5); if (tz == null) continue;
    const u = eventos[eventos.length - 1];
    if (tz > tb * 1.3) { if (u?.senal === "habla_rapida" && u.t1 >= a) u.t1 = a + 5; else add("habla_rapida", { t0: a, t1: a + 5, pico: tz }, `${tz.toFixed(1)} sílabas/s (línea base ${tb.toFixed(1)})`); }
    else if (tz < tb * 0.7) { if (u?.senal === "habla_lenta" && u.t1 >= a) u.t1 = a + 5; else add("habla_lenta", { t0: a, t1: a + 5, pico: tz }, `${tz.toFixed(1)} sílabas/s (línea base ${tb.toFixed(1)})`); }
  }
  eventos.sort((a, b) => a.t0 - b.t0);
  const vozTot = cuadros.filter(habla).length / cuadros.length;
  return { eventos, resumen: { tonoBase: Number.isFinite(f0b) ? Math.round(f0b) : null, volumenBase: Number.isFinite(dbb) ? Math.round(dbb) : null, silabasBase: tb ? +tb.toFixed(1) : null, voz: Math.round(vozTot * 100) } };
}
