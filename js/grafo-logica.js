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
      items.push({ clave: k, grupo: g.nombre, rasgo: r.nombre, nota: r.nota, variante: e.variante || "", interpretacion: r.interpretacion || "", valor: e.valor || "", motivo: e.motivo || "", origen: e.origen || "manual" });
    }
    if (items.length) secciones.push({ id: s.id, nombre: s.nombre, lema: s.lema, items });
  }
  const temp = temperamento([...seleccion.keys()]).map((t) => ({ ...t, ...(() => { const e = idx.get(clave("temperamento", "general", t.id)); return { nombre: e?.rasgo.nombre || t.id, descripcion: e?.rasgo.interpretacion || "" }; })() }));
  return { secciones, temperamento: temp, total: seleccion.size, aviso: AVISO };
}
