// Imágenes satelitales bajo demanda (Fase C6): capas raster de NASA GIBS, sin llave.
// Solo se descargan al activarlas; quedan debajo de los eventos. Desactivadas en modo LITE.
//   - Luces nocturnas VIIRS (Day/Night Band): sirven para ver apagones grandes comparando días.
//   - Color verdadero VIIRS NOAA-20: nubes, humo, inundaciones. Franjas de ~3,000 km que se traslapan:
//     el mosaico del día no deja huecos en el Ecuador.
//   - Color verdadero MODIS Terra y Aqua: franjas de ~2,330 km. Entre una órbita y la siguiente quedan
//     cuñas negras («gajos») cerca del Ecuador; no es un error de proyección, es lo que el satélite no vio.
// Se usa la fecha de AYER (UTC) porque la imagen del día puede no estar completa; se puede elegir otro día.
// Todas las capas se piden en EPSG:3857 (la proyección del mapa plano) para que encajen sin deformarse.

export const IMAGENES = {
  viirs_color: { nombre: "Color verdadero VIIRS (NOAA-20, sin huecos)", capa: "VIIRS_NOAA20_CorrectedReflectance_TrueColor", matriz: "GoogleMapsCompatible_Level9", ext: "jpg", maxzoom: 9 },
  modis_color: { nombre: "Color verdadero MODIS Terra (mañana, con huecos)", capa: "MODIS_Terra_CorrectedReflectance_TrueColor", matriz: "GoogleMapsCompatible_Level9", ext: "jpg", maxzoom: 9 },
  modis_aqua: { nombre: "Color verdadero MODIS Aqua (tarde, con huecos)", capa: "MODIS_Aqua_CorrectedReflectance_TrueColor", matriz: "GoogleMapsCompatible_Level9", ext: "jpg", maxzoom: 9 },
  viirs_noche: { nombre: "Luces nocturnas VIIRS (apagones)", capa: "VIIRS_SNPP_DayNightBand_ENCC", matriz: "GoogleMapsCompatible_Level8", ext: "png", maxzoom: 8 },
};

/** Fecha UTC (AAAA-MM-DD) de hace `dias` días. */
export function haceDias(dias, ahora = new Date()) {
  return new Date(ahora.getTime() - dias * 86400000).toISOString().slice(0, 10);
}

export const ayerUTC = (ahora = new Date()) => haceDias(1, ahora);

export function urlGIBS(def, fecha) {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${def.capa}/default/${fecha}/${def.matriz}/{z}/{y}/{x}.${def.ext}`;
}

export class Imagenes {
  constructor(map) { this.map = map; this.activas = new Map(); }

  activar(id, fecha = ayerUTC()) {
    const def = IMAGENES[id];
    if (!def) return;
    this.activas.set(id, fecha);
    this.#instalar(id);
  }

  desactivar(id) {
    this.activas.delete(id);
    if (this.map.getLayer(`img-${id}`)) this.map.removeLayer(`img-${id}`);
    if (this.map.getSource(`img-${id}`)) this.map.removeSource(`img-${id}`);
  }

  reinstalar() { for (const id of this.activas.keys()) this.#instalar(id); }

  /** Cambia el día de todas las capas activas (se vuelven a pedir los mosaicos de esa fecha). */
  setFecha(fecha) {
    for (const id of [...this.activas.keys()]) { this.desactivar(id); this.activar(id, fecha); }
  }

  #instalar(id) {
    if (this.map.getSource(`img-${id}`)) return;
    const def = IMAGENES[id];
    this.map.addSource(`img-${id}`, { type: "raster", tiles: [urlGIBS(def, this.activas.get(id))], tileSize: 256, maxzoom: def.maxzoom,
      attribution: "Imágenes: NASA GIBS / EOSDIS" });
    // Debajo de chokepoints, capas y eventos: primera capa propia del mapa.
    const antes = ["choke-anillo", "clusters"].find((l) => this.map.getLayer(l));
    this.map.addLayer({ id: `img-${id}`, type: "raster", source: `img-${id}`, paint: { "raster-opacity": 0.85, "raster-fade-duration": 0 } }, antes);
  }
}
