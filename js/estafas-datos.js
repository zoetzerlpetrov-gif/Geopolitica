import { getJSON } from "./util.js";

// Rama del MISMO repositorio, dedicada a estafas. Una corrida antigua de datos-vivos no puede sobrescribirla.
export const ESTAFAS_PUBLICADAS = "https://raw.githubusercontent.com/zoetzerlpetrov-gif/Geopolitica/datos-estafas/vivos/estafas.geojson";
export const ESTAFAS_LOCAL = "data/vivos/estafas.geojson";

export function estafasActuales(fc) {
  return fc?.version_esquema >= 2 && fc.type === "FeatureCollection" && Array.isArray(fc.features)
    && Number.isFinite(Date.parse(fc.generado_utc));
}

/** La publicación dedicada es la referencia. Pages es respaldo; nunca se acepta el formato antiguo. */
export async function leerEstafas(leer = getJSON) {
  const respuestas = await Promise.allSettled([ESTAFAS_PUBLICADAS, ESTAFAS_LOCAL].map((url) => leer(url, { bust: true })));
  const candidatas = respuestas.filter((r) => r.status === "fulfilled" && estafasActuales(r.value)).map((r) => r.value);
  if (!candidatas.length) throw new Error("No se pudo leer una publicación vigente de estafas; se conservan los datos ya dibujados.");
  return candidatas[0];
}
