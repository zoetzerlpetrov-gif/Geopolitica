// Lógica de analitica.html (Data & Analytics). Funciones puras sobre data/historial-estadisticas.json, events.json y
// los manifiestos de fuentes. Sin red: la página pide los datos y se los pasa.

/** Serie diaria de una métrica: `clave` = "total" | "area:<id>" | "pais:<ISO3>" | "sev:<n>". */
export function serie(dias, clave) {
  const [tipo, id] = clave.includes(":") ? clave.split(":") : [clave, null];
  return dias.map((d) => ({ dia: d.dia, n: tipo === "total" ? d.total : tipo === "area" ? d.areas?.[id] || 0 : tipo === "pais" ? d.paises?.[id] || 0 : d.sev?.[id] || 0 }));
}

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
const desv = (v) => { const m = media(v); return Math.sqrt(media(v.map((x) => (x - m) ** 2))); };

/**
 * Alerta de anomalía: compara el promedio de los últimos `reciente` días con la línea base anterior (media y desviación
 * estándar de los días previos). z = (reciente − media) / desviación. |z| ≥ 2 suele marcarse como inusual.
 */
export function anomalia(valores, reciente = 7, minimoBase = 7) {
  if (valores.length < reciente + minimoBase) return null;
  const base = valores.slice(0, -reciente), ult = valores.slice(-reciente);
  const m = media(base), s = desv(base), r = media(ult);
  const z = s > 0 ? (r - m) / s : r > m ? Infinity : 0;
  return { media_base: Math.round(m * 10) / 10, media_reciente: Math.round(r * 10) / 10, z: Number.isFinite(z) ? Math.round(z * 100) / 100 : z,
    cambio_pct: m > 0 ? Math.round(((r - m) / m) * 100) : null };
}

/** Países con mayor aumento: eventos por día en los últimos `reciente` días contra los `base` días anteriores. */
export function paisesAlza(dias, reciente = 7, base = 21, minimo = 5) {
  const ult = dias.slice(-reciente), prev = dias.slice(-(reciente + base), -reciente);
  const suma = (lista) => { const s = {}; for (const d of lista) for (const [p, n] of Object.entries(d.paises || {})) s[p] = (s[p] || 0) + n; return s; };
  const a = suma(ult), b = suma(prev);
  return Object.keys(a).map((p) => {
    const r = a[p] / Math.max(1, ult.length), pb = (b[p] || 0) / Math.max(1, prev.length);
    return { pais: p, reciente: Math.round(r * 10) / 10, previo: Math.round(pb * 10) / 10, total: a[p], razon: pb > 0 ? Math.round((r / pb) * 10) / 10 : null };
  }).filter((x) => x.total >= minimo).sort((x, y) => (y.razon ?? 99) - (x.razon ?? 99) || y.total - x.total);
}

/** Puntos de una polilínea SVG para una serie (ancho w, alto h, margen m). */
export function polilinea(valores, w = 600, h = 160, m = 4) {
  const max = Math.max(1, ...valores), n = Math.max(1, valores.length - 1);
  return valores.map((v, i) => `${Math.round((m + (i * (w - 2 * m)) / n) * 10) / 10},${Math.round((h - m - (v / max) * (h - 2 * m)) * 10) / 10}`).join(" ");
}

/** Conteo de eventos por área y por severidad de un país en events.json (los eventos vigentes). */
export function perfilPais(eventos, iso) {
  const evs = eventos.filter((e) => e.pais_iso3 === iso);
  const areas = {};
  for (const e of evs) areas[e.area_principal] = (areas[e.area_principal] || 0) + 1;
  return { total: evs.length, graves: evs.filter((e) => e.severidad >= 4).length, areas };
}

/** Indicadores del Banco Mundial para el comparador (código → nombre, unidad, decimales). */
export const INDICADORES_BM = [
  ["NY.GDP.MKTP.KD.ZG", "Crecimiento del PIB", "%", 1],
  ["FP.CPI.TOTL.ZG", "Inflación", "%", 1],
  ["NY.GDP.PCAP.CD", "PIB por habitante", "USD", 0],
  ["SL.UEM.TOTL.ZS", "Desempleo", "%", 1],
  ["PV.EST", "Estabilidad política (−2.5 a +2.5)", "", 2],
  ["CC.EST", "Control de la corrupción (−2.5 a +2.5)", "", 2],
  ["VC.IHR.PSRC.P5", "Homicidios por 100 mil", "", 1],
  ["SP.POP.TOTL", "Población", "", 0],
];
export const leerBM = (d) => { const v = d?.[1]?.[0]; return v && v.value != null ? { valor: Number(v.value), anio: v.date } : null; };

/**
 * Frescura de cada fuente: horas desde su última actualización contra lo esperado. `fuentes` = [{nombre, actualizado, cada_h}].
 * Estado: «al día» (≤ 1.5× lo esperado), «atrasada» (≤ 4×) o «detenida».
 */
export function frescura(fuentes, ahora = new Date()) {
  return fuentes.map((f) => {
    const t = Date.parse(f.actualizado || "");
    if (!Number.isFinite(t)) return { ...f, horas: null, estado: "sin dato" };
    const h = Math.round(((ahora - t) / 3600000) * 10) / 10;
    const lim = f.cada_h || 24;
    return { ...f, horas: h, estado: h <= lim * 1.5 ? "al día" : h <= lim * 4 ? "atrasada" : "detenida" };
  });
}

/** Eventos → CSV (para Excel o Power BI). Solo campos públicos; nunca texto completo de la nota. */
export function eventosCSV(eventos) {
  const cols = ["fecha_utc", "pais_iso3", "area_principal", "severidad", "titulo", "fuente", "url", "lat", "lon"];
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...eventos.map((e) => cols.map((c) => q(e[c])).join(","))].join("\n");
}

/** Prompt para que la IA explique una serie: solo cifras agregadas (sin datos personales). */
export function promptSerie(nombre, puntos, alerta) {
  return `Serie diaria de eventos registrados por DOMINUS OSINT: «${nombre}».\nDatos (día: eventos): ${puntos.map((p) => `${p.dia}: ${p.n}`).join("; ")}.\n`
    + (alerta ? `Prueba de anomalía: media de los días previos ${alerta.media_base}, media de los últimos 7 días ${alerta.media_reciente}, z = ${alerta.z}.\n` : "")
    + "Explica en español, en máximo 8 líneas: qué tendencia muestra, si el cambio reciente parece relevante o puede ser ruido "
    + "(recuerda que el número de eventos depende también de cuántas noticias se publican y de cómo se capturan), y qué revisarías para confirmarlo. "
    + "Usa lenguaje de probabilidad tipo ICD 203 (probable, improbable…). No inventes hechos que no estén en los datos.";
}

// ------------------------------------------------------------------ esquema, gráfico y mapa del resultado SQL

/** Tablas que se cargan en DuckDB, con columnas, tipo y significado; `rel` = relaciones (para el diagrama). */
export const ESQUEMA = {
  eventos: { desc: "Eventos vigentes en el mapa (una fila por evento).", cols: [
    ["id", "VARCHAR", "Identificador del evento"], ["fecha_utc", "TIMESTAMP", "Fecha y hora de publicación (UTC)"], ["titulo", "VARCHAR", "Título de la nota"],
    ["fuente", "VARCHAR", "Medio o institución"], ["url", "VARCHAR", "Enlace original"], ["pais_iso3", "VARCHAR", "País (ISO de 3 letras) → paises.iso3"],
    ["region", "VARCHAR", "Región del mundo (código, p. ej. norteamerica)"], ["lat", "DOUBLE", "Latitud"], ["lon", "DOUBLE", "Longitud"], ["area_principal", "VARCHAR", "Área temática → areas.id"],
    ["severidad", "INTEGER", "1 (baja) a 5 (crítica)"], ["tipo_fuente", "VARCHAR", "noticia, base_datos, red_social o analisis"], ["verificado", "BOOLEAN", "Confirmado por varias fuentes"],
    ["confianza_clasificacion", "DOUBLE", "Confianza del clasificador (0 a 1)"]] },
  conteos: { desc: "Historial diario de hasta 90 días (una fila por día, tipo y clave).", cols: [
    ["dia", "DATE", "Día (UTC)"], ["tipo", "VARCHAR", "area, pais o sev"], ["clave", "VARCHAR", "id del área, ISO3 del país o severidad (según tipo)"], ["n", "INTEGER", "Eventos ese día"]] },
  paises: { desc: "Catálogo de países (nombre en español e inglés, región y centro).", cols: [
    ["iso3", "VARCHAR", "Código ISO de 3 letras (llave)"], ["nombre", "VARCHAR", "Nombre en español"], ["nombre_en", "VARCHAR", "Nombre en inglés"],
    ["region", "VARCHAR", "Región (código)"], ["region_nombre", "VARCHAR", "Región con nombre legible"], ["lat", "DOUBLE", "Latitud del centro"], ["lon", "DOUBLE", "Longitud del centro"]] },
  areas: { desc: "Catálogo de áreas temáticas.", cols: [["id", "VARCHAR", "Identificador (llave)"], ["nombre", "VARCHAR", "Nombre del área"]] },
};
export const RELACIONES = [
  ["eventos", "pais_iso3", "paises", "iso3", "muchos a uno"],
  ["eventos", "area_principal", "areas", "id", "muchos a uno"],
  ["conteos", "clave", "paises", "iso3", "cuando tipo = 'pais'"],
  ["conteos", "clave", "areas", "id", "cuando tipo = 'area'"],
];

/** Consultas de ejemplo de la pestaña SQL ([nombre, consulta]). Se probaron con DuckDB sobre los datos publicados;
 *  los ::INTEGER y ROUND dejan la salida limpia (sin decimales sobrantes ni sumas DECIMAL). */
export const EJEMPLOS = [
  ["Eventos por área (vigentes)", "SELECT a.nombre AS area, COUNT(*) AS eventos, ROUND(AVG(e.severidad), 2) AS sev_media\nFROM eventos e LEFT JOIN areas a ON a.id = e.area_principal\nGROUP BY 1 ORDER BY 2 DESC;"],
  ["Países con más eventos graves", "SELECT p.nombre AS pais, e.pais_iso3, COUNT(*) AS graves\nFROM eventos e JOIN paises p ON p.iso3 = e.pais_iso3\nWHERE e.severidad >= 4\nGROUP BY 1, 2 ORDER BY 3 DESC LIMIT 20;"],
  ["Tendencia diaria de un país", "SELECT dia, n FROM conteos WHERE tipo = 'pais' AND clave = 'MEX' ORDER BY dia;"],
  ["Promedio móvil de 7 días de un país", "SELECT dia, n,\n  ROUND(AVG(n) OVER (ORDER BY dia ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 1) AS media_7d\nFROM conteos WHERE tipo = 'pais' AND clave = 'MEX' ORDER BY dia;"],
  ["Eventos graves con ubicación (mapa)", "SELECT titulo, fuente, severidad, lat, lon\nFROM eventos WHERE severidad >= 4 AND lat IS NOT NULL\nORDER BY fecha_utc DESC LIMIT 200;"],
  ["Eventos por país en el mapa (burbujas)", "SELECT p.nombre AS pais, p.lat, p.lon, COUNT(*) AS eventos\nFROM eventos e JOIN paises p ON p.iso3 = e.pais_iso3\nWHERE p.lat IS NOT NULL\nGROUP BY 1, 2, 3 ORDER BY 4 DESC;"],
  ["Eventos por región del mundo", "SELECT p.region_nombre AS region, COUNT(*) AS eventos\nFROM eventos e JOIN paises p ON p.iso3 = e.pais_iso3\nGROUP BY 1 ORDER BY 2 DESC;"],
  ["Área más frecuente en cada región", "SELECT p.region_nombre AS region, a.nombre AS area, COUNT(*) AS eventos\nFROM eventos e JOIN paises p ON p.iso3 = e.pais_iso3 JOIN areas a ON a.id = e.area_principal\nGROUP BY 1, 2\nQUALIFY ROW_NUMBER() OVER (PARTITION BY p.region_nombre ORDER BY COUNT(*) DESC, a.nombre) = 1\nORDER BY 3 DESC;"],
  ["Cuántos eventos hay de cada severidad (%)", "SELECT severidad::VARCHAR AS severidad, COUNT(*) AS eventos,\n  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS porcentaje\nFROM eventos GROUP BY 1 ORDER BY 1;"],
  ["Severidad media por país (mínimo 10 eventos)", "SELECT p.nombre AS pais, COUNT(*) AS eventos, ROUND(AVG(e.severidad), 2) AS sev_media,\n  COUNT(*) FILTER (WHERE e.severidad >= 4) AS graves\nFROM eventos e JOIN paises p ON p.iso3 = e.pais_iso3\nGROUP BY 1 HAVING COUNT(*) >= 10\nORDER BY 3 DESC, 2 DESC LIMIT 25;"],
  ["Eventos graves por día (historial)", "SELECT dia, SUM(n)::INTEGER AS graves\nFROM conteos WHERE tipo = 'sev' AND clave IN ('4', '5')\nGROUP BY 1 ORDER BY 1;"],
  ["Semana contra semana por área", "WITH s AS (\n  SELECT clave AS area, date_trunc('week', dia)::DATE AS semana, SUM(n)::INTEGER AS n\n  FROM conteos WHERE tipo = 'area' GROUP BY 1, 2)\nSELECT a.nombre AS area, s.semana, s.n, s.n - LAG(s.n) OVER (PARTITION BY s.area ORDER BY s.semana) AS cambio\nFROM s LEFT JOIN areas a ON a.id = s.area\nORDER BY 1, 2;"],
  ["Países que más suben (7 días contra 7 previos)", "WITH u AS (SELECT MAX(dia) AS fin FROM conteos),\nc AS (\n  SELECT clave,\n    SUM(n) FILTER (WHERE dia > fin - 7)::INTEGER AS ultimos_7,\n    SUM(n) FILTER (WHERE dia <= fin - 7 AND dia > fin - 14)::INTEGER AS previos_7\n  FROM conteos, u WHERE tipo = 'pais' GROUP BY 1)\nSELECT p.nombre AS pais, COALESCE(ultimos_7, 0) AS ultimos_7, COALESCE(previos_7, 0) AS previos_7,\n  COALESCE(ultimos_7, 0) - COALESCE(previos_7, 0) AS cambio\nFROM c JOIN paises p ON p.iso3 = c.clave\nORDER BY cambio DESC LIMIT 20;"],
  ["Eventos por día de publicación", "SELECT CAST(fecha_utc AS DATE) AS dia, COUNT(*) AS eventos\nFROM eventos GROUP BY 1 ORDER BY 1;"],
  ["Eventos por hora del día (UTC)", "SELECT lpad(hour(fecha_utc)::VARCHAR, 2, '0') || ':00' AS hora_utc, COUNT(*) AS eventos\nFROM eventos GROUP BY 1 ORDER BY 1;"],
  ["Fuentes que más aportan", "SELECT fuente, COUNT(*) AS eventos FROM eventos GROUP BY 1 ORDER BY 2 DESC LIMIT 25;"],
  ["Tipo de fuente y % verificado", "SELECT tipo_fuente, COUNT(*) AS eventos,\n  COUNT(*) FILTER (WHERE verificado) AS verificados,\n  ROUND(100.0 * COUNT(*) FILTER (WHERE verificado) / COUNT(*), 1) AS pct_verificado\nFROM eventos GROUP BY 1 ORDER BY 2 DESC;"],
  ["Buscar una palabra en los títulos", "SELECT fecha_utc, titulo, fuente, url\nFROM eventos\nWHERE regexp_matches(titulo, '(?i)\\bpetr[oó]leo|\\boil\\b')\nORDER BY fecha_utc DESC LIMIT 50;"],
  ["Clasificaciones dudosas (confianza < 0.5)", "SELECT ROUND(e.confianza_clasificacion, 2) AS confianza, a.nombre AS area, e.titulo, e.fuente\nFROM eventos e LEFT JOIN areas a ON a.id = e.area_principal\nWHERE e.confianza_clasificacion < 0.5\nORDER BY 1 LIMIT 50;"],
  ["Calidad de datos: campos vacíos", "SELECT COUNT(*) AS eventos,\n  COUNT(*) FILTER (WHERE pais_iso3 IS NULL) AS sin_pais,\n  COUNT(*) FILTER (WHERE lat IS NULL OR lon IS NULL) AS sin_coordenadas,\n  COUNT(*) FILTER (WHERE url IS NULL) AS sin_enlace\nFROM eventos;"],
  ["Países del catálogo sin eventos vigentes", "SELECT p.nombre AS pais, p.region_nombre AS region\nFROM paises p\nWHERE NOT EXISTS (SELECT 1 FROM eventos e WHERE e.pais_iso3 = p.iso3)\nORDER BY 2, 1;"],
];

/** Diagrama entidad-relación en SVG (cajas con columnas y líneas entre llaves). */
export function diagramaER(esquema = ESQUEMA, relaciones = RELACIONES) {
  const fila = 17, ancho = 300, alto = (t) => 24 + (esquema[t]?.cols.length || 0) * fila + 8;
  // Cada tabla de la derecha va debajo de la anterior y «conteos» debajo de «eventos»: las posiciones salen de la altura
  // real de cada caja (antes eran fijas y la última quedaba cortada al pie del dibujo).
  const pos = { eventos: [10, 10], paises: [420, 10] };
  pos.conteos = [10, 10 + alto("eventos") + 30];
  pos.areas = [420, 10 + alto("paises") + 30];
  const cajas = Object.entries(esquema).map(([t, d]) => {
    const [x, y] = pos[t] || [10, 10];
    return `<g><rect x="${x}" y="${y}" width="${ancho}" height="${alto(t)}" rx="6" class="er-caja"/>
      <text x="${x + 8}" y="${y + 17}" class="er-tit">${t}</text>`
      + d.cols.map(([c, ti], i) => `<text x="${x + 10}" y="${y + 40 + i * fila}" class="er-col">${c}</text><text x="${x + ancho - 8}" y="${y + 40 + i * fila}" text-anchor="end" class="er-tipo">${ti}</text>`).join("") + "</g>";
  }).join("");
  const yCol = (t, c) => pos[t][1] + 36 + esquema[t].cols.findIndex((k) => k[0] === c) * fila;
  const lineas = relaciones.map(([t1, c1, t2, c2, nota], i) => {
    const x1 = pos[t1][0] + ancho, y1 = yCol(t1, c1), x2 = pos[t2][0], y2 = yCol(t2, c2), xm = x1 + (x2 - x1) * (i + 1) / (relaciones.length + 1); // un carril vertical por relación: no se enciman
    return `<path d="M${x1} ${y1} H${xm} V${y2} H${x2}" class="er-rel${nota.startsWith("cuando") ? " er-cond" : ""}"><title>${t1}.${c1} → ${t2}.${c2} (${nota})</title></path><circle cx="${x2}" cy="${y2}" r="3" class="er-punta"/>`;
  }).join("");
  const H = Math.max(...Object.keys(esquema).map((t) => (pos[t] || [0, 10])[1] + alto(t))) + 12;
  return `<svg viewBox="0 0 730 ${H}" class="er" role="img" aria-label="Diagrama de tablas y relaciones">${lineas}${cajas}</svg>`;
}

const esNumero = (v) => typeof v === "number" || typeof v === "bigint";

/**
 * Valor de DuckDB-WASM (Apache Arrow) → valor de JavaScript legible y exportable. Medido con duckdb-wasm 1.29:
 *  - DATE (typeId 8) y TIMESTAMP (10) llegan como milisegundos → «AAAA-MM-DD» y «AAAA-MM-DD HH:MM UTC».
 *  - BIGINT (COUNT, enteros) llega como BigInt → Number (JSON.stringify falla con BigInt).
 *  - DECIMAL (7; SUM de enteros, columnas DECIMAL) llega como objeto con el entero SIN escala («12.34» → «1234»).
 * `tipo` = {id, escala} del campo (schema.fields[i].type.typeId / .scale).
 */
export function valorJS(v, tipo = {}) {
  if (v == null) return null;
  if (tipo.id === 8 || tipo.id === 10 || v instanceof Date) {
    const ms = v instanceof Date ? v.getTime() : Number(v);
    if (!Number.isFinite(ms)) return String(v);
    const iso = new Date(ms).toISOString();
    return tipo.id === 8 ? iso.slice(0, 10) : iso.slice(11, 19) === "00:00:00" ? iso.slice(0, 10) : `${iso.slice(0, 16).replace("T", " ")} UTC`;
  }
  if (tipo.id === 7) {
    const txt = String(v), neg = txt.startsWith("-"), dig = (neg ? txt.slice(1) : txt).padStart((tipo.escala || 0) + 1, "0");
    const e = tipo.escala || 0, s = `${neg ? "-" : ""}${e ? `${dig.slice(0, -e)}.${dig.slice(-e)}` : dig}`;
    const n = Number(s);
    return Number.isFinite(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER ? n : s;
  }
  if (typeof v === "bigint") return v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v.toString();
  if (typeof v === "object") return JSON.parse(JSON.stringify(v, (_, x) => (typeof x === "bigint" ? Number(x) : x)));
  return v;
}

/** Filas de un resultado Arrow → objetos con valores de `valorJS`. */
export function filasJS(campos, filas) {
  const tipos = campos.map((f) => [f.name, { id: f.type?.typeId, escala: f.type?.scale }]);
  return filas.map((f) => Object.fromEntries(tipos.map(([c, t]) => [c, valorJS(f[c], t)])));
}
const COLS_GEO = /^(lat|lon|lng|latitud|longitud|latitude|longitude)$/i;

/** ¿Qué gráfico conviene? Primera columna de texto o fecha como eje y hasta 3 columnas numéricas como series. */
export function sugerirGrafico(cols, filas) {
  if (!filas.length || filas.length > 2000) return null;
  const numericas = cols.filter((c) => !COLS_GEO.test(c) && filas.every((f) => f[c] == null || esNumero(f[c])) && filas.some((f) => f[c] != null));
  const etiqueta = cols.find((c) => !numericas.includes(c) && !COLS_GEO.test(c));
  if (!numericas.length || !etiqueta) return null;
  const fechas = filas.every((f) => /^\d{4}-\d{2}-\d{2}/.test(String(f[etiqueta] ?? "")) || f[etiqueta] instanceof Date || typeof f[etiqueta] === "number");
  return { tipo: fechas && filas.length > 2 ? "linea" : "barras", x: etiqueta, ys: numericas.slice(0, 3) };
}

const COLORES = ["#C8102E", "#1565C0", "#2E7D32"];
const corto = (s, n = 16) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const escSVG = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Gráfico SVG (barras horizontales hasta 25 categorías, o líneas para series de tiempo). `etiquetaX`: texto legible del eje. */
export function graficoSVG(sug, filas, etiquetaX = (v) => String(v ?? "")) {
  if (!sug) return "";
  const num = (v) => (v == null ? 0 : Number(v));
  if (sug.tipo === "barras") {
    const datos = filas.slice(0, 25), y = sug.ys[0], max = Math.max(1, ...datos.map((f) => num(f[y])));
    const alto = 24 + datos.length * 22;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 ${alto}" class="graf-res" role="img" aria-label="Gráfico de barras">
      <text x="4" y="14" class="g-tit">${escSVG(y)}${filas.length > 25 ? " (primeras 25 filas)" : ""}</text>`
      + datos.map((f, i) => {
        const w = Math.max(1, Math.round((num(f[y]) / max) * 430));
        return `<text x="160" y="${36 + i * 22}" text-anchor="end" class="g-et">${escSVG(corto(etiquetaX(f[sug.x]), 24))}</text>
          <rect x="166" y="${24 + i * 22}" width="${w}" height="16" fill="${COLORES[0]}" rx="2"/><text x="${172 + w}" y="${36 + i * 22}" class="g-val">${escSVG(num(f[y]).toLocaleString("es-MX"))}</text>`;
      }).join("") + "</svg>";
  }
  const W = 700, H = 240, m = 34, n = Math.max(1, filas.length - 1);
  const max = Math.max(1, ...filas.flatMap((f) => sug.ys.map((y) => num(f[y]))));
  const px = (i) => m + (i * (W - 2 * m)) / n, py = (v) => H - m - (v / max) * (H - 2 * m);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="graf-res" role="img" aria-label="Gráfico de líneas">
    <line x1="${m}" y1="${H - m}" x2="${W - m}" y2="${H - m}" stroke="#999"/><text x="${m}" y="16" class="g-val">máx. ${max.toLocaleString("es-MX")}</text>`
    + sug.ys.map((y, k) => `<polyline fill="none" stroke="${COLORES[k]}" stroke-width="2" points="${filas.map((f, i) => `${px(i).toFixed(1)},${py(num(f[y])).toFixed(1)}`).join(" ")}"/>
      <text x="${W - m}" y="${16 + k * 14}" text-anchor="end" fill="${COLORES[k]}" class="g-val">${escSVG(y)}</text>`).join("")
    + `<text x="${m}" y="${H - 10}" class="g-et">${escSVG(String(filas[0][sug.x]).slice(0, 10))}</text><text x="${W - m}" y="${H - 10}" text-anchor="end" class="g-et">${escSVG(String(filas.at(-1)[sug.x]).slice(0, 10))}</text></svg>`;
}

/**
 * Puntos para el mapa pequeño: columnas lat/lon, o una columna con códigos ISO3 de país (se ubica en su centro).
 * Devuelve [{lon, lat, etiqueta, valor}] o null si el resultado no tiene geografía.
 */
export function puntosMapa(cols, filas, paises = {}) {
  const la = cols.find((c) => /^(lat|latitud|latitude)$/i.test(c)), lo = cols.find((c) => /^(lon|lng|longitud|longitude)$/i.test(c));
  const valor = cols.find((c) => !COLS_GEO.test(c) && filas.some((f) => esNumero(f[c])));
  if (la && lo) {
    const pts = filas.filter((f) => Number.isFinite(Number(f[la])) && Number.isFinite(Number(f[lo])) && f[la] != null)
      .map((f) => ({ lon: Number(f[lo]), lat: Number(f[la]), etiqueta: String(f[cols.find((c) => !COLS_GEO.test(c)) ?? la] ?? ""), valor: valor ? Number(f[valor]) : 1 }));
    return pts.length ? pts : null;
  }
  const iso = cols.find((c) => filas.length && filas.filter((f) => typeof f[c] === "string" && paises[f[c]]).length >= Math.max(1, filas.length * 0.6));
  if (!iso) return null;
  return filas.filter((f) => paises[f[iso]]).map((f) => ({ lon: paises[f[iso]].lon, lat: paises[f[iso]].lat, etiqueta: paises[f[iso]].es || f[iso], valor: valor ? Number(f[valor] ?? 0) : 1 }));
}

/** «MEX» → «México (MEX)»; si no se conoce, el código tal cual. */
export const nombrePais = (paises, iso) => (paises?.[iso]?.es ? `${paises[iso].es} (${iso})` : String(iso ?? ""));

/** Texto del comparador → ISO3: acepta códigos o nombres en español/inglés, con o sin acentos. */
export function resolverPaises(texto, paises, max = 5) {
  const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const porNombre = {};
  for (const [iso, p] of Object.entries(paises || {})) { porNombre[norm(p.es || "")] = iso; porNombre[norm(p.en || "")] = iso; }
  const out = [];
  for (const parte of String(texto).split(/[,;\n]+/)) {
    const t = parte.trim();
    if (!t) continue;
    const iso = /^[A-Za-z]{3}$/.test(t) && paises?.[t.toUpperCase()] ? t.toUpperCase() : porNombre[norm(t)] || (/^[A-Za-z]{3}$/.test(t) ? t.toUpperCase() : null);
    if (iso && !out.includes(iso)) out.push(iso);
  }
  return out.slice(0, max);
}
