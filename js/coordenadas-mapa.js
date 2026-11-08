export const BASES_COORDENADAS = [
  ["tematico", "Temático"], ["calles", "Calles"], ["satelite", "Satélite"], ["relieve", "Relieve"],
];
export const PROYECCIONES_COORDENADAS = [["mercator", "Plano 2D"], ["globe", "Globo 3D"]];

export function puntoGeografico(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
    ? { lat, lon } : null;
}

export function textoCoordenadas({ lat, lon }) {
  return `${lat}, ${lon}`;
}

// undefined conserva la búsqueda de lugares, null señala un par numérico fuera del mapa.
export function leerCoordenadas(entrada) {
  const partes = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*(?:,\s*|\s+)([+-]?(?:\d+(?:\.\d+)?|\.\d+))$/.exec(entrada.trim());
  return partes ? puntoGeografico(Number(partes[1]), Number(partes[2])) : undefined;
}

let navegar;
export function conectarCoordenadasMapa(abrir) {
  navegar = abrir;
}

export async function abrirCoordenadasMapa(punto, vista) {
  if (!navegar) throw new Error("El mapa aún se está preparando. Vuelve a pulsar el botón cuando esté listo.");
  return navegar(punto, vista);
}
