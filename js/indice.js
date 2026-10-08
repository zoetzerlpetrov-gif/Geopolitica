// Mapa de calor por país (Fase 4): coropleta del Índice de Inestabilidad (0–100, docs/INDICADORES.md).
// Se descarga solo al activarla: países 1:110m (48 KB comprimido) + data/indice-paises.json.
import { getJSON } from "./util.js";

// Escalones del color: sin dato transparente; 1–24 amarillo pálido … 75–100 rojo.
export const ESCALA = [
  { desde: 0, color: "#f4e3a1", etiqueta: "0–24" },
  { desde: 25, color: "#f0b35b", etiqueta: "25–49" },
  { desde: 50, color: "#e0703a", etiqueta: "50–74" },
  { desde: 75, color: "#b3261e", etiqueta: "75–100" },
];

/** Agrega `indice` y `eventos` a cada país del GeoJSON (sin dato = -1). */
export function unirIndice(paises, indice) {
  return {
    type: "FeatureCollection",
    features: paises.features.map((f) => {
      const d = indice[f.properties.iso3];
      return { ...f, properties: { iso3: f.properties.iso3, indice: d ? d.indice : -1, eventos: d ? d.eventos : 0 } };
    }),
  };
}

export class CapaIndice {
  constructor(map, { onClic } = {}) { this.map = map; this.onClic = onClic; this.datos = null; this.activa = false; }

  async activar() {
    this.activa = true;
    if (!this.datos) {
      const [paises, ind] = await Promise.all([
        getJSON("data/base/countries-110m.geojson"),
        getJSON("data/indice-paises.json", { bust: true }).catch(() => ({ paises: {} })),
      ]);
      this.generado = ind.generado_utc;
      this.total = Object.keys(ind.paises).length;
      this.datos = unirIndice(paises, ind.paises);
    }
    this.#instalar();
    return { paises: this.total, generado: this.generado };
  }

  desactivar() {
    this.activa = false;
    for (const l of ["indice-relleno", "indice-borde"]) if (this.map.getLayer(l)) this.map.removeLayer(l);
    if (this.map.getSource("indice")) this.map.removeSource("indice");
  }

  reinstalar() { if (this.activa && this.datos) this.#instalar(); }

  #instalar() {
    const m = this.map;
    if (m.getSource("indice")) return;
    m.addSource("indice", { type: "geojson", data: this.datos });
    const color = ["step", ["get", "indice"], "rgba(0,0,0,0)"];
    for (const e of ESCALA) color.push(e.desde, e.color);
    // Debajo de imágenes, chokepoints y eventos: es contexto, no debe tapar los puntos.
    const antes = ["choke-anillo", "clusters"].find((l) => m.getLayer(l));
    m.addLayer({ id: "indice-relleno", type: "fill", source: "indice", paint: { "fill-color": color, "fill-opacity": 0.55 } }, antes);
    m.addLayer({ id: "indice-borde", type: "line", source: "indice", filter: [">=", ["get", "indice"], 0],
      paint: { "line-color": "#7a2a10", "line-width": 0.4, "line-opacity": 0.5 } }, antes);
    if (!this.clicInstalado) {
      this.clicInstalado = true;
      m.on("click", "indice-relleno", (e) => {
        // Si debajo del clic hay un evento, gana el evento.
        if (m.queryRenderedFeatures(e.point, { layers: ["evento", "clusters"].filter((l) => m.getLayer(l)) }).length) return;
        const p = e.features[0].properties;
        this.onClic?.(p, e.lngLat);
      });
    }
  }
}
