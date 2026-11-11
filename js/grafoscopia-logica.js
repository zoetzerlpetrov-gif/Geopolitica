// Peritaje en grafoscopía: cotejo de una firma o escritura dubitada contra muestras indubitadas.
// Sin DOM. Recibe las medidas de grafo-medir.js (medir y mascara) y el cotejo que marca el perito; devuelve tablas,
// una conclusión sugerida y el texto del dictamen. Las medidas son apoyo: la conclusión la firma la persona perita.

const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const desv = (xs) => { if (xs.length < 2) return 0; const m = media(xs); return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)); };

/** Elementos del cotejo. «que» explica qué observar; «medida» liga el elemento con una medida automática. */
export const ELEMENTOS = [
  { grupo: "Elementos generales (aspecto de conjunto)", items: [
    { id: "habilidad", nombre: "Habilidad y calidad del trazo", que: "Soltura, seguridad y dominio del útil. Una imitación suele tener forma parecida con trazo menos hábil." },
    { id: "velocidad", nombre: "Velocidad", que: "Trazos rápidos: extremos afilados, curvas amplias, ligados. Lentos: extremos romos, ángulos, vacilaciones." },
    { id: "ritmo", nombre: "Ritmo y espontaneidad", que: "Alternancia regular de tensión y descanso del trazo; desaparece cuando se copia un modelo." },
    { id: "presion", nombre: "Presión", que: "Fuerza sobre el papel y su variación (relieve). Solo valorable en originales: en copia o foto se estima por el grosor.", medida: "variacionGrosor" },
    { id: "inclinacion", nombre: "Inclinación", que: "Ángulo de los ejes de las letras respecto de la línea base.", medida: "inclinacion" },
    { id: "proporciones", nombre: "Proporciones y dimensión", que: "Relación entre la zona media, las hampas (trazos que suben) y las jambas (trazos que bajan); proporción alto/ancho del conjunto.", medida: "proporcion" },
    { id: "alineacion", nombre: "Alineación (línea base)", que: "Dirección del renglón o de la firma: horizontal, ascendente, descendente, sinuosa.", medida: "direccion" },
    { id: "espaciado", nombre: "Espaciado", que: "Distancia entre letras y entre palabras o entre nombre y rúbrica.", medida: "espacioPalabras" },
    { id: "enlaces", nombre: "Enlaces y continuidad", que: "Dónde se une y dónde se separa el trazo; levantamientos del útil y su ubicación.", medida: "ligazon" },
    { id: "uniones", nombre: "Forma de las uniones", que: "Angulosa, en guirnalda (curva hacia arriba), en arco o filiforme.", medida: "guirnalda" },
  ] },
  { grupo: "Elementos particulares (gestos gráficos)", items: [
    { id: "ataques", nombre: "Ataques (inicio de los trazos)", que: "Cómo empieza cada trazo: con gancho, con punto, en bucle, afilado o romo." },
    { id: "remates", nombre: "Remates (final de los trazos)", que: "Cómo termina: afilado, romo, en maza, con gancho, prolongado." },
    { id: "morfologia", nombre: "Morfología de letras clave", que: "Forma de mayúsculas, óvalos, letras con hampa o jamba y números que aparezcan en ambas muestras." },
    { id: "puntuacion", nombre: "Puntos, acentos y signos", que: "Ubicación, forma y dirección de puntos sobre la i, acentos y tildes." },
    { id: "gestos", nombre: "Gestos tipo e idiotismos", que: "Rasgos personales que se repiten en todas las muestras auténticas (un remolino, una forma rara de una letra)." },
    { id: "orden", nombre: "Orden de ejecución", que: "En qué orden se hicieron los trazos (se ve en cruces y empalmes con lupa o luz rasante)." },
  ] },
  { grupo: "Firma", items: [
    { id: "estructura", nombre: "Estructura de la firma", que: "Partes que la forman (nombre, apellido, iniciales, rúbrica) y su orden." },
    { id: "rubrica", nombre: "Rúbrica", que: "Forma, dirección, número de vueltas y puntos donde cruza al texto." },
    { id: "ubicacion", nombre: "Ubicación respecto del renglón o del nombre impreso", que: "Si la firma se apoya, cruza o se separa de la línea de firma o del texto." },
  ] },
];

export const VALORES_COTEJO = {
  coincide: "Coincide",
  variacion: "Diferencia dentro de la variación natural",
  diverge: "Divergencia significativa",
  nv: "No valorable",
};

/** Señales de que una firma o escritura no es auténtica o se hizo copiando un modelo. */
export const SENALES = [
  { id: "temblor", nombre: "Temblor no justificado", que: "Ondulación fina del trazo en una persona sin temblor en sus muestras auténticas (no confundir con temblor por edad o enfermedad, que también aparece en las indubitadas)." },
  { id: "lentitud", nombre: "Trazo lento o «dibujado»", que: "Extremos romos, presión pareja, curvas hechas a tramos." },
  { id: "levantamientos", nombre: "Levantamientos del útil en lugares anómalos", que: "Cortes del trazo donde la persona auténtica no los hace, para mirar el modelo." },
  { id: "retoques", nombre: "Retoques o repasos", que: "Trazos corregidos o vueltos a pasar para arreglar la forma." },
  { id: "empalmes", nombre: "Empalmes defectuosos", que: "Uniones visibles entre un tramo y el siguiente tras un levantamiento." },
  { id: "vacilaciones", nombre: "Vacilaciones y cambios bruscos de dirección", que: "Pequeñas detenciones o desvíos dentro de un trazo que debería ser continuo." },
  { id: "calco", nombre: "Huellas de calco", que: "Surco sin tinta, línea de lápiz, puntos guía o coincidencia casi exacta al superponer con una indubitada." },
  { id: "forma_sin_ritmo", nombre: "Forma correcta sin ritmo", que: "La silueta se parece, pero faltan la velocidad y los gestos tipo de las auténticas." },
  { id: "disimulo", nombre: "Indicios de disimulo (autofalsificación)", que: "La propia persona deforma su letra: cambios en lo visible (mayúsculas, inclinación) mientras se conservan gestos pequeños." },
];

/** Escala de conclusión (hipótesis 1: la misma persona hizo la dubitada; hipótesis 2: la hizo otra persona). */
export const ESCALA = [
  { n: 1, id: "identificacion", texto: "Identificación: la firma o escritura dubitada SÍ fue realizada por la misma persona que las indubitadas" },
  { n: 2, id: "fuerte_si", texto: "Fuerte apoyo a que la dubitada fue realizada por la misma persona" },
  { n: 3, id: "moderado_si", texto: "Apoyo moderado a que la dubitada fue realizada por la misma persona" },
  { n: 4, id: "inconcluso", texto: "Inconcluso: los elementos no permiten inclinarse por ninguna de las dos hipótesis" },
  { n: 5, id: "moderado_no", texto: "Apoyo moderado a que la dubitada fue realizada por otra persona" },
  { n: 6, id: "fuerte_no", texto: "Fuerte apoyo a que la dubitada fue realizada por otra persona" },
  { n: 7, id: "eliminacion", texto: "Eliminación: la firma o escritura dubitada NO fue realizada por la misma persona que las indubitadas" },
];

/** Medidas comparables entre muestras (independientes del tamaño de la imagen). */
export const MEDIDAS = [
  { id: "inclinacion", nombre: "Inclinación de los ejes", unidad: "°", tol: 4, de: (m) => m.inclinacion },
  { id: "direccion", nombre: "Dirección de la línea base", unidad: "°", tol: 3, de: (m) => m.direccion },
  { id: "proporcion", nombre: "Proporción ancho/alto del conjunto", unidad: "", tol: 0.25, rel: true, de: (m) => (m.caja ? (m.caja.x1 - m.caja.x0 + 1) / Math.max(1, m.caja.y1 - m.caja.y0 + 1) : NaN) },
  { id: "hampa", nombre: "Hampas / zona media", unidad: "×", tol: 0.2, rel: true, de: (m) => m.hampa },
  { id: "jamba", nombre: "Jambas / zona media", unidad: "×", tol: 0.2, rel: true, de: (m) => m.jamba },
  { id: "grosor", nombre: "Grosor del trazo / zona media", unidad: "×", tol: 0.25, rel: true, de: (m) => (m.grosorPx && m.zonaMediaPx ? m.grosorPx / m.zonaMediaPx : NaN) },
  { id: "espacioPalabras", nombre: "Espacio entre palabras / zona media", unidad: "×", tol: 0.3, rel: true, de: (m) => m.espacioPalabras },
  { id: "ligazon", nombre: "Piezas de trazo por letra (levantamientos)", unidad: "", tol: 0.15, de: (m) => m.avanzado?.piezasPorLetra },
  { id: "guirnalda", nombre: "Tendencia a guirnalda (+) o arco (−)", unidad: "", tol: 0.1, de: (m) => m.avanzado?.guirnalda },
  { id: "variacionGrosor", nombre: "Variación del grosor (relieve)", unidad: "", tol: 0.08, de: (m) => m.avanzado?.variacionGrosor },
  { id: "sinuosidad", nombre: "Sinuosidad de la línea base", unidad: "", tol: 0.05, de: (m) => m.avanzado?.sinuosidad },
];

/**
 * Compara cada medida de la dubitada con el rango de las indubitadas.
 * Rango aceptado = [mín − tolerancia, máx + tolerancia]; la tolerancia crece con la dispersión de las indubitadas.
 * Devuelve [{ id, nombre, unidad, dubitada, min, max, media, desv, estado: "dentro" | "fuera" | "sin_dato" }].
 */
export function compararMedidas(dub, indubs) {
  return MEDIDAS.map((M) => {
    const vals = indubs.map((m) => (m && !m.vacio ? M.de(m) : NaN)).filter(Number.isFinite);
    const d = dub && !dub.vacio ? M.de(dub) : NaN;
    const base = { id: M.id, nombre: M.nombre, unidad: M.unidad };
    if (!Number.isFinite(d) || !vals.length) return { ...base, dubitada: r2(d), estado: "sin_dato" };
    const mn = Math.min(...vals), mx = Math.max(...vals), me = media(vals), s = desv(vals);
    const tol = Math.max(M.rel ? M.tol * Math.abs(me) : M.tol, s);
    return { ...base, dubitada: r2(d), min: r2(mn), max: r2(mx), media: r2(me), desv: r2(s), estado: d >= mn - tol && d <= mx + tol ? "dentro" : "fuera" };
  });
}

/** Recorta la tinta de una máscara { w, h, m } y la lleva a una rejilla fija W×H (sin conservar proporción). */
export function normalizar({ w, h, m }, W = 240, H = 100) {
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const out = new Uint8Array(W * H);
  if (x1 < 0) return { W, H, m: out, vacio: true };
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x] && x >= x0 && x <= x1 && y >= y0 && y <= y1) {
    out[Math.min(H - 1, Math.floor(((y - y0) * H) / bh)) * W + Math.min(W - 1, Math.floor(((x - x0) * W) / bw))] = 1;
  }
  return { W, H, m: out, vacio: false };
}

/** Dilata 1 píxel (tolera el grosor distinto del útil y pequeños corrimientos). */
function dilatar({ W, H, m }) {
  const o = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < H && xx >= 0 && xx < W) o[yy * W + xx] = 1;
  }
  return o;
}

/** Coincidencia al superponer dos muestras normalizadas: intersección / unión (0 a 1), con 1 px de tolerancia. */
export function superposicion(a, b) {
  if (!a || !b || a.vacio || b.vacio || a.W !== b.W || a.H !== b.H) return NaN;
  const da = dilatar(a), db = dilatar(b);
  let inter = 0, union = 0;
  for (let i = 0; i < da.length; i++) { if (da[i] && db[i]) inter++; if (da[i] || db[i]) union++; }
  return union ? inter / union : NaN;
}

/**
 * Superposición de la dubitada con cada indubitada y de las indubitadas entre sí.
 * Dos firmas auténticas nunca coinciden exacto; si la dubitada coincide con una indubitada bastante más que las
 * indubitadas entre sí, se marca «posible calco o reproducción» (a verificar con el original).
 */
export function analizarSuperposicion(dubN, indubsN) {
  const conDub = indubsN.map((x) => superposicion(dubN, x));
  const entre = [];
  for (let i = 0; i < indubsN.length; i++) for (let j = i + 1; j < indubsN.length; j++) entre.push(superposicion(indubsN[i], indubsN[j]));
  const e = entre.filter(Number.isFinite), d = conDub.filter(Number.isFinite);
  const maxEntre = e.length ? Math.max(...e) : NaN, maxDub = d.length ? Math.max(...d) : NaN;
  const calco = Number.isFinite(maxDub) && maxDub >= 0.6 && (!Number.isFinite(maxEntre) || maxDub > maxEntre + 0.12);
  return { conDub: conDub.map(r2), entre: entre.map(r2), maxEntre: r2(maxEntre), maxDub: r2(maxDub), mediaEntre: r2(media(e)), mediaDub: r2(media(d)), calco };
}

/**
 * Conclusión sugerida a partir del cotejo, las señales y la calidad del material. La persona perita decide; esto es
 * una ayuda para no pasar por alto contradicciones. estado: { cotejo: { id: { valor } }, senales: [ids], material:
 * { copia: bool, indubitadas: n, contemporaneas: bool }, medidas: [compararMedidas], superposicion }.
 */
export function sugerirConclusion(estado = {}) {
  const valores = Object.values(estado.cotejo || {}).map((c) => c?.valor).filter(Boolean);
  const C = valores.filter((v) => v === "coincide").length, V = valores.filter((v) => v === "variacion").length;
  const D = valores.filter((v) => v === "diverge").length, valorados = C + V + D;
  const S = (estado.senales || []).length, mat = estado.material || {}, razones = [];
  const fuera = (estado.medidas || []).filter((m) => m.estado === "fuera").length;
  if (estado.superposicion?.calco && !(estado.senales || []).includes("calco")) razones.push("La superposición marca coincidencia excesiva con una indubitada (posible calco); revisa el original y marca la señal si la confirmas.");
  if (fuera) razones.push(`${fuera} medida(s) automática(s) quedan fuera del rango de las indubitadas; confirma si es una divergencia real o efecto de la foto.`);
  let n;
  if (valorados < 5) { n = 4; razones.unshift(`Solo ${valorados} elemento(s) valorados en el cotejo: no alcanza para concluir.`); }
  else if (D >= 3 && D >= C * 0.3) { n = S >= 1 ? 6 : 5; razones.unshift(`${D} divergencias significativas frente a ${C} coincidencias${S ? ` y ${S} señal(es) de falsificación` : ""}.`); }
  else if (S >= 2 && D >= 1) { n = 5; razones.unshift(`${S} señales de falsificación y ${D} divergencia(s): las coincidencias de forma pueden venir de una imitación.`); }
  else if (S >= 2) { n = 4; razones.unshift(`${S} señales de falsificación sin divergencias claras: puede ser imitación hábil o una alteración del trazo por otras causas (edad, postura, útil).`); }
  else if (D === 0 && S === 0 && C >= 8) { n = 2; razones.unshift(`${C} coincidencias, ninguna divergencia significativa ni señal de falsificación.`); }
  else if (D <= 1 && S === 0 && C >= 5) { n = 3; razones.unshift(`${C} coincidencias y ${D} divergencia(s) significativa(s), sin señales de falsificación.`); }
  else { n = 4; razones.unshift(`${C} coincidencias, ${D} divergencias y ${S} señal(es): los elementos no apuntan con claridad a ninguna hipótesis.`); }
  // Límites del material
  const tope = (motivo) => { if (n === 2) n = 3; if (n === 6) n = 5; razones.push(motivo); };
  if (mat.copia) tope("El material es copia o fotografía: no se valoran presión, surco, orden de trazos ni tinta, así que la conclusión se limita a «apoyo moderado».");
  if (Number.isFinite(mat.indubitadas) && mat.indubitadas < 5) tope(`Solo hay ${mat.indubitadas} indubitada(s); en la práctica habitual se buscan al menos 10, de fechas cercanas a la dubitada.`);
  if (mat.contemporaneas === false) tope("Las indubitadas no son de fechas cercanas a la dubitada; la escritura cambia con los años.");
  return { nivel: n, conclusion: ESCALA.find((e) => e.n === n), razones, conteo: { coincidencias: C, variaciones: V, divergencias: D, senales: S, valorados } };
}

const sinPunto = (t) => String(t || "").trim().replace(/[.;,\s]+$/, "");

/**
 * Redacta el dictamen. datos: { expediente, solicitante, perito, cedula, fecha, lugar, planteamiento, instrumentos }.
 * estado: { dubitada: { descripcion, fecha, copia }, indubitadas: [{ descripcion, fecha, tipo, copia }], medidas,
 * superposicion, cotejo: { id: { valor, nota } }, senales: [ids], nivel, consideraciones }.
 * Devuelve { titulo, secciones: [{ titulo, parrafos, filas?, tabla? }], palabras }.
 */
export function redactarDictamen(estado = {}, datos = {}) {
  const doc = { titulo: "Dictamen en materia de grafoscopía", secciones: [] };
  const sec = (titulo, parrafos = [], extra = {}) => doc.secciones.push({ titulo, parrafos: parrafos.filter(Boolean), ...extra });
  const indubs = estado.indubitadas || [], dub = estado.dubitada || {};
  sec("Datos generales", [], { filas: [["Expediente o asunto", datos.expediente || "—"], ["Solicitante o autoridad", datos.solicitante || "—"], ["Perito", datos.perito || "—"],
    ["Cédula o registro", datos.cedula || "—"], ["Lugar y fecha", [datos.lugar, datos.fecha].filter(Boolean).join(", ") || "—"]] });
  sec("Planteamiento del problema", [sinPunto(datos.planteamiento || "Determinar si la firma o escritura dubitada fue realizada o no por la misma persona que realizó las muestras indubitadas") + "."]);
  const filasMat = [["Dubitada", `${dub.descripcion || "Muestra cuestionada"}${dub.fecha ? ` (${dub.fecha})` : ""} · ${dub.copia ? "copia o fotografía" : "original"}`],
    ...indubs.map((x, i) => [`Indubitada ${i + 1}`, `${x.descripcion || "Muestra de comparación"}${x.fecha ? ` (${x.fecha})` : ""} · ${x.tipo === "recabada" ? "recabada (hecha a petición)" : "espontánea"} · ${x.copia ? "copia o fotografía" : "original"}`])];
  const recabadas = indubs.filter((x) => x.tipo === "recabada").length;
  sec("Material de estudio", [`Se recibió una muestra dubitada y ${indubs.length} muestra(s) indubitada(s)${recabadas ? `, de las cuales ${recabadas} fueron recabadas (hechas a petición); las recabadas pueden salir más cuidadas o lentas que las espontáneas, lo que se tuvo en cuenta al comparar` : ""}.`], { filas: filasMat });
  sec("Método y técnica", [
    "Se aplicó el método analítico-comparativo propio de la grafoscopía: primero se describe cada muestra por separado, después se comparan elemento por elemento y al final se valora el conjunto de coincidencias y divergencias. Ninguna coincidencia aislada basta para identificar; lo que pesa es la suma de gestos personales que se repiten.",
    "Se observaron los elementos generales (habilidad, velocidad, ritmo, presión, inclinación, proporciones, alineación, espaciado, enlaces y forma de las uniones) y los particulares (ataques, remates, morfología de letras, puntuación, gestos tipo y orden de ejecución). Como apoyo se hicieron mediciones sobre imágenes digitales (método grafométrico) y una superposición de las muestras normalizadas a un mismo tamaño.",
    datos.instrumentos ? `Instrumentos: ${sinPunto(datos.instrumentos)}.` : "",
  ]);
  const med = (estado.medidas || []).filter((m) => m.estado !== "sin_dato");
  if (med.length) sec("Mediciones (apoyo instrumental)", [`De ${med.length} medidas comparables, ${med.filter((m) => m.estado === "dentro").length} de la dubitada caen dentro del rango de variación de las indubitadas. Las medidas son aproximadas: dependen de la calidad de la imagen y del recorte.`],
    { tabla: { cab: ["Medida", "Dubitada", "Indubitadas (mín.–máx.)", "Resultado"], filas: med.map((m) => [m.nombre, `${m.dubitada}${m.unidad}`, `${m.min}–${m.max}${m.unidad}`, m.estado === "dentro" ? "Dentro del rango" : "Fuera del rango"]) } });
  const sp = estado.superposicion;
  if (sp && Number.isFinite(sp.maxDub)) sec("Superposición", [
    `Al normalizar las muestras a un mismo tamaño, la dubitada coincide con las indubitadas en ${Math.round((sp.mediaDub ?? sp.maxDub) * 100)} % en promedio (máximo ${Math.round(sp.maxDub * 100)} %)${Number.isFinite(sp.maxEntre) ? `; las indubitadas coinciden entre sí hasta ${Math.round(sp.maxEntre * 100)} %` : ""}.`,
    sp.calco ? "La dubitada coincide con una indubitada bastante más que las auténticas entre sí. Dos firmas auténticas nunca son idénticas, así que esta coincidencia excesiva es indicio de calco o reproducción y debe verificarse en el original." : "No se observa una coincidencia excesiva que haga pensar en calco.",
  ]);
  const filasC = [];
  for (const g of ELEMENTOS) for (const it of g.items) {
    const c = estado.cotejo?.[it.id]; if (!c?.valor) continue;
    filasC.push([it.nombre, VALORES_COTEJO[c.valor] || c.valor, c.nota ? sinPunto(c.nota) : "—"]);
  }
  if (filasC.length) sec("Cotejo", [], { tabla: { cab: ["Elemento", "Resultado", "Observación"], filas: filasC } });
  const sen = SENALES.filter((s) => (estado.senales || []).includes(s.id));
  sec("Señales de falsificación o alteración", sen.length ? sen.map((s) => `${s.nombre}: ${sinPunto(s.que)}.`) : ["No se observaron señales de falsificación o alteración en la muestra dubitada."]);
  const sug = sugerirConclusion(estado);
  const nivel = ESCALA.find((e) => e.n === (estado.nivel || sug.nivel)) || sug.conclusion;
  sec("Consideraciones técnicas", [...sug.razones, estado.consideraciones ? sinPunto(estado.consideraciones) + "." : ""]);
  sec("Conclusión", [`${nivel.texto}.`, "Escala de conclusión: identificación, fuerte apoyo, apoyo moderado, inconcluso y sus equivalentes hacia la otra persona. Se usa una escala porque el peso de la evidencia rara vez es absoluto; los grados intermedios dicen cuánto apoya el cotejo a cada hipótesis."]);
  sec("Alcance y limitaciones", [
    "Este dictamen se basa solo en el material recibido. " + (dub.copia || indubs.some((x) => x.copia) ? "Parte del material es copia o fotografía, por lo que no se valoraron presión, surco, orden de ejecución ni tinta. " : "") + "Las mediciones automáticas son un apoyo y no sustituyen la observación con lupa y luz rasante sobre los originales.",
    "La grafoscopía determina la autoría del trazo; no dice nada sobre la personalidad de quien escribe (eso corresponde a la grafología, que no se aplicó aquí).",
  ]);
  doc.palabras = doc.secciones.reduce((n, s) => n + [s.titulo, ...(s.parrafos || []), ...(s.filas || []).flat(), ...(s.tabla?.filas || []).flat()].join(" ").split(/\s+/).filter(Boolean).length, 0);
  return doc;
}

const escH = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** HTML del dictamen (tablas de 2 columnas en «filas» y tablas con encabezado en «tabla»). */
export function dictamenHTML(doc) {
  return `<h2>${escH(doc.titulo)}</h2>${doc.secciones.map((s, i) => `<h3>${i + 1}. ${escH(s.titulo)}</h3>${(s.parrafos || []).map((p) => `<p>${escH(p)}</p>`).join("")}`
    + (s.filas ? `<table class="t">${s.filas.map(([a, b]) => `<tr><th>${escH(a)}</th><td>${escH(b)}</td></tr>`).join("")}</table>` : "")
    + (s.tabla ? `<table class="t"><tr>${s.tabla.cab.map((c) => `<th>${escH(c)}</th>`).join("")}</tr>${s.tabla.filas.map((f) => `<tr>${f.map((c) => `<td>${escH(c)}</td>`).join("")}</tr>`).join("")}</table>` : "")).join("")}`;
}

/** Texto plano del dictamen (para copiar). */
export function dictamenTexto(doc) {
  return [doc.titulo.toUpperCase(), "", ...doc.secciones.flatMap((s, i) => [`${i + 1}. ${s.titulo.toUpperCase()}`, ...(s.filas || []).map(([a, b]) => `${a}: ${b}`),
    ...(s.tabla ? [s.tabla.cab.join(" | "), ...s.tabla.filas.map((f) => f.join(" | "))] : []), ...(s.parrafos || []), ""])].join("\n");
}
