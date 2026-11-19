// Mapa del traslado (Continuidad familiar). SVG dibujado en el navegador con el contorno de países del propio sitio
// (data/base/countries-110m.geojson): sin mosaicos ni servicios externos, así que no sale ningún dato de la familia.
// Los puntos son genéricos (ciudad o región) y vienen de la plantilla; la fecha de llegada que registra la familia
// solo se usa aquí para resaltar el destino y contar los días.

const ANCHO = 960, ALTO = 470;
const VISTA = { lonMin: -125, lonMax: 32, latMin: -45, latMax: 62 };
const COLOR_ROL = { Principal: "#c9a227", "Europa A": "#4f8fd6", "Europa B": "#4f8fd6", "Reserva lejana": "#8d9ab0", Retorno: "#4caf50" };

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Proyección equirectangular recortada a América y Europa. */
export function proyectar([lon, lat]) {
  const x = ((lon - VISTA.lonMin) / (VISTA.lonMax - VISTA.lonMin)) * ANCHO;
  const y = ((VISTA.latMax - lat) / (VISTA.latMax - VISTA.latMin)) * ALTO;
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
}

/** Curva (arco) entre dos puntos para que las rutas no se encimen. */
export function arco(a, b, curva = 0.18) {
  const [x1, y1] = proyectar(a), [x2, y2] = proyectar(b);
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1;
  const cx = mx - dy * curva, cy = my + dx * curva - Math.hypot(dx, dy) * 0.12;
  return `M${x1},${y1} Q${cx.toFixed(1)},${cy.toFixed(1)} ${x2},${y2}`;
}

function contornos(geo) {
  const anillo = (r) => "M" + r.map((c) => proyectar(c).join(",")).join("L") + "Z";
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
  const destinos = (plantilla.destinos || []).filter((d) => Array.isArray(d.coords) && d.id !== "mexico");
  const activo = Object.keys(llegadas).find((k) => llegadas[k]);
  const lineas = [];
  if (origen && inter) lineas.push(`<path d="${arco(origen, inter, 0.3)}" class="cm-ruta cm-nacional" stroke="#e08a2e"><title>${esc(`Traslado nacional: ${ruta.origen.nombre} → ${ruta.intermedio.nombre}`)}</title></path>`);
  for (const d of destinos) {
    if (!origen) break;
    const color = COLOR_ROL[d.rol] || "#8d9ab0", es = d.id === activo;
    lineas.push(`<path d="${arco(origen, d.coords)}" class="cm-ruta${d.rol === "Reserva lejana" ? " cm-reserva" : ""}${es ? " cm-activa" : ""}" stroke="${color}"><title>${esc(`${d.rol}: ${d.destino} · ${d.como}`)}</title></path>`);
  }
  // Posición de la etiqueta: «der» (por omisión), «izq» o «arriba», para que no se encimen puntos cercanos.
  const punto = (c, color, etiqueta, extra = "", grande = false, lado = "der") => {
    const [x, y] = proyectar(c);
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
  return `<svg viewBox="0 0 ${ANCHO} ${ALTO}" role="img" aria-label="Mapa del traslado: salida, resguardo nacional y destinos" class="cm-svg">
    <rect width="${ANCHO}" height="${ALTO}" class="cm-mar"/>
    <path d="${contornos(geo)}" class="cm-tierra"/>
    ${lineas.join("")}${puntos.join("")}
  </svg>`;
}

export const LEYENDA = [["#C8102E", "Salida"], ["#e08a2e", "Resguardo nacional (Naranja)"], ["#c9a227", "Destino principal"], ["#4f8fd6", "Europa A y B"], ["#8d9ab0", "Reserva lejana (punteada)"]];
