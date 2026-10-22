// Informe integral de DOMINUS OPS (sin DOM): estado de las 6 fases, hallazgos, propuestas, servicios, plan de trabajo,
// presupuesto y el documento HTML. Todo se calcula con lo capturado en ops.html; la IA solo redacta (opcional).
import { dmi, nivelDMI, puntosRadar, planRemediacion } from "./ops-logica.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const n0 = (x) => (x == null || !Number.isFinite(Number(x)) ? "—" : Number(x).toLocaleString("es-MX", { maximumFractionDigits: 0 }));

/** Cada dimensión del DMI → fase y etapa de DOMINUS OPS, sala o servicio, y metodologías de la biblioteca. */
export const MAPA_DIMENSIONES = {
  "Estrategia": { fase: 0, servicio: "Inteligencia estratégica, objetivos (OKR/BSC) y despliegue de la estrategia", metodologias: ["okr", "balanced_scorecard", "hoshin_kanri"] },
  "Gobernanza": { fase: 1, servicio: "Diseño de gobierno: derechos de decisión, comités, RACI y control interno", metodologias: ["cobit2019", "coso2013"] },
  "Riesgo y continuidad": { fase: 0, servicio: "Plan de riesgos, simulación de escenarios y continuidad del negocio", metodologias: ["iso31000", "cosoerm2017", "iso22301"] },
  "Procesos y calidad": { fase: 2, servicio: "Rediseño y mejora de procesos con control de calidad", metodologias: ["lean", "six_sigma_dmaic", "iso9001", "bpm_bpmn"] },
  "Tecnología y datos": { fase: 1, servicio: "Arquitectura de datos y tecnología, gobierno de datos", metodologias: ["dmbok2", "togaf10", "itil4"] },
  "Seguridad y privacidad": { fase: 3, servicio: "Cyber Room: postura de seguridad, Zero Trust y privacidad", metodologias: ["iso27001", "nistcsf2", "iso27701"] },
  "Personas y cultura": { fase: 2, servicio: "Gestión del cambio y adopción", metodologias: ["gestion_cambio"] },
  "Monitoreo (War Room)": { fase: 3, servicio: "War Room: tableros, KPIs con dueño y Battle Rhythm", metodologias: ["devops_dora", "sre"] },
  "Cumplimiento normativo": { fase: 0, servicio: "Alineación normativa y programa de cumplimiento", metodologias: ["iso37001"] },
};

/** Servicios fuera del alcance de una firma de consultoría como DOMINUS OPS (editable en la pestaña Informe). */
export const NO_OFRECIDOS = [
  "Dictamen fiscal o auditoría de estados financieros (lo firma un contador público registrado e independiente).",
  "Certificación ISO o SOC 2 (la emite un organismo de certificación acreditado; DOMINUS OPS prepara a la empresa para obtenerla).",
  "Representación legal, litigio o defensa ante autoridades (requiere abogado con cédula; se coordina con el despacho del cliente).",
  "Venta o intermediación de seguros (requiere agente autorizado).",
  "Seguridad física armada, escoltas o custodia de bienes.",
  "Intervención de comunicaciones, vigilancia o rastreo de personas (fuera de la ley y de los principios del marco).",
  "Operación permanente de sistemas del cliente sin un contrato de servicio administrado específico.",
];

/** Tarifas de referencia del mercado mexicano de consultoría (MXN por hora, estimación editable; no es una cotización). */
export const TARIFAS = [
  { rol: "Socio o director del proyecto", tarifa: 4500, dedicacion: 0.1 },
  { rol: "Gerente de proyecto", tarifa: 2600, dedicacion: 0.5 },
  { rol: "Consultor senior (riesgo, procesos, cumplimiento)", tarifa: 1700, dedicacion: 1 },
  { rol: "Especialista (ciberseguridad, datos, legal)", tarifa: 2200, dedicacion: 0.3 },
  { rol: "Analista", tarifa: 850, dedicacion: 1 },
];

/** Semanas base de cada fase para una empresa mediana; se ajustan por tamaño y brechas. */
export const SEMANAS_BASE = [4, 5, 10, 8, 3, 4];

/** Estado de avance de cada fase según lo capturado. */
export function estadoFases(cfg, d) {
  const filas = (i) => cfg.fases[i].plantillas.map((_, j) => (d.pl?.[`${i}-${j}`] || []).filter((f) => f.some((c) => String(c).trim())).length);
  const dims = cfg.dmi.dimensiones, dimsOk = dims.filter((x) => d.dmi?.puntos?.[x]).length / dims.length;
  const preguntas = cfg.fases[0].cuestionario.reduce((n, s) => n + s.preguntas.length, 0), resp = Object.values(d.dmi?.cuest || {}).filter(Boolean).length / (preguntas || 1);
  const gobOk = cfg.gobernanza.filter(([x]) => d.gob?.[x]?.nota).length / cfg.gobernanza.length;
  const kpiOk = (d.kpi || []).filter((k) => k.valor && k.dueno).length / Math.max(1, (d.kpi || []).length);
  const riesgos = Math.min(1, (d.esc || []).length / 10);
  return cfg.fases.map((f, i) => {
    const pl = filas(i), plPct = pl.length ? pl.filter((n) => n > 0).length / pl.length : 0;
    const señales = [plPct, ...(i === 0 ? [dimsOk, resp, riesgos] : i === 1 ? [gobOk, (d.raci?.filas || []).length >= 3 ? 1 : 0] : i === 3 ? [kpiOk, riesgos] : [])];
    const pct = Math.round((señales.reduce((a, b) => a + b, 0) / señales.length) * 100);
    return { fase: f.nombre, objetivo: f.objetivo, pct, estado: pct >= 70 ? "Completa" : pct >= 10 ? "En curso" : "Sin iniciar", plantillas: `${pl.filter((n) => n > 0).length} de ${pl.length}` };
  });
}

/** Hallazgos positivos, negativos y a mejorar a partir del DMI, la gobernanza, el RACI, los KPIs y los riesgos. */
export function hallazgos(cfg, d) {
  const pos = [], neg = [], mej = [];
  for (const x of cfg.dmi.dimensiones) {
    const v = Number(d.dmi?.puntos?.[x]);
    if (!v) continue;
    const ev = d.dmi?.evidencia?.[x] ? ` Evidencia: ${d.dmi.evidencia[x]}.` : "";
    (v >= 4 ? pos : v <= 2 ? neg : mej).push(`${x}: madurez ${v} de 5.${ev}`);
  }
  for (const [x, falla] of cfg.gobernanza) {
    const g = d.gob?.[x], v = Number(g?.nota);
    if (!v) continue;
    const t = `${x}: calificación ${v} de 5${g.hallazgo ? ` (${g.hallazgo})` : v <= 2 ? ` (riesgo típico: ${falla})` : ""}.`;
    (v >= 4 ? pos : v <= 2 ? neg : mej).push(t);
  }
  for (const f of d.raci?.filas || []) if (f.v.filter((x) => x === "A").length !== 1) neg.push(`La decisión «${f.d}» no tiene exactamente un responsable final (A) en la matriz RACI.`);
  for (const k of d.kpi || []) {
    if (!k.dueno) mej.push(`El KPI «${k.nombre}» no tiene dueño asignado.`);
    if (k.estado === "rojo") neg.push(`KPI en rojo: ${k.nombre} (meta ${k.meta}, valor ${k.valor || "—"}).`);
    else if (k.estado === "verde") pos.push(`KPI en verde: ${k.nombre} (meta ${k.meta}, valor ${k.valor}).`);
  }
  for (const r of d.esc || []) {
    if (r.nivel === "crítico" || r.nivel === "alto") neg.push(`Riesgo ${r.nivel}: ${r.nombre} (probabilidad anual ${r.prob == null ? "—" : `${(r.prob * 100).toFixed(1)} %`}, pérdida esperada ${n0(r.perdida)}, VaR 95 % ${n0(r.var95)})${r.respuesta ? `; respuesta: ${r.respuesta}` : "; sin respuesta definida"}.`);
    else if (r.nivel === "medio") mej.push(`Riesgo medio: ${r.nombre} (pérdida esperada ${n0(r.perdida)}).`);
  }
  return { positivos: pos, negativos: neg, mejorar: mej };
}

/** Propuestas de DOMINUS OPS por cada brecha del DMI (≤ 3), ordenadas de la más baja a la más alta. */
export function propuestas(cfg, d, biblioteca = []) {
  const nombreMet = Object.fromEntries(biblioteca.map((m) => [m.id, m.nombre]));
  const out = [], algunaMedida = cfg.dmi.dimensiones.some((x) => Number(d.dmi?.puntos?.[x]));
  for (const x of cfg.dmi.dimensiones) {
    const v = Number(d.dmi?.puntos?.[x]);
    const m = MAPA_DIMENSIONES[x];
    // Sin ninguna medición se proponen todas (diagnóstico inicial); con mediciones, solo las de nivel 3 o menos.
    if (!m || (v && v > 3) || (!v && algunaMedida)) continue;
    out.push({ dimension: x, nivel: v || null, fase: cfg.fases[m.fase].nombre, servicio: m.servicio, metodologias: m.metodologias.map((id) => nombreMet[id] || id),
      meta: v ? Math.min(5, v + 1) : 3 });
  }
  for (const p of planRemediacion(cfg.gobernanza, d.gob || {})) out.push({ dimension: `Gobernanza: ${p.d}`, fase: cfg.fases[1].nombre, servicio: p.control, metodologias: [nombreMet.cobit2019 || "COBIT 2019"], nivel: Number(p.nota), meta: Math.min(5, Number(p.nota) + 2) });
  return out.sort((a, b) => (a.nivel ?? 0) - (b.nivel ?? 0));
}

/** Plan de trabajo: semanas por fase ajustadas por tamaño (empleados) y brechas; fases III y IV se traslapan. */
export function planTrabajo(cfg, d, estado) {
  const e = Number(d.cliente?.empleados) || 100;
  const tam = e < 50 ? 0.7 : e < 250 ? 1 : e < 1000 ? 1.4 : 1.8;
  const props = propuestas(cfg, d);
  let inicio = 0;
  return cfg.fases.map((f, i) => {
    const brechas = props.filter((p) => p.fase === f.nombre).length, avance = (estado?.[i]?.pct || 0) / 100;
    const semanas = Math.max(1, Math.round(SEMANAS_BASE[i] * tam * (1 + 0.12 * brechas) * (1 - 0.6 * avance)));
    const ini = i === 3 ? Math.max(0, inicio - Math.round(semanas / 2)) : inicio;
    inicio = ini + semanas;
    return { fase: f.nombre, inicio: ini, semanas, fin: ini + semanas, brechas };
  });
}

/** Presupuesto: horas por rol = semanas × 40 h × dedicación; más contingencia e impuesto. */
export function presupuesto(plan, tarifas = TARIFAS, { contingencia = 0.1, impuesto = 0.16 } = {}) {
  const semanas = plan.reduce((s, f) => s + f.semanas, 0);
  const filas = tarifas.map((t) => { const horas = Math.round(semanas * 40 * Number(t.dedicacion)); return { ...t, horas, importe: horas * Number(t.tarifa) }; });
  const subtotal = filas.reduce((s, f) => s + f.importe, 0), cont = subtotal * contingencia, base = subtotal + cont, imp = base * impuesto;
  return { semanas, filas, subtotal, contingencia: cont, impuesto: imp, total: base + imp };
}

/** Diagrama de Gantt en SVG. */
export function gantt(plan) {
  const total = Math.max(...plan.map((f) => f.fin)), W = 720, x0 = 220, alto = 26, H = 30 + plan.length * alto;
  const px = (s) => x0 + (s / total) * (W - x0 - 10);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Plan de trabajo"><style>text{font:11px Arial,sans-serif;fill:#222}</style>
    ${Array.from({ length: Math.floor(total / 4) + 1 }, (_, k) => `<line x1="${px(k * 4)}" y1="20" x2="${px(k * 4)}" y2="${H}" stroke="#ddd"/><text x="${px(k * 4)}" y="14" text-anchor="middle">S${k * 4}</text>`).join("")}
    ${plan.map((f, i) => `<text x="4" y="${38 + i * alto}">${esc(f.fase.replace(/^Fase /, ""))}</text><rect x="${px(f.inicio)}" y="${26 + i * alto}" width="${Math.max(3, px(f.fin) - px(f.inicio))}" height="16" rx="3" fill="#C8102E"/><text x="${px(f.fin) + 4}" y="${38 + i * alto}">${f.semanas} sem</text>`).join("")}</svg>`;
}

/** Radar del DMI en SVG (para el documento). */
export function radarDMI(cfg, puntos) {
  const dims = cfg.dmi.dimensiones, pts = puntosRadar(dims.map((x) => Number(puntos?.[x]) || 0));
  const malla = [1, 2, 3, 4, 5].map((k) => `<polygon points="${puntosRadar(dims.map(() => k)).map((p) => p.join(",")).join(" ")}" fill="none" stroke="#ccc"/>`).join("");
  const et = puntosRadar(dims.map(() => 5.9)).map(([x, y], i) => `<text x="${x}" y="${y}" text-anchor="middle" style="font:10px Arial">${esc(dims[i].split(" ")[0])}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="320">${malla}<polygon points="${pts.map((p) => p.join(",")).join(" ")}" fill="#C8102E55" stroke="#C8102E"/>${et}</svg>`;
}

/** Documento HTML completo del informe. `ia`: textos redactados por la IA (opcional). */
export function informeHTML(cfg, d, { biblioteca = [], opciones = {}, ia = {} } = {}) {
  const c = d.cliente || {}, est = estadoFases(cfg, d), h = hallazgos(cfg, d), props = propuestas(cfg, d, biblioteca);
  const plan = planTrabajo(cfg, d, est), pres = presupuesto(plan, opciones.tarifas || TARIFAS, opciones);
  const total = dmi(d.dmi?.puntos || {}), nv = nivelDMI(total, cfg.dmi.niveles);
  const fecha = opciones.fecha || new Date().toISOString().slice(0, 10);
  const lista = (xs, vacio) => (xs.length ? `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="meta">${esc(vacio)}</p>`);
  const criticos = (d.esc || []).filter((r) => r.nivel === "crítico" || r.nivel === "alto");
  const avanceGlobal = Math.round(est.reduce((s, f) => s + f.pct, 0) / est.length);
  const resumenAuto = [
    `${c.nombre || "La organización"} tiene un Índice de Madurez DOMINUS (DMI) de ${total == null ? "sin medir" : total.toFixed(1)}${nv ? ` (nivel ${nv[0]}, ${nv[1]})` : ""} y un avance global del programa de ${avanceGlobal} %.`,
    `Se identificaron ${h.negativos.length} hallazgos negativos, ${h.mejorar.length} oportunidades de mejora y ${h.positivos.length} fortalezas.`,
    criticos.length ? `Hay ${criticos.length} riesgos de nivel alto o crítico; la pérdida esperada anual conjunta es de ${n0(criticos.reduce((s, r) => s + (r.perdida || 0), 0))} ${esc(c.moneda || "MXN")}.` : "No hay riesgos de nivel alto o crítico en el registro (o aún no se simulan).",
    `El plan propuesto dura ${pres.semanas} semanas-fase (${Math.max(...plan.map((f) => f.fin))} semanas de calendario) con un presupuesto estimado de ${n0(pres.total)} MXN con impuestos.`,
  ];
  return `
  <div style="text-align:center;margin:40px 0"><h1 style="font-size:24pt">Informe DOMINUS OPS</h1><p style="font-size:14pt">${esc(c.nombre || "Cliente")}</p>
    <p class="meta">${esc(opciones.consultor || "DOMINUS OPS")} · ${esc(fecha)} · Confidencial</p></div>
  <h2>1. Resumen ejecutivo</h2>${ia.resumen ? `<div>${esc(ia.resumen).replace(/\n/g, "<br>")}</div>` : lista(resumenAuto, "")}
  <h2>2. Perfil del cliente</h2><table><tr><th>Sector</th><td>${esc(c.sector || "—")}</td><th>País</th><td>${esc(c.pais || "—")}${c.paises ? `, ${esc(c.paises)}` : ""}</td></tr>
    <tr><th>Empleados</th><td>${esc(c.empleados || "—")}</td><th>Ingresos anuales</th><td>${n0(c.ingresos)} ${esc(c.moneda || "")}</td></tr>
    <tr><th>Sitios</th><td colspan="3">${esc(c.sitios || "—")}</td></tr><tr><th>Proveedores críticos</th><td colspan="3">${esc(c.proveedores || "—")}</td></tr></table>
    ${c.contexto ? `<p>${esc(c.contexto)}</p>` : ""}
  <h2>3. Estado de las 6 fases</h2><table><tr><th>Fase</th><th>Avance</th><th>Estado</th><th>Plantillas con datos</th></tr>${est.map((f) => `<tr><td>${esc(f.fase)}</td><td>${f.pct} %</td><td>${f.estado}</td><td>${f.plantillas}</td></tr>`).join("")}</table>
  <h2>4. Diagnóstico</h2><h3>Índice de Madurez DOMINUS (DMI)</h3>${radarDMI(cfg, d.dmi?.puntos)}
    <table><tr><th>Dimensión</th><th>Nivel</th><th>Evidencia</th></tr>${cfg.dmi.dimensiones.map((x) => `<tr><td>${esc(x)}</td><td>${d.dmi?.puntos?.[x] ?? "—"}</td><td>${esc(d.dmi?.evidencia?.[x] || "")}</td></tr>`).join("")}</table>
    <h3>Gobernanza</h3><table><tr><th>Dimensión</th><th>Calificación</th><th>Hallazgo</th></tr>${cfg.gobernanza.map(([x]) => `<tr><td>${esc(x)}</td><td>${d.gob?.[x]?.nota || "—"}</td><td>${esc(d.gob?.[x]?.hallazgo || "")}</td></tr>`).join("")}</table>
    <h3>KPIs</h3>${(d.kpi || []).length ? `<table><tr><th>KPI</th><th>Meta</th><th>Valor</th><th>Dueño</th><th>Semáforo</th></tr>${d.kpi.map((k) => `<tr><td>${esc(k.nombre)}</td><td>${esc(k.meta)}</td><td>${esc(k.valor)}</td><td>${esc(k.dueno)}</td><td>${esc(k.estado)}</td></tr>`).join("")}</table>` : `<p class="meta">Sin KPIs capturados.</p>`}
  <h2>5. Riesgos y escenarios simulados</h2>${(d.esc || []).length ? `<table><tr><th>Escenario</th><th>Prob. anual</th><th>Pérdida esperada</th><th>VaR 95 %</th><th>Nivel</th><th>Respuesta</th><th>Dueño</th></tr>
    ${[...d.esc].sort((a, b) => (b.nivel_prob || 0) * (b.nivel_imp || 0) - (a.nivel_prob || 0) * (a.nivel_imp || 0)).map((r) => `<tr><td>${esc(r.nombre)}</td><td>${r.prob == null ? "—" : `${(r.prob * 100).toFixed(1)} %`}</td><td>${n0(r.perdida)}</td><td>${n0(r.var95)}</td><td>${esc(r.nivel || "—")}</td><td>${esc(r.respuesta || "")}</td><td>${esc(r.dueno || "")}</td></tr>`).join("")}</table>
    <p class="meta">Calculados con el motor científico de DOMINUS (Monte Carlo, Poisson, Gutenberg-Richter, ecuaciones diferenciales, álgebra lineal y modelos físicos); fórmulas en la pestaña Risk Management.</p>` : `<p class="meta">Aún no hay escenarios simulados (pestaña Risk Management).</p>`}
  <h2>6. Hallazgos</h2>${ia.detallado ? `<div>${esc(ia.detallado).replace(/\n/g, "<br>")}</div>` : ""}<h3>✅ Fortalezas</h3>${lista(h.positivos, "Sin fortalezas registradas todavía.")}
    <h3>⛔ Hallazgos negativos</h3>${lista(h.negativos, "Sin hallazgos negativos registrados.")}<h3>🔧 Oportunidades de mejora</h3>${lista(h.mejorar, "Sin oportunidades registradas.")}
  <h2>7. Propuestas de DOMINUS OPS</h2>${props.length ? `<table><tr><th>Brecha</th><th>Nivel actual → meta</th><th>Fase</th><th>Servicio propuesto</th><th>Metodologías</th></tr>${props.map((p) => `<tr><td>${esc(p.dimension)}</td><td>${p.nivel ?? "sin medir"} → ${p.meta}</td><td>${esc(p.fase)}</td><td>${esc(p.servicio)}</td><td>${esc(p.metodologias.join(", "))}</td></tr>`).join("")}</table>` : `<p class="meta">Califica el DMI y la gobernanza para generar propuestas.</p>`}
  <h2>8. Servicios</h2><h3>Servicios que DOMINUS OPS puede ofrecer</h3><ul>${cfg.fases.map((f) => `<li><b>${esc(f.nombre)}:</b> ${esc(f.etapas.map((e) => e.nombre.replace(/^Etapa \d+\.\s*/, "")).join("; "))}</li>`).join("")}
    ${cfg.salas.map(([s, t]) => `<li><b>${esc(s)}:</b> ${esc(t)}</li>`).join("")}</ul>
    <h3>Servicios que no ofrecemos (se coordinan con terceros)</h3>${lista(opciones.noOfrecidos || NO_OFRECIDOS, "")}
  <h2>9. Plan de trabajo general</h2>${gantt(plan)}<table><tr><th>Fase</th><th>Inicio (semana)</th><th>Duración</th><th>Brechas atendidas</th></tr>${plan.map((f) => `<tr><td>${esc(f.fase)}</td><td>${f.inicio}</td><td>${f.semanas} semanas</td><td>${f.brechas}</td></tr>`).join("")}</table>
    <p class="meta">Estimación: semanas base por fase ajustadas por tamaño (${esc(c.empleados || "100 supuestos")} empleados), número de brechas y avance ya logrado. La fase IV (War Room) arranca a mitad de la fase III.</p>
  <h2>10. Presupuesto estimado</h2><table><tr><th>Rol</th><th>Tarifa (MXN/h)</th><th>Dedicación</th><th>Horas</th><th>Importe (MXN)</th></tr>${pres.filas.map((f) => `<tr><td>${esc(f.rol)}</td><td>${n0(f.tarifa)}</td><td>${Math.round(f.dedicacion * 100)} %</td><td>${n0(f.horas)}</td><td>${n0(f.importe)}</td></tr>`).join("")}
    <tr><th colspan="4">Subtotal</th><td>${n0(pres.subtotal)}</td></tr><tr><th colspan="4">Contingencia (${Math.round((opciones.contingencia ?? 0.1) * 100)} %)</th><td>${n0(pres.contingencia)}</td></tr>
    <tr><th colspan="4">Impuestos (${Math.round((opciones.impuesto ?? 0.16) * 100)} %)</th><td>${n0(pres.impuesto)}</td></tr><tr><th colspan="4">Total</th><td><b>${n0(pres.total)}</b></td></tr></table>
    <p class="meta">Tarifas de referencia del mercado de consultoría en México (estimación ajustable en la pestaña Informe); no es una cotización formal. Para comparar: un esquema de horas × tarifa, con 40 h por semana y la dedicación de cada rol.</p>
  <h2>11. Supuestos y limitaciones</h2><ul><li>El informe usa solo la información capturada en DOMINUS OPS y los eventos públicos del mapa; lo no capturado aparece como «sin medir».</li>
    <li>Las probabilidades y pérdidas de los escenarios dependen de los parámetros capturados; revisa sus supuestos antes de decidir.</li>${ia.resumen || ia.detallado ? "<li>Las secciones narrativas marcadas fueron redactadas con IA a partir de estas cifras y revisadas por el consultor.</li>" : ""}</ul>`;
}

/** Mensajes para que la IA redacte el resumen ejecutivo y el informe detallado (solo con los datos calculados). */
export function promptInforme(cfg, d, biblioteca = []) {
  const h = hallazgos(cfg, d), est = estadoFases(cfg, d), p = propuestas(cfg, d, biblioteca), total = dmi(d.dmi?.puntos || {});
  const datos = `Cliente: ${JSON.stringify(d.cliente || {})}\nDMI: ${total ?? "sin medir"}; por dimensión: ${JSON.stringify(d.dmi?.puntos || {})}\nFases: ${est.map((f) => `${f.fase} ${f.pct}% (${f.estado})`).join("; ")}\n`
    + `Fortalezas: ${h.positivos.join(" | ") || "—"}\nNegativos: ${h.negativos.join(" | ") || "—"}\nA mejorar: ${h.mejorar.join(" | ") || "—"}\nPropuestas: ${p.map((x) => `${x.dimension} → ${x.servicio}`).join(" | ") || "—"}`;
  return [{ role: "system", content: "Eres un consultor senior de inteligencia estratégica y gobierno corporativo. Escribes en español, estilo informe ejecutivo, con lenguaje de probabilidad tipo ICD 203. No inventes cifras ni hechos: usa solo los datos dados; si falta información, dilo." },
    { role: "user", content: `${datos}\n\nEscribe dos secciones separadas por la línea «===DETALLE===»:\n1) RESUMEN EJECUTIVO: 5 a 7 viñetas con la situación, los riesgos clave y la recomendación principal.\n2) ANÁLISIS DETALLADO: por cada fase y por cada hallazgo importante, qué significa para el negocio, causa probable y recomendación concreta; termina con las 3 prioridades de los próximos 90 días.` }];
}
