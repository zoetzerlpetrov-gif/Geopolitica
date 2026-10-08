// Historial de 90 días (rama datos-eventos → data/historial/AAAA-MM-DD.json). Se pide SOLO cuando el
// usuario elige una ventana de 30 o 90 días en la línea de tiempo. Cada día trae registros compactos
// (sin resumen ni áreas secundarias); aquí se completan con valores neutros para que el mapa, los
// filtros y la ficha los traten como cualquier evento.
import { getJSON } from "./util.js";

/** Con 90 días solo se cargan severidad ≥ 3: hasta 180,000 registros serían demasiados para un celular. */
export const SEV_MIN_90 = 3;

export function aEvento(r, regionDe = {}) {
  return {
    id: r.id, fecha_utc: r.fecha_utc, _t: Date.parse(r.fecha_utc), titulo: r.titulo,
    resumen: r.resumen || "Registro del historial: solo se conservan título, fuente, fecha y enlace. Abre la fuente original para el detalle.",
    fuente: r.fuente, url: r.url, tipo_fuente: r.tipo_fuente || "noticia",
    pais_iso3: r.pais_iso3, region: regionDe[r.pais_iso3] || null, lat: r.lat, lon: r.lon,
    area_principal: r.area_principal, areas_secundarias: [], subtemas: [], actores: [],
    severidad: r.severidad, confianza_clasificacion: 0, verificado: false,
    impacto_mexico: r.impacto_mexico ?? null, nivel_alerta: r.nivel_alerta,
    fuentes: [{ fuente: r.fuente, url: r.url, tipo_fuente: r.tipo_fuente || "noticia" }],
    estado_dato: "estatico", es_historial: true,
  };
}

/** Días a pedir: los últimos `dias` del índice que todavía no se han cargado. */
export function diasPorCargar(indice, dias, cargados = new Set()) {
  return indice.dias.slice(-dias).map((d) => d.dia).filter((d) => !cargados.has(d));
}

/**
 * Descarga días del historial (4 a la vez) y devuelve eventos nuevos (los ids ya presentes se omiten).
 * @param {object} o
 * @param {number} o.dias          30 o 90
 * @param {Set<string>} o.existentes  ids ya cargados
 * @param {Set<string>} o.cargados    días ya descargados (se actualiza)
 * @param {object} o.regionDe      iso3 -> región
 * @param {(hechos:number,total:number)=>void} o.onProgreso
 */
export async function cargarHistorial({ dias, existentes, cargados, regionDe, onProgreso = () => {} }) {
  const indice = await getJSON("data/historial-indice.json", { bust: true });
  const pendientes = diasPorCargar(indice, dias, cargados);
  const sevMin = dias > 30 ? SEV_MIN_90 : 1;
  const nuevos = [];
  let hechos = 0;
  onProgreso(0, pendientes.length);
  const cola = [...pendientes];
  async function trabajador() {
    while (cola.length) {
      const dia = cola.shift();
      try {
        const d = await getJSON(`data/historial/${dia}.json`);
        for (const r of d.eventos) {
          if (r.severidad < sevMin || existentes.has(r.id)) continue;
          existentes.add(r.id);
          nuevos.push(aEvento(r, regionDe));
        }
        // Con severidad mínima, el día solo cuenta como cargado completo en la ventana de 30 días.
        if (sevMin === 1) cargados.add(dia);
      } catch (e) {
        console.warn(`historial ${dia}:`, e.message);
      }
      onProgreso(++hechos, pendientes.length);
    }
  }
  await Promise.all([trabajador(), trabajador(), trabajador(), trabajador()]);
  return { nuevos, dias: indice.dias.length, sevMin };
}
