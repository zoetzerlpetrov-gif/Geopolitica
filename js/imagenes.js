// Imágenes satelitales bajo demanda (Fase C6): capas raster de NASA GIBS, sin llave.
// Solo se descargan al activarlas; quedan debajo de los eventos. Desactivadas en modo LITE.
//   - Luces nocturnas VIIRS (Day/Night Band): sirven para ver apagones grandes comparando días.
//   - Color verdadero VIIRS NOAA-20: nubes, humo, inundaciones. Franjas de ~3,000 km que se traslapan:
//     el mosaico del día no deja huecos en el Ecuador.
//   - Color verdadero MODIS Terra y Aqua: franjas de ~2,330 km. Entre una órbita y la siguiente quedan
//     cuñas negras («gajos») cerca del Ecuador; no es un error de proyección, es lo que el satélite no vio.
// Se usa la fecha de AYER (UTC) porque la imagen del día puede no estar completa; se puede elegir otro día.
// Todas las capas se piden en EPSG:3857 (la proyección del mapa plano) para que encajen sin deformarse.

import { conRespaldo, registrarProtocolo, leerDominio, urlDominios } from "./gibs.js";

export const IMAGENES = {
  viirs_color: { nombre: "Color verdadero VIIRS (NOAA-20, sin huecos)", capa: "VIIRS_NOAA20_CorrectedReflectance_TrueColor", matriz: "GoogleMapsCompatible_Level9", ext: "jpg", maxzoom: 9 },
  modis_color: { nombre: "Color verdadero MODIS Terra (mañana, con huecos)", capa: "MODIS_Terra_CorrectedReflectance_TrueColor", matriz: "GoogleMapsCompatible_Level9", ext: "jpg", maxzoom: 9 },
  modis_aqua: { nombre: "Color verdadero MODIS Aqua (tarde, con huecos)", capa: "MODIS_Aqua_CorrectedReflectance_TrueColor", matriz: "GoogleMapsCompatible_Level9", ext: "jpg", maxzoom: 9 },
  // Contaminación atmosférica (OMPS, NOAA-20 / Suomi NPP): una pasada por día, ~50 km por píxel (zoom máximo 6).
  // SO₂ (dióxido de azufre) cerca del suelo: chimeneas de centrales de carbón, refinerías, fundidoras y volcanes. Es el
  // gas que, al mezclarse con agua en la atmósfera, forma ácido sulfúrico: la causa principal de la lluvia ácida.
  so2_suelo: { nombre: "SO₂ cerca del suelo (lluvia ácida, volcanes, industria · OMPS)", capa: "OMPS_NOAA20_SO2_Planetary_Boundary_Layer",
    matriz: "GoogleMapsCompatible_Level6", ext: "png", maxzoom: 6, opacidad: 0.8,
    leyenda: "Unidades Dobson (DU). Paleta oficial de NASA GIBS: azul marino = poco SO₂; azul claro a casi blanco = mucho. Las manchas claras aisladas suelen ser volcanes, fundidoras o centrales de carbón. Los tramos de interpretación son orientativos.",
    // Colores tomados del mapa de color oficial (gibs.earthdata.nasa.gov/colormaps/v1.3/OMPS_SO2_Planetary_Boundary_Layer.xml).
    escala: { colores: ["rgb(8,40,100)", "rgb(24,89,153)", "rgb(36,114,180)", "rgb(79,151,201)", "rgb(126,184,219)", "rgb(196,217,238)", "rgb(247,251,255)"],
      marcas: ["< 1.5", "2", "2.5", "3", "3.5", "4", "≥ 4.5 DU"],
      tramos: [["rgb(8,40,100)", "Menos de 1.5 DU: nivel de fondo, sin fuente cercana"], ["rgb(36,114,180)", "1.5 a 2.5 DU: algo elevado (ciudades, industria lejana)"],
        ["rgb(109,175,213)", "2.5 a 3.5 DU: elevado; posible fundidora, refinería o central de carbón"], ["rgb(196,217,238)", "3.5 a 4.5 DU: alto"],
        ["rgb(247,251,255)", "4.5 DU o más: muy alto; erupción volcánica o emisión industrial fuerte"]] } },
  // Índice de aerosoles: humo de incendios, polvo del Sahara y ceniza volcánica (partículas que absorben luz UV).
  aerosoles: { nombre: "Aerosoles: humo, polvo y ceniza volcánica (OMPS)", capa: "OMPS_Aerosol_Index", matriz: "GoogleMapsCompatible_Level6", ext: "png",
    maxzoom: 6, opacidad: 0.75, leyenda: "Índice sin unidades de NASA (paleta oficial de GIBS). Mide partículas en la columna de aire, no la calidad del aire a ras de suelo. Los tramos de interpretación son orientativos.",
    // Colores del mapa de color oficial (gibs.earthdata.nasa.gov/colormaps/v1.3/OMPS_Aerosol_Index.xml).
    escala: { colores: ["rgb(240,240,240)", "rgb(231,231,197)", "rgb(223,223,98)", "rgb(255,255,0)", "rgb(216,157,0)", "rgb(237,83,0)", "rgb(251,18,0)", "rgb(185,0,14)", "rgb(115,0,25)"],
      marcas: ["0", "1", "2", "3", "4", "≥ 5"],
      tramos: [["rgb(235,235,215)", "Menos de 1: aire sin aerosoles notables"], ["rgb(223,223,98)", "1 a 2: ligero (bruma, polvo leve)"], ["rgb(255,230,0)", "2 a 3: moderado"],
        ["rgb(237,83,0)", "3 a 4: denso; humo de incendios o polvo del Sahara"], ["rgb(185,0,14)", "4 a 5: muy denso"], ["rgb(115,0,25)", "5 o más: extremo; incendios enormes, tormentas de polvo o ceniza volcánica"]] } },
  // Hielo marino diario (GHRSST MUR, ~1 km, mezcla de satélites de microondas): porcentaje del mar cubierto de hielo.
  hielo_marino: { nombre: "Hielo marino: % del mar cubierto (GHRSST MUR, diario)", capa: "GHRSST_L4_MUR_Sea_Ice_Concentration", matriz: "GoogleMapsCompatible_Level7",
    ext: "png", maxzoom: 7, opacidad: 0.8, fecha_fija: "default",
    leyenda: "Porcentaje de cada punto del mar cubierto de hielo (paleta oficial de NASA GIBS). El borde del hielo se mide desde 15 %. Se publica con ~2 días de retraso; se muestra siempre el día más reciente que haya publicado NASA. Ni el mapa plano ni el globo dibujan mosaicos más allá de 85° de latitud (límite de los mosaicos web), así que el centro del Ártico y de la Antártida queda sin color; el borde del hielo, que es lo que cambia, sí se ve.",
    // Colores del mapa de color oficial (gibs.earthdata.nasa.gov/colormaps/v1.3/GHRSST_Sea_Ice_Concentration.xml).
    escala: { colores: ["rgb(78,0,78)", "rgb(184,0,184)", "rgb(127,0,255)", "rgb(0,90,255)", "rgb(0,234,191)", "rgb(15,175,0)", "rgb(225,245,0)", "rgb(255,177,0)", "rgb(255,26,26)", "rgb(255,153,153)"],
      marcas: ["0 %", "25 %", "50 %", "75 %", "100 %"],
      tramos: [["rgb(184,0,184)", "Menos de 15 %: agua casi libre (no cuenta como «extensión de hielo»)"], ["rgb(0,90,255)", "15 a 40 %: hielo disperso"],
        ["rgb(15,175,0)", "40 a 70 %: hielo abierto"], ["rgb(255,177,0)", "70 a 90 %: hielo cerrado"], ["rgb(255,153,153)", "Más de 90 %: banquisa casi continua"]] } },
  // Columna total de ozono (OMPS): el «agujero» es donde baja de 220 unidades Dobson, sobre la Antártida de agosto a diciembre.
  ozono_total: { nombre: "Capa de ozono: columna total (OMPS, diario)", capa: "OMPS_Ozone_Total_Column", matriz: "GoogleMapsCompatible_Level6", ext: "png",
    maxzoom: 6, opacidad: 0.7, relleno: 1,
    leyenda: "Unidades Dobson (DU): cuánto ozono hay en toda la columna de aire. Menos de 220 DU es «agujero de ozono». Paleta oficial de NASA GIBS. Las franjas que el satélite aún no barre ese día (a menudo sobre el Pacífico, junto a la línea de cambio de fecha) se rellenan con el día anterior.",
    // Colores del mapa de color oficial (gibs.earthdata.nasa.gov/colormaps/v1.3/OMPS_Ozone_Total_Column.xml).
    escala: { colores: ["rgb(71,160,179)", "rgb(130,205,164)", "rgb(195,231,159)", "rgb(240,236,146)", "rgb(253,203,121)", "rgb(249,146,84)", "rgb(231,89,72)"],
      marcas: ["125", "200", "275", "350", "425", "≥ 500 DU"],
      tramos: [["rgb(71,160,179)", "Menos de 220 DU: agujero de ozono (más radiación UV llega al suelo)"], ["rgb(195,231,159)", "220 a 300 DU: bajo a normal"],
        ["rgb(253,203,121)", "300 a 400 DU: normal a alto"], ["rgb(231,89,72)", "Más de 400 DU: alto (común en latitudes altas en primavera)"]] } },
  // NO₂ (dióxido de nitrógeno): lo emiten motores, centrales, refinerías y fábricas. Sirve como indicador de actividad
  // industrial y de tráfico (cae en paros, cuarentenas o cierres de planta; sube al reanudar).
  // TROPOMI (Sentinel-5P): todo el planeta, una pasada al día, ~5 km. TEMPO: solo América del Norte (incluye México),
  // cada hora de día; con fecha «default» GIBS sirve la hora más reciente.
  // relleno: días (o horas, en productos por hora) anteriores que se dibujan debajo para tapar los huecos entre órbitas,
  // de nubes o de barridos incompletos; lo más reciente siempre queda encima.
  no2_tropomi: { nombre: "NO₂: actividad industrial y tráfico (TROPOMI, diario, mundo)", capa: "TROPOMI_L2_Nitrogen_Dioxide_Tropospheric_Column",
    matriz: "GoogleMapsCompatible_Level6", ext: "png", maxzoom: 6, opacidad: 0.75, relleno: 1,
    leyenda: "Columna troposférica de NO₂ (Sentinel-5P/TROPOMI, ~5 km). Mientras más intenso el color, más NO₂: ciudades grandes, centrales, refinerías y corredores de tráfico. Compara días: una caída fuerte en una zona industrial puede indicar paro o cierre. Los huecos entre órbitas o por nubes se rellenan con el día anterior. Leyenda oficial en NASA Worldview." },
  no2_tempo: { nombre: "NO₂ cada hora en América del Norte y México (TEMPO, hora más reciente)", capa: "TEMPO_L3_NO2_Vertical_Column_Troposphere",
    matriz: "GoogleMapsCompatible_Level7", ext: "png", maxzoom: 7, opacidad: 0.75, por_hora: true, relleno: 2,
    leyenda: "Satélite geoestacionario TEMPO (NASA): mide el NO₂ cada hora de día sobre América del Norte, de Canadá a México. Mientras más intenso el color, más NO₂. Muestra la hora más reciente con el barrido completo (el primero de la mañana y el último de la tarde salen a medias y se saltan); los huecos por nubes o barridos parciales se rellenan con las 2 horas anteriores. De noche no hay datos. Leyenda oficial en NASA Worldview." },
  // Luces nocturnas: GIBS ha cambiado nombres de capas del sensor DNB (las «ENCC» dejaron de publicarse en 2023). Al
  // activarla, el navegador prueba cada candidata en los últimos días y usa la primera con imagen completa.
  // Comprobado en GIBS (oct 2026): NOAA-20 corregida por luz de luna (Black Marble diaria) está completa al día siguiente;
  // Suomi NPP llega con ~2 días.
  viirs_noche: { nombre: "Luces nocturnas VIIRS (apagones)", maxzoom: 8, opacidad: 1, candidatos: [
    { capa: "VIIRS_NOAA20_GapFilled_BRDF_Corrected_DayNightBand_Radiance", matriz: "GoogleMapsCompatible_Level8", ext: "png",
      etiqueta: "Black Marble diaria NOAA-20 (corregida por luna y nubes)" },
    { capa: "VIIRS_NOAA20_DayNightBand_At_Sensor_Radiance", matriz: "GoogleMapsCompatible_Level8", ext: "png", etiqueta: "VIIRS NOAA-20, radiancia del día" },
    { capa: "VIIRS_SNPP_GapFilled_BRDF_Corrected_DayNightBand_Radiance", matriz: "GoogleMapsCompatible_Level8", ext: "png",
      etiqueta: "Black Marble diaria Suomi NPP (corregida por luna y nubes)" },
    { capa: "VIIRS_SNPP_DayNightBand_At_Sensor_Radiance", matriz: "GoogleMapsCompatible_Level8", ext: "png", etiqueta: "VIIRS Suomi NPP, radiancia del día" },
    { capa: "VIIRS_Black_Marble", matriz: "GoogleMapsCompatible_Level8", ext: "png", fecha: "2016-01-01", etiqueta: "Black Marble 2016 (promedio anual, no sirve para apagones recientes)" },
  ] },
};

/** Un mosaico de z2 con el día completo pesa decenas de KB; uno vacío pesa menos de ~1.5 KB y uno de un día a medio
 * publicar, unos pocos KB (medido en GIBS en oct 2026). Por debajo de esto se considera incompleto. */
export const MOSAICO_MINIMO = 8000;
// América, Europa/África y el Pacífico (a ambos lados de la línea de cambio de fecha, donde los productos diarios de
// órbita polar quedan a medias: medido en oct 2026 con el ozono OMPS, 14 mil píxeles contra 41 mil del día anterior).
const MUESTRAS = [[2, 1, 1], [2, 1, 2], [2, 2, 0], [2, 1, 3]];

/** Bytes de los mosaicos de muestra de una capa en una fecha (0 si falla alguno). */
async function bytesMuestra(capa, fecha, pedir) {
  let total = 0;
  for (const [z, y, x] of MUESTRAS) {
    try {
      const r = await pedir(urlGIBS(capa, fecha).replace("{z}", z).replace("{y}", y).replace("{x}", x));
      if (!r.ok || !/^image\//.test(r.tipo || "")) return 0;
      total += r.bytes;
    } catch (e) { return 0; }
  }
  return total;
}

/**
 * Productos diarios: el día de ayer suele estar a medio publicar (p. ej. NO₂ de TROPOMI: 37 KB contra 115-148 KB de los
 * días anteriores). Entre los últimos `dias` se elige el más completo (más bytes en los mosaicos de muestra); a igual
 * tamaño, el más reciente.
 */
export async function mejorDia(capa, pedir, ahora = new Date(), dias = 3) {
  let mejor = null;
  for (let d = 1; d <= dias; d++) {
    const f = haceDias(d, ahora), b = await bytesMuestra(capa, f, pedir);
    if (!mejor || b > mejor.bytes * 1.1) mejor = { fecha: f, bytes: b };
  }
  return mejor && mejor.bytes > 0 ? mejor.fecha : haceDias(1, ahora);
}

/** Mosaicos de z3 sobre México, EUA y Canadá (TEMPO solo cubre América del Norte). */
const MUESTRAS_NA = [[3, 3, 1], [3, 3, 2]];

/** «AAAA-MM-DDTHH:00:00Z» de hace `h` horas (GIBS ajusta la hora pedida al barrido que la contiene). */
export const haceHoras = (h, ahora = new Date()) => new Date(Math.floor(ahora.getTime() / 3600000) * 3600000 - h * 3600000).toISOString().slice(0, 19) + "Z";

/**
 * Productos por hora (TEMPO): GIBS publica un barrido por hora de día. El primero de la mañana (~13 UTC) y el último de la
 * tarde cubren solo una parte (medido en oct 2026: 4 KB contra 18 KB del mismo mosaico a mediodía) y de noche no hay
 * nada (404). Se revisan las últimas `horas` y se toma la más reciente con al menos 85 % de los bytes de la mejor.
 */
export async function mejorHora(def, pedir, ahora = new Date(), horas = 30, publicadas = null) {
  const vistas = [];
  // Desde oct 2026 GIBS solo responde a la hora exacta de cada barrido de TEMPO (p. ej. 14:52:41Z): si se conoce la
  // lista publicada se prueban esas horas; si no, horas en punto como antes.
  const candidatas = publicadas?.length ? [...publicadas].reverse().slice(0, horas) : Array.from({ length: horas }, (_, i) => haceHoras(i + 1, ahora));
  for (const t of candidatas) {
    let total = 0;
    for (const [z, y, x] of MUESTRAS_NA) {
      try {
        const r = await pedir(urlGIBS(def, t).replace("{z}", z).replace("{y}", y).replace("{x}", x));
        if (!r.ok || !/^image\//.test(r.tipo || "")) { total = 0; break; }
        total += r.bytes;
      } catch (e) { total = 0; break; }
    }
    vistas.push({ t, total });
    // Basta con ver unas horas con datos para comparar: a partir de la tercera con datos se decide.
    if (vistas.filter((v) => v.total > 0).length >= 3) break;
  }
  const max = Math.max(0, ...vistas.map((v) => v.total));
  return max > 0 ? vistas.find((v) => v.total >= max * 0.85).t : "default";
}

/**
 * Elige la primera candidata cuyo mosaico de prueba (z2, sobre América y Europa de noche) trae imagen.
 * `pedir(url)` devuelve {ok, tipo, bytes}; se inyecta para probar sin red.
 */
export async function elegirCandidata(def, fecha, pedir, fechas = [fecha]) {
  for (const c of def.candidatos) {
    for (const f of c.fecha ? [c.fecha] : fechas) {
      const base = urlGIBS(c, f);
      for (const [z, y, x] of MUESTRAS) {
        try {
          const r = await pedir(base.replace("{z}", z).replace("{y}", y).replace("{x}", x));
          if (r.ok && /^image\//.test(r.tipo || "") && r.bytes >= MOSAICO_MINIMO) return { ...c, fecha: f };
        } catch (e) { /* siguiente */ }
      }
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

/** Fechas anteriores para rellenar huecos: días (AAAA-MM-DD) o horas (AAAA-MM-DDTHH:00:00Z) antes de `fecha`. */
export function fechasRelleno(def, fecha, n = def.relleno || 0) {
  if (!n || !fecha || fecha === "default") return [];
  const porHora = fecha.includes("T"), base = new Date(porHora ? fecha : `${fecha}T12:00:00Z`).getTime();
  return Array.from({ length: n }, (_, i) => {
    const t = new Date(base - (i + 1) * (porHora ? 3600000 : 86400000)).toISOString();
    return porHora ? `${t.slice(0, 13)}:00:00Z` : t.slice(0, 10);
  });
}

/** Horas exactas publicadas de un producto por hora (las últimas 30 h hasta `hasta`); [] si GIBS no responde. */
export async function horasPublicadas(def, hasta = new Date(), pedirTexto = async (u) => (await fetch(u)).text()) {
  const iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
  try {
    return leerDominio(await pedirTexto(urlDominios(def.capa, def.matriz, iso(new Date(hasta.getTime() - 30 * 3600000)), iso(hasta))));
  } catch (e) { return []; }
}

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
    // Productos que tardan más en publicarse (hielo marino GHRSST: ~2 días): con la fecha por omisión se usa su último día completo.
    const porOmision = fecha === ayerUTC();
    if (def.retraso_dias && porOmision) fecha = haceDias(def.retraso_dias);
    let rellenos = null;
    if (def.por_hora) {
      const publicadas = await horasPublicadas(def, porOmision ? new Date() : new Date(`${fecha}T23:59:59Z`));
      fecha = porOmision ? await mejorHora(def, pedir, new Date(), 30, publicadas)
        : publicadas.filter((t) => t <= `${fecha}T18:00:00Z`).at(-1) || `${fecha}T18:00:00Z`;  // otro día: cerca del mediodía en México
      // Relleno con los barridos publicados anteriores (horas exactas), no con horas en punto que GIBS ya no reconoce.
      if (publicadas.length) rellenos = publicadas.filter((t) => t < fecha).slice(-(def.relleno || 0)).reverse();
    }
    else if (porOmision && def.capa && !def.fecha_fija) fecha = await mejorDia(def, pedir);  // día completo, no a medias
    if (def.fecha_fija && porOmision) fecha = def.fecha_fija;  // p. ej. «default» = lo más reciente que publique GIBS; otro día elegido se respeta
    if (def.candidatos) {
      eleccion = await elegirCandidata(def, fecha, pedir, porOmision ? [haceDias(1), haceDias(2), haceDias(3)] : [fecha]);
      if (!eleccion) throw new Error("NASA GIBS no devolvió imagen de luces nocturnas para esa fecha ni para la referencia anual");
    }
    this.activas.set(id, { fecha, eleccion, rellenos });
    this.#instalar(id);
    return eleccion;
  }

  desactivar(id) {
    this.activas.delete(id);
    for (const sid of [`img-${id}`, ...[1, 2, 3].map((k) => `img-${id}-r${k}`)]) {
      if (this.map.getLayer(sid)) this.map.removeLayer(sid);
      if (this.map.getSource(sid)) this.map.removeSource(sid);
    }
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
    const { fecha, eleccion, rellenos } = this.activas.get(id);
    const capa = eleccion || def;
    registrarProtocolo();  // mosaicos con error → transparentes (sin «estática» gris)
    this.map.addSource(`img-${id}`, { type: "raster", tiles: [conRespaldo(urlGIBS(capa, eleccion?.fecha || fecha))], tileSize: 256, maxzoom: def.maxzoom,
      attribution: "Imágenes: NASA GIBS / EOSDIS" });
    // Debajo de chokepoints, capas y eventos: primera capa propia del mapa.
    const antes = ["paises-contorno", "choke-anillo", "clusters"].find((l) => this.map.getLayer(l));
    this.map.addLayer({ id: `img-${id}`, type: "raster", source: `img-${id}`, paint: { "raster-opacity": def.opacidad ?? 0.85, "raster-fade-duration": 0 } }, antes);
    // Relleno: lo anterior va debajo de la capa principal (cada una se inserta justo antes de la que ya está arriba).
    let arriba = `img-${id}`;
    (rellenos || fechasRelleno(def, eleccion?.fecha || fecha)).forEach((f, k) => {
      const sid = `img-${id}-r${k + 1}`;
      this.map.addSource(sid, { type: "raster", tiles: [conRespaldo(urlGIBS(capa, f))], tileSize: 256, maxzoom: def.maxzoom, attribution: "Imágenes: NASA GIBS / EOSDIS" });
      this.map.addLayer({ id: sid, type: "raster", source: sid, paint: { "raster-opacity": def.opacidad ?? 0.85, "raster-fade-duration": 0 } }, arriba);
      arriba = sid;
    });
  }
}
