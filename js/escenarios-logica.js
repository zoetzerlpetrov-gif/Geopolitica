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
/** Gráfica SVG de un histograma de pérdidas o de una serie (x, y), con títulos de ejes, marcas y una explicación debajo. */
export function svgResultado(r, { moneda = "MXN", simulaciones = 20000, ejeX = "Periodo", ejeY = "Valor" } = {}) {
  const W = 640, H = 230, mi = 62, md = 16, ms = 26, mb = 46;
  const ancho = W - mi - md, alto = H - ms - mb;
  const ejes = (tx, ty) => `<line x1="${mi}" y1="${H - mb}" x2="${W - md}" y2="${H - mb}" stroke="var(--line,#999)"/><line x1="${mi}" y1="${ms}" x2="${mi}" y2="${H - mb}" stroke="var(--line,#999)"/>
    <text x="${mi + ancho / 2}" y="${H - 6}" text-anchor="middle" class="g-eje">${tx}</text>
    <text x="14" y="${ms + alto / 2}" text-anchor="middle" class="g-eje" transform="rotate(-90 14 ${ms + alto / 2})">${ty}</text>`;
  if (r.serie?.length) {
    const xs = r.serie.map((p) => p.x), ys = r.serie.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(0, ...ys), y1 = Math.max(...ys) || 1;
    const px = (x) => mi + ((x - x0) / ((x1 - x0) || 1)) * ancho, py = (y) => H - mb - ((y - y0) / ((y1 - y0) || 1)) * alto;
    return `<figure class="graf-fig"><svg viewBox="0 0 ${W} ${H}" class="graf-esc" role="img" aria-label="Evolución de ${ejeY} por ${ejeX}">${ejes(ejeX, ejeY)}
      <line x1="${mi}" y1="${py(0)}" x2="${W - md}" y2="${py(0)}" stroke="#999" stroke-dasharray="3 3"/>
      <polyline fill="none" stroke="#C8102E" stroke-width="2" points="${r.serie.map((p) => `${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(" ")}"/>
      <text x="${mi - 4}" y="${py(y1) + 4}" text-anchor="end" class="g-et">${usd(y1)}</text><text x="${mi - 4}" y="${py(y0) + 4}" text-anchor="end" class="g-et">${usd(y0)}</text>
      <text x="${mi}" y="${H - mb + 14}" class="g-et">${x0}</text><text x="${W - md}" y="${H - mb + 14}" text-anchor="end" class="g-et">${x1}</text></svg>
      <figcaption class="meta">Cómo leerla: el eje horizontal es ${ejeX.toLowerCase()} y el vertical ${ejeY.toLowerCase()}. El valor más alto de la línea es ${usd(y1)}.</figcaption></figure>`;
  }
  if (!r.histograma?.length) return "";
  const hs = r.histograma, max = Math.max(...hs.map((b) => b.n)) || 1, w = ancho / hs.length;
  const desde = hs[0].desde, hasta = hs.at(-1).hasta, px = (v) => mi + ((v - desde) / ((hasta - desde) || 1)) * ancho;
  const marca = (v, et) => (v != null && Number.isFinite(v) && v >= desde && v <= hasta
    ? `<line x1="${px(v).toFixed(1)}" y1="${ms}" x2="${px(v).toFixed(1)}" y2="${H - mb}" stroke="var(--text,#222)" stroke-dasharray="4 3"/><text x="${(px(v) + 3).toFixed(1)}" y="${ms + 10}" class="g-et">${et}</text>` : "");
  const pct = (n) => `${Math.round((n / simulaciones) * 1000) / 10} %`;
  return `<figure class="graf-fig"><svg viewBox="0 0 ${W} ${H}" class="graf-esc" role="img" aria-label="Distribución de la pérdida en un año según ${simulaciones} simulaciones">${ejes(`Pérdida en un año (${moneda})`, "Simulaciones")}
    ${hs.map((b, i) => {
      const h = (b.n / max) * alto;
      return `<rect x="${(mi + i * w).toFixed(1)}" y="${(H - mb - h).toFixed(1)}" width="${Math.max(1, w - 1).toFixed(1)}" height="${h.toFixed(1)}" fill="#C8102E" opacity="0.8"><title>${usd(b.desde)} a ${usd(b.hasta)} ${moneda}: ${b.n} de ${simulaciones} simulaciones (${pct(b.n)})</title></rect>`;
    }).join("")}
    ${marca(r.media ?? r.perdida, "Promedio")}${marca(r.var95, "VaR 95 %")}
    <text x="${mi - 4}" y="${ms + 4}" text-anchor="end" class="g-et">${max}</text><text x="${mi - 4}" y="${H - mb + 4}" text-anchor="end" class="g-et">0</text>
    <text x="${mi}" y="${H - mb + 14}" class="g-et">${usd(desde)}</text><text x="${mi + ancho / 2}" y="${H - mb + 14}" text-anchor="middle" class="g-et">${usd((desde + hasta) / 2)}</text><text x="${W - md}" y="${H - mb + 14}" text-anchor="end" class="g-et">${usd(hasta)}</text></svg>
    <figcaption class="meta">Cómo leerla: el motor repite ${simulaciones.toLocaleString("es-MX")} veces un año posible (no son ${simulaciones.toLocaleString("es-MX")} años reales: es una simulación Monte Carlo).
      Cada barra cuenta cuántas de esas simulaciones terminaron con una pérdida en ese rango (eje horizontal, en ${moneda}); el eje vertical es el número de simulaciones.
      La barra de la izquierda suele ser la más alta porque en la mayoría de los años el evento no ocurre o cuesta poco. La línea «VaR 95 %» marca la pérdida que solo se supera en 1 de cada 20 años simulados.
      Para que se lea mejor, la gráfica llega hasta el 99 % de los casos; el 1 % más extremo queda fuera del dibujo pero sí cuenta en los números de la tabla.</figcaption></figure>`;
}
