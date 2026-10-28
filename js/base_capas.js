// Opciones del mapa base (Temático, Calles, Satélite y Relieve): qué etiquetas se ven y contornos de estados y
// provincias de todo el mundo. Solo toca las capas del mapa base (fuentes de OpenFreeMap y los nombres de países
// locales); las capas propias del monitor (eventos, clústeres, capas encendidas) no se tocan.
//
// Los contornos salen de la capa «boundary» de los mosaicos de OpenStreetMap (esquema OpenMapTiles) que ya usa el
// mapa: admin_level 4 = primer nivel bajo el país (estados de México y EUA, provincias de Canadá y Argentina,
// regiones de Francia, oblasts de Rusia…). Sin red hacia OpenFreeMap (mapa local de respaldo) no hay contornos.

export const GRUPOS = [
  ["paises", "Países", /country|paises-nombre/],
  ["estados", "Estados y provincias", /state|province/],
  ["ciudades", "Ciudades y pueblos", /city|town|village|hamlet|suburb|neighbo|place|lugares|capital/],
  ["calles", "Calles y carreteras", /highway|road|transportation|street|shield|calles|oneway|motorway/],
  ["agua", "Mares, ríos y lagos", /water|ocean|sea|lake|river|marine|bay/],
  ["otros", "Aeropuertos, parques, montañas y lugares de interés", /poi|airport|aerodrome|airfield|park|housenumber|building|mountain|peak|landuse|landcover/],
];

export const ID_ESTADOS = "estados-contorno";
export const POR_OMISION = { estados: false, etiquetas: Object.fromEntries(GRUPOS.map(([k]) => [k, true])) };

/** Grupo de etiquetas de una capa del mapa base, o null. El primero que coincide gana (países antes que lugares). */
export const grupoDe = (id) => GRUPOS.find(([, , rx]) => rx.test(id))?.[0] || null;

const esVectorBase = (src) => src?.type === "vector" && /openfreemap|openmaptiles/.test(src.url || (src.tiles || []).join(" "));

/** ¿La capa es del mapa base? (fuente vectorial de OpenFreeMap o los nombres de países locales). */
export function esDelMapaBase(capa, fuentes) {
  return esVectorBase(fuentes[capa.source]) || capa.source === "nombres";
}

/** Capa de contornos de estados y provincias para la fuente vectorial `fuente` (o null si el estilo no tiene). */
export function capaEstados(fuente, oscuro) {
  if (!fuente) return null;
  return {
    id: ID_ESTADOS, type: "line", source: fuente, "source-layer": "boundary", minzoom: 1.5,
    filter: ["all", ["==", ["get", "admin_level"], 4], ["!=", ["get", "maritime"], 1]],
    layout: { "line-join": "round" },
    paint: {
      "line-color": oscuro ? "rgba(225,232,238,0.55)" : "rgba(70,82,94,0.55)",
      "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.4, 6, 0.9, 10, 1.4],
      "line-dasharray": [3, 2],
    },
  };
}

/** Aplica la configuración al estilo cargado. `oscuro`: fondo oscuro (tema oscuro o satélite). */
export function aplicar(map, cfg = POR_OMISION, { oscuro = false } = {}) {
  const estilo = map.getStyle();
  if (!estilo) return;
  const fuentes = estilo.sources || {};
  for (const l of estilo.layers) {
    if (l.type !== "symbol" || !esDelMapaBase(l, fuentes)) continue;
    const g = grupoDe(l.id);
    if (!g) continue;
    const ver = cfg.etiquetas?.[g] !== false;
    if ((map.getLayoutProperty(l.id, "visibility") ?? "visible") !== (ver ? "visible" : "none")) map.setLayoutProperty(l.id, "visibility", ver ? "visible" : "none");
  }
  const fuente = Object.entries(fuentes).find(([, s]) => esVectorBase(s))?.[0];
  if (cfg.estados && fuente && !map.getLayer(ID_ESTADOS)) {
    // Debajo de las etiquetas del mapa base y de todo lo que agrega el monitor.
    const antes = estilo.layers.find((l) => l.type === "symbol" && esDelMapaBase(l, fuentes))?.id;
    map.addLayer(capaEstados(fuente, oscuro), antes);
  } else if (!cfg.estados && map.getLayer(ID_ESTADOS)) {
    map.removeLayer(ID_ESTADOS);
  }
  return Boolean(fuente);
}
