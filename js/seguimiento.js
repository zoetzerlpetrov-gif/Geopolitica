// Listas de seguimiento personales (idea tomada de Aureum). Se guardan SOLO en este navegador
// (localStorage): no se envían a ningún servidor ni se comparten entre dispositivos.
import { storage, distanciaKm } from "./util.js";

const CLAVE = "gp_seguimiento";
const RADIO_KM = 300;

export function leer() {
  try { return JSON.parse(storage.get(CLAVE) || "[]"); } catch (e) { return []; }
}
function guardar(lista) { storage.set(CLAVE, JSON.stringify(lista)); }

export const sigue = (id) => leer().some((x) => x.id === id);

/** Agrega o quita una entidad/zona. Devuelve true si quedó seguida. */
export function alternar(item) {
  const lista = leer();
  const i = lista.findIndex((x) => x.id === item.id);
  if (i >= 0) { lista.splice(i, 1); guardar(lista); return false; }
  lista.push({ ...item, desde: new Date().toISOString(), visto: new Date().toISOString() });
  guardar(lista);
  return true;
}

/** Marca como vistos los eventos de un elemento (para contar "nuevos" la próxima vez). */
export function marcarVisto(id) {
  const lista = leer();
  const x = lista.find((y) => y.id === id);
  if (x) { x.visto = new Date().toISOString(); guardar(lista); }
}

/** Eventos cercanos a cada elemento seguido y cuántos son posteriores a la última vez que se vio. */
export function resumen(eventos) {
  return leer().map((x) => {
    const cerca = eventos.filter((ev) => ev.lat != null && distanciaKm(x.lat, x.lon, ev.lat, ev.lon) <= RADIO_KM);
    return { ...x, eventos: cerca, nuevos: cerca.filter((ev) => ev.fecha_utc > x.visto).length };
  });
}
