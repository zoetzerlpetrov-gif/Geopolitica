// Mapa del traslado (Continuidad familiar). SVG dibujado en el navegador con el contorno de países del propio sitio
// (data/base/countries-110m.geojson): sin mosaicos ni servicios externos, así que no sale ningún dato de la familia.
// Los puntos son genéricos (ciudad o región) y vienen de la plantilla; la fecha de llegada que registra la familia
// solo se usa aquí para resaltar el destino y contar los días.

const ANCHO = 960, ALTO = 470;
const VISTA = { lonMin: -125, lonMax: 32, latMin: -45, latMax: 62 };
const COLOR_ROL = { Principal: "#c9a227", "Europa A": "#4f8fd6", "Europa B": "#4f8fd6", "Reserva lejana": "#8d9ab0", Retorno: "#4caf50" };

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export const ROLES = Object.keys(COLOR_ROL);

/** Proyección equirectangular; por omisión recortada a América y Europa (la vista crece si hay destinos fuera). */
export function proyectar([lon, lat], v = VISTA) {
  const x = ((lon - v.lonMin) / (v.lonMax - v.lonMin)) * ANCHO;
  const y = ((v.latMax - lat) / (v.latMax - v.latMin)) * ALTO;
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
}

/** Curva (arco) entre dos puntos para que las rutas no se encimen. */
export function arco(a, b, curva = 0.18, v = VISTA) {
  const [x1, y1] = proyectar(a, v), [x2, y2] = proyectar(b, v);
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1;
  const cx = mx - dy * curva, cy = my + dx * curva - Math.hypot(dx, dy) * 0.12;
  return `M${x1},${y1} Q${cx.toFixed(1)},${cy.toFixed(1)} ${x2},${y2}`;
}

/** Vista que contiene la vista base y todos los puntos (con margen), con la misma proporción del dibujo. */
export function vistaPara(puntos) {
  const v = { ...VISTA };
  for (const [lon, lat] of puntos) {
    v.lonMin = Math.min(v.lonMin, lon - 10); v.lonMax = Math.max(v.lonMax, lon + 10);
    v.latMin = Math.min(v.latMin, lat - 8); v.latMax = Math.max(v.latMax, lat + 8);
  }
  v.lonMin = Math.max(-180, v.lonMin); v.lonMax = Math.min(180, v.lonMax); v.latMin = Math.max(-85, v.latMin); v.latMax = Math.min(85, v.latMax);
  // Misma proporción que la vista base para no deformar los contornos.
  const r = (VISTA.latMax - VISTA.latMin) / (VISTA.lonMax - VISTA.lonMin), lon = v.lonMax - v.lonMin, lat = v.latMax - v.latMin;
  if (lat / lon < r) { const extra = (lon * r - lat) / 2; v.latMin = Math.max(-85, v.latMin - extra); v.latMax = Math.min(85, v.latMax + extra); }
  else { const extra = (lat / r - lon) / 2; v.lonMin = Math.max(-180, v.lonMin - extra); v.lonMax = Math.min(180, v.lonMax + extra); }
  return v;
}

export const coordsValidas = (c) => Array.isArray(c) && c.length === 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]) && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 85;

function contornos(geo, v) {
  const anillo = (r) => "M" + r.map((c) => proyectar(c, v).join(",")).join("L") + "Z";
  return (geo.features || []).map((f) => {
    const g = f.geometry || {}, polis = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    return polis.flatMap((p) => p.map(anillo)).join("");
  }).join("");
}

/**
 * SVG del traslado. `plantilla`: destinos con coords y ruta (origen, intermedio). `estado`: llegadas registradas,
 * nivel vigente y fase actual. Devuelve texto SVG (todo el texto pasa por esc()).
 */
export function svgTraslado(plantilla, geo, { llegadas = {}, nivel = "verde", dias = {} } = {}) {
  const ruta = plantilla.ruta || {}, origen = ruta.origen?.coords, inter = ruta.intermedio?.coords;
  const destinos = (plantilla.destinos || []).filter((d) => coordsValidas(d.coords) && d.id !== "mexico");
  const v = vistaPara([origen, inter, ...destinos.map((d) => d.coords)].filter(coordsValidas));
  const activo = Object.keys(llegadas).find((k) => llegadas[k]);
  const lineas = [];
  if (origen && inter) lineas.push(`<path d="${arco(origen, inter, 0.3, v)}" class="cm-ruta cm-nacional" stroke="#e08a2e"><title>${esc(`Traslado nacional: ${ruta.origen.nombre} → ${ruta.intermedio.nombre}`)}</title></path>`);
  for (const d of destinos) {
    if (!origen) break;
    const color = COLOR_ROL[d.rol] || "#8d9ab0", es = d.id === activo;
    lineas.push(`<path d="${arco(origen, d.coords, 0.18, v)}" class="cm-ruta${d.rol === "Reserva lejana" ? " cm-reserva" : ""}${es ? " cm-activa" : ""}" stroke="${color}"><title>${esc(`${d.rol}: ${d.destino} · ${d.como}`)}</title></path>`);
  }
  // Posición de la etiqueta: «der» (por omisión), «izq» o «arriba», para que no se encimen puntos cercanos.
  const punto = (c, color, etiqueta, extra = "", grande = false, lado = "der") => {
    const [x, y] = proyectar(c, v);
    const tx = lado === "izq" ? x - 9 : lado === "arriba" ? x : x + 9, ty = lado === "arriba" ? y - 24 : y + 4;
    const anc = lado === "izq" ? "end" : lado === "arriba" ? "middle" : "start";
    return `<g class="cm-punto"><circle cx="${x}" cy="${y}" r="${grande ? 7 : 5}" fill="${color}" stroke="#fff" stroke-width="1.5"/>`
      + `<text x="${tx}" y="${ty}" text-anchor="${anc}">${esc(etiqueta)}</text>${extra ? `<text x="${tx}" y="${ty + 14}" text-anchor="${anc}" class="cm-sub">${esc(extra)}</text>` : ""}</g>`;
  };
  const LADO = { espana_norte: "izq" };
  const puntos = [];
  if (origen) puntos.push(punto(origen, "#C8102E", ruta.origen.nombre, `Nivel ${nivel}`, true, "izq"));
  if (inter) puntos.push(punto(inter, "#e08a2e", "Mérida", "resguardo nacional", false, "arriba"));
  for (const d of destinos) {
    const n = dias[d.id];
    puntos.push(punto(d.coords, COLOR_ROL[d.rol] || "#8d9ab0", d.destino.replace(/\s*\(.*\)$/, ""), n != null ? `día ${n}${d.estancia_dias ? ` de ${d.estancia_dias}` : ""}` : d.rol, d.id === activo, LADO[d.id]));
  }
  return `<svg viewBox="0 0 ${ANCHO} ${ALTO}" role="img" aria-label="Mapa del traslado: salida, resguardo nacional y destinos" class="cm-svg" data-vista="${[v.lonMin, v.lonMax, v.latMin, v.latMax].map((n) => n.toFixed(3)).join(",")}">
    <rect width="${ANCHO}" height="${ALTO}" class="cm-mar"/>
    <path d="${contornos(geo, v)}" class="cm-tierra"/>
    ${lineas.join("")}${puntos.join("")}
  </svg>`;
}

/** Inverso de proyectar(): de la posición de un clic en el dibujo (0–1 en cada eje) a [lon, lat]. */
export function desproyectar(fx, fy, v) {
  return [Math.round((v.lonMin + fx * (v.lonMax - v.lonMin)) * 100) / 100, Math.round((v.latMax - fy * (v.latMax - v.latMin)) * 100) / 100];
}

export const LEYENDA = [["#C8102E", "Salida"], ["#e08a2e", "Resguardo nacional (Naranja)"], ["#c9a227", "Destino principal"], ["#4f8fd6", "Europa A y B"], ["#8d9ab0", "Reserva lejana (punteada)"]];
