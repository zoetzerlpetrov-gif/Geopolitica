// Lectura grafológica de las medidas (grafo-medir.js) con el catálogo del resumen de la persona (config/grafologia.json).
// Las medidas son geometría verificable; la interpretación es la de la escuela grafológica del catálogo y no tiene validez
// científica demostrada para evaluar personalidad, honestidad o aptitudes. Por eso el informe separa «medido» de «lectura».

export const AVISO = "La grafología no tiene validez científica demostrada para evaluar personalidad, honestidad ni aptitudes (meta-análisis de Neter y Ben-Shakhar, 1989; revisión de Dean, 1992). Úsala como ejercicio de observación. No la uses para contratar, despedir, otorgar crédito ni en asuntos legales: en México sería un trato discriminatorio (Ley Federal del Trabajo, arts. 3 y 133) y la escritura y la firma son datos personales (LFPDPPP). Tampoco autentica firmas: eso es un peritaje en documentoscopía.";

export const clave = (sec, grupo, rasgo) => `${sec}/${grupo}/${rasgo}`;

/** Índice plano del catálogo: clave → { seccion, grupo, rasgo }. */
export function indice(catalogo) {
  const m = new Map();
  for (const s of catalogo.secciones) for (const g of s.grupos) for (const r of g.rasgos) m.set(clave(s.id, g.id, r.id), { seccion: s, grupo: g, rasgo: r });
  return m;
}

const fx = (v, d = 1) => (v == null || Number.isNaN(v) ? "—" : Number(v).toFixed(d));
const pct = (v) => (v == null || Number.isNaN(v) ? "—" : `${Math.round(v * 100)} %`);

/**
 * Convierte medidas en rasgos del catálogo. Devuelve [{ clave, variante, valor, motivo }].
 * opciones: { hojaCompleta } (el recorte es la hoja entera: los márgenes son reales).
 */
export function clasificar(med, { hojaCompleta = false } = {}) {
  if (!med || med.vacio) return [];
  const out = [], add = (k, valor, motivo, variante = "") => out.push({ clave: k, valor, motivo, variante });
  // Tamaño (zona media en mm)
  if (med.zonaMediaMm != null) {
    const mm = med.zonaMediaMm;
    const id = mm >= 3.75 ? "exag_grande_4mm" : mm >= 3.25 ? "grande_3_5_mm" : mm >= 2.75 ? "mediana_o_normal_3mm" : mm >= 2.25 ? "pequena_2_5_mm" : "exag_pequena_2mm";
    add(clave("dimension", "tamano", id), `${fx(mm)} mm`, "Altura de la zona media (letras sin hampas ni jambas), mediana de los renglones.");
  }
  // Proporción de zonas
  {
    const a = med.hampa, b = med.jamba;
    const id = a >= 1.5 && b >= 1.5 ? "prol_hacia_arriba_y_abajo" : a >= 1.5 ? "prol_hacia_arriba" : b >= 1.5 ? "prol_hacia_abajo" : a < 0.6 && b < 0.6 ? "baja" : "sobria";
    add(clave("dimension", "proporcion_espacio_entre_hampa_y_jamba_1_5_ovalos", id), `hampas ${fx(a)} × zona media · jambas ${fx(b)} ×`, "Altura típica de lo que sube (hampas) y baja (jambas) respecto de la zona media.");
  }
  // Espaciamiento
  {
    const p = med.espacioPalabras, l = med.interlineado;
    const id = (p != null && p < 0.8) || (l != null && l < 2) ? "apretada" : p != null && p >= 2 ? "espaciada" : l != null && l >= 3.5 ? "aireada" : "";
    if (id) add(clave("dimension", "espaciamiento", id), `entre palabras ${fx(p)} × zona media · entre renglones ${fx(l)} ×`, "Espacios medidos con columnas y filas sin tinta.");
  }
  if (med.enredos > 0) add(clave("orden", "organizacion", "enredada_letra_apretada_es_facil_de_enredar"), `${med.enredos} renglón(es) se tocan`, "Las jambas de un renglón alcanzan las hampas del siguiente.");
  // Inclinación
  if (Number.isFinite(med.inclinacion)) {
    const a = med.inclinacion;
    let id = "vertical_90_85_a_95", v = "";
    if (a < 85) { id = "inclinada"; v = a >= 70 ? "Poco inclinada (70a80°)" : a >= 50 ? "Inclinada (65a50°)" : "Muy inclinada-tumbada (50-45°)"; }
    else if (a > 95) { id = "invertida"; v = a <= 112 ? "Poco invertida (100a110°)" : a <= 128 ? "Invertida (115a125°)" : "Muy invertida (+130°)"; }
    add(clave("inclinacion", "posicion", id), `${fx(a, 0)}°`, "Ángulo de los trazos respecto del renglón (90° = vertical; menos de 90° se inclina a la derecha).", v);
    if (med.renglones >= 3) {
      const s = med.variacionInclinacion;
      const e = s < 1.5 ? "rigida" : s < 4 ? "constante" : s < 8 ? "vibrante_u_oscilante" : "desigual_o_irregular";
      add(clave("inclinacion", "estabilidad", e), `±${fx(s)}° entre renglones`, "Desviación de la inclinación de un renglón a otro.");
    }
  }
  // Dirección de los renglones
  {
    const d = med.direccion;
    let id = "horizontal_aprox_0", v = "";
    if (d >= 1) { id = "ascendente_1a50"; v = d < 5 ? "Lig. ascendente (5mm)" : d < 30 ? "Ascendente (10a30°)" : "Trepadora (45°)"; }
    else if (d <= -1) { id = "descendente_5a10"; v = d > -5 ? "Lig. descendente (5°)" : d > -10 ? "Decsndente (6a10°)" : "Hundida (10° hacia abajo)"; }
    add(clave("direccion", "orientacion", id), `${d > 0 ? "+" : ""}${fx(d)}°`, "Dirección de los renglones respecto del borde de la foto. Si la hoja salió girada en la foto, este valor incluye ese giro.", v);
    if (med.curva > 0.25) add(clave("direccion", "trayecto", "convexa"), `centro ${fx(med.curva, 2)} × más alto`, "El centro del renglón queda más alto que los extremos.");
    else if (med.curva < -0.25) add(clave("direccion", "trayecto", "concava"), `centro ${fx(-med.curva, 2)} × más bajo`, "El centro del renglón queda más bajo que los extremos.");
    if (med.finalSube > 3) add(clave("direccion", "trayecto", "con_ascenso_al_final"), `+${fx(med.finalSube)}°`, "El último tercio del renglón sube respecto del resto.");
    else if (med.finalSube < -3) add(clave("direccion", "trayecto", "con_descenso_al_final"), `${fx(med.finalSube)}°`, "El último tercio del renglón baja respecto del resto.");
    if (med.renglones >= 3 && med.variacionDireccion < 0.5) add(clave("direccion", "trayecto", "rigida"), `±${fx(med.variacionDireccion, 2)}°`, "Todos los renglones llevan casi la misma dirección.");
    else if (med.renglones >= 3 && med.variacionDireccion > 2) add(clave("direccion", "trayecto", "sinuosa"), `±${fx(med.variacionDireccion)}°`, "La dirección cambia de un renglón a otro.");
  }
  // Regularidad
  if (med.renglones >= 3) {
    if (med.variacionTamano < 0.1 && med.variacionInclinacion < 4) add(clave("continuidad", "grado_de_variabilidad", "regular"), `tamaño ±${pct(med.variacionTamano)}`, "Tamaño e inclinación casi iguales en todos los renglones.");
    else if (med.variacionTamano > 0.25 || med.variacionInclinacion > 8) add(clave("continuidad", "grado_de_variabilidad", "desigual"), `tamaño ±${pct(med.variacionTamano)} · inclinación ±${fx(med.variacionInclinacion)}°`, "El tamaño o la inclinación cambian bastante entre renglones.");
  }
  // Calibre del trazo
  if (med.grosorMm != null) {
    const g = med.grosorMm;
    const id = g < 0.35 ? "ligera_0_25mm" : g >= 1.5 ? "espesa_3_4mm" : g >= 1 ? "gruesa_1mm" : g >= 0.75 ? "pesada_0_75a1mm" : "";
    if (id) add(clave("presion", "calibre", id), `${fx(g, 2)} mm`, "Grosor típico del trazo en la imagen. Depende también del bolígrafo y de la foto; la presión real se comprueba tocando el relieve al reverso del papel.");
  }
  // Espacio gráfico
  if (med.cascadas > 0) add(clave("espacio_grafico", "general", "cascadas_mas_de_4_lineas"), `${med.cascadas}`, "Huecos entre palabras alineados en más de 4 renglones.");
  else if (med.chimeneas > 0) add(clave("espacio_grafico", "general", "chimeneas_4_o_mas_lineas"), `${med.chimeneas}`, "Huecos entre palabras alineados en 4 o más renglones.");
  if (med.cuchillos > 0) add(clave("espacio_grafico", "general", "cuchillos_2_a_3_lineas"), `${med.cuchillos}`, "Huecos entre palabras alineados en 2 o 3 renglones.");
  if (med.huecosDerecha > 0) add(clave("espacio_grafico", "general", "fantasmas_cuchillo_o_chimenea_derecho"), `${med.huecosDerecha}`, "Cuchillos o chimeneas en la mitad derecha del texto.");
  // Márgenes (solo con la hoja completa)
  if (hojaCompleta) {
    const q = (v, bajo, alto) => (v < bajo ? "estrecho" : v > alto ? "amplio" : "normal");
    const m = med.margenes;
    add(clave("orden", "margenes_como_te_desenvuelves_en_la_vida", "superior"), `${pct(m.superior)} (${q(m.superior, 0.05, 0.15)})`, "Fracción del alto de la hoja.");
    add(clave("orden", "margenes_como_te_desenvuelves_en_la_vida", "izquierdo"), `${pct(m.izquierdo)} (${q(m.izquierdo, 0.05, 0.15)})${med.margenIzqTendencia > 0.5 ? ", se ensancha hacia abajo" : med.margenIzqTendencia < -0.5 ? ", se estrecha hacia abajo" : ""}`, "Fracción del ancho de la hoja.");
    add(clave("orden", "margenes_como_te_desenvuelves_en_la_vida", "derecho"), `${pct(m.derecho)} (${q(m.derecho, 0.03, 0.12)})`, "Fracción del ancho de la hoja.");
    add(clave("orden", "margenes_como_te_desenvuelves_en_la_vida", "inferior"), `${pct(m.inferior)} (${q(m.inferior, 0.05, 0.15)})`, "Fracción del alto de la hoja.");
  }
  return out;
}

/**
 * Rasgos estimados con las medidas avanzadas (componentes, bordes, bucles…). Menos confiables que las de clasificar():
 * van con confianza «estimado» para que la persona los confirme viendo el original.
 */
export function clasificarAvanzado(med, base = []) {
  const A = med?.avanzado; if (!A || med.vacio) return [];
  const out = [], add = (k, valor, motivo, variante = "") => out.push({ clave: k, valor, motivo, variante, confianza: "estimado" });
  const tiene = (k) => base.some((b) => b.clave === k) || out.some((b) => b.clave === k);
  // Ligazón
  if (A.piezasPorPalabra != null) {
    const ppw = A.piezasPorPalabra, ppl = A.piezasPorLetra;
    const id = ppw <= 1.15 ? (med.espacioPalabras != null && med.espacioPalabras < 0.8 ? "hiperligada" : "ligada") : ppl >= 1.3 ? "fragmentada" : ppl >= 0.75 ? "desligada" : "agrupada";
    add(clave("continuidad", "ligazon", id), `${fx(ppw)} piezas por palabra · ${fx(ppl, 2)} por letra`, "Trazos sin levantar la pluma: cuántas piezas separadas tiene cada palabra frente a las letras estimadas.");
  }
  // Anatomía (ángulo o curva) por la variedad de orientaciones de los bordes
  if (A.entropiaBordes != null) {
    const e = A.entropiaBordes;
    const id = e < 0.72 ? "angulosa" : e < 0.82 ? "semiangulosa_semiredonda" : "curva";
    add(clave("forma", "anatomia", id), `variedad de direcciones ${fx(e, 2)}`, "Con letra angulosa los bordes se concentran en pocas direcciones; con letra curva se reparten en todas.");
  }
  // Coligamiento: curvas abiertas arriba (guirnalda) o abajo (arco)
  if (A.guirnalda != null && (A.guirnalda > 0.6 || A.guirnalda < 0.4)) {
    const g = A.guirnalda > 0.6;
    add(clave("forma", "coligamiento", g ? "guirnalda" : "arco"), `${Math.round((g ? A.guirnalda : 1 - A.guirnalda) * 100)} % de los enlaces horizontales en la parte ${g ? "baja" : "alta"} de la zona media`, "Dónde quedan los trazos horizontales que unen las letras.");
  }
  // Anchura de las letras
  if (A.separacionTrazos != null) {
    if (A.separacionTrazos < 0.3) add(clave("dimension", "anchura", "comprimida"), `${fx(A.separacionTrazos, 2)} × zona media entre trazos`, "Distancia media entre trazos verticales en la línea media.");
    else if (A.separacionTrazos > 0.6) add(clave("dimension", "anchura", "extendida"), `${fx(A.separacionTrazos, 2)} × zona media entre trazos`, "Distancia media entre trazos verticales en la línea media.");
  }
  // Trayecto del renglón e imbricación
  if (A.sinuosidad != null && A.sinuosidad > 0.12 && !tiene("direccion/trayecto/sinuosa")) add(clave("direccion", "trayecto", A.sinuosidad > 0.25 ? "serpentina" : "sinuosa"), `ondulación ${fx(A.sinuosidad, 2)} × zona media`, "Cuánto se separa la base de las letras de una recta dentro de cada renglón.");
  if (A.imbricacion != null && Math.abs(A.imbricacion) > 2) add(clave("direccion", "trayecto", A.imbricacion < 0 ? "superpuesta_descendente" : "superpuesta_ascendente"), `${A.imbricacion > 0 ? "+" : ""}${fx(A.imbricacion)}° por palabra`, "Cada palabra, por separado, sube o baja aunque el renglón vaya recto (imbricada).");
  // Desarrollo de la palabra
  if (A.desarrollo != null && (A.desarrollo < 0.75 || A.desarrollo > 1.3)) add(clave("continuidad", "grado_de_soltura", "desarrollo"), `final ${fx(A.desarrollo, 2)} × el inicio`, "Altura de las últimas letras de cada palabra frente a las primeras.", A.desarrollo < 0.75 ? "Gladiolada" : "Creciente");
  // Calidad y pureza del trazo
  if (A.variacionGrosor != null) {
    if (A.variacionGrosor > 0.45) add(clave("presion", "calidad", "relieve"), `variación del grosor ${fx(A.variacionGrosor, 2)}`, "Contraste entre trazos gruesos y finos.");
    else if (A.variacionGrosor < 0.2) add(clave("presion", "calidad", "plana"), `variación del grosor ${fx(A.variacionGrosor, 2)}`, "Trazos de grosor casi igual.");
  }
  if (A.nitidez != null) {
    if (A.nitidez < 0.25) add(clave("presion", "pureza", "nitida"), `borde difuso ${fx(A.nitidez, 2)}`, "Proporción de píxeles de transición en el borde del trazo (depende también del enfoque de la foto).");
    else if (A.nitidez > 0.7) add(clave("presion", "pureza", A.nitidez > 1.2 ? "borrosa_y_con_bolsas" : "pastosa"), `borde difuso ${fx(A.nitidez, 2)}`, "Proporción de píxeles de transición en el borde del trazo (depende también del enfoque de la foto).");
  }
  // Bucles, bolsas de tinta, subrayados
  const bucles = (A.buclesHampaPorPalabra || 0) + (A.buclesJambaPorPalabra || 0);
  if (bucles >= 0.5) {
    const v = `${fx(bucles, 1)} por palabra (hampas ${fx(A.buclesHampaPorPalabra, 1)} · jambas ${fx(A.buclesJambaPorPalabra, 1)})`;
    add(clave("forma", "gestos_tipos", "bucles"), v, "Huecos cerrados por arriba o por debajo de la zona media.");
    add(clave("gestos_tipos", "curvos", "bucle"), v, "Huecos cerrados por arriba o por debajo de la zona media.");
  }
  if (A.bolsasPorPalabra != null && A.bolsasPorPalabra > 0.15) add(clave("derivados_de_imperfecciones_o_accidentes", "general", "bolsas_de_tinta"), `${A.bolsas} zona(s)`, "Zonas rellenas de tinta más gruesas que dos trazos y medio.");
  if (A.subrayados > 0) add(clave("orden", "organizacion", "subrayada"), `${A.subrayados} raya(s) larga(s)`, "Trazos horizontales de más de 5 veces la zona media fuera de la línea de escritura.");
  // Orden y equilibrio
  if (A.variacionInicio != null && A.variacionInterlineado != null) {
    if (A.variacionInicio < 0.6 && A.variacionInterlineado < 0.12 && (med.variacionDireccion ?? 0) < 1.5 && !med.enredos) add(clave("orden", "estructura", "ordenada_esmerada_exageradamente_ordenada"), `inicio ±${fx(A.variacionInicio, 2)} × zona media · interlineado ±${Math.round(A.variacionInterlineado * 100)} %`, "Renglones que empiezan en el mismo lugar, con separación pareja y dirección constante.");
    else if (A.variacionInicio > 1.5 || A.variacionInterlineado > 0.3 || med.enredos > 1) add(clave("orden", "estructura", "desordenada_desalinada_exageradamente_desordenada"), `inicio ±${fx(A.variacionInicio, 2)} × zona media · interlineado ±${Math.round(A.variacionInterlineado * 100)} %`, "Inicio de renglón, interlineado o renglones que se tocan muy irregulares.");
  }
  if (med.hampa >= 0.6 && med.hampa <= 1.8 && med.jamba >= 0.6 && med.jamba <= 1.8 && med.variacionTamano < 0.2) add(clave("orden", "equilibrio", "proporcionada_mediana_sobria_aireada_clara_modelo_caligrafic"), `hampas ${fx(med.hampa)} · jambas ${fx(med.jamba)} × zona media`, "Zonas superior, media e inferior en proporción.");
  else if (med.hampa > 2.2 || med.jamba > 2.2 || (med.hampa < 0.35 && med.jamba < 0.35)) add(clave("orden", "equilibrio", "desproporcionada_bizarra_muy_grande_muy_pequena_hacia_arriba"), `hampas ${fx(med.hampa)} · jambas ${fx(med.jamba)} × zona media`, "Una zona domina mucho sobre las otras.");
  // Velocidad estimada por indicios (inclinación, ligazón, presión, espacio, dirección, forma)
  const todos = [...base, ...out].map((x) => x.clave), hay = (k) => todos.includes(k);
  let v = 0; const motivos = [];
  const suma = (cond, n, txt) => { if (cond) { v += n; motivos.push(`${n > 0 ? "+" : "−"} ${txt}`); } };
  suma(hay("inclinacion/posicion/inclinada"), 1, "inclinada");
  suma(hay("continuidad/ligazon/ligada") || hay("continuidad/ligazon/hiperligada"), 1, "ligada");
  suma(hay("presion/calibre/ligera_0_25mm"), 0.5, "presión ligera");
  suma(hay("dimension/espaciamiento/espaciada") || hay("dimension/espaciamiento/aireada"), 0.5, "espaciada");
  suma(hay("direccion/orientacion/ascendente_1a50"), 0.5, "ascendente");
  suma(hay("forma/anatomia/curva") || hay("forma/coligamiento/guirnalda"), 0.5, "curva o en guirnalda");
  suma(hay("continuidad/ligazon/desligada") || hay("continuidad/ligazon/fragmentada"), -1, "desligada");
  suma(hay("inclinacion/posicion/invertida") || hay("inclinacion/posicion/vertical_90_85_a_95"), -0.5, "vertical o invertida");
  suma(hay("inclinacion/estabilidad/rigida") && hay("continuidad/grado_de_variabilidad/regular"), -0.5, "muy regular");
  const idV = v >= 2.5 ? "rapida_180_lxm" : v >= 1.5 ? "acelerada_160_lxm" : v >= 0.5 ? "pausada_o_mesurada_140_lxm" : "lenta_120_lxm";
  add(clave("velocidad", "intensidad", idV), `indicios ${v > 0 ? "+" : ""}${v}: ${motivos.join(", ") || "sin indicios"}`, "La velocidad real se mide viendo escribir (letras por minuto); aquí se estima con indicios de la escritura terminada.");
  return out;
}

/**
 * Firma frente al texto (mismas coordenadas de imagen). texto/firma = medir(); cajas = recortes {x,y,w,h};
 * hoja = ancho de referencia (recorte del texto si es la hoja completa).
 */
export function clasificarFirma(firma, texto, cajaFirma, cajaTexto, { hojaCompleta = false } = {}) {
  const out = [], add = (k, valor, motivo) => out.push({ clave: k, valor, motivo, variante: "" });
  if (!firma || firma.vacio) return out;
  const d = firma.direccion;
  add(clave("firma", "direccion_de_las_firmas", d >= 1.5 ? "ascendente" : d <= -1.5 ? "descendente" : "horizontal"), `${d > 0 ? "+" : ""}${fx(d)}°`, "Dirección de la firma respecto del borde de la foto.");
  if (texto && !texto.vacio && cajaTexto) {
    const r = firma.zonaMediaPx / texto.zonaMediaPx;
    add(clave("firma", "ejecucion_de_la_firma", r > 1.25 ? "con_letras_mayores_que_el_texto" : r < 0.8 ? "con_letras_menores_que_el_texto" : "coincide_con_letras_del_texto"), `${fx(r, 2)} × el texto`, "Altura de la zona media de la firma comparada con la del texto.");
    const fTop = cajaFirma.y + firma.caja.y0, tBot = cajaTexto.y + texto.caja.y1, sep = (fTop - tBot) / texto.zonaMediaPx;
    const solapa = cajaFirma.y + firma.caja.y0 < tBot && cajaFirma.x + firma.caja.x0 < cajaTexto.x + texto.caja.x1;
    const id = solapa ? (cajaFirma.y + firma.caja.y1 < tBot ? "firma_entre_el_texto_casi_totalidad" : "invadiendo_el_texto_una_parte") : sep < 2 ? "proxima_al_texto" : sep > 8 ? "alejada_del_texto" : "correctamente_situada";
    add(clave("firma", "situacion", id), solapa ? "se encima con el texto" : `${fx(sep)} × zona media debajo del texto`, "Distancia vertical entre el final del texto y la firma.");
    if (hojaCompleta) {
      const c = (cajaFirma.x + (firma.caja.x0 + firma.caja.x1) / 2 - cajaTexto.x) / cajaTexto.w;
      add(clave("firma", "respecto_al_espacio_o_margen", c < 0.4 ? "izquierda" : c > 0.6 ? "derecha" : "centro"), pct(c), "Centro de la firma respecto del ancho de la hoja.");
    }
  }
  return out;
}

// Indicadores de temperamento del catálogo, traducidos a rasgos del propio catálogo (alguno basta para cada indicador).
export const TEMPERAMENTOS = {
  bilioso_activo_y_emotivo: [
    ["Presión firme", ["presion/profundidad/firme", "presion/calibre/pesada_0_75a1mm", "presion/calibre/gruesa_1mm"]],
    ["Destaca angulosidad", ["forma/anatomia/angulosa", "forma/coligamiento/angulo"]],
    ["Escritura pequeña", ["dimension/tamano/pequena_2_5_mm", "dimension/tamano/exag_pequena_2mm"]],
    ["Texto concentrado y condensado", ["dimension/espaciamiento/apretada", "dimension/anchura/comprimida"]],
    ["Ordenado", ["orden/estructura/ordenada_esmerada_exageradamente_ordenada"]],
  ],
  sanguineo_activo_y_no_emotivo: [
    ["Mayúsculas adornadas o infladas", ["gestos_tipos/curvos/inflados", "rasgos_tipo/general/rizos_o_florituras"]],
    ["Presión en relieve", ["presion/calidad/relieve"]],
    ["Escritura más grande de lo normal", ["dimension/tamano/grande_3_5_mm", "dimension/tamano/exag_grande_4mm"]],
    ["Predominio de curva sobre ángulo", ["forma/anatomia/curva", "forma/anatomia/redonda", "forma/coligamiento/guirnalda"]],
    ["Distribución amplia", ["dimension/espaciamiento/espaciada", "dimension/espaciamiento/aireada", "dimension/anchura/extendida"]],
  ],
  nervioso_no_activo_y_emotivo: [
    ["Inclinación vibrante (enderezados o desiguales)", ["inclinacion/estabilidad/vibrante_u_oscilante", "inclinacion/estabilidad/desigual_o_irregular", "inclinacion/desviaciones/enderezada_trata_de_corregir_el_trazo_y_es_involuntario"]],
    ["Agitación", ["derivados_de_imperfecciones_o_accidentes/general/agitaciones"]],
    ["Presión ligera", ["presion/calibre/ligera_0_25mm", "presion/profundidad/blanda"]],
    ["Desordenado", ["orden/estructura/desordenada_desalinada_exageradamente_desordenada"]],
    ["Trazos filiformes", ["forma/gestos_tipos/filiforme_serpentina"]],
    ["Velocidad rápida o precipitada", ["velocidad/intensidad/rapida_180_lxm", "velocidad/intensidad/precipitada_200_lxm"]],
  ],
  linfatico_no_activo_no_emotivo: [
    ["Velocidad lenta o pausada", ["velocidad/intensidad/lenta_120_lxm", "velocidad/intensidad/pausada_o_mesurada_140_lxm"]],
    ["Letra regular", ["continuidad/grado_de_variabilidad/regular"]],
    ["Escritura inacabada", ["continuidad/grado_de_soltura/inhibida"]],
    ["Escritura redondeada", ["forma/anatomia/redonda", "forma/anatomia/curva"]],
    ["Escritura bien hecha", ["forma/modelo_caligrafico/caligrafica", "orden/estructura/ordenada_esmerada_exageradamente_ordenada"]],
  ],
};

/** Puntaje de cada temperamento con los rasgos elegidos (Set o array de claves). */
export function temperamento(elegidos) {
  const s = new Set(elegidos);
  return Object.entries(TEMPERAMENTOS).map(([id, inds]) => {
    const cumple = inds.filter(([, ks]) => ks.some((k) => s.has(k))).map(([n]) => n);
    return { id, cumple, total: inds.length, puntaje: cumple.length / inds.length };
  }).sort((a, b) => b.puntaje - a.puntaje);
}

/**
 * Informe: secciones del catálogo con los rasgos elegidos y su interpretación.
 * seleccion: Map clave → { variante, valor, motivo, origen: "medido" | "manual" }.
 */
export function informe(catalogo, seleccion) {
  const idx = indice(catalogo);
  const secciones = [];
  for (const s of catalogo.secciones) {
    if (s.id === "temperamento") continue;
    const items = [];
    for (const g of s.grupos) for (const r of g.rasgos) {
      const k = clave(s.id, g.id, r.id), e = seleccion.get(k);
      if (!e) continue;
      items.push({ clave: k, grupo: g.nombre, rasgo: r.nombre, nota: r.nota, variante: e.variante || "", interpretacion: r.interpretacion || "", valor: e.valor || "", motivo: e.motivo || "", origen: e.origen || "manual", observacion: textoObservacion(e.obs).texto });
    }
    if (items.length) secciones.push({ id: s.id, nombre: s.nombre, lema: s.lema, items });
  }
  const temp = temperamento([...seleccion.keys()]).map((t) => ({ ...t, ...(() => { const e = idx.get(clave("temperamento", "general", t.id)); return { nombre: e?.rasgo.nombre || t.id, descripcion: e?.rasgo.interpretacion || "" }; })() }));
  return { secciones, temperamento: temp, total: seleccion.size, aviso: AVISO };
}

/**
 * Avisos sobre el tipo de escritura: sin espacios entre palabras (chino, japonés, coreano) o alineada a la derecha
 * (árabe, hebreo, de derecha a izquierda). El catálogo está pensado para la escritura cursiva latina.
 */
export function avisosEscritura(med) {
  if (!med || med.vacio || !med.lineas?.length) return [];
  const out = [], L = med.lineas, xh = med.zonaMediaPx || 1;
  const largos = L.filter((l) => l.x1 - l.x0 > 12 * xh);
  if (largos.length && largos.reduce((a, l) => a + l.palabras, 0) / largos.length <= 1.5) out.push("Casi no hay espacios entre palabras. Si es escritura china, japonesa o coreana, las medidas de palabras, ligazón, espacios y espacio gráfico no aplican, y el catálogo (pensado para la cursiva latina) no corresponde.");
  if (L.length >= 3) {
    const d = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)); };
    const ini = d(L.map((l) => l.x0)), fin = d(L.map((l) => l.x1));
    if (ini > 1.5 * xh && fin < 0.5 * ini) out.push("Los renglones se alinean a la derecha y su inicio varía. Si la escritura va de derecha a izquierda (árabe, hebreo), los márgenes izquierdo y derecho y la inclinación se leen al revés, y en árabe la ligazón es obligatoria.");
  }
  return out;
}

/** Medidas de hojas (mm, ancho × largo en vertical). */
export const HOJAS = { carta: [216, 279], a4: [210, 297], oficio: [216, 340], media: [140, 216] };

/**
 * Milímetros por píxel según la opción de escala.
 * opcion: "nada" | "img-carta" | "img-a4" | "img-oficio" | "img-media" | "img-otra" (la imagen es la hoja completa)
 *         | "carta" | "a4" | "media" | "otra" (el rectángulo azul mide ese ancho).
 * Devuelve { k, aviso, desc } (k = null si no hay escala).
 */
export function escalaGrafo(opcion, { anchoImg, altoImg, anchoAzul = 0, mmAzul = 0, hojaAncho = 0, hojaAlto = 0 } = {}) {
  if (!opcion || opcion === "nada") return { k: null, aviso: "", desc: "" };
  if (opcion.startsWith("img-")) {
    let [a, l] = opcion === "img-otra" ? [Number(hojaAncho), Number(hojaAlto)] : HOJAS[opcion.slice(4)] || [0, 0];
    if (!(a > 0 && l > 0) || !(anchoImg > 0 && altoImg > 0)) return { k: null, aviso: "Escribe el ancho y el largo de la hoja en milímetros.", desc: "" };
    // Hoja acostada: se gira la medida para que coincida con la foto
    if ((anchoImg > altoImg) !== (a > l)) [a, l] = [l, a];
    const kx = a / anchoImg, ky = l / altoImg, k = (kx + ky) / 2, dif = Math.abs(kx - ky) / k;
    const aviso = dif > 0.08 ? `La proporción de la foto (${anchoImg}×${altoImg} px) no coincide con la de la hoja (${a}×${l} mm), con ${Math.round(dif * 100)} % de diferencia: puede estar recortada, con bordes de más o en perspectiva. Usé el promedio; para más precisión, recorta la foto justo a la orilla de la hoja o escanéala.` : "";
    return { k, aviso, desc: `la imagen es una hoja de ${a} × ${l} mm` };
  }
  const mm = { carta: 216, a4: 210, media: 140 }[opcion] ?? Number(mmAzul);
  if (!(anchoAzul > 0)) return { k: null, aviso: "Esta escala usa el ancho del rectángulo azul: márcalo o elige «La foto es la hoja completa».", desc: "" };
  if (!(mm > 0)) return { k: null, aviso: "Escribe el ancho real del rectángulo azul en milímetros.", desc: "" };
  return { k: mm / anchoAzul, aviso: "", desc: `el rectángulo azul mide ${mm} mm de ancho` };
}

/** Rasgos que sí se pueden leer en una firma sola (sin texto): se quitan márgenes, orden, espacios entre renglones y la dirección
 *  de los renglones (la firma tiene su propio rasgo de dirección). */
export function rasgosDeFirmaSola(lista) {
  return (lista || []).filter((c) => !/^(orden|espacio_grafico|direccion)\/|^dimension\/espaciamiento\//.test(c.clave))
    .map((c) => ({ ...c, motivo: `${c.motivo} (medido en la firma)` }));
}

/** Secciones en que cada rasgo admite «dónde se encontró» y observaciones (opcional). */
export const CON_OBSERVACIONES = new Set(["gestos_tipos", "rasgos_tipo", "derivados_de_imperfecciones_o_accidentes", "letras_y_numeros"]);

/** Lugares donde se puede encontrar un rasgo y su lectura según el simbolismo del espacio (Max Pulver, 1931). */
export const LUGARES = [
  { id: "zona_superior", nombre: "Zona superior (hampas, puntos, acentos)", lee: "lo intelectual, las ideas y las aspiraciones" },
  { id: "zona_media", nombre: "Zona media (cuerpo de las letras)", lee: "el yo, la afectividad y la vida cotidiana" },
  { id: "zona_inferior", nombre: "Zona inferior (jambas)", lee: "lo material, lo instintivo y lo físico" },
  { id: "inicio_palabra", nombre: "Al inicio de palabra", lee: "la forma de empezar: el yo y lo que viene del pasado" },
  { id: "final_palabra", nombre: "Al final de palabra", lee: "la forma de terminar y de ir hacia los demás y el futuro" },
  { id: "izquierda", nombre: "Lado izquierdo de la hoja", lee: "el pasado, el yo y el origen" },
  { id: "centro", nombre: "Centro de la hoja", lee: "el presente" },
  { id: "derecha", nombre: "Lado derecho de la hoja", lee: "el futuro y los demás" },
  { id: "arriba", nombre: "Parte de arriba de la hoja (comienzo del escrito)", lee: "la forma de presentarse al empezar" },
  { id: "abajo", nombre: "Parte de abajo de la hoja (final del escrito)", lee: "cómo se sostiene la energía hasta el final; si aparece solo ahí, posible cansancio" },
  { id: "mayusculas", nombre: "En mayúsculas", lee: "la autoimagen y la forma de presentarse" },
  { id: "firma", nombre: "En la firma", lee: "la imagen pública que se desea proyectar" },
  { id: "numeros", nombre: "En números", lee: "la relación con lo material y el dinero" },
];
export const FRECUENCIAS = { aislado: "una sola vez (indicio débil)", ocasional: "ocasionalmente", frecuente: "con frecuencia (rasgo habitual)" };

/** Observación de un rasgo → { corto, texto } para el informe y el análisis escrito. obs: { lugares, letras, frecuencia, nota }. */
export function textoObservacion(obs) {
  if (!obs) return { corto: "", texto: "" };
  const ls = (obs.lugares || []).map((id) => LUGARES.find((l) => l.id === id)).filter(Boolean);
  const partes = [ls.map((l) => l.nombre.replace(/\s*\(.*\)$/, "").toLowerCase()).join(", "), obs.letras ? `letras o números: ${obs.letras}` : "", (FRECUENCIAS[obs.frecuencia] || "").replace(/\s*\(.*\)$/, "")].filter(Boolean);
  if (!partes.length && !obs.nota) return { corto: "", texto: "" };
  const corto = partes.join("; ");
  let texto = partes.length ? `Se encontró: ${corto}.` : "";
  if (ls.length) texto += ` Según el simbolismo del espacio (Max Pulver), ${ls.map((l) => `${l.nombre.replace(/\s*\(.*\)$/, "").toLowerCase()} remite a ${l.lee}`).join("; ")}.`;
  if (obs.nota) texto += ` Observación: ${String(obs.nota).trim().replace(/[.\s]+$/, "")}.`;
  return { corto, texto: texto.trim() };
}
