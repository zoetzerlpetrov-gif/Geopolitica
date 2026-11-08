// Redacción del análisis grafológico a partir de los rasgos elegidos: breve (½ cuartilla), mediana (≈ 2,5 cuartillas)
// o completa (> 5 cuartillas, con estructura de dictamen). Usa las interpretaciones del resumen de la persona y, cuando
// faltan, las lecturas complementarias (config/grafologia_complemento.json), marcadas como tales.
// Todo es texto generado con plantillas: no hay IA ni datos externos.
import { clave, indice, temperamento, AVISO } from "./grafo-logica.js";

export const PALABRAS_POR_CUARTILLA = 250;

export const AREAS = {
  personal: { nombre: "Personalidad y mundo interior", secciones: ["dimension", "inclinacion", "direccion", "presion", "derivados_de_imperfecciones_o_accidentes", "abreaciones", "rasgos_tipo", "gestos_tipos"],
    intro: "Este apartado reúne lo que la escritura sugiere sobre cómo se percibe la persona, cómo vive sus emociones y con qué energía enfrenta lo cotidiano." },
  laboral: { nombre: "Trabajo, método y desempeño", secciones: ["orden", "velocidad", "continuidad", "forma", "presion", "direccion", "espacio_grafico", "dimension"],
    intro: "En el terreno laboral interesan la organización, el ritmo, la constancia, la forma de razonar y la energía disponible para sostener las tareas." },
  pareja: { nombre: "Pareja y vida afectiva", secciones: ["inclinacion", "forma", "gestos_tipos", "abreaciones", "presion", "continuidad", "rasgos_tipo"],
    intro: "En la vida afectiva, la grafología mira sobre todo la inclinación, las curvas, los bucles y la calidad del trazo, que la escuela relaciona con la forma de acercarse al otro." },
  social: { nombre: "Relaciones sociales y comunicación", secciones: ["continuidad", "inclinacion", "dimension", "orden", "firma", "forma"],
    intro: "Para el trato con los demás se observan la ligazón, los espacios, la inclinación y la relación entre la firma y el texto." },
  familiar: { nombre: "Familia y origen", secciones: ["orden", "firma", "rasgos_tipo", "inclinacion"],
    intro: "La escuela relaciona el margen izquierdo, la firma (nombre y apellidos) y algunos rasgos tipo con el vínculo con el origen y la familia." },
  liderazgo: { nombre: "Liderazgo y toma de decisiones", secciones: ["presion", "velocidad", "dimension", "gestos_tipos", "firma", "direccion"],
    intro: "Para el liderazgo y las decisiones se observan la presión, el tamaño, la velocidad, los gestos angulosos y la firma." },
  vocacional: { nombre: "Orientación vocacional", secciones: ["forma", "velocidad", "continuidad", "dimension", "orden"],
    intro: "Para orientar intereses se combinan el temperamento con la forma, la velocidad, la ligazón y el tamaño." },
  bienestar: { nombre: "Energía y estado de ánimo", secciones: ["presion", "direccion", "derivados_de_imperfecciones_o_accidentes", "velocidad", "inclinacion"],
    intro: "La energía y el ánimo se leen en la presión, la dirección de los renglones y los accidentes del trazo; estos últimos también pueden deberse a causas físicas." },
};

export const EXTENSIONES = { breve: { nombre: "Breve (½ cuartilla)", objetivo: 0.5 }, media: { nombre: "Mediana (≈ 2,5 cuartillas)", objetivo: 2.5 }, completa: { nombre: "Completa tipo dictamen (más de 5 cuartillas)", objetivo: 5 } };

// Relaciones entre rasgos que la escuela lee en conjunto («síndromes»). Redacción propia.
export const SINDROMES = [
  { todos: ["inclinacion/posicion/inclinada", "forma/coligamiento/guirnalda"], texto: "La inclinación a la derecha unida a los enlaces en guirnalda refuerza la lectura de una afectividad expansiva, que busca el contacto y se adapta al otro." },
  { todos: ["inclinacion/posicion/vertical_90_85_a_95", "forma/anatomia/angulosa"], texto: "La verticalidad junto con la angulosidad sugiere que la razón y la firmeza pesan más que el impulso afectivo." },
  { todos: ["inclinacion/posicion/invertida", "forma/coligamiento/arco"], texto: "La inclinación invertida con enlaces en arco refuerza la lectura de reserva y protección de la intimidad." },
  { algun: [["presion/calibre/pesada_0_75a1mm", "presion/calibre/gruesa_1mm", "presion/profundidad/firme"], ["forma/anatomia/angulosa", "forma/coligamiento/angulo"]], texto: "La presión firme acompañada de ángulos es el conjunto que la escuela asocia con voluntad, resistencia y capacidad de mando." },
  { algun: [["continuidad/ligazon/ligada", "continuidad/ligazon/hiperligada"], ["velocidad/intensidad/rapida_180_lxm", "velocidad/intensidad/acelerada_160_lxm"]], texto: "La ligazón con velocidad alta se lee como pensamiento ágil y deductivo, que conecta ideas y pasa pronto a la acción." },
  { algun: [["continuidad/ligazon/desligada", "continuidad/ligazon/agrupada"], ["dimension/tamano/pequena_2_5_mm", "dimension/tamano/exag_pequena_2mm"]], texto: "Letra pequeña y desligada: el perfil que la escuela asocia con observación, análisis del detalle y trabajo independiente." },
  { algun: [["direccion/orientacion/ascendente_1a50"], ["presion/calidad/relieve", "presion/calibre/pesada_0_75a1mm"]], texto: "Renglones que suben con un trazo con relieve se leen como optimismo con energía para llevarlo a cabo." },
  { algun: [["direccion/orientacion/descendente_5a10"], ["presion/calibre/ligera_0_25mm", "presion/profundidad/blanda"]], texto: "Renglones que bajan con presión ligera son el conjunto que la escuela relaciona con cansancio o desánimo; conviene comparar con otra muestra escrita en otro momento." },
  { algun: [["orden/estructura/ordenada_esmerada_exageradamente_ordenada"], ["continuidad/grado_de_variabilidad/regular"]], texto: "Orden y regularidad juntos describen método, disciplina y constancia; en exceso, rigidez frente a lo imprevisto." },
  { algun: [["dimension/espaciamiento/apretada"], ["dimension/anchura/comprimida"]], texto: "La escritura apretada y comprimida se asocia con contención, ahorro de recursos y cautela en el trato." },
  { algun: [["dimension/espaciamiento/espaciada", "dimension/espaciamiento/aireada"], ["dimension/anchura/extendida"]], texto: "Espacios amplios y letra extendida se asocian con necesidad de espacio propio, expansión y contacto con el entorno." },
  { algun: [["gestos_tipos/curvos/bucle", "forma/gestos_tipos/bucles"], ["forma/anatomia/curva", "forma/anatomia/redonda"]], texto: "Bucles y curvas juntos refuerzan la lectura de imaginación, sociabilidad y búsqueda de agrado." },
];

const LEYES = "Las «leyes de la escritura» que formuló Solange Pellat (1927) sostienen, en síntesis, que el gesto gráfico depende del cerebro y no de la mano que escribe; que al escribir la persona actúa con su forma habitual de moverse; que no se puede cambiar voluntariamente la escritura natural sin que se note el esfuerzo; y que, cuando escribir resulta difícil, se vuelve a las formas más habituales o más simples. A partir de ahí, la grafología clásica analiza los géneros gráficos (orden, dimensión, forma, inclinación, dirección, velocidad, continuidad y presión), los gestos tipo, los rasgos tipo, los accidentes del trazo, las abreaciones, el espacio gráfico y la firma, y los interpreta en conjunto, no rasgo por rasgo.";
const VALIDEZ = "Las revisiones científicas no han encontrado que la grafología prediga la personalidad, el desempeño laboral ni la honestidad mejor que el azar (Neter y Ben-Shakhar, 1989; Dean, 1992). Este documento es un ejercicio de observación según una escuela grafológica: las mediciones de la imagen son verificables, pero las interpretaciones son hipótesis. No debe usarse para contratar, despedir, otorgar crédito ni como prueba en un juicio. Un dictamen pericial sobre la autoría de una escritura o firma corresponde a la documentoscopía o grafoscopía, que es una disciplina distinta.";

const minus = (t) => (t && !/^[A-ZÁÉÍÓÚÑ]{2,}\b/.test(t) ? t[0].toLowerCase() + t.slice(1) : t);
const sinPunto = (t) => String(t || "").trim().replace(/[.;,\s]+$/, "");
const esMayus = (t) => /[A-ZÁÉÍÓÚÑ]/.test(t) && t === t.toUpperCase();
const oracion = (t) => { t = sinPunto(t); return t ? t[0].toUpperCase() + t.slice(1) + "." : ""; };
const tipoOracion = (t) => (esMayus(t) ? t.toLowerCase() : t);

/** Interpretación del catálogo → { texto, positivo, negativo, complemento }. */
export function interpretacion(rasgo, complemento = "") {
  const crudo = rasgo?.interpretacion || "";
  if (!crudo) return { texto: complemento ? sinPunto(complemento) : "", positivo: "", negativo: "", complemento: !!complemento };
  const lineas = crudo.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  let positivo = "", negativo = "", polo = null; const resto = [];
  for (const l of lineas) {
    const m = l.match(/^(.+?)\s*\(([+-])\)\s*$/);
    if (m) { polo = m[2]; const et = tipoOracion(m[1]).trim(); if (polo === "+") positivo = et; else negativo = et; continue; }
    if (polo === "+") positivo = `${positivo}: ${minus(sinPunto(tipoOracion(l)))}`;
    else if (polo === "-") negativo = `${negativo}: ${minus(sinPunto(tipoOracion(l)))}`;
    else resto.push(sinPunto(tipoOracion(l)));
  }
  return { texto: resto.map((r, i) => (i ? minus(r) : r)).join("; "), positivo, negativo, complemento: false };
}

// Nombre en contexto: «margen superior», «abertura en la zona superior», «firma próxima al texto».
function nombreRasgo(sec, grupo, r, e) {
  let n = r.nombre.toLowerCase();
  if (grupo.id.startsWith("margenes")) n = `margen ${n}`;
  else if (sec.id === "abreaciones") n = `${grupo.id === "aberturas" ? "abertura" : "cerradura"} en la ${n.replace("zon ", "zona ")}`;
  else if (sec.id === "firma") n = `firma: ${grupo.nombre.toLowerCase()}, ${n}`;
  else if (sec.id === "espacio_grafico") n = `espacio gráfico: ${n}`;
  else if (["calibre", "calidad", "pureza", "profundidad"].includes(grupo.id)) n = `presión ${n}`;
  else if (grupo.id === "intensidad") n = `velocidad ${n}`;
  if (!e?.variante) return n;
  const v = e.variante.toLowerCase();
  return v.includes(r.nombre.toLowerCase().split(" ")[0]) ? v : `${n} (${v})`;
}
// Primera idea de una interpretación (para las versiones cortas).
const primera = (t) => sinPunto(String(t || "").split(/[.;](\s|$)/)[0]);

// Plantillas de oración para no repetir siempre la misma estructura.
const FRASES = [
  (n, v, i) => `Se observa ${n}${v}; la escuela lo asocia con ${minus(i)}.`,
  (n, v, i) => `Se observa ${n}${v}, rasgo que suele leerse como ${minus(i)}.`,
  (n, v, i) => `Presenta ${n}${v}. La lectura habitual: ${minus(i)}.`,
  (n, v, i) => `Aparece ${n}${v}, que la grafología relaciona con ${minus(i)}.`,
];

function fraseRasgo(item, k, corto = false) {
  const v = item.valor && !corto ? ` (${item.origen === "medido" ? "medido" : item.origen === "estimado" ? "estimado" : "observado"}: ${item.valor})` : "";
  const I = corto ? { ...item.interp, texto: primera(item.interp.texto || item.interp.positivo), positivo: "", negativo: "", complemento: false } : item.interp;
  let base;
  if (I.texto) base = FRASES[k % FRASES.length](item.nombre, v, I.texto);
  else if (I.positivo || I.negativo) base = `Se observa ${item.nombre}${v}.`;
  else base = `Se marcó ${item.nombre}${v}; el resumen de referencia no trae una interpretación para este rasgo.`;
  if (I.positivo) base += ` En su sentido positivo se lee como ${minus(I.positivo)}`;
  if (I.negativo) base += `${I.positivo ? "; si se exagera o lo acompañan rasgos negativos" : " Si se exagera o lo acompañan rasgos negativos, se lee como"}, ${minus(I.negativo)}`;
  if (I.positivo || I.negativo) base += ".";
  if (I.complemento) base += " (Lectura complementaria: no viene del resumen de referencia).";
  return base;
}

/** Junta los rasgos elegidos con su interpretación. */
export function rasgosElegidos(catalogo, complemento, seleccion) {
  const items = [];
  for (const s of catalogo.secciones) for (const g of s.grupos) for (const r of g.rasgos) {
    const k = clave(s.id, g.id, r.id), e = seleccion.get(k); if (!e) continue;
    const comp = complemento?.interpretaciones?.[k] || "";
    items.push({ clave: k, seccion: s.id, seccionNombre: s.nombre, lema: s.lema, grupo: g.nombre, nombre: nombreRasgo(s, g, r, e), rasgo: r, valor: e.valor || "", motivo: e.motivo || "", origen: e.origen || "manual", interp: interpretacion(r, comp) });
  }
  return items;
}

const contar = (doc) => doc.secciones.reduce((n, s) => n + [s.titulo, ...(s.parrafos || []), ...(s.filas || []).flat()].join(" ").split(/\s+/).filter(Boolean).length, 0);

/**
 * Redacta el análisis. opciones: { extension: "breve"|"media"|"completa", areas: [ids], medidas: {texto, firma},
 * datos: { persona, fecha, analista, motivo } }.
 */
export function redactar(catalogo, complemento, seleccion, { extension = "media", areas = ["personal", "laboral"], medidas = {}, datos = {} } = {}) {
  const items = rasgosElegidos(catalogo, complemento, seleccion);
  const temp = temperamento([...seleccion.keys()]);
  const idx = indice(catalogo);
  const nombreTemp = (t) => idx.get(clave("temperamento", "general", t.id))?.rasgo.nombre.toLowerCase() || t.id;
  const descTemp = (t) => sinPunto(idx.get(clave("temperamento", "general", t.id))?.rasgo.interpretacion || "");
  const dominante = temp[0] && temp[0].puntaje > 0 ? temp[0] : null;
  const segundo = temp[1] && temp[1].puntaje > 0 ? temp[1] : null;
  const areasSel = areas.filter((a) => AREAS[a]);
  const quien = datos.persona ? `de ${datos.persona}` : "de la persona evaluada";
  const sind = SINDROMES.filter((x) => (x.todos ? x.todos.every((k) => seleccion.has(k)) : x.algun.every((grupo) => grupo.some((k) => seleccion.has(k)))));
  // en el orden de prioridad del área (la primera sección pesa más)
  const deSeccion = (ids) => items.filter((i) => ids.includes(i.seccion)).sort((a, b) => ids.indexOf(a.seccion) - ids.indexOf(b.seccion));
  const positivos = items.filter((i) => i.interp.positivo).map((i) => `${i.nombre}: ${minus(i.interp.positivo)}`);
  const negativos = items.filter((i) => i.interp.negativo).map((i) => `${i.nombre}: ${minus(i.interp.negativo)}`);
  const texto = medidas.texto && !medidas.texto.vacio ? medidas.texto : null, firma = medidas.firma && !medidas.firma.vacio ? medidas.firma : null;
  const doc = { titulo: extension === "completa" ? "Dictamen grafológico" : "Análisis grafológico", extension, secciones: [] };
  const sec = (titulo, parrafos, filas) => doc.secciones.push({ titulo, parrafos: parrafos.filter(Boolean), ...(filas ? { filas } : {}) });
  if (!items.length) { sec("Sin rasgos", ["No hay rasgos marcados. Mide la imagen o marca rasgos en la lista para redactar el análisis."]); doc.palabras = contar(doc); return doc; }

  const parrafoArea = (id, limite, corto = false) => {
    const A = AREAS[id], its = deSeccion(A.secciones).slice(0, limite);
    if (!its.length) return [`${A.intro} Con los rasgos marcados no hay elementos suficientes para este apartado.`];
    const ps = [A.intro, its.map((it, k) => fraseRasgo(it, k + id.length, corto)).join(" ")];
    const pos = its.filter((i) => i.interp.positivo).map((i) => minus(i.interp.positivo)), neg = its.filter((i) => i.interp.negativo).map((i) => minus(i.interp.negativo));
    if (pos.length || neg.length) ps.push(`${pos.length ? `Como recursos en este ámbito destacan ${pos.slice(0, 4).join("; ")}.` : ""}${neg.length ? ` Como aspectos a vigilar, la escuela señalaría ${neg.slice(0, 4).join("; ")}.` : ""}`.trim());
    if (id === "vocacional" && dominante) ps.push(`El temperamento con más indicadores es el ${nombreTemp(dominante)}: ${minus(descTemp(dominante))}. Para orientar intereses conviene contrastarlo con pruebas vocacionales validadas y con la experiencia de la persona.`);
    return ps;
  };

  if (extension === "breve") {
    const prioridad = ["dimension", "inclinacion", "direccion", "presion", "continuidad", "velocidad", "forma", "orden"];
    const top = prioridad.map((p) => items.find((i) => i.seccion === p && (i.interp.texto || i.interp.positivo))).filter(Boolean).slice(0, 4);
    sec("Síntesis", [
      `Análisis breve de la escritura ${quien}${datos.fecha ? `, muestra del ${datos.fecha}` : ""}, con ${items.length} rasgos marcados${texto ? ` (${texto.renglones} renglones y ${texto.palabras} palabras medidas en la imagen)` : ""}.`
        + (dominante ? ` El temperamento con más indicadores es el ${nombreTemp(dominante)} (${dominante.cumple.length} de ${dominante.total})${segundo ? `, seguido del ${nombreTemp(segundo)}` : ""}.` : ""),
      top.map((it, k) => fraseRasgo(it, k, true)).join(" "),
      areasSel.length ? areasSel.map((a) => { const it = deSeccion(AREAS[a].secciones).find((i) => !top.includes(i) && (i.interp.texto || i.interp.positivo)); return it ? `En ${AREAS[a].nombre.split(" ")[0].toLowerCase() === "trabajo" ? "lo laboral" : AREAS[a].nombre.toLowerCase()}: ${it.nombre}, ${minus(primera(it.interp.texto || it.interp.positivo))}.` : ""; }).join(" ") : "",
      "Es una lectura de escuela grafológica, sin validez científica demostrada; úsese como observación y no para decidir sobre la persona.",
    ]);
    doc.palabras = contar(doc); return doc;
  }

  const filasMedidas = [];
  if (texto) {
    const f = (v, d = 1) => (v == null || Number.isNaN(v) ? "—" : Number(v).toFixed(d));
    filasMedidas.push(["Renglones y palabras", `${texto.renglones} renglones · ${texto.palabras} palabras`], ["Zona media", `${texto.zonaMediaPx} px${texto.zonaMediaMm != null ? ` · ${f(texto.zonaMediaMm)} mm` : ""}`],
      ["Hampas / jambas", `${f(texto.hampa)} / ${f(texto.jamba)} × zona media`], ["Inclinación", `${f(texto.inclinacion, 0)}° ± ${f(texto.variacionInclinacion)}°`],
      ["Dirección de los renglones", `${f(texto.direccion)}° ± ${f(texto.variacionDireccion)}°`], ["Espacios (palabras · renglones)", `${f(texto.espacioPalabras)} · ${f(texto.interlineado)} × zona media`],
      ["Márgenes izq. · der. · sup. · inf.", ["izquierdo", "derecho", "superior", "inferior"].map((q) => `${Math.round(texto.margenes[q] * 100)} %`).join(" · ")],
      ["Grosor del trazo", `${texto.grosorPx} px${texto.grosorMm != null ? ` · ${f(texto.grosorMm, 2)} mm` : ""}`]);
    const A = texto.avanzado || {};
    if (A.piezasPorPalabra != null) filasMedidas.push(["Piezas por palabra (ligazón)", f(A.piezasPorPalabra)]);
    if (A.entropiaBordes != null) filasMedidas.push(["Variedad de direcciones del borde (0 ángulo – 1 curva)", f(A.entropiaBordes, 2)]);
    filasMedidas.push(["Cuchillos · chimeneas", `${texto.cuchillos} · ${texto.chimeneas}`]);
  }
  if (firma) filasMedidas.push(["Firma: zona media · dirección · inclinación", `${firma.zonaMediaPx} px · ${Number(firma.direccion).toFixed(1)}° · ${Number(firma.inclinacion).toFixed(0)}°`]);

  if (extension === "media") {
    sec("Introducción", [`Este análisis describe la escritura ${quien}${datos.fecha ? ` (muestra del ${datos.fecha})` : ""} según una escuela grafológica, a partir de ${items.length} rasgos: ${items.filter((i) => i.origen === "medido").length} medidos en la imagen, ${items.filter((i) => i.origen === "estimado").length} estimados por la computadora y ${items.filter((i) => i.origen === "manual").length} observados por quien analiza.${datos.motivo ? ` Motivo del análisis: ${sinPunto(datos.motivo)}.` : ""}`,
      "La grafología lee los rasgos en conjunto: un rasgo aislado no basta, y cada interpretación es una hipótesis que se refuerza o se debilita con los demás rasgos."]);
    const porSec = {}; for (const it of items) (porSec[it.seccionNombre] ||= []).push(it);
    sec("Rasgos principales", Object.entries(porSec).map(([n, its], j) => `${n}${its[0].lema ? ` (${its[0].lema.toLowerCase()})` : ""}: ${its.slice(0, 1).map((it, k) => fraseRasgo(it, k + j, true)).join(" ")}`));
    if (sind.length) sec("Rasgos que se refuerzan entre sí", sind.map((x) => x.texto));
    if (dominante) sec("Temperamento", [`El temperamento con más indicadores es el ${nombreTemp(dominante)} (${dominante.cumple.length} de ${dominante.total}: ${dominante.cumple.join(", ").toLowerCase()}). La escuela lo describe así: ${minus(descTemp(dominante))}.${segundo ? ` Le sigue el ${nombreTemp(segundo)} (${segundo.cumple.length} de ${segundo.total}), lo que sugiere una mezcla de ambos.` : ""}`]);
    for (const a of areasSel) sec(AREAS[a].nombre, parrafoArea(a, Math.max(2, Math.round(6 / Math.max(1, areasSel.length))), true));
    if (firma || items.some((i) => i.seccion === "firma")) sec("La firma", [items.filter((i) => i.seccion === "firma").map((it, k) => fraseRasgo(it, k)).join(" ") || "Se midió la firma, pero no se marcaron rasgos de firma.", "La firma representa la imagen que la persona proyecta hacia fuera; el texto, cómo se conduce en lo cotidiano. Las diferencias entre ambos son las que la escuela considera más reveladoras."]);
    sec("Consideraciones", ["Es una lectura de escuela grafológica, sin validez científica demostrada para evaluar personalidad (Neter y Ben-Shakhar, 1989; Dean, 1992). No debe usarse para contratar, despedir, otorgar crédito ni como prueba legal."]);
    doc.palabras = contar(doc); return doc;
  }

  // ---------------- completa: estructura de dictamen ----------------
  sec("I. Datos generales", [], [["Persona evaluada", datos.persona || "—"], ["Fecha de la muestra", datos.fecha || "—"], ["Fecha del análisis", new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })], ["Analista", datos.analista || "—"],
    ["Material", `Imagen digital de ${texto ? "un texto manuscrito" : ""}${texto && firma ? " y " : ""}${firma ? "una firma" : ""}`.replace("de  y", "de")], ["Rasgos considerados", `${items.length} (${items.filter((i) => i.origen === "medido").length} medidos, ${items.filter((i) => i.origen === "estimado").length} estimados, ${items.filter((i) => i.origen === "manual").length} observados)`]]);
  sec("II. Objeto y alcance", [`Describir, según la escuela grafológica de referencia, los rasgos de la escritura ${quien} y su interpretación en: ${areasSel.map((a) => AREAS[a].nombre.toLowerCase()).join("; ") || "todas las áreas"}.${datos.motivo ? ` Motivo: ${sinPunto(datos.motivo)}.` : ""}`,
    "El alcance es descriptivo. No se pronuncia sobre la autoría de la escritura ni sobre la veracidad de su contenido, y no sustituye una evaluación psicológica."]);
  sec("III. Metodología y fundamentos", [LEYES,
    "El procedimiento seguido fue: (1) digitalizar la muestra y delimitar texto y firma; (2) medir en la imagen el tamaño de la zona media, las hampas y jambas, la inclinación, la dirección y la regularidad de los renglones, los espacios, los márgenes y el grosor del trazo; (3) estimar con procedimientos de visión por computadora la ligazón, la angulosidad, el tipo de enlace, la sinuosidad, el desarrollo de las palabras, la calidad del trazo, los bucles y las bolsas de tinta; (4) completar por observación directa los rasgos que no se pueden medir (gestos tipo, rasgos tipo, abreaciones, accidentes); (5) interpretar cada rasgo con el resumen de referencia y (6) leerlos en conjunto, buscando los rasgos que se refuerzan entre sí.",
    "Las medidas en milímetros dependen de la escala indicada al medir; la dirección de los renglones se mide respecto del borde de la imagen, por lo que un giro de la foto se suma a ella. La presión real solo se comprueba en el papel original (relieve al reverso)."]);
  if (filasMedidas.length) sec("IV. Descripción de la muestra y medidas", ["Medidas obtenidas de la imagen:"], filasMedidas);
  const porSeccion = catalogo.secciones.filter((s) => s.id !== "temperamento").map((s) => ({ s, its: items.filter((i) => i.seccion === s.id) })).filter((x) => x.its.length);
  sec("V. Análisis por géneros gráficos", porSeccion.map(({ s, its }, j) => `${s.nombre}${s.lema ? ` (${s.lema.toLowerCase()})` : ""}. ${s.descripcion ? oracion(s.descripcion) + " " : ""}${its.map((it, k) => fraseRasgo(it, k + j) + (it.motivo && it.origen !== "manual" ? ` Cómo se obtuvo: ${minus(sinPunto(it.motivo))}.` : "")).join(" ")}`));
  sec("VI. Rasgos que se refuerzan entre sí", sind.length ? sind.map((x) => x.texto) : ["Con los rasgos marcados no aparece ninguna de las combinaciones que la escuela lee en conjunto. Cada rasgo debe tomarse, por tanto, como un indicio aislado y más débil."]);
  sec("VII. Temperamento", [
    "La escuela clásica describe cuatro temperamentos (bilioso, sanguíneo, nervioso y linfático) a partir de dos ejes: actividad y emotividad. Cada uno tiene indicadores gráficos; se contó cuántos se cumplen en la muestra.",
    ...temp.map((t) => `${nombreTemp(t)[0].toUpperCase() + nombreTemp(t).slice(1)}: ${t.cumple.length} de ${t.total} indicadores${t.cumple.length ? ` (${t.cumple.join(", ").toLowerCase()})` : ""}. ${oracion(descTemp(t))}`),
    dominante ? `Predomina el ${nombreTemp(dominante)}${segundo ? ` con rasgos del ${nombreTemp(segundo)}` : ""}. En la práctica los temperamentos se mezclan; el predominio solo orienta la lectura del resto de los rasgos.` : "Ningún temperamento reúne indicadores suficientes con los rasgos marcados."]);
  if (firma || items.some((i) => i.seccion === "firma")) sec(texto ? "VIII. La firma frente al texto" : "VIII. La firma", [
    texto ? "" : "Solo se analizó una firma, sin texto manuscrito con qué compararla. Los rasgos generales (tamaño, inclinación, presión, forma, ligazón y velocidad) se midieron en la propia firma; márgenes, orden y espacios entre renglones no aplican. Como la firma es un trazo muy practicado y breve, estas lecturas tienen menos sustento que las de un texto.",
    "La escuela distingue entre el texto, que muestra cómo se conduce la persona en lo cotidiano, y la firma, que muestra la imagen que desea proyectar. Las coincidencias se leen como coherencia; las diferencias, como distancia entre lo íntimo y lo público.",
    items.filter((i) => i.seccion === "firma").map((it, k) => fraseRasgo(it, k)).join(" ") || "Se midió la firma, pero no se marcaron rasgos de firma en la lista.",
    firma && texto ? `En la imagen, la zona media de la firma mide ${(firma.zonaMediaPx / texto.zonaMediaPx).toFixed(2)} veces la del texto; su dirección es de ${Number(firma.direccion).toFixed(1)}° frente a ${Number(texto.direccion).toFixed(1)}° del texto, y su inclinación de ${Number(firma.inclinacion).toFixed(0)}° frente a ${Number(texto.inclinacion).toFixed(0)}°.` : ""]);
  const areasDict = areasSel.length ? areasSel : Object.keys(AREAS);
  sec("IX. Síntesis por áreas", areasDict.flatMap((a) => [`${AREAS[a].nombre}.`, ...parrafoArea(a, 99)]));
  sec("X. Fortalezas y aspectos a vigilar", [
    positivos.length ? `Fortalezas que la escuela atribuiría a los rasgos observados: ${positivos.join("; ")}.` : "Los rasgos marcados no traen lecturas positivas explícitas en el resumen de referencia.",
    negativos.length ? `Aspectos a vigilar si los rasgos se presentan exagerados o acompañados de otros negativos: ${negativos.join("; ")}.` : "Los rasgos marcados no traen lecturas negativas explícitas en el resumen de referencia.",
    "Que un rasgo tenga lectura positiva o negativa depende del conjunto: el mismo rasgo puede ser recurso o dificultad según la calidad general de la escritura (armonía, soltura y regularidad)."]);
  sec("XI. Limitaciones, validez y uso ético", [VALIDEZ, AVISO.replace(VALIDEZ, ""),
    "Limitaciones de esta muestra: se trabajó con una imagen digital (no con el original), por lo que la presión, el relieve y la calidad de la tinta se estimaron con la foto; la muestra es única y no permite valorar cambios en el tiempo; y varios rasgos dependen del criterio de quien observa."]);
  sec("XII. Conclusiones", [
    `Con ${items.length} rasgos considerados, la escritura ${quien} se describe principalmente por ${items.slice(0, 6).map((i) => i.nombre).join(", ")}.${dominante ? ` El temperamento con más indicadores es el ${nombreTemp(dominante)}.` : ""}`,
    sind.length ? `Los rasgos que se refuerzan entre sí (${sind.length}) son los que dan más peso a las lecturas de este documento.` : "No se encontraron combinaciones que se refuercen entre sí, por lo que las lecturas deben tomarse con especial cautela.",
    "Estas conclusiones son hipótesis de trabajo para la observación y la conversación con la persona, no afirmaciones sobre su carácter.",
    `Analista: ${datos.analista || "____________________"}     Firma: ____________________`]);
  doc.palabras = contar(doc);
  return doc;
}

export function cuartillas(doc) { return doc.palabras / PALABRAS_POR_CUARTILLA; }

const escH = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function aHTML(doc) {
  return `<h2>${escH(doc.titulo)}</h2>${doc.secciones.map((s) => `<h3>${escH(s.titulo)}</h3>${(s.parrafos || []).map((p) => `<p>${escH(p)}</p>`).join("")}${s.filas ? `<table class="t">${s.filas.map(([a, b]) => `<tr><th>${escH(a)}</th><td>${escH(b)}</td></tr>`).join("")}</table>` : ""}`).join("")}`;
}
export function aTexto(doc) {
  return [doc.titulo.toUpperCase(), "", ...doc.secciones.flatMap((s) => [s.titulo.toUpperCase(), ...(s.filas || []).map(([a, b]) => `${a}: ${b}`), ...(s.parrafos || []), ""])].join("\n");
}
