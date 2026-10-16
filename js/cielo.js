/**
 * Gráficas y textos de las capas de clima de temporada (frentes, nortes, mar de fondo, El Niño/La Niña) y del cielo
 * (asteroides cercanos, cometas, lluvias de estrellas, bólidos, Luna y eclipses). Funciones puras: reciben las
 * propiedades del objeto y devuelven HTML/SVG, para que se puedan probar sin mapa.
 */
import { esc } from "./util.js";

const fechaCorta = (t) => { const d = new Date(/Z$|[+-]\d\d:\d\d$/.test(String(t)) ? t : `${t}Z`); return Number.isNaN(d.getTime()) ? String(t || "") : d.toISOString().slice(0, 16).replace("T", " ") + " UTC"; };
const num = (x, d = 1) => (x == null || Number.isNaN(Number(x)) ? "—" : Number(x).toFixed(d));

// ---------------------------------------------------------------- frentes y nortes

export const COLOR_FRENTE = { frio: "#1F6FB2", calido: "#C62828", estacionario: "#8E44AD", ocluido: "#6C3483", vaguada: "#B9770E",
  linea_seca: "#A0522D", linea_turbonada: "#D35400", alta: "#1F6FB2", baja: "#C62828", tentativo_12h: "#8FB3D1" };
/** Color de la zona de influencia y de la posición tentativa: el del frente al que pertenecen (más claro). */
export const colorFrente = (p) => (p.kind === "zona" ? COLOR_FRENTE[p.de] || "#8D99A6" : p.kind === "tentativo_12h" ? (p.de === "calido" ? "#E3A0A0" : COLOR_FRENTE.tentativo_12h) : COLOR_FRENTE[p.kind] || "#8D99A6");
export const QUE_ES_FRENTE = {
  frio: "Borde del aire frío que avanza y empuja al aire cálido. Al pasar: baja la temperatura, sube la presión, cambia el viento al norte y puede haber lluvias, tormentas y, en el Golfo de México, evento de «Norte».",
  calido: "Borde del aire cálido que avanza sobre aire más frío. Trae nubes en capas, lluvias ligeras y luego subida de temperatura.",
  estacionario: "Frente que casi no se mueve: el aire frío y el cálido se empujan con la misma fuerza. Puede dejar lluvias varios días en la misma zona.",
  ocluido: "Un frente frío alcanzó a uno cálido y levantó el aire cálido del suelo. Suele marcar una tormenta madura (baja presión profunda).",
  vaguada: "Zona alargada de presión baja sin cambio claro de masa de aire. Favorece nubes y lluvias, sobre todo por la tarde.",
  linea_seca: "Límite entre aire seco del desierto y aire húmedo; ahí se forman tormentas fuertes (común en Texas y el norte de México en primavera).",
  linea_turbonada: "Línea de tormentas organizadas con ráfagas fuertes.",
  alta: "Centro de alta presión (A): aire que baja, cielo más despejado y, detrás de un frente frío, aire frío y seco.",
  baja: "Centro de baja presión (B): aire que sube, nubes, lluvia y viento. Las bajas profundas (< 990 hPa) son tormentas fuertes." };

export function movimientoFrente(p) {
  if (p.mov_kmh == null) return "Sin estimar todavía (se calcula al comparar con el análisis anterior de NOAA, cada 3 h)";
  if (p.mov_kmh < 3) return "Casi estacionario (menos de 3 km/h)";
  return `Hacia el ${p.mov_hacia}, ~${p.mov_kmh} km/h (~${Math.round(p.mov_kmh * 24)} km por día)`;
}

export function filasFrente(p) {
  if (p.kind === "zona") {
    const [a, b] = p.ancho_km || [];
    return [["Qué es", "Franja aproximada donde el frente cambia el tiempo: lluvias y tormentas cerca de la línea; detrás de un frente frío, aire más frío, viento del norte y, en el Golfo de México, posible Norte."],
      ["Ancho usado", p.con_movimiento ? `${a} km delante y ${b} km detrás del frente` : `${Math.round(Math.max(a, b) * 0.6)} km a cada lado (sin dirección clara todavía)`],
      ["Movimiento estimado", movimientoFrente(p)], ["Aviso", "Estimación propia a partir del análisis de NOAA; no es un aviso oficial."]];
  }
  if (p.kind === "tentativo_12h") {
    return [["Qué es", "Dónde estaría el frente en 12 horas si siguiera a la misma velocidad y dirección. Los frentes aceleran, frenan o se disipan: úsalo solo como referencia."],
      ["Movimiento estimado", movimientoFrente(p)]];
  }
  return [["Qué es", QUE_ES_FRENTE[p.kind] || "—"], ...(p.presion_hpa ? [["Presión", `${p.presion_hpa} hPa`]] : []),
    ...(["frio", "calido", "estacionario", "ocluido"].includes(p.kind) ? [["Movimiento estimado", movimientoFrente(p)]] : []),
    ...(p.toca_mexico ? [["México", "Pasa sobre territorio mexicano o sus mares cercanos"]] : []), ["Análisis válido", p.valido_utc ? fechaCorta(p.valido_utc) : "—"]];
}

/** Barras horarias simples: serie [[hora, valor], ...] con umbrales de color. */
export function barras(serie, { umbrales = [], unidad = "", alto = 60, titulo = "" } = {}) {
  const s = (serie || []).filter((x) => Array.isArray(x) && Number.isFinite(Number(x[1])));
  if (!s.length) return "";
  // Escala: el dato mayor (o el primer umbral) con 15 % de aire; solo se dibujan los umbrales que caben.
  const max = Math.max(...s.map((x) => Number(x[1])), umbrales[0]?.[0] || 0) * 1.15;
  umbrales = umbrales.filter(([u]) => u <= max);
  const ancho = 300, paso = ancho / s.length;
  const color = (v) => [...umbrales].reverse().find(([u]) => v >= u)?.[1] || "#8D99A6";
  const rects = s.map(([t, v], i) => { const h = Math.max(1, (Number(v) / max) * alto);
    return `<rect x="${(i * paso).toFixed(1)}" y="${(alto - h).toFixed(1)}" width="${Math.max(1, paso - 1).toFixed(1)}" height="${h.toFixed(1)}" fill="${color(Number(v))}"><title>${esc(fechaCorta(t))}: ${esc(v)} ${esc(unidad)}</title></rect>`; }).join("");
  const lineas = umbrales.map(([u, c, t]) => { const y = (alto - (u / max) * alto).toFixed(1);
    return `<line x1="0" x2="${ancho}" y1="${y}" y2="${y}" stroke="${c}" stroke-dasharray="3 2" stroke-width="1"/><text x="${ancho - 2}" y="${Math.max(9, y - 2)}" text-anchor="end" font-size="9" fill="currentColor">${esc(t)}</text>`; }).join("");
  return `${titulo ? `<h4>${esc(titulo)}</h4>` : ""}<svg class="graf-barras" viewBox="0 0 ${ancho} ${alto + 14}" role="img" aria-label="${esc(titulo || "Gráfica")}">
    ${rects}${lineas}<text x="0" y="${alto + 11}" font-size="9" fill="currentColor">${esc(fechaCorta(s[0][0]).slice(0, 10))}</text>
    <text x="${ancho}" y="${alto + 11}" font-size="9" text-anchor="end" fill="currentColor">${esc(fechaCorta(s[s.length - 1][0]).slice(0, 10))}</text></svg>`;
}

export function nivelNorte(n) { return ["Sin Norte en 7 días", "Norte (ráfagas de 50 a 69 km/h)", "Norte fuerte (70 a 89 km/h)", "Norte muy fuerte (90 km/h o más)"][n] || "—"; }

export function filasNorte(p) {
  return [["Estimación", nivelNorte(p.nivel)], ["Ráfaga máxima del norte", p.rafaga_max_kmh ? `${p.rafaga_max_kmh} km/h` : "—"],
    ["Desde", p.inicio ? fechaCorta(p.inicio) : "—"], ["Hasta", p.fin ? fechaCorta(p.fin) : "—"], ["Horas con Norte", String(p.horas ?? 0)],
    ...(p.istmo ? [["Istmo de Tehuantepec", "Aquí el Norte del Golfo cruza el Istmo y sale al Pacífico como viento «Tehuano»: oleaje alto en el Golfo de Tehuantepec."]] : [])];
}

// ---------------------------------------------------------------- mar de fondo

export function nivelMar(n) { return ["Sin mar de fondo en 7 días", "Mar de fondo moderado (2 a 2.9 m)", "Mar de fondo fuerte (3 a 3.9 m)", "Mar de fondo muy fuerte (4 m o más)"][n] || "—"; }

export function filasMar(p) {
  const dir = p.direccion_en_max == null ? "" : ` · llega del ${rumbo(p.direccion_en_max)}`;
  return [["Estimación", nivelMar(p.nivel)], ["Oleaje de fondo máximo", `${num(p.altura_max_m)} m, periodo ${num(p.periodo_en_max_s)} s${dir}`],
    ["Momento del máximo", p.hora_max ? fechaCorta(p.hora_max) : "—"], ...(p.inicio ? [["Mar de fondo desde", fechaCorta(p.inicio)], ["Hasta", fechaCorta(p.fin)]] : [])];
}

export function rumbo(g) {
  const n = ["norte", "noreste", "este", "sureste", "sur", "suroeste", "oeste", "noroeste"];
  return n[Math.round((((Number(g) % 360) + 360) % 360) / 45) % 8];
}

// ---------------------------------------------------------------- El Niño / La Niña

export const FASE_ENSO = { nino: ["El Niño", "#C62828"], nina: ["La Niña", "#1F6FB2"], neutral: ["Neutral", "#8D99A6"] };
export const IMPACTOS_ENSO = {
  nino: ["Invierno más lluvioso y fresco en el norte y noroeste de México (más frentes fríos y nortes).",
    "Verano más seco en el centro y sur de México: riesgo de sequía e incendios forestales.",
    "Menos huracanes en el Atlántico y más en el Pacífico oriental.",
    "En el mundo: sequías en Australia, Indonesia, India y el sur de África; lluvias e inundaciones en Perú y Ecuador."],
  nina: ["Invierno más seco y cálido en el norte de México: sequía en Sonora, Chihuahua, Coahuila, Nuevo León y Tamaulipas.",
    "Verano con más lluvia en el sur y sureste de México.",
    "Más huracanes en el Atlántico y el Golfo de México.",
    "En el mundo: sequía en Argentina, Uruguay y el sur de Brasil; más lluvia en Australia e Indonesia."],
  neutral: ["Sin influencia fuerte del Pacífico ecuatorial: el clima depende más de otros factores (Atlántico, Oscilación Madden-Julian, etc.)."] };

export function intensidadOni(v) {
  const a = Math.abs(v);
  return a < 0.5 ? "neutral" : a < 1 ? "débil" : a < 1.5 ? "moderado" : a < 2 ? "fuerte" : "muy fuerte";
}

/** Barras del ONI (anomalía trimestral, °C) con las líneas de ±0.5. */
export function graficaOni(serie) {
  const s = (serie || []).filter((x) => Array.isArray(x) && Number.isFinite(x[1]));
  if (!s.length) return "";
  const lim = Math.max(1, ...s.map((x) => Math.abs(x[1]))), alto = 90, mitad = alto / 2, ancho = 300, paso = ancho / s.length;
  const y = (v) => mitad - (v / lim) * (mitad - 6);
  const rects = s.map(([t, v], i) => { const y0 = Math.min(y(v), mitad), h = Math.max(1, Math.abs(y(v) - mitad));
    return `<rect x="${(i * paso).toFixed(1)}" y="${y0.toFixed(1)}" width="${Math.max(1, paso - 1).toFixed(1)}" height="${h.toFixed(1)}" fill="${FASE_ENSO[v >= 0.5 ? "nino" : v <= -0.5 ? "nina" : "neutral"][1]}"><title>${esc(t)}: ${v > 0 ? "+" : ""}${v} °C</title></rect>`; }).join("");
  return `<h4>Índice ONI (anomalía de la temperatura del mar en Niño 3.4, °C)</h4>
    <svg class="graf-barras" viewBox="0 0 ${ancho} ${alto + 14}" role="img" aria-label="Serie del índice ONI">
      <line x1="0" x2="${ancho}" y1="${mitad}" y2="${mitad}" stroke="currentColor" stroke-width="0.5"/>
      <line x1="0" x2="${ancho}" y1="${y(0.5)}" y2="${y(0.5)}" stroke="#C62828" stroke-dasharray="3 2"/><line x1="0" x2="${ancho}" y1="${y(-0.5)}" y2="${y(-0.5)}" stroke="#1F6FB2" stroke-dasharray="3 2"/>
      ${rects}<text x="0" y="${alto + 11}" font-size="9" fill="currentColor">${esc(s[0][0])}</text><text x="${ancho}" y="${alto + 11}" font-size="9" text-anchor="end" fill="currentColor">${esc(s[s.length - 1][0])}</text></svg>
    <p class="meta">Rojo: +0.5 °C o más (umbral de El Niño). Azul: −0.5 °C o menos (La Niña). Cada barra es un promedio de 3 meses (DJF = dic-ene-feb).</p>`;
}

export function filasEnso(p) {
  const [nombre] = FASE_ENSO[p.fase_oni] || ["—"];
  return [["Estado oficial (NOAA)", p.estado || "—"], ["Índice ONI más reciente", `${p.oni > 0 ? "+" : ""}${num(p.oni, 2)} °C (${esc(p.oni_trimestre)}): ${nombre} ${intensidadOni(p.oni)}`],
    [`Anomalía semanal en ${p.nombre}`, p.anomalia == null ? "—" : `${p.anomalia > 0 ? "+" : ""}${num(p.anomalia)} °C (semana del ${esc(p.semana)})`],
    ...(p.sinopsis_en ? [["Resumen de NOAA (en inglés)", p.sinopsis_en]] : []), ...(p.emitido ? [["Discusión emitida", p.emitido]] : [])];
}

export function extraEnso(p) {
  const fase = p.fase_oni || "neutral";
  return `${graficaOni(p.oni_serie)}<div class="efectos" style="--c:${FASE_ENSO[fase][1]}"><b>Efectos típicos de ${esc(FASE_ENSO[fase][0])} (tendencias, no certezas):</b>
    <ul>${(IMPACTOS_ENSO[fase] || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    <p class="meta">Resumen propio de las relaciones descritas por NOAA y el SMN. Cada episodio es distinto; usa el pronóstico estacional del SMN para México.</p></div>`;
}

// ---------------------------------------------------------------- asteroides

export function filasNeo(p) {
  const [a, b] = p.diametro_m || [];
  return [["Máximo acercamiento", p.fecha_utc ? fechaCorta(p.fecha_utc) : "—"], ["Distancia", `${num(p.dist_ld, 2)} distancias lunares (${Number(p.dist_km || 0).toLocaleString("es-MX")} km)`],
    ["Velocidad relativa", `${num(p.vel_kms)} km/s`], ["Tamaño estimado", a ? (a === b ? `${a} m` : `${a} a ${b} m (según qué tan oscuro sea)`) : "—"],
    ["Incertidumbre de la hora", p.incertidumbre || "—"], ["Punto del mapa", p.sin_ubicacion ? "Sin trayectoria de JPL Horizons: ubicación no disponible" : "Lugar de la Tierra que lo tiene justo encima (cenit) en el máximo acercamiento"],
    ["¿Riesgo?", "Ninguno: la lista es de pasos cercanos ya calculados, no de impactos. Los objetos con alguna probabilidad de impacto están en la tabla Sentry de la NASA."]];
}

/** Trayectoria vista desde «arriba» del plano del paso: Tierra al centro, órbita de la Luna (1 distancia lunar) y el recorrido de ±2 días. */
export function svgTrayectoria(p) {
  const pts = (p.trayectoria_ld || []).filter((x) => Array.isArray(x) && x.length === 2);
  if (pts.length < 2) return "";
  // La escala se ajusta al punto más cercano (no a toda la recta), así el paso y la órbita de la Luna siempre se ven.
  const dmin = Math.min(...pts.map(([x, y]) => Math.hypot(x, y)));
  const lim = Math.max(1.3, dmin * 1.4);
  const T = 120, k = (T - 6) / lim, X = (v) => (T + v * k).toFixed(1), Y = (v) => (T - v * k).toFixed(1);
  const visibles = pts.filter(([x, y]) => Math.abs(x) <= lim && Math.abs(y) <= lim);
  const ca = pts.reduce((m, q) => (q[0] ** 2 + q[1] ** 2 < m[0] ** 2 + m[1] ** 2 ? q : m));
  const tierra = Math.max(2.5, (6371 / 384400) * k);
  return `<h4>Trayectoria (±2 días alrededor del máximo acercamiento)</h4>
    <svg class="graf-tray" viewBox="0 0 ${2 * T} ${2 * T}" role="img" aria-label="Trayectoria del asteroide respecto a la Tierra y la órbita de la Luna">
      <circle cx="${T}" cy="${T}" r="${k.toFixed(1)}" fill="none" stroke="#8D99A6" stroke-dasharray="4 3"/><text x="${T}" y="${(T - k - 3).toFixed(1)}" text-anchor="middle" font-size="9" fill="currentColor">órbita de la Luna</text>
      <circle cx="${T}" cy="${T}" r="${tierra.toFixed(1)}" fill="#1F6FB2"/><text x="${T + 6}" y="${T + 12}" font-size="9" fill="currentColor">Tierra</text>
      <polyline fill="none" stroke="#E2711D" stroke-width="2" points="${visibles.map(([x, y]) => `${X(x)},${Y(y)}`).join(" ")}"/>
      <circle cx="${X(ca[0])}" cy="${Y(ca[1])}" r="4" fill="#C62828"/><line x1="${T}" y1="${T}" x2="${X(ca[0])}" y2="${Y(ca[1])}" stroke="#C62828" stroke-width="0.8" stroke-dasharray="2 2"/>
      <text x="${X(ca[0])}" y="${(Number(Y(ca[1])) - 7).toFixed(1)}" text-anchor="middle" font-size="9" fill="#C62828">${esc(num(p.dist_ld, 2))} DL</text></svg>
    <p class="meta">Escala: el círculo punteado es la órbita de la Luna (1 distancia lunar, DL = 384 400 km). La línea naranja es el paso del objeto en 4 días; el punto rojo, el momento más cercano. Datos: NASA/JPL Horizons.</p>`;
}

// ---------------------------------------------------------------- cielo: lluvias, cometas, bólidos, calendario

export function filasCielo(p) {
  if (p.kind === "lluvia") {
    return [["Activa", `${p.inicio} a ${p.fin}${p.activa ? " (activa ahora)" : ""}`], ["Máximo", `${p.maximo} (±1 día)`],
      ["Meteoros por hora (ZHR)", `${p.zhr} con cielo ideal; en la práctica, menos`], ["Velocidad", `${p.vel_kms} km/s`], ["Origen", p.padre],
      ["Luna en el máximo", `${Math.round((p.luna_en_maximo ?? 0) * 100)} % iluminada${(p.luna_en_maximo ?? 0) > 0.6 ? " (estorba: mejor antes de que salga)" : ""}`],
      ["Desde dónde se ve", `Latitudes ${p.lat_desde}° a ${p.lat_hasta}° (radiante a 20° o más sobre el horizonte); mejor después de medianoche, lejos de la ciudad`]];
  }
  return [["Magnitud estimada hoy", `${num(p.magnitud)} ${p.simple_vista ? "(a simple vista en cielo oscuro)" : p.magnitud <= 9 ? "(con binoculares)" : "(con telescopio pequeño)"}`],
    ["Perihelio (más cerca del Sol)", p.perihelio || "—"], ...(p.mag_pico ? [["Brillo máximo previsto", `${p.mag_pico} (${p.fecha_pico})`]] : []),
    ["Separación del Sol", p.elongacion == null ? "—" : `${p.elongacion}°${p.cerca_del_sol ? " (muy cerca del Sol: difícil de ver)" : ""}`],
    ["Desde dónde se ve", `Latitudes ${p.lat_desde}° a ${p.lat_hasta}°`], ["Posición (AR, Dec)", `${num(p.ar)}°, ${num(p.dec)}°`]];
}

export function filasBolido(p) {
  return [["Fecha", fechaCorta(p.fecha_utc)], ["Energía de impacto estimada", p.energia_kt == null ? "—" : `${p.energia_kt} kilotones de TNT`],
    ["Altura de la explosión", p.altura_km == null ? "—" : `${p.altura_km} km`], ["Velocidad", p.vel_kms == null ? "—" : `${p.vel_kms} km/s`],
    ["Qué es", "Un meteoro muy brillante (bólido) detectado por sensores del gobierno de EUA. Casi todos se desintegran en el aire, sobre el océano."]];
}

export function htmlCalendario(cal) {
  if (!cal) return "";
  const fases = (cal.fases || []).slice(0, 4).map((f) => `<li>${esc(f.fase)}: ${esc(fechaCorta(f.fecha_utc))}</li>`).join("");
  const ecl = (cal.eclipses_solares || []).map((e) => `<li>${esc(e.nombre)}</li>`).join("");
  return `<div class="efectos" style="--c:#5B6C8F"><b>Calendario del cielo</b><p class="meta">Luna hoy: ${Math.round((cal.luna_hoy ?? 0) * 100)} % iluminada.</p>
    <ul>${fases}</ul>${ecl ? `<b>Próximos eclipses de Sol</b><ul>${ecl}</ul><p class="meta">Mapas de la franja de cada eclipse: <a href="https://science.nasa.gov/eclipses/future-eclipses/" target="_blank" rel="noopener noreferrer">NASA</a>.</p>` : ""}
    <p class="meta">Fuente: USNO (Observatorio Naval de EUA).</p></div>`;
}
