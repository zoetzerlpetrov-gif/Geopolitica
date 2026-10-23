// Contorno de países encima de imágenes satelitales, clima y «cambio en el tiempo»: esas capas tapan el mapa base y
// no se distingue dónde termina cada país. La línea se pone sola al encender una de ellas y se quita al apagar la última.
// Las capas raster se insertan debajo de «paises-contorno» (ver imagenes.js, clima.js, timelapse.js), así que la
// línea queda siempre arriba de ellas y abajo de los puntos y eventos.

export const ID = "paises-contorno";
const CUBRIENTES = /^(img-|clima-|tl-|bucle-|indice-)/;

/** ¿Alguna de estas capas tapa el mapa base? */
export const hayCubriente = (ids) => ids.some((id) => CUBRIENTES.test(id) && !/-(lineas|etiquetas|rayos)$/.test(id));

const vigilados = new WeakSet();

export function actualizarContornos(map, url = "data/base/countries.geojson") {
  // Los bucles animados (nubes, color real GOES, lluvia IMERG) agregan sus capas después, cuando GIBS responde qué cuadros
  // hay; sin esto, con una sola de ellas encendida la revisión llegaba antes que sus capas y el contorno no aparecía.
  if (!vigilados.has(map)) {
    vigilados.add(map);
    let pendiente = false;
    map.on("styledata", () => {
      if (pendiente) return;
      pendiente = true;
      setTimeout(() => { pendiente = false; revisar(map, url); }, 50);
    });
  }
  revisar(map, url);
}

function revisar(map, url) {
  const ids = (map.getStyle()?.layers || []).map((l) => l.id);
  const hace = hayCubriente(ids);
  if (hace && !map.getLayer(ID)) {
    if (!map.getSource(ID)) map.addSource(ID, { type: "geojson", data: url });
    const antes = ["choke-anillo", "clusters"].find((l) => map.getLayer(l));
    map.addLayer({ id: ID, type: "line", source: ID, paint: {
      "line-color": "rgba(255,255,255,0.85)", "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.6, 6, 1.4],
    } }, antes);
  } else if (!hace && map.getLayer(ID)) {
    map.removeLayer(ID);
  }
}
