// Lógica del Diagnóstico de ciberseguridad (DOMINUS OPS). Funciones puras: calificación por función de NIST CSF 2.0,
// nivel de madurez, preparación frente a cada amenaza, plan de acción priorizado y lectura de los registros DNS del
// dominio (SPF, DMARC, DNSSEC, CAA, MTA-STS). Sin red ni DOM.

/** Puntaje 0–100 de un conjunto de preguntas: Σ respuesta×peso / Σ 3×peso. Las sin respuesta cuentan como 0. */
export function puntaje(preguntas, resp) {
  const total = preguntas.reduce((s, p) => s + 3 * p.peso, 0);
  if (!total) return 0;
  return Math.round((preguntas.reduce((s, p) => s + (Number(resp[p.id]) || 0) * p.peso, 0) / total) * 100);
}

export const nivel = (cat, pct) => [...cat.niveles].reverse().find((n) => pct >= n.min) || cat.niveles[0];

/** Resultado completo del diagnóstico. */
export function calcular(cat, resp = {}) {
  const porFuncion = cat.funciones.map((f) => {
    const ps = cat.preguntas.filter((p) => p.funcion === f.id);
    return { ...f, pct: puntaje(ps, resp), respondidas: ps.filter((p) => resp[p.id] != null).length, total: ps.length };
  });
  const global = puntaje(cat.preguntas, resp);
  const amenazas = Object.entries(cat.amenazas).map(([id, nombre]) => {
    const ps = cat.preguntas.filter((p) => p.amenazas.includes(id));
    return { id, nombre, pct: puntaje(ps, resp) };
  }).sort((a, b) => a.pct - b.pct);
  // Plan: lo que está en 0 o 1, primero lo de más peso y plazo más corto.
  const plan = cat.preguntas.filter((p) => (Number(resp[p.id]) || 0) < 2)
    .map((p) => ({ ...p, actual: Number(resp[p.id]) || 0, prioridad: p.peso * 10 - p.plazo / 30 + (Number(resp[p.id]) ? 0 : 3) }))
    .sort((a, b) => b.prioridad - a.prioridad);
  const respondidas = cat.preguntas.filter((p) => resp[p.id] != null).length;
  return { global, nivel: nivel(cat, global), porFuncion, amenazas, plan, respondidas, total: cat.preguntas.length };
}

// ---------------------------------------------------------------- dominio (DNS)
export const DOMINIO = /^(?=.{4,253}$)(?!-)[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})+$/;
export const limpiarDominio = (t) => String(t || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#:]/)[0];

/** Evalúa los registros consultados. `r`: { spf: [txt], dmarc: [txt], caa: [..], mtasts: [txt], dnssec: bool, mx: [..] }. */
export function evaluarDNS(r) {
  const out = [];
  const spf = (r.spf || []).filter((t) => /^v=spf1\b/i.test(t));
  if (!spf.length) out.push({ id: "spf", estado: "mal", texto: "Sin registro SPF: cualquiera puede enviar correo «desde» este dominio.", accion: "Publicar un registro TXT «v=spf1 … -all» con los servidores que envían correo." });
  else if (spf.length > 1) out.push({ id: "spf", estado: "mal", texto: "Hay más de un registro SPF: los servidores de correo lo tratan como inválido.", accion: "Unir los registros SPF en uno solo." });
  else if (/\+all\b/i.test(spf[0])) out.push({ id: "spf", estado: "mal", texto: "SPF con «+all»: autoriza a todo el mundo.", accion: "Cambiar «+all» por «-all» o «~all»." });
  else out.push({ id: "spf", estado: /-all\b/i.test(spf[0]) ? "bien" : "regular", texto: `SPF presente (${spf[0].slice(0, 80)}).`, accion: /-all\b/i.test(spf[0]) ? "" : "Endurecer a «-all» cuando todos los remitentes legítimos estén listados." });
  const dm = (r.dmarc || []).find((t) => /^v=DMARC1\b/i.test(t));
  const pol = dm?.match(/\bp=(none|quarantine|reject)\b/i)?.[1]?.toLowerCase();
  if (!dm) out.push({ id: "dmarc", estado: "mal", texto: "Sin DMARC: no hay instrucción para rechazar correos falsos con este dominio.", accion: "Publicar _dmarc con «v=DMARC1; p=none; rua=mailto:…», revisar reportes y subir a quarantine y reject." });
  else out.push({ id: "dmarc", estado: pol === "reject" ? "bien" : pol === "quarantine" ? "regular" : "mal", texto: `DMARC con política «${pol || "desconocida"}».`, accion: pol === "reject" ? "" : "Subir la política a «quarantine» y después a «reject»." });
  out.push(r.dnssec ? { id: "dnssec", estado: "bien", texto: "DNSSEC activo: las respuestas DNS están firmadas.", accion: "" }
    : { id: "dnssec", estado: "regular", texto: "Sin DNSSEC: las respuestas DNS se podrían falsificar.", accion: "Activar DNSSEC en el registrador o proveedor de DNS." });
  out.push((r.caa || []).length ? { id: "caa", estado: "bien", texto: "CAA presente: solo las autoridades indicadas pueden emitir certificados.", accion: "" }
    : { id: "caa", estado: "regular", texto: "Sin CAA: cualquier autoridad podría emitir un certificado para el dominio.", accion: "Agregar registros CAA con la autoridad de certificados que usa la empresa." });
  if ((r.mx || []).length) out.push((r.mtasts || []).some((t) => /^v=STSv1/i.test(t)) ? { id: "mtasts", estado: "bien", texto: "MTA-STS publicado: el correo entrante exige cifrado.", accion: "" }
    : { id: "mtasts", estado: "regular", texto: "Sin MTA-STS: el correo entrante podría viajar sin cifrar.", accion: "Publicar MTA-STS (registro _mta-sts y política en https://mta-sts.<dominio>)." });
  return out;
}

/** Respuesta sugerida para la pregunta de correo (pr11) a partir del DNS: 0, 1 o 2. */
export function respuestaCorreo(evaluacion) {
  const e = Object.fromEntries(evaluacion.map((x) => [x.id, x.estado]));
  if (e.spf === "mal" || e.dmarc === "mal") return e.spf === "mal" && e.dmarc === "mal" ? 0 : 1;
  return e.dmarc === "bien" ? 2 : 1;
}
