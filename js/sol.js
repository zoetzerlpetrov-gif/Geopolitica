// Geometría Sol–Tierra–satélite para calcular pases visibles a simple vista. Script clásico: lo carga
// js/sat-worker.js con importScripts y las pruebas con node:vm. Precisión de ~0.01° en la posición del
// Sol (algoritmo de baja precisión del Astronomical Almanac), de sobra para decidir día o noche.
//
// Un satélite se ve a simple vista cuando se cumplen tres condiciones a la vez:
//   1. está sobre el horizonte del observador (aquí, a más de 10° de altura, para librar edificios y bruma);
//   2. el observador está a oscuras: el Sol está más de 6° bajo su horizonte (después del crepúsculo civil);
//   3. el satélite está iluminado por el Sol (no ha entrado en la sombra de la Tierra).
// Por eso los pases visibles ocurren poco después del atardecer o poco antes del amanecer.
/* exported SOL */
(function (raiz) {
  const R_TIERRA = 6378.137; // km
  const RAD = Math.PI / 180;

  /** Vector unitario hacia el Sol en coordenadas inerciales (ECI, ecuador y equinoccio de la fecha). */
  function solECI(fecha) {
    const n = fecha.getTime() / 86400000 + 2440587.5 - 2451545.0; // días desde J2000
    const L = (280.46 + 0.9856474 * n) * RAD;
    const g = (357.528 + 0.9856003 * n) * RAD;
    const lambda = L + (1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
    const eps = (23.439 - 0.0000004 * n) * RAD;
    return [Math.cos(lambda), Math.cos(eps) * Math.sin(lambda), Math.sin(eps) * Math.sin(lambda)];
  }

  /** Vector unitario «hacia arriba» del observador en ECI (aproximación esférica). gmst en radianes. */
  function cenitECI(latGrados, lonGrados, gmst) {
    const f = latGrados * RAD, th = gmst + lonGrados * RAD;
    return [Math.cos(f) * Math.cos(th), Math.cos(f) * Math.sin(th), Math.sin(f)];
  }

  const punto = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  /** Altura del Sol sobre el horizonte del observador, en grados. */
  function alturaSol(latGrados, lonGrados, fecha, gmst) {
    return Math.asin(Math.max(-1, Math.min(1, punto(solECI(fecha), cenitECI(latGrados, lonGrados, gmst))))) / RAD;
  }

  /** ¿El satélite (posición ECI en km) está en la sombra de la Tierra? Modelo de sombra cilíndrica. */
  function enSombra(posKm, solUnit) {
    const proy = punto(posKm, solUnit);
    if (proy > 0) return false; // del lado del Sol
    const perp = [posKm[0] - proy * solUnit[0], posKm[1] - proy * solUnit[1], posKm[2] - proy * solUnit[2]];
    return Math.hypot(perp[0], perp[1], perp[2]) < R_TIERRA;
  }

  /** Rumbo en texto (N, NE, E…) a partir del azimut en grados. */
  function rumbo(azGrados) {
    const nombres = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
    return nombres[Math.round((((azGrados % 360) + 360) % 360) / 45) % 8];
  }

  raiz.SOL = { solECI, cenitECI, alturaSol, enSombra, rumbo, R_TIERRA };
})(typeof self !== "undefined" ? self : globalThis);
