// Letras y números: convierte config/grafologia_letras.json en una sección más del catálogo de grafología
// («letras_y_numeros», un grupo por carácter) y sus lecturas, que se muestran como lectura complementaria.
export const SECCION_LETRAS = "letras_y_numeros";

const may = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);

/** Devuelve { seccion, interpretaciones } a partir de los datos de letras. */
export function seccionLetras(datos) {
  const interpretaciones = {};
  const grupos = (datos?.caracteres || []).map((c) => {
    const rasgos = [
      ...c.variantes.map(([id, nombre, lectura]) => ({ id, nombre, lectura })),
      ...(datos.genericas || []).map(([id, nombre, lectura]) => ({ id: `gen_${id}`, nombre, lectura: lectura.replaceAll("{s}", c.simboliza), generica: true })),
    ].map((r) => {
      interpretaciones[`${SECCION_LETRAS}/${c.id}/${r.id}`] = may(r.lectura);
      return { id: r.id, nombre: r.nombre, nota: "", interpretacion: "", indicadores: "", variantes: [], generica: !!r.generica };
    });
    return { id: c.id, nombre: c.nombre, tipo: c.tipo, simboliza: c.simboliza, rasgos };
  });
  return {
    seccion: { id: SECCION_LETRAS, nombre: "Letras y números", lema: "Letras representativas o distintas del modelo caligráfico",
      descripcion: "Cada letra o número tiene una lectura tradicional según las partes que lo forman (óvalos, hampas, jambas, barras, puntos) y la zona en que se trazan. Se marcan solo los que llaman la atención: por tamaño, forma o diferencia con el modelo escolar.", grupos },
    interpretaciones,
  };
}

/** Agrega la sección de letras al catálogo (antes de «temperamento») y sus lecturas al complemento. No duplica. */
export function unirLetras(catalogo, complemento, datos) {
  if (!datos || catalogo.secciones.some((s) => s.id === SECCION_LETRAS)) return catalogo;
  const { seccion, interpretaciones } = seccionLetras(datos);
  const i = catalogo.secciones.findIndex((s) => s.id === "temperamento");
  catalogo.secciones.splice(i < 0 ? catalogo.secciones.length : i, 0, seccion);
  complemento.interpretaciones = { ...(complemento.interpretaciones || {}), ...interpretaciones };
  return catalogo;
}
