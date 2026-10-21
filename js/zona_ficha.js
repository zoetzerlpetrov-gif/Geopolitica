// Zona y videos en las fichas de seguridad, emergencias, red, salud, criminología y carreteras.
// Zona: si el punto trae ubicación de ciudad o estado, se resalta el estado donde cae (vivos/zonas_eventos.geojson,
// Natural Earth admin-1); si solo trae el país, se resalta el país. Así no se pinta un estado que la nota no nombra.
// Videos: de vivos/conflictos_videos.json («recientes»: canales de noticias en YouTube, 7 días), los que en el título
// nombran el lugar Y el tema de la capa. Sin coincidencia, enlaces de búsqueda para abrir en otra pestaña.
import { esc, sinAcentos } from "./util.js";

export const GRUPOS_ZONA = new Set(["Seguridad y ataques", "Emergencias, zonas afectadas y transporte", "Red y ciberseguridad",
  "Salud: brotes y enfermedades", "Criminología: modalidades delictivas en noticias", "Carreteras y calles: robos, bloqueos y protestas"]);

// Palabras del tema por grupo (títulos de videos en español e inglés, sin acentos).
export const TEMAS_VIDEO = {
  "Seguridad y ataques": /\b(ataque|attack|bomb|explosi|tirote|shoot|balacera|cartel|narco|militar|military|missile|misil|dron|drone|guerra|war|violencia|violence|terror)/,
  "Emergencias, zonas afectadas y transporte": /\b(incendio|fire|accidente|crash|explosi|emergenc|rescate|rescue|evacua|derrumbe|collapse|inunda|flood|avion|plane|barco|ship)/,
  "Red y ciberseguridad": /\b(hacke|hack|ciber|cyber|internet|apagon|outage|ransomware|malware|datos|data breach)/,
  "Salud: brotes y enfermedades": /\b(brote|outbreak|virus|vacun|vaccin|dengue|ebola|covid|gripe|flu|sarampion|measles|colera|cholera|salud|health|epidemi|pandemi)/,
  "Criminología: modalidades delictivas en noticias": /\b(extorsi|secuestr|kidnap|fraude|fraud|estafa|scam|robo|theft|trata|traffick|lavado|launder|desaparec|missing|cartel|narco)/,
  "Carreteras y calles: robos, bloqueos y protestas": /\b(bloqueo|narcobloqueo|blockade|protest|marcha|march|manifesta|paro|strike|robo|asalto|robbery|caseta|carretera|highway|autopista|disturbio|riot)/,
};

const norm = (t) => sinAcentos(String(t || "")).toLowerCase();

/** ¿El punto [lon, lat] cae dentro del Polygon o MultiPolygon? (regla par-impar; los huecos restan). */
export function contiene(geom, [x, y]) {
  const polis = geom?.type === "Polygon" ? [geom.coordinates] : geom?.type === "MultiPolygon" ? geom.coordinates : [];
  const enAnillo = (a) => {
    let dentro = false;
    for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
      const [xi, yi] = a[i], [xj, yj] = a[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
    }
    return dentro;
  };
  return polis.some((p) => p.length && enAnillo(p[0]) && !p.slice(1).some(enAnillo));
}

/** Zona a resaltar: {geometry, nombre, nivel} o null. */
export function zonaDe(punto, props, { estados, paises, nombrePais = (i) => i } = {}) {
  if (!punto) return null;
  if (["ciudad", "estado"].includes(props?.precision)) {
    const e = (estados?.features || []).find((f) => contiene(f.geometry, punto));
    if (e) return { geometry: e.geometry, nombre: `${e.properties.nombre}, ${nombrePais(e.properties.iso3)}`, nivel: "estado o provincia" };
  }
  const iso = props?.pais_iso3 || props?.iso3 || props?.pais;
  const p = (paises?.features || []).find((f) => (iso && f.properties.iso3 === iso) || (!iso && contiene(f.geometry, punto)));
  return p ? { geometry: p.geometry, nombre: nombrePais(p.properties.iso3), nivel: "país" } : null;
}

/** Palabras de lugar de la ficha (≥ 4 letras): «Culiacán, Sinaloa» → [culiacan, sinaloa]; más el país. */
export function lugaresDe(props, nombrePais = (i) => i) {
  const crudo = [props?.lugar, props?.state, props?.nombre, props?.pais_iso3 && nombrePais(props.pais_iso3), props?.country].filter(Boolean).join(",");
  return [...new Set(crudo.split(/[,;()]/).map((x) => norm(x).trim()).filter((x) => x.length >= 4 && !/sin lugar|aprox/.test(x)))];
}

/** Videos recientes que nombran un lugar de la ficha y el tema del grupo, del más nuevo al más viejo. */
export function videosPara(recientes, lugares, grupo, max = 4) {
  const tema = TEMAS_VIDEO[grupo];
  if (!tema || !lugares.length) return [];
  const rx = new RegExp(`\\b(${lugares.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`);
  return (recientes || []).filter((v) => { const t = norm(v.t); return rx.test(t) && tema.test(t); })
    .sort((a, b) => String(b.f).localeCompare(String(a.f))).slice(0, max)
    .map((v) => ({ video: v.v, titulo: v.t, canal: v.c, fecha: v.f }));
}

export function htmlZona(zona) {
  return zona ? `<p class="meta">🗺️ Resaltado en el mapa: <b>${esc(zona.nombre)}</b> (${esc(zona.nivel)}). Es la zona que nombra la nota o donde cae el punto, no el área afectada medida.</p>` : "";
}

/** Dibuja (o borra con null) la zona de la ficha abierta. */
export function dibujarZona(map, zona) {
  const fc = { type: "FeatureCollection", features: zona ? [{ type: "Feature", geometry: zona.geometry, properties: {} }] : [] };
  if (map.getSource("ficha-zona")) { map.getSource("ficha-zona").setData(fc); return; }
  if (!zona) return;
  map.addSource("ficha-zona", { type: "geojson", data: fc });
  map.addLayer({ id: "ficha-zona-relleno", type: "fill", source: "ficha-zona", paint: { "fill-color": "#C8102E", "fill-opacity": 0.12 } });
  map.addLayer({ id: "ficha-zona-borde", type: "line", source: "ficha-zona", paint: { "line-color": "#C8102E", "line-width": 2, "line-dasharray": [2, 1] } });
}
