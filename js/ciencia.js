// Motor científico de DOMINUS: modelos matemáticos, físicos y químicos para simular escenarios de riesgo.
// Es el mismo código para todos los navegadores (se publica con el sitio y está versionado en el repositorio); los datos
// de cada cliente se quedan en su navegador. Todo es determinista: la simulación Monte Carlo usa una semilla fija,
// así que los mismos datos dan el mismo resultado en cualquier equipo. Catálogo de modelos: config/modelos_ciencia.json.

// ------------------------------------------------------------------ números aleatorios con semilla y distribuciones
/** Generador mulberry32: rápido, con semilla, reproducible. */
export function rng(semilla = 20261022) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Normal estándar por Box-Muller. */
export const normal = (u) => { const a = Math.max(u(), 1e-12), b = u(); return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b); };
/** Poisson: algoritmo de Knuth (λ < 30) o aproximación normal. */
export function poisson(u, l) {
  if (l <= 0) return 0;
  if (l > 30) return Math.max(0, Math.round(l + Math.sqrt(l) * normal(u)));
  const L = Math.exp(-l); let k = 0, p = 1;
  do { k++; p *= u(); } while (p > L);
  return k - 1;
}
/** Función de distribución normal estándar Φ(x) (Abramowitz y Stegun 26.2.17, error < 7.5e-8). */
export function fiNormal(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}
/** Inversa de Φ (algoritmo de Acklam, error relativo < 1.15e-9). */
export function fiInversa(p) {
  if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - pl) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
/** Parámetros de una lognormal a partir de un caso típico (mediana, p50) y uno grave (p90). */
export function lognormalDesdeRango(p50, p90) {
  const mu = Math.log(Math.max(p50, 1e-9));
  const sigma = Math.max(1e-6, (Math.log(Math.max(p90, p50 * 1.0001)) - mu) / 1.2815515655446004);
  return { mu, sigma };
}

// ------------------------------------------------------------------ estadística descriptiva
export const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
export function cuantil(ordenados, p) {
  if (!ordenados.length) return 0;
  const i = (ordenados.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return ordenados[lo] + (ordenados[hi] - ordenados[lo]) * (i - lo);
}
/** Resumen de una muestra de pérdidas: media, mediana, VaR 95/99, TVaR 95 (pérdida media en el peor 5 %) y probabilidad de pérdida > 0. */
export function resumen(muestra) {
  const o = [...muestra].sort((a, b) => a - b);
  const v95 = cuantil(o, 0.95), cola = o.filter((x) => x >= v95);
  return { media: media(o), mediana: cuantil(o, 0.5), var95: v95, var99: cuantil(o, 0.99), tvar95: media(cola), p_perdida: o.filter((x) => x > 0).length / (o.length || 1), max: o.at(-1) ?? 0 };
}
/** Histograma: `n` barras entre el mínimo y el percentil 99 (para que un valor extremo no aplaste la gráfica). */
export function histograma(muestra, n = 20) {
  const o = [...muestra].sort((a, b) => a - b), min = o[0] ?? 0, max = cuantil(o, 0.99) || min + 1, ancho = (max - min) / n || 1;
  const barras = Array.from({ length: n }, (_, i) => ({ desde: min + i * ancho, hasta: min + (i + 1) * ancho, n: 0 }));
  for (const x of o) barras[Math.min(n - 1, Math.max(0, Math.floor((x - min) / ancho)))].n++;
  return barras;
}

// ------------------------------------------------------------------ álgebra lineal
/** Producto matriz por vector. */
export const matVec = (A, x) => A.map((f) => f.reduce((s, a, j) => s + a * x[j], 0));
/** Inversa por eliminación de Gauss-Jordan con pivoteo parcial. */
export function inversa(M) {
  const n = M.length, A = M.map((f, i) => [...f, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) throw new Error("La matriz no tiene inversa (dependencias de 100 % o más)");
    [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c];
    for (let j = 0; j < 2 * n; j++) A[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j]; }
  }
  return A.map((f) => f.slice(n));
}
/** Descomposición de Cholesky (matriz de correlación simétrica y definida positiva). */
export function cholesky(S) {
  const n = S.length, L = S.map(() => Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = S[i][j];
    for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
    if (i === j) { if (s <= 0) throw new Error("La matriz de correlación no es válida (no es definida positiva)"); L[i][j] = Math.sqrt(s); } else L[i][j] = s / L[j][j];
  }
  return L;
}
/** Distribución estacionaria de una cadena de Markov (iteración de potencias). */
export function estacionaria(P, iter = 2000) {
  let x = P.map(() => 1 / P.length);
  for (let k = 0; k < iter; k++) x = x.map((_, j) => x.reduce((s, xi, i) => s + xi * P[i][j], 0));
  return x;
}

// ------------------------------------------------------------------ ecuaciones diferenciales
/** Runge-Kutta de 4.º orden para y' = f(t, y) con y vector. Devuelve los estados en cada paso. */
export function rk4(f, y0, t0, t1, h) {
  const pasos = [{ t: t0, y: [...y0] }];
  let t = t0, y = [...y0];
  const suma = (a, b, k) => a.map((v, i) => v + k * b[i]);
  while (t < t1 - 1e-12) {
    const k1 = f(t, y), k2 = f(t + h / 2, suma(y, k1, h / 2)), k3 = f(t + h / 2, suma(y, k2, h / 2)), k4 = f(t + h, suma(y, k3, h));
    y = y.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
    t += h;
    pasos.push({ t, y: [...y] });
  }
  return pasos;
}

// ------------------------------------------------------------------ evaluador de expresiones seguro (sin eval)
/** Evalúa «cliente.ingresos * 0.02 + 5» con números, + − × ÷, potencias (^), paréntesis, min/max y variables del contexto. */
export function evaluar(expr, ctx = {}) {
  if (typeof expr === "number") return expr;
  const s = String(expr ?? "").trim();
  if (!s) return NaN;
  const tokens = s.match(/\d+(?:\.\d+)?(?:e[+-]?\d+)?|[A-Za-z_][\w.]*|[()+\-*/^,]/g) || [];
  let i = 0;
  const ver = () => tokens[i], comer = () => tokens[i++];
  const valorVar = (n) => { const v = n.split(".").reduce((o, k) => (o == null ? undefined : o[k]), ctx); const x = Number(v); return Number.isFinite(x) ? x : NaN; };
  function primario() {
    const t = comer();
    if (t === "(") { const v = suma(); comer(); return v; }
    if (t === "-") return -primario();
    if (/^\d/.test(t)) return Number(t);
    if (t === "min" || t === "max") { comer(); const a = [suma()]; while (ver() === ",") { comer(); a.push(suma()); } comer(); return Math[t](...a); }
    if (/^[A-Za-z_]/.test(t)) return valorVar(t);
    return NaN;
  }
  function potencia() { let b = primario(); while (ver() === "^") { comer(); b = b ** primario(); } return b; }
  function producto() { let v = potencia(); while (ver() === "*" || ver() === "/") { const op = comer(), d = potencia(); v = op === "*" ? v * d : v / d; } return v; }
  function suma() { let v = producto(); while (ver() === "+" || ver() === "-") { const op = comer(), d = producto(); v = op === "+" ? v + d : v - d; } return v; }
  const r = suma();
  return i === tokens.length ? r : NaN;
}

// ------------------------------------------------------------------ escala 5×5 (ISO 31000 / matriz de calor)
/** Probabilidad anual → nivel 1-5: < 1 %, 1-5 %, 5-20 %, 20-50 %, ≥ 50 %. */
export const nivelProbabilidad = (p) => (p >= 0.5 ? 5 : p >= 0.2 ? 4 : p >= 0.05 ? 3 : p >= 0.01 ? 2 : 1);
/** Impacto como % de los ingresos anuales → nivel 1-5: < 0.1 %, 0.1-1 %, 1-5 %, 5-15 %, ≥ 15 %. Sin ingresos se usa el nivel indicado. */
export const nivelImpacto = (perdida, ingresos) => {
  if (!(ingresos > 0)) return null;
  const r = perdida / ingresos;
  return r >= 0.15 ? 5 : r >= 0.05 ? 4 : r >= 0.01 ? 3 : r >= 0.001 ? 2 : 1;
};
export const nivelRiesgo = (p, i) => { const x = p * i; return x >= 15 ? "crítico" : x >= 10 ? "alto" : x >= 5 ? "medio" : "bajo"; };

// ------------------------------------------------------------------ modelos (cada uno devuelve pasos con la fórmula usada)
const f2 = (x, d = 2) => (Number.isFinite(x) ? Number(x.toFixed(d)) : x);
const N = 20000;

export const MODELOS = {
  /** Frecuencia-severidad (FAIR / actuarial): N ~ Poisson(λ) eventos al año, cada uno con pérdida ~ Lognormal; Monte Carlo. */
  frecuencia_severidad({ lambda, p50, p90, semilla = 1 }) {
    const u = rng(semilla), { mu, sigma } = lognormalDesdeRango(p50, p90), m = [];
    for (let k = 0; k < N; k++) { let s = 0; const n = poisson(u, lambda); for (let j = 0; j < n; j++) s += Math.exp(mu + sigma * normal(u)); m.push(s); }
    const r = resumen(m);
    return { prob: 1 - Math.exp(-lambda), perdida: r.media, ...r, muestra: m,
      pasos: [["Frecuencia", "N ~ Poisson(λ)", `λ = ${lambda} eventos/año → P(al menos 1) = 1 − e^(−λ) = ${f2((1 - Math.exp(-lambda)) * 100, 1)} %`],
        ["Severidad", "X ~ Lognormal(μ, σ), μ = ln(p50), σ = (ln p90 − ln p50)/1.2816", `μ = ${f2(mu, 3)}, σ = ${f2(sigma, 3)}`],
        ["Pérdida anual", "L = Σ X_i (i = 1…N), 20 000 simulaciones Monte Carlo", `media = ${f2(r.media, 0)}, VaR95 = ${f2(r.var95, 0)}`]] };
  },
  /** Gutenberg-Richter + Poisson + curva de fragilidad lognormal. */
  sismo_gr({ n_obs, anios_obs, m0, b = 1, m_dano, horizonte, valor, theta_m = 7, beta = 0.6 }) {
    const l0 = n_obs / anios_obs, l = l0 * 10 ** (-b * (m_dano - m0)), p = 1 - Math.exp(-l * horizonte);
    const dano = fiNormal(Math.log(m_dano / theta_m) / beta);
    const eal = l * dano * valor;
    const pa = 1 - Math.exp(-l);
    return { prob: pa, prob_horizonte: p, perdida: eal, media: eal, var95: pa >= 0.05 ? dano * valor : 0, var99: pa >= 0.01 ? dano * valor : 0,
      pasos: [["Tasa observada", "λ0 = N0 / años", `${n_obs} sismos M≥${m0} en ${anios_obs} años → λ0 = ${f2(l0, 3)}/año`],
        ["Ley de Gutenberg-Richter", "log10 N(M) = a − b·M ⇒ λ(M) = λ0·10^(−b(M−M0))", `λ(M≥${m_dano}) = ${f2(l, 5)}/año (b = ${b})`],
        ["Probabilidad en el horizonte", "P = 1 − e^(−λ·T)", `T = ${horizonte} años → P = ${f2(p * 100, 2)} %`],
        ["Fragilidad (daño esperado)", "D = Φ(ln(M/θ)/β)", `θ = ${theta_m}, β = ${beta} → daño = ${f2(dano * 100, 1)} % del valor expuesto`],
        ["Pérdida anual esperada", "EAL = λ·D·V", f2(eal, 0)]] };
  },
  /** Periodo de retorno (eventos extremos: huracán, inundación, ceniza). */
  periodo_retorno({ T, horizonte, perdida_evento }) {
    const p1 = 1 / T, p = 1 - (1 - p1) ** horizonte, eal = perdida_evento * p1;
    return { prob: p1, prob_horizonte: p, perdida: eal, media: eal, var95: p1 >= 0.05 ? perdida_evento : 0, var99: p1 >= 0.01 ? perdida_evento : 0,
      pasos: [["Probabilidad anual", "p = 1/T", `T = ${T} años → p = ${f2(p1 * 100, 2)} %`],
        ["Al menos un evento en el horizonte", "P = 1 − (1 − 1/T)^n", `n = ${horizonte} años → P = ${f2(p * 100, 1)} %`],
        ["Pérdida anual esperada", "EAL = p·L", f2(eal, 0)]] };
  },
  /** Movimiento browniano geométrico (ecuación diferencial estocástica dS = μS dt + σS dW) sobre una exposición. */
  gbm_exposicion({ exposicion, mu = 0, sigma, dias, semilla = 2 }) {
    const u = rng(semilla), T = dias / 252, m = [];
    for (let k = 0; k < N; k++) { const st = Math.exp((mu - sigma ** 2 / 2) * T + sigma * Math.sqrt(T) * normal(u)); m.push(Math.max(0, exposicion * (st - 1))); }
    const r = resumen(m), umbral = exposicion * 0.1;
    const pr = m.filter((x) => x >= umbral).length / m.length;
    return { prob: pr, perdida: r.media, ...r, muestra: m,
      pasos: [["Modelo", "dS = μ·S·dt + σ·S·dW (Itô) ⇒ S_T = S_0·e^((μ − σ²/2)T + σ√T·Z)", `σ anual = ${sigma}, T = ${dias} días hábiles`],
        ["Pérdida", "L = max(0, E·(S_T/S_0 − 1))", `exposición = ${exposicion}`],
        ["Probabilidad de un alza ≥ 10 %", "P(S_T/S_0 ≥ 1.1)", `${f2(pr * 100, 1)} %`]] };
  },
  /** Modelo de Vasicek para tasas (Ornstein-Uhlenbeck): dr = κ(θ − r)dt + σ dW. */
  vasicek_deuda({ deuda, r0, theta, kappa, sigma, anios }) {
    const e = theta + (r0 - theta) * Math.exp(-kappa * anios), v = (sigma ** 2 / (2 * kappa)) * (1 - Math.exp(-2 * kappa * anios)), sd = Math.sqrt(v);
    const r95 = e + 1.6449 * sd, extra = Math.max(0, (e - r0)) * deuda, extra95 = Math.max(0, r95 - r0) * deuda;
    const pAlza = 1 - fiNormal((r0 + 0.01 - e) / (sd || 1e-9));
    return { prob: pAlza, perdida: extra, media: extra, var95: extra95, var99: Math.max(0, e + 2.3263 * sd - r0) * deuda,
      pasos: [["Modelo de Vasicek", "dr = κ(θ − r)dt + σ dW", `κ = ${kappa}, θ = ${theta}, σ = ${sigma}`],
        ["Tasa esperada", "E[r_T] = θ + (r_0 − θ)e^(−κT)", `${f2(e * 100, 2)} % en ${anios} años`],
        ["Banda al 95 %", "Var = σ²/(2κ)·(1 − e^(−2κT))", `tasa ≤ ${f2(r95 * 100, 2)} % con 95 % de confianza`],
        ["Probabilidad de subir ≥ 1 punto", "P(r_T ≥ r_0 + 0.01)", `${f2(pAlza * 100, 1)} %`],
        ["Costo financiero adicional anual", "ΔC = (r − r_0)·Deuda", `esperado ${f2(extra, 0)}; escenario 95 %: ${f2(extra95, 0)}`]] };
  },
  /** Modelo epidemiológico SIR resuelto con Runge-Kutta 4 → ausentismo. */
  sir_ausentismo({ empleados, R0, dias_infeccioso, infectados0 = 1, costo_dia, prob_brote = 0.2 }) {
    const g = 1 / dias_infeccioso, b = R0 * g, Np = empleados;
    const pasos = rk4((t, [S, I]) => [-b * S * I / Np, b * S * I / Np - g * I, g * I], [Np - infectados0, infectados0, 0], 0, 180, 0.5);
    let pico = 0, diaPico = 0, diasAus = 0;
    for (const p of pasos) { if (p.y[1] > pico) { pico = p.y[1]; diaPico = p.t; } diasAus += p.y[1] * 0.5; }
    const costo = diasAus * costo_dia;
    return { prob: prob_brote, perdida: costo * prob_brote, media: costo * prob_brote, var95: prob_brote >= 0.05 ? costo : 0, var99: prob_brote >= 0.01 ? costo : 0,
      serie: pasos.filter((_, k) => k % 4 === 0).map((p) => ({ x: p.t, y: p.y[1] })),
      pasos: [["Modelo SIR", "dS/dt = −βSI/N, dI/dt = βSI/N − γI, dR/dt = γI", `γ = 1/${dias_infeccioso}, β = R0·γ = ${f2(b, 3)}`],
        ["Solución numérica", "Runge-Kutta de 4.º orden, paso 0.5 días", `pico de ${f2(pico, 0)} personas enfermas al mismo tiempo (${f2(pico / Np * 100, 1)} %) el día ${f2(diaPico, 0)}`],
        ["Días de ausencia", "∫ I(t) dt", f2(diasAus, 0)],
        ["Costo si ocurre el brote", "C = días × costo diario", `${f2(costo, 0)}; con probabilidad ${prob_brote * 100} % al año → esperado ${f2(costo * prob_brote, 0)}`]] };
  },
  /** Difusión de Bass (crisis reputacional): dN/dt = (p + qN/M)(M − N). */
  difusion_reputacional({ audiencia, p = 0.03, q = 0.4, dias = 30, costo_por_alcance, prob = 0.15 }) {
    const pasos = rk4((t, [n]) => [(p + q * n / audiencia) * (audiencia - n)], [0], 0, dias, 0.25);
    const fin = pasos.at(-1).y[0], d50 = pasos.find((x) => x.y[0] >= audiencia / 2)?.t ?? null;
    const costo = fin * costo_por_alcance;
    return { prob, perdida: costo * prob, media: costo * prob, var95: prob >= 0.05 ? costo : 0, var99: prob >= 0.01 ? costo : 0,
      serie: pasos.filter((_, k) => k % 4 === 0).map((x) => ({ x: x.t, y: x.y[0] })),
      pasos: [["Modelo de Bass", "dN/dt = (p + q·N/M)(M − N)", `p (exposición directa) = ${p}, q (contagio) = ${q}, M = ${audiencia}`],
        ["Alcance", "Runge-Kutta 4", `${f2(fin, 0)} personas en ${dias} días${d50 != null ? `; la mitad de la audiencia en el día ${f2(d50, 1)}` : ""}`],
        ["Costo si ocurre", "C = alcance × costo por persona alcanzada", f2(costo, 0)]] };
  },
  /** Liquidez: dC/dt = I(t) − E con caída de ingresos; tiempo hasta caja cero. */
  runway_liquidez({ caja, ingresos_mes, egresos_mes, caida, meses = 12, prob = 0.2 }) {
    const ingreso = ingresos_mes * (1 - caida), neto = ingreso - egresos_mes;
    const mesesCero = neto < 0 ? caja / -neto : Infinity, minimo = caja + Math.min(0, neto) * meses;
    const faltante = Math.max(0, -minimo);
    return { prob, perdida: faltante * prob, media: faltante * prob, var95: prob >= 0.05 ? faltante : 0, var99: prob >= 0.01 ? faltante : 0,
      serie: Array.from({ length: meses + 1 }, (_, k) => ({ x: k, y: caja + neto * k })),
      pasos: [["Ecuación de caja", "dC/dt = I − E ⇒ C(t) = C0 + (I − E)·t", `I = ${f2(ingreso, 0)}/mes (caída ${caida * 100} %), E = ${egresos_mes}/mes`],
        ["Meses hasta caja cero", "t* = C0 / (E − I)", Number.isFinite(mesesCero) ? f2(mesesCero, 1) : "no se agota"],
        ["Financiamiento faltante a 12 meses", "max(0, −C(12))", f2(faltante, 0)]] };
  },
  /** Confiabilidad de sistemas: disponibilidad A = MTBF/(MTBF + MTTR); serie Π A, paralelo 1 − Π(1 − A). */
  disponibilidad_sistemas({ mtbf, mttr, redundantes = 1, componentes = 1, costo_hora }) {
    const a = mtbf / (mtbf + mttr), ap = 1 - (1 - a) ** redundantes, as = ap ** componentes;
    const horas = (1 - as) * 8760, costo = horas * costo_hora, fallas = (8760 / (mtbf + mttr)) * componentes;
    return { prob: 1 - Math.exp(-fallas * (1 - a) ** (redundantes - 1)), perdida: costo, media: costo, var95: costo * 2, var99: costo * 3,
      pasos: [["Disponibilidad de un equipo", "A = MTBF/(MTBF + MTTR)", `${mtbf} h / (${mtbf} + ${mttr}) h = ${f2(a * 100, 3)} %`],
        ["Con respaldo (paralelo)", "A_p = 1 − (1 − A)^k", `k = ${redundantes} → ${f2(ap * 100, 4)} %`],
        ["Cadena de componentes (serie)", "A_s = A_p^n", `n = ${componentes} → ${f2(as * 100, 4)} %`],
        ["Horas fuera de servicio al año", "(1 − A_s)·8760", f2(horas, 1)], ["Costo anual esperado", "horas × costo por hora", f2(costo, 0)]] };
  },
  /** Cadena de Markov de dos estados (opera / interrumpido) → fracción del tiempo interrumpido. */
  markov_proveedor({ p_falla_mes, p_recupera_mes, costo_mes_caido }) {
    const P = [[1 - p_falla_mes, p_falla_mes], [p_recupera_mes, 1 - p_recupera_mes]], pi = estacionaria(P);
    const meses = pi[1] * 12, costo = meses * costo_mes_caido, prob = 1 - (1 - p_falla_mes) ** 12;
    return { prob, perdida: costo, media: costo, var95: Math.min(12, (1 / p_recupera_mes) * 1.5) * costo_mes_caido, var99: Math.min(12, (1 / p_recupera_mes) * 2.5) * costo_mes_caido,
      pasos: [["Matriz de transición", "P = [[1−f, f], [r, 1−r]]", `f = ${p_falla_mes}, r = ${p_recupera_mes} por mes`],
        ["Distribución estacionaria", "π = π·P (iteración de potencias)", `interrumpido ${f2(pi[1] * 100, 2)} % del tiempo`],
        ["Duración media de una interrupción", "1/r", `${f2(1 / p_recupera_mes, 1)} meses`],
        ["Probabilidad de al menos una interrupción al año", "1 − (1 − f)^12", `${f2(prob * 100, 1)} %`], ["Costo anual esperado", "12·π_caído·costo", f2(costo, 0)]] };
  },
  /** Efecto cascada entre áreas (modelo insumo-producto de Leontief): x = (I − A)^(-1)·d. */
  leontief_cascada({ areas, A, choque }) {
    const n = areas.length, I = areas.map((_, i) => areas.map((__, j) => (i === j ? 1 : 0)));
    const L = inversa(I.map((f, i) => f.map((v, j) => v - A[i][j]))), x = matVec(L, choque);
    const total = x.reduce((a, b) => a + b, 0), directo = choque.reduce((a, b) => a + b, 0);
    return { prob: null, perdida: total, media: total, var95: total, var99: total, por_area: areas.map((a, i) => ({ area: a, impacto: x[i] })),
      pasos: [["Matriz de dependencias", "A[i][j] = fracción del daño de j que se transmite a i", `${n} áreas`],
        ["Inversa de Leontief", "x = (I − A)^(-1)·d (eliminación de Gauss-Jordan)", areas.map((a, i) => `${a}: ${f2(x[i], 0)}`).join("; ")],
        ["Multiplicador", "impacto total / choque directo", f2(total / (directo || 1), 2)]] };
  },
  /** Riesgos correlacionados: Monte Carlo con Cholesky; compara la pérdida conjunta con la suma de las individuales. */
  portafolio_correlado({ riesgos, correlacion, semilla = 3 }) {
    const u = rng(semilla), L = cholesky(correlacion), ps = riesgos.map((r) => ({ ...r, ...lognormalDesdeRango(r.p50, r.p90) })), m = [];
    for (let k = 0; k < N; k++) {
      const z = riesgos.map(() => normal(u)), c = L.map((f) => f.reduce((s, a, j) => s + a * z[j], 0));
      m.push(ps.reduce((s, r, i) => s + (fiNormal(c[i]) < r.prob ? Math.exp(r.mu + r.sigma * normal(u)) : 0), 0));
    }
    const r = resumen(m), ind = ps.map((x) => x.prob * Math.exp(x.mu + x.sigma ** 2 / 2));
    return { prob: r.p_perdida, perdida: r.media, ...r, muestra: m,
      pasos: [["Correlación", "Σ = L·Lᵀ (Cholesky); Z_corr = L·Z", `${riesgos.length} riesgos`],
        ["Ocurrencia conjunta", "riesgo i ocurre si Φ(Z_i) < p_i (cópula gaussiana)", riesgos.map((x) => `${x.nombre}: ${x.prob * 100} %`).join("; ")],
        ["Pérdida conjunta", "Monte Carlo 20 000", `media ${f2(r.media, 0)} (suma de esperadas ${f2(ind.reduce((a, b) => a + b, 0), 0)}), VaR95 ${f2(r.var95, 0)}`]] };
  },
  /** Teoría de colas M/M/c (fórmula de Erlang C): saturación de atención en una crisis. */
  erlang_c({ llamadas_hora, minutos_servicio, agentes, espera_meta_s = 20 }) {
    const a = llamadas_hora * minutos_servicio / 60, c = agentes;
    if (a >= c) return { prob: 1, perdida: null, media: null, var95: null, var99: null, saturado: true,
      pasos: [["Intensidad de tráfico", "A = λ·T_servicio", `${f2(a, 2)} erlangs ≥ ${c} agentes: la cola crece sin límite`]] };
    let s = 0, t = 1;
    for (let k = 0; k < c; k++) { if (k > 0) t *= a / k; s += t; }
    const ac = t * a / c, pc = (ac * c / (c - a)) / (s + ac * c / (c - a));
    const espera = pc * (minutos_servicio * 60) / (c - a), nivel = 1 - pc * Math.exp(-(c - a) * espera_meta_s / (minutos_servicio * 60));
    return { prob: pc, perdida: null, media: null, var95: null, var99: null,
      pasos: [["Intensidad de tráfico", "A = λ·T", `${f2(a, 2)} erlangs`], ["Probabilidad de esperar (Erlang C)", "P_w = (A^c/c!·c/(c−A)) / (Σ A^k/k! + A^c/c!·c/(c−A))", `${f2(pc * 100, 1)} %`],
        ["Espera promedio", "W = P_w·T/(c − A)", `${f2(espera, 0)} s`], ["Nivel de servicio", `P(espera ≤ ${espera_meta_s} s)`, `${f2(nivel * 100, 1)} %`]] };
  },
  /** Dispersión de un gas (pluma gaussiana, Pasquill-Gifford clase D, coeficientes de Briggs rurales). */
  pluma_gaussiana({ q_gs, viento, altura, limite_mgm3, prob = 0.02, costo_evento = 0 }) {
    const conc = (x) => { const sy = 0.08 * x * (1 + 0.0001 * x) ** -0.5, sz = 0.06 * x * (1 + 0.0015 * x) ** -0.5;
      return (q_gs * 1000 / (Math.PI * viento * sy * sz)) * Math.exp(-(altura ** 2) / (2 * sz ** 2)); };
    const xs = [50, 100, 250, 500, 1000, 2000, 5000];
    let dist = 0;
    for (let x = 10; x <= 20000; x *= 1.05) if (conc(x) >= limite_mgm3) dist = x;
    return { prob, perdida: costo_evento * prob, media: costo_evento * prob, var95: prob >= 0.05 ? costo_evento : 0, var99: prob >= 0.01 ? costo_evento : 0, distancia_m: dist,
      serie: xs.map((x) => ({ x, y: conc(x) })),
      pasos: [["Modelo gaussiano (a nivel de suelo, en el eje)", "C = Q/(π·u·σy·σz)·e^(−H²/2σz²)", `Q = ${q_gs} g/s, u = ${viento} m/s, H = ${altura} m`],
        ["Dispersión (clase D, Briggs)", "σy = 0.08x(1 + 0.0001x)^−½, σz = 0.06x(1 + 0.0015x)^−½", xs.map((x) => `${x} m: ${f2(conc(x), 2)} mg/m³`).join("; ")],
        ["Distancia con concentración ≥ límite", `C(x) ≥ ${limite_mgm3} mg/m³`, dist ? `hasta ≈ ${f2(dist, 0)} m` : "no se supera el límite"]] };
  },
  /** Sobrepresión de una explosión: escala de Hopkinson-Cranz Z = R/W^(1/3) y fórmula de Kinney-Graham. */
  sobrepresion_explosion({ tnt_kg, prob = 0.005, costo_evento = 0 }) {
    const P = (R) => { const Z = R / tnt_kg ** (1 / 3); return 101.325 * 808 * (1 + (Z / 4.5) ** 2) / (Math.sqrt(1 + (Z / 0.048) ** 2) * Math.sqrt(1 + (Z / 0.32) ** 2) * Math.sqrt(1 + (Z / 1.35) ** 2)); };
    const radio = (kpa) => { let r = 1; while (P(r) > kpa && r < 1e5) r *= 1.01; return r; };
    const umbrales = [[3.5, "rotura de vidrios"], [7, "daño parcial a casas; heridas por vidrios"], [14, "daño moderado en estructuras"], [35, "daño grave o colapso de edificios"], [100, "lesiones pulmonares; muy probable mortalidad"]];
    return { prob, perdida: costo_evento * prob, media: costo_evento * prob, var95: prob >= 0.05 ? costo_evento : 0, var99: prob >= 0.01 ? costo_evento : 0,
      radios: umbrales.map(([k, t]) => ({ kpa: k, efecto: t, radio_m: radio(k) })),
      pasos: [["Distancia escalada", "Z = R / W^(1/3)", `W = ${tnt_kg} kg de TNT equivalente`],
        ["Sobrepresión (Kinney-Graham)", "P/P0 = 808[1 + (Z/4.5)²] / (√(1+(Z/0.048)²)·√(1+(Z/0.32)²)·√(1+(Z/1.35)²))", umbrales.map(([k, t]) => `${k} kPa (${t}): ${f2(radio(k), 0)} m`).join("; ")]] };
  },
  /** Estrés térmico: índice de calor de Rothfusz (NWS) y categorías de riesgo. */
  estres_termico({ temp_c, humedad, trabajadores, horas, costo_hora, perdidas = [0, 0.05, 0.15, 0.3, 0.5], dias = 20 }) {
    const T = temp_c * 9 / 5 + 32, R = humedad;
    let hi = -42.379 + 2.04901523 * T + 10.14333127 * R - 0.22475541 * T * R - 6.83783e-3 * T * T - 5.481717e-2 * R * R + 1.22874e-3 * T * T * R + 8.5282e-4 * T * R * R - 1.99e-6 * T * T * R * R;
    if (T < 80) hi = 0.5 * (T + 61 + (T - 68) * 1.2 + R * 0.094);
    const hic = (hi - 32) * 5 / 9, cat = hic >= 54 ? 4 : hic >= 41 ? 3 : hic >= 32 ? 2 : hic >= 27 ? 1 : 0;
    const NOM = ["Sin riesgo", "Precaución", "Precaución extrema", "Peligro", "Peligro extremo"];
    const costo = trabajadores * horas * costo_hora * perdidas[cat] * dias;
    return { prob: cat >= 2 ? 0.5 : cat === 1 ? 0.2 : 0.02, perdida: costo, media: costo, var95: costo * 1.5, var99: costo * 2,
      pasos: [["Índice de calor (Rothfusz)", "HI = −42.379 + 2.049T + 10.143R − 0.2248TR − … (°F)", `${temp_c} °C y ${humedad} % → ${f2(hic, 1)} °C`],
        ["Categoría (NWS)", "27 / 32 / 41 / 54 °C", NOM[cat]],
        ["Pérdida de productividad (supuesto editable)", "trabajadores × horas × costo × % pérdida × días", f2(costo, 0)]] };
  },
  /** Inventario y quiebre de abasto: demanda durante el tiempo de entrega ~ Normal(μ·L, σ·√L). */
  inventario_quiebre({ demanda_dia, sd_dia, lead_dias, retraso_dias, stock, margen_unidad }) {
    const L = lead_dias + retraso_dias, mu = demanda_dia * L, sd = sd_dia * Math.sqrt(L), z = (stock - mu) / (sd || 1e-9);
    const p = 1 - fiNormal(z), faltante = sd * (Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI) - z * (1 - fiNormal(z)));
    const costo = faltante * margen_unidad;
    return { prob: p, perdida: costo, media: costo, var95: Math.max(0, mu + 1.645 * sd - stock) * margen_unidad, var99: Math.max(0, mu + 2.326 * sd - stock) * margen_unidad,
      pasos: [["Demanda durante el abasto", "D ~ Normal(μ·L, σ·√L)", `L = ${lead_dias} + ${retraso_dias} días de retraso → media ${f2(mu, 0)}, desviación ${f2(sd, 0)}`],
        ["Probabilidad de quiebre", "P = 1 − Φ((S − μL)/σL)", `${f2(p * 100, 1)} %`], ["Unidades faltantes esperadas", "E[(D − S)+] = σL·[φ(z) − z(1 − Φ(z))]", f2(faltante, 0)],
        ["Margen perdido esperado", "faltante × margen", f2(costo, 0)]] };
  },
  /** Teorema de Bayes: probabilidad de sanción tras observar una señal (auditoría, denuncia, visita). */
  bayes_regulatorio({ previa, sensibilidad, falsa_alarma, multa }) {
    const post = sensibilidad * previa / (sensibilidad * previa + falsa_alarma * (1 - previa));
    return { prob: post, perdida: post * multa, media: post * multa, var95: post >= 0.05 ? multa : 0, var99: post >= 0.01 ? multa : 0,
      pasos: [["Probabilidad previa", "P(H)", `${previa * 100} %`], ["Teorema de Bayes", "P(H|E) = P(E|H)P(H) / [P(E|H)P(H) + P(E|¬H)(1 − P(H))]", `${f2(post * 100, 1)} %`],
        ["Valor esperado de la sanción", "P(H|E) × multa", f2(post * multa, 0)]] };
  },
  /** Incidentes en traslados (robo, bloqueo): binomial y Poisson. */
  binomial_traslados({ p_incidente, viajes, perdida_incidente, semilla = 4 }) {
    const l = p_incidente * viajes, u = rng(semilla), m = [];
    for (let k = 0; k < N; k++) m.push(poisson(u, l) * perdida_incidente);
    const r = resumen(m), p = 1 - (1 - p_incidente) ** viajes;
    return { prob: p, perdida: r.media, ...r, muestra: m,
      pasos: [["Al menos un incidente", "P = 1 − (1 − p)^n", `p = ${p_incidente}, n = ${viajes} → ${f2(p * 100, 1)} %`],
        ["Número esperado", "E[N] = n·p (≈ Poisson)", f2(l, 2)], ["Pérdida anual", "Monte Carlo", `media ${f2(r.media, 0)}, VaR95 ${f2(r.var95, 0)}`]] };
  },
  /** Árbol de decisión: valor monetario esperado de cada opción. */
  arbol_decision({ opciones }) {
    const emv = opciones.map((o) => ({ nombre: o.nombre, emv: o.ramas.reduce((s, r) => s + r.p * r.valor, 0) - (o.costo || 0) }));
    const mejor = emv.reduce((a, b) => (b.emv > a.emv ? b : a));
    const peor = Math.min(...opciones.flatMap((o) => o.ramas.map((r) => r.valor)));
    return { prob: null, perdida: Math.max(0, -mejor.emv), media: Math.max(0, -mejor.emv), var95: Math.max(0, -peor), var99: Math.max(0, -peor), opciones: emv,
      pasos: [["Valor monetario esperado", "EMV = Σ p_i·v_i − costo", emv.map((e) => `${e.nombre}: ${f2(e.emv, 0)}`).join("; ")], ["Mejor opción por EMV", "max EMV", mejor.nombre]] };
  },
  /** Concentración de clientes o proveedores: índice Herfindahl-Hirschman. */
  concentracion_hhi({ participaciones, ingresos, prob_perder_mayor = 0.1, margen = 0.15 }) {
    const hhi = participaciones.reduce((s, x) => s + x * x, 0), mayor = Math.max(...participaciones) / 100, perdida = mayor * ingresos * margen;
    return { prob: prob_perder_mayor, perdida: perdida * prob_perder_mayor, media: perdida * prob_perder_mayor, var95: prob_perder_mayor >= 0.05 ? perdida : 0, var99: perdida,
      pasos: [["Índice Herfindahl-Hirschman", "HHI = Σ s_i² (s en %)", `${f2(hhi, 0)} (${hhi > 2500 ? "muy concentrado" : hhi > 1500 ? "moderadamente concentrado" : "diversificado"})`],
        ["Perder al mayor", "participación × ingresos × margen", f2(perdida, 0)]] };
  },
  /** Tiempo de evacuación (flujo específico tipo SFPE ≈ 1.3 personas/s por metro de ancho efectivo). */
  evacuacion({ personas, ancho_m, distancia_m, velocidad = 1.2, flujo = 1.3, premovimiento_s = 60, disponible_s = 300 }) {
    const t = premovimiento_s + distancia_m / velocidad + personas / (flujo * ancho_m);
    return { prob: t > disponible_s ? 0.5 : 0.02, perdida: null, media: null, var95: null, var99: null, tiempo_s: t,
      pasos: [["Tiempo requerido", "t = t_premov + d/v + N/(F·W)", `${f2(t, 0)} s (${f2(t / 60, 1)} min)`], ["Margen de seguridad", "t_disponible − t_requerido", `${f2(disponible_s - t, 0)} s ${t > disponible_s ? "⚠️ insuficiente" : "✓"}`]] };
  },
};

/** Resuelve los parámetros de un escenario (números o expresiones con datos del cliente) y corre su modelo. */
export function simular(escenario, valores = {}, ctx = {}) {
  const params = {};
  for (const p of escenario.parametros || []) {
    const v = valores[p.k] ?? p.valor;
    params[p.k] = typeof v === "string" && p.tipo !== "texto" ? evaluar(v, ctx) : v;
    if (p.tipo === "json") params[p.k] = typeof v === "string" ? JSON.parse(v) : v;
  }
  for (const [k, v] of Object.entries(params)) if (typeof v === "number" && !Number.isFinite(v)) throw new Error(`Falta un dato válido en «${(escenario.parametros.find((p) => p.k === k) || {}).etiqueta || k}»`);
  const fn = MODELOS[escenario.modelo];
  if (!fn) throw new Error(`Modelo desconocido: ${escenario.modelo}`);
  const r = fn(params);
  const ingresos = Number(ctx.cliente?.ingresos);
  const np = r.prob == null ? null : nivelProbabilidad(r.prob);
  const ni = r.perdida == null ? null : nivelImpacto(r.var95 || r.perdida, ingresos);
  return { ...r, params, nivel_prob: np, nivel_imp: ni, nivel: np && ni ? nivelRiesgo(np, ni) : null };
}

/**
 * Propuestas de escenarios para un contexto: puntúa cada escenario del catálogo por palabras clave del texto, sector del
 * cliente y áreas con más eventos recientes en sus países. Devuelve los mejores con el motivo (sin IA: reproducible).
 */
export function proponer(catalogo, { texto = "", sector = "", eventosPorArea = {} } = {}, max = 12) {
  const t = String(texto).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const totalEv = Object.values(eventosPorArea).reduce((a, b) => a + b, 0) || 1;
  return catalogo.map((e) => {
    const motivos = [];
    let s = 0;
    const hits = (e.palabras || []).filter((p) => t.includes(p.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()));
    if (hits.length) { s += 3 * hits.length; motivos.push(`menciona ${hits.slice(0, 3).join(", ")}`); }
    if (sector && (e.sectores || []).includes(sector)) { s += 2; motivos.push("típico del sector"); }
    const ev = (e.areas_eventos || []).reduce((n, a) => n + (eventosPorArea[a] || 0), 0);
    if (ev) { s += 4 * ev / totalEv; motivos.push(`${ev} eventos recientes relacionados`); }
    if (e.base) { s += 0.5; }
    return { id: e.id, puntos: Math.round(s * 100) / 100, motivos };
  }).filter((x) => x.puntos > 0).sort((a, b) => b.puntos - a.puntos).slice(0, max);
}
