// Dibujos de ejemplo (SVG esquemático) para cada rasgo del catálogo de grafología. No son muestras reales: ilustran la
// idea del rasgo (inclinación, tamaño, forma de enlace, presión, ligazón, márgenes…). 100 × 50, color del texto.

const W = 100, H = 50;
const r1 = (n) => Math.round(n * 10) / 10;
function aleatorio(semilla) { let s = semilla >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

/**
 * Escritura esquemática: palabras hechas de letras con forma de arco, guirnalda, ángulo, curva…
 * o: { xh, incl, dir, forma, palabras, letras, ancho, hueco, separa, grosor, relieve, temblor, punteada, fragmentada,
 *      sinuosa, curva, imbrica, crece, hampa, jamba, bucles, base, x0, renglones, interlinea, gris, desenfoque }
 */
export function trazos(o = {}) {
  const { xh = 9, incl = 90, dir = 0, forma = "arco", palabras = 2, letras = 4, ancho = 0.7, hueco = 1.3, separa = 0, grosor = 1.6, relieve = 0,
    temblor = 0, punteada = false, fragmentada = false, sinuosa = 0, curva = 0, imbrica = 0, crece = 1, hampa = 0, jamba = 0, bucles = false,
    base = 32, x0 = 6, renglones = 1, interlinea = 2.6, semilla = 7, desenfoque = 0 } = o;
  const rnd = aleatorio(semilla), sl = xh / Math.tan((incl * Math.PI) / 180), t = Math.tan((dir * Math.PI) / 180);
  let d = "";
  const largo = palabras * letras * xh * ancho + (palabras - 1) * xh * hueco;
  for (let r = 0; r < renglones; r++) {
    let x = x0;
    for (let p = 0; p < palabras; p++) {
      const xp = x;
      for (let l = 0; l < letras; l++) {
        const k = l / Math.max(1, letras - 1), esc = 1 + (crece - 1) * k, h = xh * esc, w = xh * ancho * esc;
        const rel = (x - x0) / Math.max(1, largo);
        const y0 = base + r * xh * interlinea - (x - x0) * t - (x - xp) * Math.tan((imbrica * Math.PI) / 180)
          + sinuosa * xh * Math.sin(rel * Math.PI * 3) - curva * xh * Math.sin(rel * Math.PI);
        const j = () => (temblor ? (rnd() - 0.5) * temblor : 0);
        const s = sl * esc, mov = l === 0 || separa ? "M" : "L";
        if (forma === "arco") d += `${mov}${r1(x)},${r1(y0)} L${r1(x + s + j())},${r1(y0 - h + j())} C${r1(x + s + w * 0.2)},${r1(y0 - h * 1.35)} ${r1(x + s + w * 0.8)},${r1(y0 - h * 1.35)} ${r1(x + s + w)},${r1(y0 - h)} L${r1(x + w + j())},${r1(y0 + j())} `;
        else if (forma === "guirnalda") d += `${mov}${r1(x + s)},${r1(y0 - h)} L${r1(x + j())},${r1(y0 + j())} C${r1(x + w * 0.2)},${r1(y0 + h * 0.35)} ${r1(x + w * 0.8)},${r1(y0 + h * 0.35)} ${r1(x + w)},${r1(y0)} L${r1(x + s + w + j())},${r1(y0 - h + j())} `;
        else if (forma === "angulo") d += `${mov}${r1(x)},${r1(y0)} L${r1(x + s + w * 0.15)},${r1(y0 - h)} L${r1(x + w * 0.5)},${r1(y0)} L${r1(x + s + w * 0.85)},${r1(y0 - h)} L${r1(x + w)},${r1(y0)} `;
        else if (forma === "cuadrada") d += `${mov}${r1(x)},${r1(y0)} L${r1(x + s)},${r1(y0 - h)} L${r1(x + s + w * 0.8)},${r1(y0 - h)} L${r1(x + w * 0.8)},${r1(y0)} L${r1(x + w)},${r1(y0)} `;
        else if (forma === "redonda") d += `M${r1(x + w / 2 + s / 2 + w * 0.45)},${r1(y0 - h / 2)} a${r1(w * 0.45)},${r1(h / 2)} 0 1 0 0.01,0 `;
        else if (forma === "curva") d += `${mov}${r1(x)},${r1(y0)} C${r1(x + s * 0.4)},${r1(y0 - h * 1.2)} ${r1(x + s + w * 0.7)},${r1(y0 - h * 1.2)} ${r1(x + w * 0.6)},${r1(y0)} C${r1(x + w * 0.7)},${r1(y0 + h * 0.2)} ${r1(x + w * 0.9)},${r1(y0)} ${r1(x + w)},${r1(y0 - h * 0.2)} `;
        else if (forma === "filiforme") d += `${mov}${r1(x)},${r1(y0 - h * 0.2)} Q${r1(x + w * 0.25)},${r1(y0 - h * 0.5)} ${r1(x + w * 0.5)},${r1(y0 - h * 0.15)} T${r1(x + w)},${r1(y0 - h * 0.25)} `;
        else if (forma === "palote") d += `M${r1(x + w * 0.3)},${r1(y0)} L${r1(x + w * 0.3 + s)},${r1(y0 - h)} `;
        else d += `${mov}${r1(x)},${r1(y0)} L${r1(x + s)},${r1(y0 - h)} L${r1(x + w)},${r1(y0)} `;
        if (hampa && l === 1) d += `M${r1(x + w * 0.2)},${r1(y0)} L${r1(x + w * 0.2 + sl * (1 + hampa))},${r1(y0 - xh * (1 + hampa))} ${bucles ? `C${r1(x + w * 0.2 + sl * (1 + hampa) + xh * 0.5)},${r1(y0 - xh * (1 + hampa) + 2)} ${r1(x + w * 0.5)},${r1(y0 - xh)} ${r1(x + w * 0.35)},${r1(y0 - xh * 0.6)}` : ""} `;
        if (jamba && l === letras - 2) d += `M${r1(x + w * 0.6)},${r1(y0)} L${r1(x + w * 0.6 - sl * jamba)},${r1(y0 + xh * jamba)} ${bucles ? `C${r1(x + w * 0.2)},${r1(y0 + xh * jamba)} ${r1(x + w * 0.2)},${r1(y0 + 2)} ${r1(x + w * 0.9)},${r1(y0 - 1)}` : ""} `;
        x += w + (separa ? xh * separa : 0);
      }
      x += xh * hueco;
    }
  }
  const dash = punteada ? ` stroke-dasharray="1.2 2.2"` : fragmentada ? ` stroke-dasharray="6 2.5"` : "";
  const blur = desenfoque ? ` filter="url(#bl${semilla})"` : "";
  const filtro = desenfoque ? `<defs><filter id="bl${semilla}"><feGaussianBlur stdDeviation="${desenfoque}"/></filter></defs>` : "";
  const capas = relieve
    ? `<path d="${d}" stroke-width="${grosor + relieve}" stroke-dasharray="4 4"${blur}/><path d="${d}" stroke-width="${Math.max(0.5, grosor - relieve * 0.4)}"${blur}/>`
    : `<path d="${d}" stroke-width="${grosor}"${dash}${blur}/>`;
  return `${filtro}<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${capas}</g>`;
}

/** Miniatura de hoja con renglones (márgenes, orden, espacio gráfico, firma). */
function hoja({ margen = [6, 6, 6, 6], resaltar = "", lineas = 6, desorden = 0, canales = 0, canalDerecha = false, firma = null, sangria = 0 } = {}) {
  const [sup, der, inf, izq] = margen, x0 = 32, w = 36, y0 = 2, h = 46, rnd = aleatorio(3);
  let s = `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="none" stroke="currentColor" stroke-width="0.6" opacity="0.6"/>`;
  const zona = { superior: [x0, y0, w, sup], inferior: [x0, y0 + h - inf, w, inf], izquierdo: [x0, y0, izq, h], derecho: [x0 + w - der, y0, der, h] }[resaltar];
  if (zona) s += `<rect x="${zona[0]}" y="${zona[1]}" width="${zona[2]}" height="${zona[3]}" fill="#E65100" opacity="0.35"/>`;
  const util = h - sup - inf - (firma ? 8 : 0), paso = util / lineas;
  for (let i = 0; i < lineas; i++) {
    const y = y0 + sup + paso * (i + 0.6) + (desorden ? (rnd() - 0.5) * desorden * 3 : 0);
    const a = x0 + izq + (desorden ? rnd() * desorden * 3 : i * sangria), b = x0 + w - der - (desorden ? rnd() * desorden * 4 : 0);
    if (canales) { const c = x0 + (canalDerecha ? w * 0.7 : w * 0.5); s += `<line x1="${r1(a)}" y1="${r1(y)}" x2="${r1(c - 1.5)}" y2="${r1(y)}" stroke="currentColor" stroke-width="1.6"/><line x1="${r1(c + 1.5)}" y1="${r1(y)}" x2="${r1(b)}" y2="${r1(y)}" stroke="currentColor" stroke-width="1.6"/>`; }
    else s += `<line x1="${r1(a)}" y1="${r1(y)}" x2="${r1(b)}" y2="${r1(y + (desorden ? (rnd() - 0.5) * desorden * 3 : 0))}" stroke="currentColor" stroke-width="1.6"/>`;
  }
  if (canales) s += `<rect x="${x0 + (canalDerecha ? w * 0.7 : w * 0.5) - 1.2}" y="${y0 + sup}" width="2.4" height="${util}" fill="#E65100" opacity="0.4"/>`;
  if (firma) { const [fx, fy, fw] = firma; s += `<path d="M${fx},${fy} q3,-6 6,0 t6,0 t6,-2" fill="none" stroke="#C62828" stroke-width="1.3"/>`; }
  return s;
}

// Íconos de gestos tipo, rasgos tipo, accidentes y abreaciones (trazo esquemático del gesto).
const P = (d, extra = "") => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const B = "M20,38 L80,38"; // base de referencia tenue
const base = `<line x1="10" y1="38" x2="90" y2="38" stroke="currentColor" stroke-width="0.4" opacity="0.4"/>`;
const ICONOS = {
  // gestos tipo curvos
  bucle: P("M30,38 L45,10 C55,8 52,24 42,26 L60,38 L70,30"), lazo: P("M25,38 C40,20 60,20 55,32 C50,42 35,30 50,22 C60,16 70,30 78,30"),
  guirnalda: P("M20,22 C25,40 40,40 45,22 C50,40 65,40 70,22"), arco: P("M20,38 C25,15 40,15 45,38 C50,15 65,15 70,38"),
  espiral: P("M50,26 m-2,0 a2,2 0 1 1 4,0 a5,5 0 1 1 -10,0 a8,8 0 1 1 16,0 a11,11 0 1 1 -22,0"),
  inflados: P("M40,38 L40,20 C40,2 72,4 60,22 C55,30 42,28 42,22"), nudos: P("M30,38 C35,20 55,20 45,30 C38,36 40,22 55,24 L70,38"),
  serpentinas: P("M15,30 Q25,20 35,30 T55,30 T75,30 T95,30"),
  // gestos tipo angulosos
  maza_y_o_boton: P("M30,38 L60,30") + `<circle cx="62" cy="30" r="3.5" fill="currentColor"/>`, triangulos: P("M35,38 L50,12 L65,38 Z"),
  golpe_de_sable: P("M15,36 L90,18", ` stroke-width="2.6"`), golpe_de_latigo: P("M20,38 L40,14 C55,0 70,20 95,6"),
  gancho: P("M30,38 L55,12 L48,14"), arpon: P("M30,38 L60,14 L52,12 M60,14 L58,22"), cruzamientos_o_aspas: P("M30,12 L70,40 M30,40 L70,12"),
  diente_de_jabali: P("M20,38 C40,38 55,30 62,10 C60,26 52,34 40,38"), puntas_y_o_agujas: P("M20,36 L60,36 L92,30 M50,38 L50,6"),
  // rasgos tipo
  ala_de_gallina: P("M20,38 C30,12 60,8 80,20 C70,22 60,26 55,38"), ancla: P("M50,8 L50,40 M35,32 C38,44 62,44 65,32 M42,16 L58,16"),
  anillado: P("M20,30 C30,44 45,40 40,30 C35,22 25,30 40,34 C55,40 65,26 75,30"), arco_de_flecha: P("M25,40 C40,10 70,10 85,28 M82,20 L85,28 L77,30"),
  banderin: P("M35,40 L35,8 L62,14 L35,22"), boca_de_lobo: P("M25,14 L40,38 L55,18 L70,38 L85,14"), cola_de_escorpion: P("M20,38 L60,38 C80,38 85,20 72,16 L76,24"),
  cola_de_puerco: P("M20,30 L45,30 C55,30 55,20 48,20 C40,20 44,34 60,34 L80,30"), cuartos_o_habitaciones: P("M25,38 L25,14 L55,14 L55,38 M40,14 L40,38"),
  cuna_de_moises_bucle_acostado_lado_izquierdo: P("M65,30 L35,30 C20,30 20,42 35,40 C45,38 45,30 40,30"), dientes_de_tiburon_enlaces_angulosos: P("M15,38 L25,22 L35,38 L45,22 L55,38 L65,22 L75,38 L85,22"),
  embrion: P("M50,28 C40,18 60,10 64,22 C68,34 46,40 40,30"), enroscado: P("M30,38 C30,14 70,14 62,30 C56,40 44,30 52,24"),
  espada_de_esparta: P("M20,38 L85,10 M70,8 L78,22"), espejos: P("M30,14 L30,38 M70,14 L70,38 M30,26 C40,16 60,16 70,26"),
  garras_o_unas_de_gato: P("M30,14 C30,38 50,42 62,30 M62,30 L56,26"), mascaras: P("M20,30 C30,10 70,10 80,30 C70,22 30,22 20,30"),
  matriz: P("M30,38 C30,10 70,10 70,38 M42,26 C46,30 54,30 58,26"), megafono_o_trompeta: P("M20,26 L45,30 L80,12 L80,42 L45,30"),
  navajas_o_espadas: P("M15,26 L90,26 M80,20 L90,26 L80,32"), ojos: P("M35,24 a6,5 0 1 0 0.1,0 M65,24 a6,5 0 1 0 0.1,0"),
  rieles_de_tren: P("M10,22 L90,22 M10,32 L90,32 M20,22 L20,32 M40,22 L40,32 M60,22 L60,32 M80,22 L80,32"),
  rizos_o_florituras: P("M15,30 C25,10 35,40 45,20 C55,0 60,40 70,22 C78,10 85,30 92,22"), toque_de_midas: P("M25,38 L50,8 L75,38") + `<circle cx="50" cy="8" r="3" fill="#E0A526"/>`,
  velas_de_barco_parte_curva_acentuada_hacia_la_derecha: P("M35,40 L35,8 C70,10 80,30 35,36"), rasgos_del_diablo_en_la_s_caligrafica_hacia_la_izquierda: P("M60,14 C40,10 40,24 55,26 C70,28 60,42 40,40 L25,32"),
  submarinos_se_extiende_a_la_derecha: P("M15,32 L35,32 C40,40 70,42 92,34"),
  // accidentes e imperfecciones
  abreaciones: P("M55,20 C40,12 30,24 34,32 C38,40 52,38 58,30"), agitaciones: P("M15,30 L25,18 L30,36 L38,14 L44,34 L52,20 L58,36 L66,16 L72,30 L82,22"),
  bolsas_de_tinta: P("M20,38 L40,12 L55,38") + `<ellipse cx="44" cy="22" rx="5" ry="6" fill="currentColor"/>`, brisado: P("M20,30 L35,30 M39,30 L52,30 M57,30 L70,30 M74,30 L88,30"),
  correcciones_o_retoques: P("M25,38 L45,12 L60,38") + P("M27,37 L46,14", ` stroke-width="0.9" opacity="0.7"`), dentados_ovalos_incompletos_y_abiertos_en_fora_de_ues: P("M25,20 C25,40 45,40 45,20 M55,20 C55,40 75,40 75,20"),
  emplastamiento: P("M15,32 C35,26 60,38 88,28", ` stroke-width="5"`), encadenados: P("M20,30 C30,20 40,40 50,30 C60,20 70,40 80,30") + P("M22,31 C32,21 42,41 52,31", ` stroke-width="0.9"`),
  enmaranados: P("M25,38 C30,8 60,40 40,20 C30,10 70,10 60,30 C50,44 30,20 70,26"), frenado_o_contenciones: P("M20,30 L70,30") + `<circle cx="70" cy="30" r="2.6" fill="currentColor"/>`,
  globos: P("M35,38 L45,24 C30,4 75,4 58,24 L65,38"), humo: P("M20,32 C40,30 60,22 88,14", ` stroke-width="1" opacity="0.6"`), inflamientos_de_tinta: P("M15,30 L85,30") + `<ellipse cx="50" cy="30" rx="6" ry="3.5" fill="currentColor"/>`,
  pedestal: P("M50,10 L50,34 M30,38 L70,38"), pies_curvos: P("M50,8 L50,34 C50,42 40,42 36,36"), puntos_negros: P("M20,30 L80,30") + `<circle cx="35" cy="30" r="2.2" fill="currentColor"/><circle cx="62" cy="30" r="2.2" fill="currentColor"/>`,
  reenganches: P("M20,38 L40,14 M38,18 L55,38 L70,16"), rosarios: P("M15,30 L85,30", ` stroke-dasharray="0.1 5" stroke-width="3"`), temblores: P("M15,30 l3,-2 3,3 3,-3 3,2 3,-3 3,3 3,-2 3,3 3,-3 3,2 3,-3 3,3 3,-2 3,3 3,-3 3,2 3,-3 3,3 3,-2 3,3 3,-3 3,2"),
  torsiones_o_enderezados: P("M30,38 C34,30 26,22 34,12 M60,38 C64,30 56,22 64,12"),
};

function abreacion(zona, abierta) {
  // óvalo con hueco hacia la zona
  const gap = { zona_superior: [215, 325], zona_inferior: [35, 145], zon_izquierda: [125, 235], zona_derecha: [-55, 55] }[zona] || [0, 0];
  const pts = []; for (let a = 0; a <= 360; a += 10) { const dentro = abierta ? !(a >= ((gap[0] + 360) % 360) && a <= ((gap[1] + 360) % 360)) : true; if (dentro || (gap[0] < 0 && !(a >= 360 + gap[0] || a <= gap[1]))) pts.push([50 + 14 * Math.cos((a * Math.PI) / 180), 26 + 11 * Math.sin((a * Math.PI) / 180)]); }
  const d = pts.map((p, i) => `${i ? "L" : "M"}${r1(p[0])},${r1(p[1])}`).join(" ");
  const extra = !abierta ? (zona === "zona_superior" ? P("M50,15 L58,8") : zona === "zona_inferior" ? P("M50,37 L56,44") : zona === "zon_izquierda" ? P("M36,26 L28,22") : P("M64,26 L72,22")) : "";
  return P(d) + extra;
}

const SPEC = {
  // Dimensión
  "dimension/tamano/exag_grande_4mm": { xh: 16, letras: 3, palabras: 1 }, "dimension/tamano/grande_3_5_mm": { xh: 13, letras: 3 }, "dimension/tamano/mediana_o_normal_3mm": { xh: 10 },
  "dimension/tamano/pequena_2_5_mm": { xh: 7, letras: 5 }, "dimension/tamano/exag_pequena_2mm": { xh: 5, letras: 6, palabras: 3 },
  "dimension/anchura/adosada": { ancho: 0.45, separa: -0.15, letras: 6 }, "dimension/anchura/comprimida": { ancho: 0.4, letras: 6 }, "dimension/anchura/extendida": { ancho: 1.25, letras: 3 },
  "dimension/altura/sobrealzada": { xh: 14, ancho: 0.45, letras: 5 }, "dimension/altura/rebajada": { xh: 5, ancho: 1.2, letras: 4 },
  "dimension/espaciamiento/espaciada": { hueco: 3, letras: 3, xh: 8 }, "dimension/espaciamiento/aireada": { hueco: 2.6, renglones: 2, interlinea: 3.4, xh: 6, base: 18, letras: 3 },
  "dimension/espaciamiento/apretada": { hueco: 0.4, renglones: 3, interlinea: 1.6, xh: 6, base: 14, palabras: 3, letras: 3 },
  "dimension/proporcion_espacio_entre_hampa_y_jamba_1_5_ovalos/baja": { xh: 10 }, "dimension/proporcion_espacio_entre_hampa_y_jamba_1_5_ovalos/prol_hacia_arriba": { xh: 7, hampa: 2.2, base: 40 },
  "dimension/proporcion_espacio_entre_hampa_y_jamba_1_5_ovalos/prol_hacia_abajo": { xh: 7, jamba: 2.2, base: 18 }, "dimension/proporcion_espacio_entre_hampa_y_jamba_1_5_ovalos/prol_hacia_arriba_y_abajo": { xh: 6, hampa: 1.8, jamba: 1.8, base: 30 },
  "dimension/proporcion_espacio_entre_hampa_y_jamba_1_5_ovalos/sobria": { xh: 8, hampa: 0.9, jamba: 0.9 },
  // Forma
  "forma/anatomia/cuadrada": { forma: "cuadrada" }, "forma/anatomia/angulosa": { forma: "angulo" }, "forma/anatomia/curva": { forma: "curva" }, "forma/anatomia/redonda": { forma: "redonda", letras: 4 },
  "forma/anatomia/semiangulosa_semiredonda": { forma: "arco" }, "forma/legibilidad_facilidad_para_dejarse_entender/clara": { forma: "arco", hueco: 1.6 },
  "forma/legibilidad_facilidad_para_dejarse_entender/confusa": { forma: "filiforme", incl: 60, letras: 6 }, "forma/trazado_numero_de_trazos/complicada": { forma: "curva", hampa: 1.2, bucles: true, jamba: 1.2 },
  "forma/trazado_numero_de_trazos/sencilla": { forma: "arco" }, "forma/trazado_numero_de_trazos/simplificada": { forma: "filiforme", incl: 70 },
  "forma/gestos_tipos/arqueada_arco": { forma: "arco" }, "forma/gestos_tipos/guirnalda": { forma: "guirnalda" }, "forma/gestos_tipos/bucles": { forma: "arco", hampa: 1.3, jamba: 1.3, bucles: true, base: 28 },
  "forma/gestos_tipos/filiforme_serpentina": { forma: "filiforme", letras: 6 }, "forma/particularidades/dentada_dan_forma_de_ues": { forma: "guirnalda", ancho: 0.6 },
  "forma/modelo_caligrafico/caligrafica": { forma: "curva", incl: 72, hampa: 1.2, bucles: true }, "forma/modelo_caligrafico/tipografica": { forma: "palote", separa: 0.4, letras: 5 },
  "forma/modelo_caligrafico/extrana_o_bizarra": { forma: "angulo", crece: 1.8, temblor: 2.5 }, "forma/coligamiento/guirnalda": { forma: "guirnalda" }, "forma/coligamiento/angulo": { forma: "angulo" },
  "forma/coligamiento/arco": { forma: "arco" }, "forma/coligamiento/mezclas_u_otros": { forma: "curva" },
  // Inclinación
  "inclinacion/posicion/vertical_90_85_a_95": { incl: 90 }, "inclinacion/posicion/inclinada": { incl: 62 }, "inclinacion/posicion/invertida": { incl: 118 },
  "inclinacion/desviaciones/enderezada_trata_de_corregir_el_trazo_y_es_involuntario": { incl: 75, temblor: 1.5 }, "inclinacion/desviaciones/torcida_vertical_u_horizontal_temblores_mas_fuertes": { incl: 80, temblor: 3.5 },
  "inclinacion/estabilidad/rigida": { incl: 70 }, "inclinacion/estabilidad/constante": { incl: 75 }, "inclinacion/estabilidad/vibrante_u_oscilante": { incl: 72, temblor: 2.5 },
  "inclinacion/estabilidad/desigual_o_irregular": { incl: 85, temblor: 4.5 },
  // Dirección
  "direccion/orientacion/horizontal_aprox_0": { dir: 0, palabras: 3, letras: 3, xh: 7 }, "direccion/orientacion/ascendente_1a50": { dir: 12, palabras: 3, letras: 3, xh: 7, base: 42 },
  "direccion/orientacion/descendente_5a10": { dir: -12, palabras: 3, letras: 3, xh: 7, base: 16 }, "direccion/trayecto/rigida": { palabras: 3, letras: 3, xh: 7 },
  "direccion/trayecto/sinuosa": { palabras: 3, letras: 3, xh: 7, sinuosa: 0.35 }, "direccion/trayecto/serpentina": { palabras: 3, letras: 3, xh: 7, sinuosa: 0.8 },
  "direccion/trayecto/convexa": { palabras: 3, letras: 3, xh: 7, curva: 1, base: 38 }, "direccion/trayecto/concava": { palabras: 3, letras: 3, xh: 7, curva: -1, base: 26 },
  "direccion/trayecto/superpuesta_descendente": { palabras: 3, letras: 3, xh: 7, imbrica: -14, base: 24 }, "direccion/trayecto/superpuesta_ascendente": { palabras: 3, letras: 3, xh: 7, imbrica: 14, base: 36 },
  "direccion/trayecto/con_ascenso_al_final": { palabras: 3, letras: 3, xh: 7, curva: -0.6, dir: 4, base: 36 }, "direccion/trayecto/con_descenso_al_final": { palabras: 3, letras: 3, xh: 7, curva: 0.6, dir: -4, base: 28 },
  // Velocidad
  "velocidad/intensidad/lenta_120_lxm": { forma: "redonda", incl: 95, separa: 0.3 }, "velocidad/intensidad/pausada_o_mesurada_140_lxm": { forma: "arco", incl: 88 },
  "velocidad/intensidad/acelerada_160_lxm": { forma: "guirnalda", incl: 72 }, "velocidad/intensidad/rapida_180_lxm": { forma: "guirnalda", incl: 62, ancho: 0.9 },
  "velocidad/intensidad/precipitada_200_lxm": { forma: "filiforme", incl: 55, letras: 6 }, "velocidad/fluidez/constrenida": { xh: 6, ancho: 0.45, letras: 6, hueco: 0.6 },
  "velocidad/fluidez/contenida": { forma: "arco", incl: 88 }, "velocidad/fluidez/dinamogena": { forma: "angulo", incl: 70, grosor: 2.6 }, "velocidad/fluidez/espontanea": { forma: "guirnalda", incl: 75 },
  "velocidad/fluidez/movida": { forma: "guirnalda", sinuosa: 0.4, temblor: 1.5 }, "velocidad/impulsividad/floja": { forma: "curva", grosor: 0.8, dir: -6, base: 24 },
  "velocidad/impulsividad/retardada": { forma: "redonda", incl: 100 }, "velocidad/impulsividad/resuelta": { forma: "angulo", incl: 75, grosor: 2.2 },
  "velocidad/impulsividad/aguzada": { forma: "angulo", incl: 65, grosor: 1.2 }, "velocidad/impulsividad/lanzada": { forma: "guirnalda", incl: 58, dir: 6, base: 38 },
  // Continuidad
  "continuidad/ligazon/hiperligada": { forma: "guirnalda", hueco: 0.3, palabras: 3, letras: 3 }, "continuidad/ligazon/ligada": { forma: "guirnalda" }, "continuidad/ligazon/agrupada": { forma: "guirnalda", separa: 0.25, letras: 4 },
  "continuidad/ligazon/desligada": { forma: "arco", separa: 0.5, letras: 4 }, "continuidad/ligazon/palotes": { forma: "palote", letras: 6, separa: 0.2 },
  "continuidad/ligazon/fragmentada": { forma: "arco", fragmentada: true }, "continuidad/ligazon/punteada": { forma: "arco", punteada: true, grosor: 2 },
  "continuidad/grado_de_variabilidad/regular": { forma: "arco" }, "continuidad/grado_de_variabilidad/desigual": { forma: "arco", temblor: 4, crece: 1.5 },
  "continuidad/grado_de_soltura/suelta": { forma: "guirnalda", incl: 72 }, "continuidad/grado_de_soltura/inhibida": { forma: "arco", temblor: 2, separa: 0.3, grosor: 1.1 },
  "continuidad/grado_de_soltura/desarrollo": { forma: "arco", crece: 0.45, letras: 5, palabras: 1, xh: 14, base: 38 },
  // Presión
  "presion/calibre/ligera_0_25mm": { grosor: 0.6 }, "presion/calibre/pesada_0_75a1mm": { grosor: 2.4 }, "presion/calibre/gruesa_1mm": { grosor: 3.2 }, "presion/calibre/espesa_3_4mm": { grosor: 4.2 },
  "presion/calidad/relieve": { grosor: 1.2, relieve: 2 }, "presion/calidad/plana": { grosor: 1.8 }, "presion/pureza/espasmodica": { grosor: 1.4, relieve: 2.5, temblor: 1 },
  "presion/pureza/nitida": { grosor: 1.5 }, "presion/pureza/pastosa": { grosor: 2.4, desenfoque: 0.7 }, "presion/pureza/borrosa_y_con_bolsas": { grosor: 2.6, desenfoque: 1.2 },
  "presion/profundidad/firme": { grosor: 2.2 }, "presion/profundidad/blanda": { grosor: 1.1, desenfoque: 0.4 },
};

/** SVG (cadena) para una clave del catálogo; `variante` ajusta ángulos y desarrollo. Devuelve "" si no hay dibujo. */
export function ejemplo(k, variante = "") {
  const [sec, grupo, id] = k.split("/");
  let cuerpo = "";
  if (SPEC[k]) {
    const o = { ...SPEC[k] };
    const v = variante.toLowerCase();
    if (v) {
      const n = Number((v.match(/(\d+)/) || [])[1]);
      if (grupo === "posicion" && Number.isFinite(n)) o.incl = id === "inclinada" ? (v.includes("muy") ? 47 : v.includes("poco") ? 76 : 58) : (v.includes("muy") ? 132 : v.includes("poco") ? 104 : 118);
      if (grupo === "orientacion") o.dir = id.startsWith("asc") ? (v.includes("trepadora") ? 24 : v.includes("lig") ? 5 : 14) : (v.includes("hundida") ? -20 : v.includes("lig") ? -5 : -10);
      if (id === "desarrollo") o.crece = v.includes("creciente") || v.includes("aumentos") ? 1.8 : v.includes("cilíndrica") ? 1 : v.includes("desigual") ? 1.3 : 0.45;
      if (id === "punteada") o.punteada = true;
    }
    cuerpo = (grupo === "orientacion" || grupo === "trayecto" ? "" : base) + trazos(o);
  } else if (sec === "orden" && grupo.startsWith("margenes")) cuerpo = hoja({ margen: [7, 5, 7, 5], resaltar: id });
  else if (k === "orden/estructura/ordenada_esmerada_exageradamente_ordenada") cuerpo = hoja({ margen: [6, 5, 6, 6] });
  else if (k === "orden/estructura/desordenada_desalinada_exageradamente_desordenada") cuerpo = hoja({ margen: [4, 2, 3, 3], desorden: 1.2 });
  else if (k === "orden/equilibrio/proporcionada_mediana_sobria_aireada_clara_modelo_caligrafic") cuerpo = base + trazos({ hampa: 0.9, jamba: 0.9, xh: 8 });
  else if (k === "orden/equilibrio/desproporcionada_bizarra_muy_grande_muy_pequena_hacia_arriba") cuerpo = base + trazos({ hampa: 2.6, xh: 5, base: 44 });
  else if (k === "orden/organizacion/enredada_letra_apretada_es_facil_de_enredar") cuerpo = trazos({ renglones: 2, interlinea: 1.6, jamba: 1.8, hampa: 1.8, xh: 7, base: 18 });
  else if (k === "orden/organizacion/cruzada") cuerpo = trazos({ xh: 8 }) + P("M10,40 L90,12", ` stroke-width="1.2"`);
  else if (k === "orden/organizacion/hiperpuesta") cuerpo = trazos({ xh: 8 }) + trazos({ xh: 8, x0: 9, base: 30, grosor: 1 });
  else if (k === "orden/organizacion/direcciones_multiples") cuerpo = trazos({ xh: 6, base: 18, dir: 10, palabras: 1 }) + trazos({ xh: 6, base: 40, dir: -12, x0: 50, palabras: 1 });
  else if (k === "orden/organizacion/subrayada") cuerpo = trazos({ xh: 8, base: 28 }) + P("M8,36 L92,35");
  else if (sec === "espacio_grafico") cuerpo = hoja({ margen: [5, 4, 5, 4], lineas: 7, canales: 1, canalDerecha: id.startsWith("fantasmas") }) + (id.startsWith("cascadas") ? `<text x="80" y="47" font-size="7" fill="currentColor">5+</text>` : "");
  else if (sec === "firma") {
    const pos = { proxima_al_texto: [44, 38], invadiendo_el_texto_una_parte: [46, 33], firma_entre_el_texto_casi_totalidad: [40, 22], correctamente_situada: [48, 41], alejada_del_texto: [48, 47], izquierda: [34, 42], centro: [42, 42], derecha: [50, 42] }[id];
    if (pos) cuerpo = hoja({ margen: [5, 4, 14, 4], lineas: 4, firma: [pos[0], pos[1]] });
    else if (grupo === "ejecucion_de_la_firma") cuerpo = trazos({ xh: 6, base: 20, palabras: 2, letras: 3 }) + `<g transform="translate(${id.includes("mayores") ? 0 : 10},${id.includes("mayores") ? 4 : 0}) scale(${id.includes("mayores") ? 1.6 : id.includes("menores") ? 0.6 : 1})"><path d="M30,36 q3,-6 6,0 t6,0 t6,-2" fill="none" stroke="#C62828" stroke-width="1.3"/></g>`;
    else if (grupo === "direccion_de_las_firmas") cuerpo = `<path d="M20,${id === "ascendente" ? 40 : id === "descendente" ? 18 : 30} q8,-10 16,0 t16,0 t16,0 t12,${id === "ascendente" ? -14 : id === "descendente" ? 14 : 0}" fill="none" stroke="#C62828" stroke-width="1.6"/>`;
    else if (grupo === "legibilidad") cuerpo = id === "legible" ? trazos({ xh: 9, forma: "arco" }) : id === "semilegible" ? trazos({ xh: 9, forma: "curva", incl: 70 }) : trazos({ xh: 9, forma: "filiforme", incl: 60, letras: 6 });
    else if (grupo === "grado_de_constancia") cuerpo = `<path d="M10,20 q4,-6 8,0 t8,0 t8,-2 M10,40 q4,-6 8,0 t8,0 t8,-2 M55,20 q4,-6 8,0 t8,0 t8,-2 M55,40 q${id === "constante" ? "4,-6 8,0 t8,0 t8,-2" : "6,-12 12,2 t4,-8 t12,6"}" fill="none" stroke="#C62828" stroke-width="1.4"/>`;
    else if (grupo === "predominio_nom_y_o_apellido") cuerpo = `<text x="50" y="32" text-anchor="middle" font-size="${id === "con_iniciales" ? 16 : 11}" font-style="italic" fill="currentColor">${{ predominio_del_nombre: "<tspan font-size='16'>Ana</tspan> Ruiz L.", predominio_del_primer_apellido: "A. <tspan font-size='16'>Ruiz</tspan> L.", predominio_del_segundo_apellido: "A. R. <tspan font-size='16'>López</tspan>", con_iniciales: "A. R. L." }[id] || ""}</text>`;
  } else if (sec === "abreaciones") cuerpo = abreacion(id, grupo === "aberturas");
  else if (k === "forma/gestos_tipos/latigazos") cuerpo = base + ICONOS.golpe_de_latigo;
  else if (k === "forma/gestos_tipos/arpones_gancho_y_arpon") cuerpo = base + ICONOS.arpon;
  else if (k === "forma/gestos_tipos/anillada_guirnalda_bucle") cuerpo = base + ICONOS.anillado;
  else if (k === "forma/particularidades/encadenada_reafirma_el_trazo") cuerpo = base + ICONOS.encadenados;
  else if (ICONOS[id]) cuerpo = (sec === "gestos_tipos" || sec === "rasgos_tipo" || sec === "derivados_de_imperfecciones_o_accidentes" ? base : "") + ICONOS[id];
  if (!cuerpo) return "";
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Ejemplo esquemático" class="ej">${cuerpo}</svg>`;
}
