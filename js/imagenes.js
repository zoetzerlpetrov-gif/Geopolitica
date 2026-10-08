// Imágenes satelitales bajo demanda (Fase C6): capas raster de NASA GIBS, sin llave.
// Solo se descargan al activarlas; quedan debajo de los eventos. Desactivadas en modo LITE.
//   - Luces nocturnas VIIRS (Day/Night Band): sirven para ver apagones grandes comparando días.
//   - Color verdadero MODIS Terra: nubes, humo de incendios, inundaciones.
// Se usa la fecha de AYER (UTC) porque la imagen del día puede no estar completa.

export const IMAGENES = {
  viirs_noche: { nombre: "Luces nocturnas VIIRS (apagones)", capa: "VIIRS_SNPP_DayNightBand_ENCC", matriz: "GoogleMapsCompatible_Level8", ext: "png", maxzoom: 8 },
  modis_color: { nombre: "Color verdadero MODIS", capa: "MODIS_Terra_CorrectedReflectance_TrueColor", matriz: "GoogleMapsCompatible_Level9", ext: "jpg", maxzoom: 9 },
};

export function ayerUTC(ahora = new Date()) {
  const d = new Date(ahora.getTime() - 86400000);
  return d.toISOString().slice(0, 10);
}

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
