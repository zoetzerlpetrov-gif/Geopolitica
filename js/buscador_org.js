// Buscador de Organizaciones: empresas, organismos internacionales y embajadas/consulados por nombre.
// Lee los índices ligeros que genera «Construir capas» (buscar_<familia>.json) o, para las familias en GeoJSON,
// el archivo de la capa. Sin red adicional: todo sale de este mismo sitio.
import { getJSON, sinAcentos, palabrasDe } from "./util.js";

export const MAX_RESULTADOS = 60;
const TIPO_DIPLOMATICO = { embassy: "Embajada", consulate: "Consulado", consulate_general: "Consulado general", honorary_consulate: "Consulado honorario",
  liaison: "Oficina de enlace", permanent_mission: "Misión permanente", delegation: "Delegación", high_commission: "Alto comisionado", ambassadors_residence: "Residencia del embajador" };

/** Fila del índice [n, st, p, lon, lat, id, x] → objeto. */
export const deFila = (familia, f) => ({ familia, n: f[0], st: f[1], p: f[2], lon: f[3], lat: f[4], id: f[5], x: f[6] || "" });

/** Feature de una capa GeoJSON (organismos) → objeto. */
export function deFeature(familia, ft) {
  const p = ft.properties || {};
  let c = ft.geometry?.coordinates;
  while (Array.isArray(c?.[0])) c = c[0];
  if (!p.n || !Array.isArray(c)) return null;
  return { familia, n: p.n, st: p.st, p: p.p || "", lon: c[0], lat: c[1], id: p.id, x: String(p.x || "") };
}

/** Detalle legible: «embassy|MX» → «Embajada de México» (con `nombrePais`). */
export function detalle(r, nombrePais = (x) => x) {
  if (r.familia === "embajadas") {
    const [tipo, pais, aprox] = r.x.split("|");
    return `${TIPO_DIPLOMATICO[tipo] || "Representación diplomática"}${pais ? ` de ${nombrePais(pais.length === 2 ? pais.toUpperCase() : pais)}` : ""}`
      + (aprox ? " (ubicación aproximada: ciudad sede)" : "");
  }
  return r.x;
}

/** Resultados que contienen TODAS las palabras (sin acentos) en nombre, detalle o país; primero los que empiezan igual. */
export function filtrar(filas, q, nombrePais = (x) => x, max = MAX_RESULTADOS) {
  const ps = palabrasDe(q);
  if (!ps.length) return [];
  const out = [];
  for (const r of filas) {
    const t = sinAcentos(`${r.n} ${detalle(r, nombrePais)} ${nombrePais(r.p)} ${r.p}`);
    if (ps.every((w) => t.includes(w))) out.push(r);
  }
  const ini = ps[0];
  out.sort((a, b) => (sinAcentos(b.n).startsWith(ini) - sinAcentos(a.n).startsWith(ini)) || a.n.localeCompare(b.n, "es"));
  return out.slice(0, max);
}

/** Descarga (una vez) los índices de las familias disponibles. */
export async function cargarIndices(familias) {
  const partes = await Promise.all(familias.filter((f) => f.disponible).map(async (f) => {
    try {
      if (f.manifest.indice) return (await getJSON(f.manifest.indice)).map((x) => deFila(f.id, x));
      if (f.manifest.formato === "geojson") return (await getJSON(f.manifest.archivo)).features.map((ft) => deFeature(f.id, ft)).filter(Boolean);
    } catch (e) { /* índice aún no generado: esa familia no aparece en los resultados */ }
    return [];
  }));
  return partes.flat();
}
