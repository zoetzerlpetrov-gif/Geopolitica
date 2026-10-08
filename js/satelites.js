// Ficha y trayectoria de un satélite (traza en tierra), a partir de lo que calcula js/sat-worker.js.
//
// Precisión: la posición sale de los elementos orbitales públicos (TLE de CelesTrak, se renuevan cada
// 6 h) con el modelo SGP4. Con un TLE de menos de un día el error típico es de 1 a 3 km en órbita baja,
// y crece unos kilómetros por día de antigüedad. Es la misma técnica que usan los sitios de rastreo.
//
// ¿Por qué tantos satélites sobre el Ecuador? Los geoestacionarios (grupo «geo») giran a la misma
// velocidad que la Tierra a 35,786 km de altura, encima del Ecuador: desde el suelo parecen fijos.
// Es su posición real, no un error del mapa.
import { esc } from "./util.js";

const R = 6378.137; // radio ecuatorial (km)
const MU = 398600.4418; // km³/s²

/** Semieje mayor (km) a partir del período (min). Tercera ley de Kepler. */
export function semieje(periodoMin) {
  const n = (2 * Math.PI) / (periodoMin * 60);
  return Math.cbrt(MU / (n * n));
}

/** Clasificación por forma y altura de la órbita. */
export function tipoOrbita({ periodo_min, excentricidad, inclinacion }) {
  const a = semieje(periodo_min);
  const perigeo = a * (1 - excentricidad) - R, apogeo = a * (1 + excentricidad) - R;
  if (excentricidad > 0.25) return { id: "heo", nombre: "Órbita muy elíptica (HEO)", perigeo, apogeo };
  if (Math.abs(periodo_min - 1436.1) < 30 && excentricidad < 0.05) {
    return inclinacion < 5
      ? { id: "geo", nombre: "Geoestacionaria (GEO): parece fija sobre el Ecuador", perigeo, apogeo }
      : { id: "gso", nombre: "Geosíncrona inclinada: dibuja un «8» norte-sur", perigeo, apogeo };
  }
  if (apogeo < 2000) return { id: "leo", nombre: "Órbita baja (LEO)", perigeo, apogeo };
  return { id: "meo", nombre: "Órbita media (MEO), p. ej. GPS y Galileo", perigeo, apogeo };
}

/** Radio (km sobre la superficie) del área desde donde el satélite se ve sobre el horizonte. */
export function radioHuella(altKm, elevMinGrados = 0) {
  const e = (elevMinGrados * Math.PI) / 180;
  const lambda = Math.acos((R / (R + altKm)) * Math.cos(e)) - e; // ángulo central
  return R * lambda;
}

/** Círculo de `km` alrededor de [lon, lat] (puntos sobre la esfera), con longitudes continuas. */
export function circulo([lon, lat], km, n = 72) {
  const d = km / R, f1 = (lat * Math.PI) / 180, l1 = (lon * Math.PI) / 180;
  const pts = [];
  let previo = null;
  for (let i = 0; i <= n; i++) {
    const b = (2 * Math.PI * i) / n;
    const f2 = Math.asin(Math.sin(f1) * Math.cos(d) + Math.cos(f1) * Math.sin(d) * Math.cos(b));
    let l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(f1), Math.cos(d) - Math.sin(f1) * Math.sin(f2));
    let x = (l2 * 180) / Math.PI;
    if (previo != null) { while (x - previo > 180) x -= 360; while (x - previo < -180) x += 360; }
    previo = x;
    pts.push([+x.toFixed(3), +Math.max(-85, Math.min(85, (f2 * 180) / Math.PI)).toFixed(3)]);
  }
  return pts;
}

/** Une puntos [lon, lat, …] con longitudes continuas (la línea no cruza el mapa en el antimeridiano). */
export function continuo(puntos) {
  const out = [];
  let previo = null;
  for (const [lon, lat] of puntos) {
    let x = lon;
    if (previo != null) { while (x - previo > 180) x -= 360; while (x - previo < -180) x += 360; }
    previo = x;
    out.push([x, lat]);
  }
  return out;
}

/**
 * GeoJSON para la capa «trayectoria» (js/vuelos.js): recorrido de la última media órbita (k=recorrido),
 * la próxima órbita (k=rumbo, discontinua) y el borde del área de cobertura (k=al_destino).
 * `orb` = respuesta del worker; `actual` = [lon, lat, alt] mostrado en el mapa.
 */
export function geojsonOrbita(orb, actual) {
  const feats = [];
  const pasado = orb.muestras.filter((p) => p[3] <= 0);
  const futuro = orb.muestras.filter((p) => p[3] >= 0);
  if (pasado.length > 1) feats.push({ type: "Feature", properties: { k: "recorrido" }, geometry: { type: "LineString", coordinates: continuo(pasado) } });
  if (futuro.length > 1) feats.push({ type: "Feature", properties: { k: "rumbo" }, geometry: { type: "LineString", coordinates: continuo(futuro) } });
  const alt = actual[2] ?? futuro[0]?.[2] ?? 500;
  feats.push({ type: "Feature", properties: { k: "al_destino" }, geometry: { type: "LineString", coordinates: circulo([actual[0], actual[1]], radioHuella(alt)) } });
  return { type: "FeatureCollection", features: feats };
}

/** Año de lanzamiento desde el designador internacional («98067A» → 1998, lanzamiento 067). */
export function lanzamiento(designador) {
  const m = /^(\d{2})(\d{3})([A-Z]*)$/.exec(designador || "");
  if (!m) return null;
  const yy = Number(m[1]);
  return { anio: yy < 57 ? 2000 + yy : 1900 + yy, numero: Number(m[2]), pieza: m[3] };
}

/** Horas desde la época del TLE (día juliano) hasta `ahora`. */
export const edadTleHoras = (epocaJd, ahora = Date.now()) => (ahora / 86400000 + 2440587.5 - epocaJd) * 24;

const num = (n, d = 0) => Number(n).toLocaleString("es-MX", { maximumFractionDigits: d, minimumFractionDigits: d });

/** HTML de la ficha. `orb` puede ser null mientras el worker responde. */
export function htmlSatelite({ n, norad, grupo, alt }, orb) {
  const e = orb?.elementos;
  const tipo = e ? tipoOrbita(e) : null;
  const lz = e ? lanzamiento(e.designador) : null;
  const edad = e ? edadTleHoras(e.epoca_jd) : null;
  const geo = tipo && (tipo.id === "geo" || tipo.id === "gso");
  return `<h3 id="ficha-titulo">${esc(n)}</h3>
    <div class="fecha">${esc(grupo)} · NORAD ${esc(norad)}${tipo ? ` · ${esc(tipo.nombre)}` : ""}</div>
    <div class="chips"><span class="chip estado-estimado">Posición calculada (SGP4)</span></div>
    <dl>
      <dt>Altitud</dt><dd>${num(alt)} km</dd>
      ${e?.vel_kms ? `<dt>Velocidad</dt><dd>${num(e.vel_kms, 2)} km/s · ${num(e.vel_kms * 3600)} km/h</dd>` : ""}
      ${e ? `<dt>Una vuelta</dt><dd>${e.periodo_min >= 120 ? `${num(e.periodo_min / 60, 1)} h` : `${num(e.periodo_min)} min`} (${num(1440 / e.periodo_min, 1)} vueltas al día)</dd>
      <dt>Inclinación</dt><dd>${num(e.inclinacion, 1)}° ${e.inclinacion > 90 ? "(retrógrada)" : ""}</dd>
      <dt>Perigeo / apogeo</dt><dd>${num(tipo.perigeo)} / ${num(tipo.apogeo)} km</dd>` : ""}
      ${lz ? `<dt>Lanzamiento</dt><dd>${lz.anio} (designador ${esc(e.designador)})</dd>` : ""}
      ${edad != null ? `<dt>Datos orbitales</dt><dd>de hace ${edad < 48 ? `${num(edad)} h` : `${num(edad / 24)} días`}${edad > 72 ? " · la posición puede desviarse decenas de km" : ""}</dd>` : ""}
      <dt>Fuente</dt><dd><a href="https://celestrak.org/satcat/search.php?CATNR=${encodeURIComponent(norad)}" target="_blank" rel="noopener noreferrer">CelesTrak</a></dd>
    </dl>
    ${orb ? `<p class="leyenda-tray"><span class="lt-rec"></span>última media vuelta <span class="lt-rumbo"></span>próxima vuelta <span class="lt-dest"></span>zona desde donde se ve</p>` : `<p class="meta">Calculando la trayectoria…</p>`}
    ${geo ? `<p class="meta">Por eso se ve casi inmóvil: tarda lo mismo que la Tierra en dar una vuelta. Los cientos de puntos alineados sobre el Ecuador son satélites geoestacionarios (TV, comunicaciones, meteorología) y su posición es real.</p>` : ""}
    <p class="meta">Calculado en tu navegador con SGP4 a partir de los elementos orbitales públicos de CelesTrak; con datos de menos de un día el error típico es de 1 a 3 km en órbita baja.</p>`;
}
