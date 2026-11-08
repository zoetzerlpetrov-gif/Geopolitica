// Agregados al catálogo de grafología que vienen del manual y la hoja de análisis de la persona usuaria
// (config/grafologia_manual.json): grupos nuevos, variantes nuevas y lecturas que faltaban. No duplica.
export function unirManual(catalogo, complemento, datos) {
  if (!datos) return catalogo;
  const sec = (id) => catalogo.secciones.find((s) => s.id === id);
  for (const { seccion, grupo } of datos.grupos_nuevos || []) {
    const s = sec(seccion); if (!s || s.grupos.some((g) => g.id === grupo.id)) continue;
    s.grupos.push({ ...grupo, rasgos: grupo.rasgos.map((r) => ({ nota: "", interpretacion: "", indicadores: "", variantes: [], ...r })) });
  }
  const rasgo = (k) => { const [a, b, c] = k.split("/"); return sec(a)?.grupos.find((g) => g.id === b)?.rasgos.find((r) => r.id === c); };
  for (const { clave, variante } of datos.variantes_nuevas || []) { const r = rasgo(clave); if (r && !r.variantes.includes(variante)) r.variantes.push(variante); }
  for (const [k, t] of Object.entries(datos.interpretaciones || {})) {
    const r = rasgo(k); if (r && !r.interpretacion) { r.interpretacion = t; if (complemento?.interpretaciones) delete complemento.interpretaciones[k]; }
  }
  if (complemento) complemento.interpretaciones = { ...(complemento.interpretaciones || {}), ...(datos.complementarias || {}) };
  return catalogo;
}
