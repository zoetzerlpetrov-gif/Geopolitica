// Protección de identidad: lógica sin DOM (revisor de líneas, CURP, ruta de acción y escritos). Todo queda en el navegador.

const ESTADOS_CURP = "AS BC BS CC CL CM CS CH DF DG GT GR HG JC MC MN MS NT NL OC PL QT QR SP SL SR TC TS TL VZ YN ZS NE".split(" ");
const DICC = "0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";

/** Revisa el formato de una CURP y su dígito verificador. Devuelve { ok, curp, motivo }. No consulta a RENAPO. */
export function validarCurp(texto) {
  const curp = String(texto || "").toUpperCase().replace(/\s+/g, "");
  if (curp.length !== 18) return { ok: false, curp, motivo: `Tiene ${curp.length} caracteres; una CURP tiene 18.` };
  const m = /^([A-Z][AEIOUX][A-Z]{2})(\d{2})(\d{2})(\d{2})([HMX])([A-Z]{2})([B-DF-HJ-NP-TV-Z]{3})([A-Z\d])(\d)$/.exec(curp);
  if (!m) return { ok: false, curp, motivo: "El orden de letras y números no corresponde a una CURP." };
  const mes = +m[3], dia = +m[4];
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return { ok: false, curp, motivo: "La fecha de nacimiento (posiciones 5 a 10) no es válida." };
  if (!ESTADOS_CURP.includes(m[6])) return { ok: false, curp, motivo: `«${m[6]}» no es una clave de entidad federativa.` };
  let suma = 0;
  for (let i = 0; i < 17; i++) suma += DICC.indexOf(curp[i]) * (18 - i);
  const dv = (10 - (suma % 10)) % 10;
  if (dv !== +curp[17]) return { ok: false, curp, motivo: "El último dígito (verificador) no coincide: revisa si hay un error de captura." };
  return { ok: true, curp, motivo: "" };
}

/** Plataformas cuyo nombre de marca contiene el texto buscado (sin acentos ni mayúsculas). */
export function filtrar(plataformas, buscar = "") {
  const q = normal(buscar);
  if (!q) return plataformas;
  return plataformas.filter((p) => p.marcas.some((m) => normal(m).includes(q)));
}
const normal = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** estados: { id: { e: "sin" | "mia" | "ajena", fecha } }. Resume el avance. */
export function progreso(plataformas, estados = {}) {
  let revisadas = 0, marcas = 0, ajenas = [], mias = 0;
  for (const p of plataformas) {
    const e = estados[p.id]?.e;
    if (!e) continue;
    revisadas++; marcas += p.marcas.length;
    if (e === "ajena") ajenas.push(p);
    if (e === "mia") mias++;
  }
  const totalMarcas = plataformas.reduce((s, p) => s + p.marcas.length, 0);
  return { revisadas, total: plataformas.length, marcas, totalMarcas, mias, ajenas, pct: plataformas.length ? Math.round((revisadas / plataformas.length) * 100) : 0 };
}

/** Fecha (AAAA-MM-DD) en que toca repetir la revisión. */
export function proximaRevision(fechaIso, meses = 3) {
  const d = new Date(`${fechaIso}T12:00:00Z`);
  if (isNaN(d)) return "";
  const dia = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + meses);
  const fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, fin));
  return d.toISOString().slice(0, 10);
}

/** Pasos de la ruta cuando aparece una línea que no reconoces. */
export const RUTA = [
  { id: "evidencia", t: "Guarda evidencia", d: "Captura de pantalla de la consulta donde aparece la línea, con fecha y hora visibles. Anota el número (o su terminación), la compañía y la página donde la viste." },
  { id: "baja", t: "Pide la baja en la plataforma de la compañía", d: "La mayoría de las páginas de consulta tienen la opción «No reconozco esta línea», «Reportar» o «Dar de baja». Si no existe, acude a un centro de atención de la compañía con tu identificación oficial. Guarda el folio." },
  { id: "compania", t: "Reporta a la compañía el uso indebido de tu identidad", d: "Por escrito (correo o formulario) para que quede constancia. Pide que te informen con qué documentos se registró la línea y que confirmen la desvinculación. Usa la plantilla «Escrito a la compañía»." },
  { id: "crt", t: "Avisa a la CRT", d: "La Comisión Reguladora de Telecomunicaciones supervisa el registro. Presenta tu reporte por sus canales oficiales (portal.crt.gob.mx) con el folio de la compañía. Usa la plantilla «Reporte a la CRT»." },
  { id: "profeco", t: "Si hubo cobros o la compañía no responde: PROFECO", d: "Queja en línea (Concilianet) o en una oficina de PROFECO. Lleva el folio y la respuesta de la compañía, o la constancia de que no respondió." },
  { id: "denuncia", t: "Denuncia ante la Fiscalía o la policía cibernética", d: "Si sospechas que usaron tus datos para cometer un delito (extorsión, fraude, créditos). La denuncia te sirve de respaldo si esa línea aparece en una investigación. Lleva la evidencia y los folios." },
  { id: "arco", t: "Pide a la compañía tus datos (derechos ARCO)", d: "Puedes pedir acceso a los datos que tiene de ti y su cancelación. Si no responde o la niega, la autoridad en materia de datos personales en posesión de particulares es, desde 2025, la Secretaría Anticorrupción y Buen Gobierno. Usa la plantilla «Solicitud ARCO»." },
  { id: "revisar", t: "Revisa el resto de tu identidad", d: "Una línea a tu nombre suele indicar que tus datos circulan. Haz las revisiones de la pestaña «Otras revisiones» (Buró y Círculo de Crédito, SAT, IMSS)." },
];

/** Otras revisiones de suplantación (enlaces oficiales). */
export const REVISIONES = [
  { id: "buro", t: "Buró de Crédito: reporte de crédito especial", url: "https://www.burodecredito.com.mx/", d: "Busca créditos, tarjetas o consultas que no reconozcas. Si encuentras algo, presenta una reclamación ahí mismo; también puedes acudir a CONDUSEF." },
  { id: "circulo", t: "Círculo de Crédito: reporte de crédito especial", url: "https://www.circulodecredito.com.mx/", d: "Es la otra sociedad de información crediticia; un crédito puede aparecer en una y no en la otra." },
  { id: "sat", t: "SAT: facturas emitidas y recibidas a tu RFC", url: "https://www.sat.gob.mx/", d: "En Factura electrónica → Consultar, cancelar y recuperar. Revisa que no haya facturas emitidas con tu RFC que no hiciste. Revisa también tu situación fiscal y tu e.firma." },
  { id: "imss", t: "IMSS: semanas cotizadas", url: "https://serviciosdigitales.imss.gob.mx/semanascotizadas-web/usuarios/IngresoAsegurado", d: "Si aparecen patrones donde nunca trabajaste, alguien pudo usar tu NSS o tu CURP." },
  { id: "curp", t: "RENAPO: consulta tu CURP", url: "https://www.gob.mx/curp/", d: "Confirma que tus datos sean correctos y que no haya una CURP duplicada." },
  { id: "condusef", t: "CONDUSEF: reclamaciones ante bancos", url: "https://www.condusef.gob.mx/", d: "Si aparecen créditos o cuentas que no abriste, CONDUSEF orienta la reclamación ante la institución." },
  { id: "hibp", t: "Have I Been Pwned: tu correo en filtraciones", url: "https://haveibeenpwned.com/", d: "Muestra en qué filtraciones públicas aparece tu correo. Cambia la contraseña de esos servicios." },
  { id: "repep", t: "REPEP de PROFECO: no recibir publicidad", url: "https://repep.profeco.gob.mx/", d: "Inscribe tus números para que las empresas no te llamen con publicidad. Reduce llamadas de pesca de datos." },
];

/** Medidas de prevención. */
export const PREVENCION = [
  { id: "pin-sim", t: "Pon un PIN a tu tarjeta SIM", d: "En Ajustes → Seguridad (o Celular → PIN de la SIM). Así, si te roban el teléfono, no pueden pasar tu chip a otro equipo sin el PIN. El PIN inicial suele venir en el empaque del chip; tres intentos fallidos lo bloquean." },
  { id: "portabilidad", t: "Pregunta a tu compañía cómo proteger la portabilidad y la reposición del chip", d: "Pide que no se haga reposición de SIM ni cambio de compañía sin verificación en persona, si lo ofrecen. Es la defensa contra el «SIM swap» (alguien obtiene un chip con tu número y recibe tus códigos)." },
  { id: "2fa-app", t: "Usa verificación en dos pasos con app, no con SMS", d: "En banco, correo y redes, elige una app autenticadora o una llave de seguridad. El SMS depende de tu línea, que es lo que se puede secuestrar." },
  { id: "palabra", t: "Acuerda una palabra clave familiar", d: "Una palabra que solo conozca tu familia, para comprobar quién llama si piden dinero «de urgencia». Sirve contra la extorsión con voz clonada por IA." },
  { id: "copias", t: "Marca las copias de tu INE", d: "Escribe sobre la copia para qué es y la fecha (por ejemplo «Solo para trámite de renta, 08/11/2026»), sin tapar los datos que te piden. Dificulta reutilizarla." },
  { id: "curp-compartir", t: "Comparte tu CURP solo cuando sea obligatorio", d: "Pregunta para qué la necesitan y lee el aviso de privacidad. Nunca la envíes por WhatsApp a números desconocidos ni la publiques." },
  { id: "biometria", t: "Cuida tus datos biométricos", d: "Una huella, una foto del rostro o la voz no se pueden cambiar como una contraseña. Desconfía de concursos o apps que piden selfie con tu INE o grabar tu voz." },
  { id: "alertas", t: "Activa alertas de movimientos en tus bancos", d: "Una notificación por cada cargo te permite detectar fraude el mismo día." },
  { id: "revisar-3m", t: "Repite la revisión de líneas cada 3 meses", d: "Las filtraciones no avisan. La herramienta te recuerda la fecha." },
];

const hoyLargo = (iso) => { try { return new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); } catch (e) { return iso; } };

/** Plantillas de escritos. datos: { nombre, curp, correo, telefono, linea, compania, folio, fecha, ciudad, detalle }. */
export const PLANTILLAS = {
  compania: { t: "Escrito a la compañía", f: (d) => `${d.ciudad || "[Ciudad]"}, a ${hoyLargo(d.fecha)}

A: ${d.compania || "[Nombre de la compañía]"}
Área de atención a clientes / Oficial de datos personales

Asunto: Línea registrada a mi nombre sin mi consentimiento. Solicitud de baja e información.

Yo, ${d.nombre || "[nombre completo]"}, con CURP ${d.curp || "[CURP]"}, informo que al consultar la plataforma de vinculación de líneas de esta compañía aparece registrada a mi nombre la línea ${d.linea || "[número o terminación]"}, que no contraté, no uso y no autoricé a nadie a registrar.

Solicito:
1. La baja o desvinculación inmediata de esa línea de mi CURP.
2. Que me informen la fecha del registro, el canal (tienda, en línea, distribuidor) y los documentos con que se realizó.
3. Que me confirmen por escrito que la línea ya no está asociada a mis datos.
4. Que conserven la información del registro, por si la requiere una autoridad.
${d.folio ? `\nFolio de la solicitud en la plataforma: ${d.folio}\n` : ""}${d.detalle ? `\nInformación adicional: ${d.detalle}\n` : ""}
Adjunto copia de mi identificación oficial y la captura de la consulta.

Recibo respuesta en ${d.correo || "[correo electrónico]"}${d.telefono ? ` o al teléfono ${d.telefono}` : ""}.

Atentamente,

${d.nombre || "[Nombre y firma]"}` },
  crt: { t: "Reporte a la CRT", f: (d) => `${d.ciudad || "[Ciudad]"}, a ${hoyLargo(d.fecha)}

A: Comisión Reguladora de Telecomunicaciones (CRT)

Asunto: Reporte de línea vinculada a mi CURP sin mi consentimiento.

Yo, ${d.nombre || "[nombre completo]"}, con CURP ${d.curp || "[CURP]"}, reporto que en la plataforma de consulta de ${d.compania || "[compañía]"} aparece vinculada a mi CURP la línea ${d.linea || "[número o terminación]"}, que no registré ni autoricé.

Ya solicité la baja a la compañía${d.folio ? ` con el folio ${d.folio}` : " [anotar folio, si lo hay]"}.

Solicito que la CRT tome conocimiento del caso, verifique el cumplimiento del procedimiento de registro por parte de la compañía y me informe el estado de mi reporte.
${d.detalle ? `\nInformación adicional: ${d.detalle}\n` : ""}
Adjunto: identificación oficial, captura de la consulta y respuesta (o falta de respuesta) de la compañía.

Contacto: ${d.correo || "[correo electrónico]"}${d.telefono ? `, ${d.telefono}` : ""}.

Atentamente,

${d.nombre || "[Nombre y firma]"}` },
  arco: { t: "Solicitud ARCO (acceso y cancelación)", f: (d) => `${d.ciudad || "[Ciudad]"}, a ${hoyLargo(d.fecha)}

A: ${d.compania || "[Nombre de la empresa]"}
Responsable de datos personales (según su aviso de privacidad)

Asunto: Ejercicio de los derechos de acceso y cancelación de datos personales.

Yo, ${d.nombre || "[nombre completo]"}, con CURP ${d.curp || "[CURP]"}, con fundamento en la Ley Federal de Protección de Datos Personales en Posesión de los Particulares, solicito:

1. ACCESO: que me informen qué datos personales míos tienen, de dónde los obtuvieron, para qué los usan y a quién los han transferido.
2. CANCELACIÓN: que eliminen los datos asociados a la línea ${d.linea || "[número o terminación]"}, que no contraté.
${d.detalle ? `\nInformación adicional: ${d.detalle}\n` : ""}
Acredito mi identidad con copia de mi identificación oficial.

Medio para recibir la respuesta: ${d.correo || "[correo electrónico]"}.

Atentamente,

${d.nombre || "[Nombre y firma]"}` },
  denuncia: { t: "Narración de hechos para denuncia", f: (d) => `Narración de hechos (para presentar ante la Fiscalía o la policía cibernética)
Fecha de elaboración: ${hoyLargo(d.fecha)}

Nombre: ${d.nombre || "[nombre completo]"}
CURP: ${d.curp || "[CURP]"}
Contacto: ${d.correo || "[correo]"}${d.telefono ? `, ${d.telefono}` : ""}

Hechos:
1. El ${hoyLargo(d.fecha)} consulté la plataforma oficial de vinculación de líneas de ${d.compania || "[compañía]"}.
2. Apareció registrada a mi nombre la línea ${d.linea || "[número o terminación]"}, que no contraté ni autoricé.
3. Solicité la baja a la compañía${d.folio ? ` (folio ${d.folio})` : ""}.
4. Desconozco quién realizó el registro y con qué documentos. Considero que se usaron mis datos personales sin mi consentimiento.
${d.detalle ? `5. ${d.detalle}\n` : ""}
Pruebas que presento: captura de la consulta, folio de baja, identificación oficial y, en su caso, respuesta de la compañía.

Solicito que se investigue el posible uso indebido de mi identidad y que se me entregue copia de la denuncia.` },
};

/** Texto de la bitácora de la revisión (para guardar como respaldo). */
export function bitacora(plataformas, estados = {}, fecha = "") {
  const p = progreso(plataformas, estados);
  const n = { sin: "Sin líneas", mia: "Línea mía", ajena: "LÍNEA QUE NO RECONOZCO" };
  const lineas = plataformas.filter((x) => estados[x.id]?.e).map((x) => {
    const s = estados[x.id];
    return `- ${x.marcas.length > 3 ? `${x.marcas.slice(0, 3).join(", ")} y ${x.marcas.length - 3} más` : x.marcas.join(", ")}: ${n[s.e] || s.e}${s.fecha ? ` (${s.fecha})` : ""}${s.folio ? ` · folio ${s.folio}` : ""}${s.nota ? ` · ${s.nota}` : ""}`;
  });
  return [`Revisión de líneas a mi nombre${fecha ? ` · ${fecha}` : ""}`,
    `Páginas revisadas: ${p.revisadas} de ${p.total} (cubren ${p.marcas} de ${p.totalMarcas} marcas).`,
    `Líneas que no reconozco: ${p.ajenas.length}.`, "", ...lineas, "",
    "Fuente de la lista: portal.crt.gob.mx/plataformas-de-consulta-de-las-companias-telefonicas"].join("\n");
}
