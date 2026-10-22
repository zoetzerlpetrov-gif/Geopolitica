// Lógica del simulador de escenarios (sin DOM): instrucciones para la IA, validación de su respuesta, matriz 5×5 y
// filas para exportar. La IA solo propone QUÉ escenario y QUÉ parámetros revisar; los números los calcula js/ciencia.js.

/** Catálogo resumido para la IA: id, nombre, categoría, modelo y parámetros que puede ajustar. */
export const catalogoParaIA = (cat) => cat.map((e) => `${e.id} | ${e.nombre} | ${e.categoria} | modelo ${e.modelo} | parámetros: ${(e.parametros || []).filter((p) => p.tipo !== "json").map((p) => `${p.k} (${p.etiqueta}${p.unidad ? `, ${p.unidad}` : ""})`).join("; ")}`).join("\n");

const REGLAS = "Responde SOLO con JSON válido, sin texto adicional, con la forma {\"escenarios\":[{\"id\":\"<id del catálogo>\",\"motivo\":\"<por qué aplica, 1 frase>\",\"ajustes\":{\"<parámetro>\":<número>}}]}. "
  + "Usa únicamente ids del catálogo. En «ajustes» pon solo parámetros numéricos del catálogo y solo si el contexto da un dato concreto; si no, deja {}. No inventes cifras: los cálculos los hace un motor matemático.";

/** Mensajes para pedir a la IA escenarios adicionales a partir del contexto del cliente o de los eventos. */
export function promptPropuestas(cat, contexto, yaPropuestos = []) {
  return [{ role: "system", content: "Eres un analista de riesgos empresariales (ISO 31000, COSO ERM). Respondes en español. " + REGLAS },
    { role: "user", content: `Catálogo de escenarios:\n${catalogoParaIA(cat)}\n\nContexto:\n${contexto}\n\nYa propuestos: ${yaPropuestos.join(", ") || "ninguno"}.\nPropón hasta 8 escenarios más del catálogo que apliquen a este contexto, del más al menos relevante.` }];
}

/** Mensajes para traducir un escenario descrito libremente a escenarios del catálogo con sus parámetros. */
export function promptEscenarioLibre(cat, descripcion, contexto) {
  return [{ role: "system", content: "Eres un analista de riesgos cuantitativo. Respondes en español. " + REGLAS },
    { role: "user", content: `Catálogo de escenarios:\n${catalogoParaIA(cat)}\n\nContexto de la empresa:\n${contexto}\n\nEscenario descrito por el analista:\n${descripcion}\n\nElige de 1 a 4 escenarios del catálogo que mejor modelen lo descrito y los ajustes numéricos que se deduzcan del texto.` }];
}

/** Valida la respuesta de la IA: solo ids existentes y ajustes numéricos de parámetros que existen. */
export function leerRespuestaIA(texto, cat) {
  const porId = Object.fromEntries(cat.map((e) => [e.id, e]));
  const m = String(texto || "").match(/\{[\s\S]*\}/);
  if (!m) return [];
  let d;
  try { d = JSON.parse(m[0]); } catch (e) { return []; }
  return (Array.isArray(d.escenarios) ? d.escenarios : []).filter((x) => porId[x?.id]).map((x) => {
    const permitidos = new Set((porId[x.id].parametros || []).filter((p) => p.tipo !== "json").map((p) => p.k));
    const ajustes = Object.fromEntries(Object.entries(x.ajustes || {}).filter(([k, v]) => permitidos.has(k) && typeof v === "number" && Number.isFinite(v)));
    return { id: x.id, motivo: String(x.motivo || "").slice(0, 300), ajustes };
  });
}

/** Matriz 5×5: cuántos riesgos caen en cada celda (probabilidad × impacto). */
export function matriz(registro) {
  const m = Array.from({ length: 5 }, () => Array(5).fill(null).map(() => []));
  for (const r of registro) if (r.nivel_prob && r.nivel_imp) m[5 - r.nivel_prob][r.nivel_imp - 1].push(r.nombre);
  return m; // fila 0 = probabilidad 5 (arriba)
}

/** Filas del registro de riesgos para exportar. */
export const filasRegistro = (registro) => registro.map((r) => ({
  escenario: r.nombre, categoria: r.categoria, modelo: r.modelo, probabilidad_anual: r.prob == null ? "" : Math.round(r.prob * 1000) / 10,
  perdida_esperada: r.perdida == null ? "" : Math.round(r.perdida), var95: r.var95 == null ? "" : Math.round(r.var95), var99: r.var99 == null ? "" : Math.round(r.var99),
  nivel_prob: r.nivel_prob ?? "", nivel_imp: r.nivel_imp ?? "", nivel: r.nivel ?? "", respuesta: r.respuesta || "", dueno: r.dueno || "", fecha: r.fecha || "",
}));

/** Resumen numérico del registro que se le da a la IA para redactar (ella no calcula). */
export function promptInterpretacion(registro, contexto) {
  const filas = filasRegistro(registro).map((f) => `${f.escenario}: P=${f.probabilidad_anual}% · pérdida esperada ${f.perdida_esperada} · VaR95 ${f.var95} · nivel ${f.nivel || "—"}`).join("\n");
  return [{ role: "system", content: "Eres un consultor de inteligencia estratégica y gestión de riesgos. Respondes en español, con viñetas, sin inventar cifras: usa solo las que se te dan." },
    { role: "user", content: `Contexto:\n${contexto}\n\nResultados calculados por el motor matemático:\n${filas}\n\nRedacta: 1) los 3 riesgos prioritarios y por qué, 2) respuesta recomendada para cada uno (evitar, reducir, transferir, aceptar) con controles concretos, 3) indicadores de alerta temprana (KRI) a vigilar. Máximo 20 viñetas.` }];
}

const usd = (n) => (n == null || !Number.isFinite(n) ? "—" : Math.round(n).toLocaleString("es-MX"));
/** Gráfica SVG de un histograma de pérdidas o de una serie (x, y). */
export function svgResultado(r) {
  if (r.serie?.length) {
    const xs = r.serie.map((p) => p.x), ys = r.serie.map((p) => p.y), W = 600, H = 170, m = 30;
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(0, ...ys), y1 = Math.max(...ys) || 1;
    const px = (x) => m + ((x - x0) / ((x1 - x0) || 1)) * (W - 2 * m), py = (y) => H - m - ((y - y0) / ((y1 - y0) || 1)) * (H - 2 * m);
    return `<svg viewBox="0 0 ${W} ${H}" class="graf-esc" role="img" aria-label="Evolución"><line x1="${m}" y1="${py(0)}" x2="${W - m}" y2="${py(0)}" stroke="#999"/>
      <polyline fill="none" stroke="#C8102E" stroke-width="2" points="${r.serie.map((p) => `${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(" ")}"/>
      <text x="${m}" y="14" class="g-val">máx. ${usd(y1)}</text><text x="${m}" y="${H - 8}" class="g-et">${x0}</text><text x="${W - m}" y="${H - 8}" text-anchor="end" class="g-et">${x1}</text></svg>`;
  }
  if (!r.histograma?.length) return "";
  const W = 600, H = 170, m = 30, max = Math.max(...r.histograma.map((b) => b.n)) || 1, w = (W - 2 * m) / r.histograma.length;
  return `<svg viewBox="0 0 ${W} ${H}" class="graf-esc" role="img" aria-label="Distribución de pérdidas anuales">${r.histograma.map((b, i) => {
    const h = (b.n / max) * (H - 2 * m);
    return `<rect x="${(m + i * w).toFixed(1)}" y="${(H - m - h).toFixed(1)}" width="${(w - 1).toFixed(1)}" height="${h.toFixed(1)}" fill="#C8102E" opacity="0.8"><title>${usd(b.desde)} – ${usd(b.hasta)}: ${b.n} simulaciones</title></rect>`;
  }).join("")}<text x="${m}" y="14" class="g-val">Pérdida anual simulada (20 000 años)</text><text x="${m}" y="${H - 8}" class="g-et">${usd(r.histograma[0].desde)}</text><text x="${W - m}" y="${H - 8}" text-anchor="end" class="g-et">${usd(r.histograma.at(-1).hasta)}</text></svg>`;
}
