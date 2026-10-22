// Lógica de DOMINUS OPS (ops.html): Índice de Madurez (DMI), gobernanza, SITREP y plantillas. Funciones puras.

/** DMI global: promedio ponderado de las dimensiones calificadas (1 a 5). Pesos opcionales por dimensión (1 por omisión). */
export function dmi(puntos, pesos = {}) {
  let s = 0, w = 0;
  for (const [k, v] of Object.entries(puntos)) {
    const n = Number(v);
    if (!(n >= 1 && n <= 5)) continue;
    const p = Number(pesos[k] ?? 1) || 1;
    s += n * p; w += p;
  }
  return w ? Math.round((s / w) * 10) / 10 : null;
}

/** Nivel DMI (1 Reactivo … 5 Estratégico) de un valor. */
export const nivelDMI = (x, niveles) => (x == null ? null : niveles[Math.min(4, Math.max(0, Math.floor(x + 0.0001) - 1))]);

/** Promedio de un cuestionario Likert (1-5) por sección: {seccion: promedio}. Las respuestas vacías no cuentan. */
export function promediosCuestionario(secciones, respuestas) {
  const out = {};
  secciones.forEach((s, i) => {
    const v = s.preguntas.map((_, j) => Number(respuestas[`${i}-${j}`])).filter((n) => n >= 1 && n <= 5);
    out[s.seccion] = v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
  });
  return out;
}

/** Sugerencia de calificación DMI a partir del cuestionario de la Fase I (Readiness Assessment). */
export const SECCION_A_DIMENSION = {
  "Sección A — Estrategia corporativa": ["Estrategia"],
  "Sección B — Gobierno y gestión de proyectos": ["Gobernanza", "Procesos y calidad"],
  "Sección C — Normatividad y cumplimiento": ["Cumplimiento normativo"],
  "Sección D — Tecnología y datos": ["Tecnología y datos", "Seguridad y privacidad"],
  "Sección E — Riesgos y resiliencia": ["Riesgo y continuidad"],
  "Sección F — Personas y cultura": ["Personas y cultura"],
};
export function sugerirDMI(promedios) {
  const out = {};
  for (const [sec, dims] of Object.entries(SECCION_A_DIMENSION)) if (promedios[sec] != null) for (const d of dims) out[d] = Math.round(promedios[sec]);
  return out;
}

/** Vértices de un radar SVG (centro c, radio r) para valores 0-5 en el orden dado. */
export function puntosRadar(valores, c = 150, r = 110) {
  const n = valores.length;
  return valores.map((v, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n, k = (Math.max(0, Math.min(5, Number(v) || 0)) / 5) * r;
    return [Math.round((c + k * Math.cos(a)) * 10) / 10, Math.round((c + k * Math.sin(a)) * 10) / 10];
  });
}

/** Color de mapa de calor para una calificación de gobernanza 1-5 (rojo / ámbar / verde, como en el Volumen V). */
export const colorGob = (n) => (!(Number(n) >= 1) ? "sin evaluar" : n <= 2 ? "rojo" : n === 3 ? "ambar" : "verde");

/** Plan de remediación: brechas de gobernanza ordenadas por impacto (5 − calificación) y luego por esfuerzo (menor primero). */
export function planRemediacion(dimensiones, evaluacion) {
  return dimensiones.map(([d, falla, control]) => ({ d, falla, control, ...(evaluacion[d] || {}) }))
    .filter((x) => Number(x.nota) >= 1 && Number(x.nota) <= 3)
    .sort((a, b) => (Number(a.nota) - Number(b.nota)) || ((Number(a.esfuerzo) || 3) - (Number(b.esfuerzo) || 3)));
}

/** SITREP a partir de los eventos del mapa en los países que vigila la operación (ISO3) y de los KPIs capturados. */
export function sitrep(eventos, paises, kpis = [], ahora = new Date(), horas = 24) {
  const desde = ahora.getTime() - horas * 3600000;
  const set = new Set(paises.map((p) => p.toUpperCase()));
  const rel = eventos.filter((e) => set.has(e.pais_iso3) && Date.parse(e.fecha_utc) >= desde).sort((a, b) => b.severidad - a.severidad);
  const criticos = rel.filter((e) => e.severidad >= 4);
  const rojo = kpis.filter((k) => k.estado === "rojo"), ambar = kpis.filter((k) => k.estado === "ambar");
  const condicion = criticos.length >= 3 || rojo.length ? "ROJO" : criticos.length || ambar.length ? "ÁMBAR" : "VERDE";
  const linea = (e) => `- [S${e.severidad}] ${e.pais_iso3} · ${e.titulo} (${e.fuente})`;
  return { condicion, total: rel.length, criticos: criticos.length,
    texto: `SITREP · ${ahora.toISOString().slice(0, 16).replace("T", " ")} UTC · ventana ${horas} h\n\n1. CONDICIÓN GENERAL: ${condicion}\n\n`
      + `2. ENTORNO (eventos del mapa en ${[...set].join(", ") || "—"}): ${rel.length} eventos, ${criticos.length} de severidad 4-5.\n${rel.slice(0, 10).map(linea).join("\n") || "- Sin eventos en la ventana."}\n\n`
      + `3. KPIs: ${kpis.length ? kpis.map((k) => `\n- ${k.nombre}: ${k.valor ?? "—"} (meta ${k.meta ?? "—"}) · ${String(k.estado || "sin estado").toUpperCase()}${k.dueno ? ` · dueño: ${k.dueno}` : ""}`).join("") : "sin KPIs capturados."}\n\n`
      + `4. DECISIONES REQUERIDAS: ${rojo.length ? rojo.map((k) => k.nombre).join(", ") : criticos.length ? "revisar exposición a los eventos críticos" : "ninguna"}\n\n5. PRÓXIMO REPORTE: según el Battle Rhythm.` };
}

/** Plantilla → CSV (separador coma, comillas dobles). */
export function aCSV(columnas, filas) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [columnas, ...filas].map((f) => f.map(q).join(",")).join("\n");
}

// ------------------------------------------------------------------ biblioteca de metodologías (config/ops_biblioteca/*.json)
const sinAc = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const escH = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Metodologías que contienen todas las palabras (nombre, organismo, para qué, conceptos o nombres de plantillas). */
export function buscarMetodologias(lista, q = "") {
  const p = sinAc(q).split(/\s+/).filter((x) => x.length > 1);
  if (!p.length) return lista;
  return lista.filter((m) => {
    const t = sinAc([m.nombre, m.organismo, m.para_que, ...(m.conceptos || []).flat(), ...(m.plantillas || []).map((x) => x.nombre)].join(" "));
    return p.every((x) => t.includes(x));
  });
}

/** Valor vacío de un campo de plantilla (las tablas son listas de filas). */
export const vacioDe = (campo) => (campo.tipo === "tabla" ? [] : "");

/** Documento de una plantilla llenada: Markdown y HTML (para Word, PDF o imprimir). */
export function documentoPlantilla(met, pl, valores = {}, cliente = {}) {
  const titulo = `${pl.nombre} — ${met.nombre}`;
  let md = `# ${titulo}\n\n${cliente.nombre ? `**Cliente:** ${cliente.nombre}\n\n` : ""}_${pl.proposito || ""}_\n\n`;
  let html = `<h1>${escH(titulo)}</h1>${cliente.nombre ? `<p><b>Cliente:</b> ${escH(cliente.nombre)}</p>` : ""}<p><i>${escH(pl.proposito || "")}</i></p>`;
  for (const c of pl.campos || []) {
    const v = valores[c.k];
    if (c.tipo === "tabla") {
      const filas = Array.isArray(v) ? v : [];
      md += `## ${c.etiqueta}\n\n| ${c.columnas.join(" | ")} |\n| ${c.columnas.map(() => "---").join(" | ")} |\n${filas.map((f) => `| ${c.columnas.map((_, i) => String(f[i] ?? "").replace(/\|/g, "\\|")).join(" | ")} |`).join("\n")}\n\n`;
      html += `<h2>${escH(c.etiqueta)}</h2><table border="1" cellspacing="0" cellpadding="4"><tr>${c.columnas.map((x) => `<th>${escH(x)}</th>`).join("")}</tr>${filas.map((f) => `<tr>${c.columnas.map((_, i) => `<td>${escH(f[i] ?? "")}</td>`).join("")}</tr>`).join("")}</table>`;
    } else {
      md += `**${c.etiqueta}:** ${v ?? ""}\n\n`;
      html += `<p><b>${escH(c.etiqueta)}:</b> ${escH(v ?? "").replace(/\n/g, "<br>")}</p>`;
    }
  }
  const pie = `${met.organismo ? `${met.organismo} · ` : ""}${met.version || ""}`;
  return { titulo, md: md + `---\n${pie}\n`, html: html + `<hr><p style="font-size:9pt;color:#555">${escH(pie)} · Plantilla de la biblioteca DOMINUS OPS.</p>` };
}
