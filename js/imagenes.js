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
  // Luces nocturnas: GIBS ha cambiado nombres de capas del sensor DNB. Al activarla, el navegador prueba un
  // mosaico de cada candidata (de la diaria a la anual) y usa la primera que trae imagen de verdad.
  viirs_noche: { nombre: "Luces nocturnas VIIRS (apagones)", maxzoom: 8, opacidad: 1, candidatos: [
    { capa: "VIIRS_SNPP_DayNightBand_ENCC", matriz: "GoogleMapsCompatible_Level8", ext: "png", etiqueta: "VIIRS Suomi NPP, imagen del día" },
    { capa: "VIIRS_NOAA20_DayNightBand_ENCC", matriz: "GoogleMapsCompatible_Level8", ext: "png", etiqueta: "VIIRS NOAA-20, imagen del día" },
    { capa: "VIIRS_SNPP_DayNightBand_At_Sensor_Radiance", matriz: "GoogleMapsCompatible_Level8", ext: "png", etiqueta: "VIIRS Black Marble diaria (radiancia)" },
    { capa: "VIIRS_Black_Marble", matriz: "GoogleMapsCompatible_Level8", ext: "png", fecha: "2016-01-01", etiqueta: "Black Marble 2016 (promedio anual, no sirve para apagones recientes)" },
  ] },
};

/** Un mosaico con datos pesa varios KB; uno vacío o transparente pesa menos de ~1.5 KB. */
export const MOSAICO_MINIMO = 1500;

/**
 * Elige la primera candidata cuyo mosaico de prueba (z2, sobre América y Europa de noche) trae imagen.
 * `pedir(url)` devuelve {ok, tipo, bytes}; se inyecta para probar sin red.
 */
export async function elegirCandidata(def, fecha, pedir) {
  for (const c of def.candidatos) {
    const f = c.fecha || fecha;
    const base = urlGIBS(c, f);
    for (const [z, y, x] of [[2, 1, 1], [2, 1, 2]]) {
      try {
        const r = await pedir(base.replace("{z}", z).replace("{y}", y).replace("{x}", x));
        if (r.ok && /^image\//.test(r.tipo || "") && r.bytes >= MOSAICO_MINIMO) return { ...c, fecha: f };
      } catch (e) { /* siguiente */ }
    }
  }
  return null;
}

async function pedirMosaico(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    const b = r.ok ? await r.blob() : null;
    return { ok: r.ok, tipo: r.headers.get("content-type"), bytes: b ? b.size : 0 };
  } finally { clearTimeout(t); }
}

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

  /** Activa una capa. Devuelve la candidata usada (o null si ninguna respondió) para capas con candidatos. */
  async activar(id, fecha = ayerUTC(), pedir = pedirMosaico) {
    const def = IMAGENES[id];
    if (!def) return null;
    let eleccion = null;
    if (def.candidatos) {
      eleccion = await elegirCandidata(def, fecha, pedir);
      if (!eleccion) throw new Error("NASA GIBS no devolvió imagen de luces nocturnas para esa fecha ni para la referencia anual");
    }
    this.activas.set(id, { fecha, eleccion });
    this.#instalar(id);
    return eleccion;
  }

  desactivar(id) {
    this.activas.delete(id);
    if (this.map.getLayer(`img-${id}`)) this.map.removeLayer(`img-${id}`);
    if (this.map.getSource(`img-${id}`)) this.map.removeSource(`img-${id}`);
  }

  reinstalar() { for (const id of this.activas.keys()) this.#instalar(id); }

  /** Cambia el día de todas las capas activas (se vuelven a pedir los mosaicos de esa fecha). */
  async setFecha(fecha) {
    const res = {};
    for (const id of [...this.activas.keys()]) { this.desactivar(id); res[id] = await this.activar(id, fecha).catch(() => null); }
    return res;
  }

  #instalar(id) {
    if (this.map.getSource(`img-${id}`)) return;
    const def = IMAGENES[id];
    const { fecha, eleccion } = this.activas.get(id);
    const capa = eleccion || def;
    this.map.addSource(`img-${id}`, { type: "raster", tiles: [urlGIBS(capa, eleccion?.fecha || fecha)], tileSize: 256, maxzoom: def.maxzoom,
      attribution: "Imágenes: NASA GIBS / EOSDIS" });
    // Debajo de chokepoints, capas y eventos: primera capa propia del mapa.
    const antes = ["choke-anillo", "clusters"].find((l) => this.map.getLayer(l));
    this.map.addLayer({ id: `img-${id}`, type: "raster", source: `img-${id}`, paint: { "raster-opacity": def.opacidad ?? 0.85, "raster-fade-duration": 0 } }, antes);
  }
}
