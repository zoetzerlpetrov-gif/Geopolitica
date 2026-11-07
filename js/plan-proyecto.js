// Plan de proyecto por sector y país, de la idea al cierre, armado con el catálogo de normativa (config/normativa/*.json)
// y la plantilla de tareas (config/plan_proyecto.json). Lógica pura: sin DOM, para probarla y reusarla (Excel, JSON, OPS).

const RECURRENTE = /mensual|bimestral|trimestral|semestral|anual|cada (año|mes|\d)|día \d+ del mes|d[ií]a \d+|de cada|periódic|renovaci|abril|marzo|mayo|junio|julio|enero|febrero|agosto|septiembre|octubre|noviembre|diciembre|weekly|monthly|annual|quarterly/i;
const EVENTO = /accidente|incidente|en caso|cuando (ocurra|se|haya)|inmediat|\d+ ?(h|horas?)\b|al (ocurrir|detectar|conocer)|retiro|recall|vulneraci|violaci[oó]n de datos|sin demora|derrame|siniestro/i;
const PREVIO = /antes|previ|inicio|al constituir|al contratar|alta|registr|inscrip|solicitud|permiso|licencia|autorizaci|al poner en|al adoptar/i;

/** Fase de una ley según su área (las del sector van a permisos del sector). */
export function faseDeArea(area = "", sector = false) {
  if (sector) return "F3";
  const a = area.toLowerCase();
  if (/societ|propiedad intelectual/.test(a)) return "F1";
  if (/fiscal|inversi|comercio exterior/.test(a)) return "F2";
  if (/ambient|protecci[oó]n civil|inmueble/.test(a)) return "F4";
  if (/laboral|seguridad y salud/.test(a)) return "F5";
  if (/datos|lavado|anticorrup|integridad|consumidor|producto/.test(a)) return "F6";
  if (/competencia/.test(a)) return "F0";
  if (/valores/.test(a)) return "F8";
  return "F6";
}

/** Fase de un trámite según su plazo: recurrente → operación; por evento → incidentes; previo → fase del área. */
export function faseDeTramite(plazo = "", faseArea = "F6", que = "") {
  const t = `${plazo} | ${que}`;
  if (EVENTO.test(t)) return "F9";
  if (RECURRENTE.test(t) && !/antes de operar|antes de iniciar/i.test(plazo)) return "F8";
  if (PREVIO.test(plazo)) return faseArea === "F8" ? "F7" : faseArea;
  return "F8";
}

export function frecuenciaDe(plazo = "") {
  const p = plazo.toLowerCase();
  for (const [re, f] of [[/diari|daily/, "Diaria"], [/semanal|weekly/, "Semanal"], [/mensual|monthly|del mes|día \d+ del mes siguiente/, "Mensual"], [/bimestral/, "Bimestral"],
    [/trimestral|quarterly/, "Trimestral"], [/semestral/, "Semestral"], [/cada (\d+) años/, "Plurianual"], [/anual|annual|cada año|abril|marzo|mayo|junio|julio/, "Anual"]]) if (re.test(p)) return f;
  if (EVENTO.test(plazo)) return "Por evento";
  return "";
}

const ROL_AREA = [[/societ|propiedad/, "LEG"], [/fiscal|inversi/, "FIS"], [/laboral/, "RH"], [/seguridad y salud|ambient|protecci[oó]n civil/, "EHS"], [/datos/, "TI"],
  [/lavado|anticorrup|integridad|competencia|consumidor/, "CUM"], [/valores/, "FIN"]];
const rolDeArea = (a = "", sector = false) => (sector ? "OPE" : (ROL_AREA.find(([re]) => re.test(a.toLowerCase())) || [null, "CUM"])[1]);
const ANCLA = { F0: "G-F0-03", F1: "G-F1-01", F2: "G-F2-01", F3: "G-F3-01", F4: "G-F4-01", F5: "G-F5-01", F6: "G-F6-07", F7: "G-F7-01", F8: "G-F7-03", F9: "G-F7-04", F10: "G-F10-01" };
const GLOBALES = new Set(["G-F7-04", "G-F9-01", "G-F9-04", "G-F10-01"]);
const esGlobal = (id) => id.startsWith("G-F0-") || GLOBALES.has(id);
const corto = (l) => l.sigla || l.nombre.slice(0, 60);

/** Leyes del catálogo: generales (toda empresa) + las del sector elegido. */
function leyesCatalogo(norma, sector) {
  const out = [];
  for (const g of norma?.generales || []) for (const l of g.leyes || []) out.push({ area: g.area, sector: false, ley: l });
  if (sector && norma?.sectores?.[sector]) for (const l of norma.sectores[sector].leyes || []) out.push({ area: `Sector: ${norma.sectores[sector].nombre || sector}`, sector: true, ley: l });
  return out;
}

/**
 * Plan completo. `catalogos`: {iso: norma}; `jurisdicciones`: lista de iso (México primero); `extranjera`: agrega la ruta de
 * empresa extranjera en México. Devuelve tareas (orden de fase), base normativa, auditoría, riesgos y calendario recurrente.
 */
export function construirPlan({ cfg, catalogos = {}, jurisdicciones = ["MEX"], sector = "", extranjera = false, nombres = {}, duraciones = [] }) {
  const fases = Object.fromEntries(cfg.fases.map(([id, n]) => [id, n]));
  const tareas = [], base = [], auditoria = [], riesgos = [], recurrentes = [];
  const yaGlobal = new Set();
  for (const iso of jurisdicciones) {
    const norma = catalogos[iso];
    if (!norma) continue;
    const pais = nombres[iso] || norma.nombre || iso;
    const leyes = leyesCatalogo(norma, sector);
    const porId = Object.fromEntries(leyes.map((x) => [x.ley.id, x]));
    const idT = (id) => (esGlobal(id) ? id : `${iso}-${id}`);
    // 1) Tareas de la plantilla (generales en cada país; las «X-» solo en México y si es empresa extranjera).
    for (const t of cfg.tareas) {
      if (t.solo === "extranjera" && !(extranjera && iso === "MEX")) continue;
      if (esGlobal(t.id) && yaGlobal.has(t.id)) continue;
      if (esGlobal(t.id)) yaGlobal.add(t.id);
      const ligadas = [...t.leyes.filter((k) => k.startsWith(`${iso}:`)).map((k) => porId[k.slice(4)]).filter(Boolean),
        ...leyes.filter((x) => !x.sector && t.areas.includes(x.area))];
      const unicas = [...new Map(ligadas.map((x) => [x.ley.id, x])).values()];
      tareas.push({ id: idT(t.id), fase: t.fase, faseNombre: fases[t.fase], seccion: t.seccion, tarea: t.tarea, entregable: t.entregable,
        pais: esGlobal(t.id) ? "Todos" : pais, iso: esGlobal(t.id) ? "" : iso, ambito: t.solo === "extranjera" ? "Empresa extranjera en México" : "General",
        base: unicas.map((x) => corto(x.ley)).join("; "), referencia: t.ref || "", autoridad: [...new Set(unicas.map((x) => x.ley.autoridad).filter(Boolean))].join("; ").slice(0, 300),
        plazo: "", frecuencia: t.frecuencia || "", rol: t.rol, prioridad: t.prioridad, pred: t.pred ? idT(t.pred) : "", dias: t.dias, base_dias: "Estimación de referencia (plantilla)",
        evidencia: t.entregable, riesgo: unicas.map((x) => x.ley.sanciones).filter(Boolean)[0] || "", url: unicas.find((x) => x.ley.url)?.ley.url || "", origen: "plantilla" });
    }
    // 2) Cada ley del catálogo: implementar sus obligaciones; cada trámite: tarea con su plazo legal y autoridad.
    for (const { area, sector: esSector, ley } of leyes) {
      const fA = faseDeArea(area, esSector), rol = rolDeArea(area, esSector);
      const idsLey = [];
      const idL = `${iso}-L-${ley.id}`;
      idsLey.push(idL);
      tareas.push({ id: idL, fase: fA, faseNombre: fases[fA], seccion: area, tarea: `Cumplir ${corto(ley)}: ${ley.nombre}`,
        entregable: (ley.obligaciones || []).join(" • ").slice(0, 1500), pais, iso, ambito: esSector ? "Sector" : "General", base: corto(ley), referencia: ley.nombre,
        autoridad: ley.autoridad || "", plazo: "", frecuencia: "", rol, prioridad: esSector ? "Crítica" : "Alta", pred: idT(ANCLA[fA]),
        dias: esSector ? 10 : 5, base_dias: "Estimación de referencia", evidencia: (ley.evidencia || []).join("; "), riesgo: ley.sanciones || "", url: ley.url || "", origen: "catálogo", aplica_a: ley.aplica || "" });
      (ley.tramites || []).forEach((tr, i) => {
        const f = faseDeTramite(tr.plazo, fA, tr.que), frec = f === "F8" || f === "F9" ? frecuenciaDe(`${tr.plazo} ${tr.que}`) : "";
        const id = `${iso}-T-${ley.id}-${i + 1}`;
        idsLey.push(id);
        tareas.push({ id, fase: f, faseNombre: fases[f], seccion: area, tarea: `Trámite: ${tr.que}`, entregable: `Acuse o constancia ante ${tr.ante}`, pais, iso,
          ambito: esSector ? "Sector" : "General", base: corto(ley), referencia: ley.nombre, autoridad: tr.ante, plazo: tr.plazo, frecuencia: frec, rol,
          prioridad: f === "F3" || /antes de operar/i.test(tr.plazo) ? "Crítica" : "Alta", pred: f === fA ? idL : idT(ANCLA[f]),
          ...((d) => ({ dias: d.dias, base_dias: d.base }))(duracionTramite(tr, { iso, sector: esSector, fase: f, ley }, duraciones)),
          evidencia: (ley.evidencia || []).join("; "), riesgo: ley.sanciones || "", url: ley.url || "", origen: "catálogo" });
        if (f === "F8" || f === "F9") recurrentes.push({ id, pais, ley: corto(ley), tramite: tr.que, plazo: tr.plazo, ante: tr.ante, frecuencia: frec || "Según la norma", rol, proxima: proximaFecha(tr.plazo) });
      });
      base.push({ pais, iso, area, ambito: esSector ? "Sector" : "General", sigla: ley.sigla || "", nombre: ley.nombre, tipo: ley.tipo || "", autoridad: ley.autoridad || "",
        aplica: ley.aplica || "", obligaciones: (ley.obligaciones || []).join(" • "), tramites: (ley.tramites || []).map((t) => `${t.que} (${t.plazo}; ante ${t.ante})`).join(" • "),
        sanciones: ley.sanciones || "", evidencia: (ley.evidencia || []).join("; "), url: ley.url || "", ultima_reforma: ley.ultima_reforma || "verificar", tareas: idsLey.join(", "), id: `${iso}:${ley.id}` });
      (ley.preguntas || []).forEach((p, i) => auditoria.push({ id: `${iso}:${ley.id}:${i}`, pais, area, ley: corto(ley), pregunta: p, evidencia: (ley.evidencia || []).join("; "), rol }));
      if (ley.sanciones) riesgos.push({ id: `R-${iso}-${ley.id}`, pais, area, riesgo: `Incumplir ${corto(ley)}`, consecuencia: ley.sanciones, prob: 3, impacto: esSector ? 5 : 4, rol,
        respuesta: (ley.obligaciones || [])[0] ? `Control: ${(ley.obligaciones || [])[0]}` : "Asignar dueño y control" });
    }
  }
  // Orden: por fase y, dentro de la fase, por país (México primero, ya viene así) y sección.
  const orden = Object.fromEntries(cfg.fases.map(([id], i) => [id, i]));
  const pos = new Map(tareas.map((t, i) => [t.id, i]));
  tareas.sort((a, b) => orden[a.fase] - orden[b.fase] || (a.iso === b.iso ? 0 : !a.iso ? -1 : !b.iso ? 1 : jurisdicciones.indexOf(a.iso) - jurisdicciones.indexOf(b.iso)) || pos.get(a.id) - pos.get(b.id));
  // Predecesoras que no existen (tarea filtrada) se quitan para no romper las fechas.
  const ids = new Set(tareas.map((t) => t.id));
  for (const t of tareas) if (t.pred && !ids.has(t.pred)) t.pred = "";
  return { tareas, base, auditoria, riesgos, recurrentes };
}

const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };

/**
 * Duración de un trámite y su base: reglas de config/plan_duraciones.json, el plazo legal escrito en el catálogo,
 * la regla general del país para trámites previos o una estimación. Devuelve {dias, base}.
 */
export function duracionTramite(tr, { iso, sector = false, fase = "", ley = {} }, reglas = []) {
  const texto = String(tr.que || ""), plazo = String(tr.plazo || "");
  const previo = PREVIO.test(plazo) && !EVENTO.test(plazo);
  for (const r of reglas) {
    if (r.pais !== "*" && r.pais !== iso) continue;
    if (r.patron && !new RegExp(r.patron, "i").test(texto)) continue;
    if (!r.patron && (!r.previo || !previo || (r.sector && !sector) || fase === "F8" || fase === "F9")) continue;
    if (r.patron || !leerPlazo(plazo)) return { dias: r.dias, base: r.base };
  }
  const p = leerPlazo(plazo);
  if (p) return p;
  if (fase === "F8" || fase === "F9") return { dias: 1, base: "Presentación o aviso: 1 día por cada vez (la fecha límite está en «Plazo legal»)" };
  return { dias: sector ? 20 : 5, base: "Estimación de referencia" };
}

/** «5 días hábiles», «30 días», «3 meses», «72 horas» → {dias hábiles, base}. */
export function leerPlazo(plazo = "") {
  let m;
  if ((m = plazo.match(/(\d+)\s*(?:horas?|h)\b/i))) return { dias: 1, base: `Plazo legal: ${m[1]} horas` };
  if ((m = plazo.match(/(\d+)\s*d[ií]as?\s*h[aá]biles/i))) return { dias: +m[1], base: `Plazo legal: ${m[1]} días hábiles` };
  if ((m = plazo.match(/(\d+)\s*d[ií]as?(?!\s*h[aá]biles)/i))) return { dias: Math.max(1, Math.ceil(+m[1] * 5 / 7)), base: `Plazo legal: ${m[1]} días naturales (≈${Math.max(1, Math.ceil(+m[1] * 5 / 7))} hábiles)` };
  if ((m = plazo.match(/(\d+)\s*semanas?/i))) return { dias: +m[1] * 5, base: `Plazo legal: ${m[1]} semanas` };
  if ((m = plazo.match(/(\d+)\s*mes(?:es)?(?!\s*siguiente)/i)) && !/del mes|cada \d+ mes/i.test(plazo)) return { dias: +m[1] * 21, base: `Plazo legal: ${m[1]} meses (≈${+m[1] * 21} hábiles)` };
  return null;
}

/** Próxima fecha de una obligación recurrente, si el plazo la dice: {tipo: "mensual", dia} | {tipo: "anual", mes, dia} | {tipo: "fin_mes"}. */
export function proximaFecha(plazo = "") {
  const p = plazo.toLowerCase();
  let m;
  if ((m = p.match(/d[ií]a (\d{1,2}) del mes siguiente|d[ií]a (\d{1,2}) de cada mes/))) return { tipo: "mensual", dia: +(m[1] || m[2]) };
  if (/[uú]ltimo d[ií]a del mes siguiente/.test(p)) return { tipo: "fin_mes" };
  if ((m = p.match(/[uú]ltimo d[ií]a (?:h[aá]bil )?de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/))) return { tipo: "anual", mes: MESES[m[1]], dia: 0 };
  if ((m = p.match(/(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/))) return { tipo: "anual", mes: MESES[m[2]], dia: +m[1] };
  return null;
}

/** Días inhábiles obligatorios de México (LFT art. 74) para los años dados: fechas ISO. */
export function feriadosMexico(anios) {
  const lunes = (a, m, n) => { const d = new Date(Date.UTC(a, m, 1)); const off = (8 - d.getUTCDay()) % 7; return new Date(Date.UTC(a, m, 1 + off + 7 * (n - 1))); };
  const out = [];
  for (const a of anios) {
    out.push(new Date(Date.UTC(a, 0, 1)), lunes(a, 1, 1), lunes(a, 2, 3), new Date(Date.UTC(a, 4, 1)), new Date(Date.UTC(a, 8, 16)), lunes(a, 10, 3), new Date(Date.UTC(a, 11, 25)));
    if ((a - 2024) % 6 === 0) out.push(new Date(Date.UTC(a, 9, 1)));  // transmisión del Poder Ejecutivo federal
  }
  return out.map((d) => d.toISOString().slice(0, 10)).sort();
}

/** Claves estables de las columnas del plan (para importar en DOMINUS OPS / OSINT y armar tableros). */
export const COLUMNAS_PLAN = [
  ["id", "ID", "Identificador estable de la tarea (país-plantilla o país-ley-trámite)."], ["fase", "Fase", "Etapa del proyecto (0 a 10)."], ["seccion", "Sección", "Área o sección dentro de la fase."],
  ["tarea", "Tarea", "Qué hay que hacer."], ["entregable", "Qué entregar / obligaciones", "Resultado esperado; en tareas de ley, las obligaciones resumidas."],
  ["pais", "País", "Jurisdicción («Todos» = tarea del proyecto)."], ["ambito", "Ámbito", "General, Sector o Empresa extranjera en México."],
  ["base", "Base normativa", "Ley(es) del catálogo que sustentan la tarea."], ["referencia", "Referencia", "Nombre completo de la ley o norma técnica / estándar."],
  ["autoridad", "Autoridad", "Ante quién se hace o quién vigila."], ["plazo", "Plazo legal", "Plazo que fija la norma (texto del catálogo)."], ["frecuencia", "Frecuencia", "Para obligaciones recurrentes."],
  ["rol", "Responsable (rol)", "Rol sugerido; reemplázalo por la persona."], ["prioridad", "Prioridad", "Crítica, Alta, Media o Baja."], ["pred", "Predecesora", "ID de la tarea que debe terminar antes."],
  ["dias", "Duración (días hábiles)", "Del plazo legal del trámite cuando existe; si no, estimación. Ajústala."],
  ["base_dias", "Base de la duración", "Ley, artículo o criterio del que sale la duración."], ["inicio", "Inicio", "Se calcula con la predecesora y los días inhábiles."], ["fin", "Fin", "Inicio + duración en días hábiles."],
  ["aplica", "¿Aplica?", "«No» la excluye de fechas, avance y tablero sin borrarla."], ["estado", "Estado", "Pendiente, En curso, Hecho, Bloqueado o No aplica."], ["avance", "Avance %", "0 a 100 %."],
  ["evidencia", "Evidencia", "Lo que un auditor pediría para comprobarlo."], ["riesgo", "Riesgo si no se hace", "Sanción o consecuencia según el catálogo."], ["url", "Fuente oficial", "Enlace al texto oficial."],
  ["notas", "Notas", "Libre."]];
