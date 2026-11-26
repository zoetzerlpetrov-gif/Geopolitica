// Estudio del creador (creadores.html): lógica pura, sin DOM ni red. Ideas por nicho, guion por formato, escenas para el
// video, lectura de métricas y evaluación de 30 días. Lo usa js/creadores-estudio.js.

/** Palabras por segundo al narrar en español a ritmo normal (unas 150 por minuto). */
export const PALABRAS_SEG = 2.5;

/** Formatos de pieza: duración objetivo y forma del guion. */
export const FORMATOS = {
  corto: { nombre: "Video corto vertical (15 a 60 s)", segundos: [15, 60], aspecto: "9:16" },
  largo: { nombre: "Video largo horizontal (5 a 12 min)", segundos: [300, 720], aspecto: "16:9" },
  carrusel: { nombre: "Carrusel de imágenes (5 a 10)", segundos: [0, 0], aspecto: "4:5" },
};

const palabras = (t) => String(t || "").trim().split(/\s+/).filter(Boolean).length;
/** Segundos que toma decir un texto en voz alta. */
export const segundosDe = (t) => Math.max(1, Math.round(palabras(t) / PALABRAS_SEG));

/** Ideas a partir del nicho y un subnicho: las plantillas del nicho con «{sub}» reemplazado. */
export function ideasDe(nicho, sub) {
  if (!nicho) return [];
  const s = String(sub || nicho.subnichos?.[0] || nicho.nombre).trim();
  return (nicho.ideas || []).map((x) => x.replace(/\{sub\}/g, s.toLowerCase()));
}

/** Prioridad de una idea (1 a 5): interés de la audiencia × facilidad de hacerla, ajustado por si ya funcionó algo parecido. */
export function prioridad({ interes = 3, facilidad = 3 } = {}) {
  const i = Math.min(5, Math.max(1, Number(interes) || 3)), f = Math.min(5, Math.max(1, Number(facilidad) || 3));
  return Math.round((i * 0.6 + f * 0.4) * 10) / 10;
}

/**
 * Guion para una idea. d = { idea, formato, puntos: [..], cta, tono }.
 * Devuelve { partes: [{ etiqueta, texto, seg }], total } con el tiempo estimado de cada parte.
 */
export function guion({ idea = "", formato = "corto", puntos = [], cta = "", publico = "" } = {}) {
  const ps = (puntos || []).map((x) => String(x || "").trim()).filter(Boolean);
  const tema = String(idea || "tu tema").trim();
  const quien = publico ? ` si eres ${publico}` : "";
  let partes;
  if (formato === "largo") {
    partes = [
      ["Gancho (0-15 s)", `${tema}. Quédate hasta el final${quien}: te digo lo que casi nadie explica.`],
      ["Promesa", `En este video vas a ver ${ps.length || 3} cosas concretas para entender ${tema.toLowerCase()} y aplicarlo hoy.`],
      ...(ps.length ? ps : ["Primer punto con un ejemplo real", "Segundo punto con un dato y su fuente", "Tercer punto: el error más común"]).map((p, k) => [`Parte ${k + 1}`, p]),
      ["Resumen", `Repaso rápido: ${(ps.length ? ps : ["punto uno", "punto dos", "punto tres"]).map((p) => p.split(/[.,:;]/)[0]).join(", ")}.`],
      ["Llamado a la acción", cta || "Si te sirvió, suscríbete y dime en comentarios qué tema quieres para el siguiente video."],
    ];
  } else if (formato === "carrusel") {
    partes = [
      ["Portada", tema],
      ...(ps.length ? ps : ["Dato o paso 1", "Dato o paso 2", "Dato o paso 3"]).map((p, k) => [`Lámina ${k + 2}`, p]),
      ["Última lámina", cta || "Guárdalo para después y compártelo con quien lo necesite."],
    ];
  } else {
    partes = [
      ["Gancho (0-3 s)", tema],
      ["Contexto (1 frase)", `Esto${quien} te ahorra tiempo:`],
      ...(ps.length ? ps.slice(0, 4) : ["Primer punto, corto y concreto", "Segundo punto con un ejemplo", "Tercer punto: lo que casi nadie hace"]).map((p, k) => [`Punto ${k + 1}`, p]),
      ["Cierre y llamado a la acción", cta || "Sígueme para la parte 2."],
    ];
  }
  const out = partes.map(([etiqueta, texto]) => ({ etiqueta, texto, seg: formato === "carrusel" ? 0 : segundosDe(texto) }));
  return { partes: out, total: out.reduce((s, p) => s + p.seg, 0) };
}

/** Aviso si la duración no entra en el rango del formato. */
export function revisarDuracion(total, formato) {
  const [min, max] = FORMATOS[formato]?.segundos || [0, 0];
  if (!max) return "";
  if (total > max) return `Dura unos ${total} s y el formato pide hasta ${max} s: recorta puntos o frases.`;
  if (total < min) return `Dura unos ${total} s; puedes agregar un ejemplo para llegar a ${min} s.`;
  return "";
}

/** Guion en texto plano (para copiar o leer en el teleprompter). */
export const guionTexto = (g) => g.partes.map((p) => `${p.etiqueta}${p.seg ? ` (~${p.seg} s)` : ""}\n${p.texto}`).join("\n\n");

/**
 * Escenas del video: una por parte del guion, repartiendo los medios (fotos o clips) en orden.
 * Cada escena dura lo que toma leer su texto (mínimo 2.5 s) o lo que dura el clip si es más largo y se pide.
 */
export function escenas(partes, medios = [], { minimo = 2.5 } = {}) {
  if (!partes.length && !medios.length) return [];
  const textos = partes.length ? partes.map((p) => p.texto) : medios.map(() => "");
  return textos.map((texto, k) => ({ texto, medio: medios.length ? k % medios.length : -1, dur: Math.max(minimo, segundosDe(texto) + 0.5) }));
}

/** Tamaño del lienzo por relación de aspecto (píxeles). */
export const LIENZO = { "9:16": [1080, 1920], "16:9": [1920, 1080], "1:1": [1080, 1080], "4:5": [1080, 1350] };

/** Encuadre «Ken Burns»: escala y desplazamiento de una imagen a lo largo de la escena (t de 0 a 1). */
export function kenBurns(t, k = 0) {
  const sentido = k % 2 ? -1 : 1;
  return { escala: 1.04 + 0.08 * t, dx: sentido * (t - 0.5) * 0.04, dy: (k % 3 === 0 ? -1 : 1) * (t - 0.5) * 0.03 };
}

/** Opacidad de la escena (fundido de entrada y salida de `fundido` segundos). */
export function opacidad(seg, dur, fundido = 0.5) {
  if (seg < fundido) return Math.max(0, seg / fundido);
  if (seg > dur - fundido) return Math.max(0, (dur - seg) / fundido);
  return 1;
}

/** Métricas de una publicación → tasas y una recomendación concreta. m = { vistas, me_gusta, comentarios, compartidos, guardados, seguidores, retencion }. */
export function leerMetricas(m = {}) {
  const n = (k) => Math.max(0, Number(m[k]) || 0);
  const vistas = n("vistas");
  const interacciones = n("me_gusta") + n("comentarios") + n("compartidos") + n("guardados");
  const tasa = vistas ? Math.round((interacciones / vistas) * 1000) / 10 : null;
  const conversion = vistas ? Math.round((n("seguidores") / vistas) * 10000) / 100 : null;
  const retencion = m.retencion === "" || m.retencion == null ? null : Math.min(100, n("retencion"));
  const consejos = [];
  // Referencias orientativas (no oficiales de las plataformas): sirven para comparar tus propias piezas entre sí.
  if (retencion != null && retencion < 35) consejos.push("Pocas personas se quedan: mejora el gancho de los primeros 3 segundos y corta las pausas.");
  if (tasa != null && tasa < 2) consejos.push("Poca interacción: termina con una pregunta concreta o un dato que invite a comentar o guardar.");
  if (vistas >= 1000 && conversion != null && conversion < 0.3) consejos.push("Te ven pero no te siguen: di en el cierre qué van a encontrar si te siguen (por ejemplo, la parte 2).");
  if (n("guardados") > n("me_gusta") * 0.3) consejos.push("Lo guardan mucho: es contenido útil; haz más piezas de este tipo y en serie.");
  if (n("compartidos") > n("me_gusta") * 0.2) consejos.push("Lo comparten mucho: el tema conecta; repite el formato con otra idea del mismo tema.");
  if (!consejos.length && vistas) consejos.push("Va bien: repite el formato y prueba un horario distinto para comparar.");
  return { vistas, interacciones, tasa, conversion, retencion, consejos };
}

/** De varias publicaciones: cuáles repetir (mejor tasa) y cuáles ajustar. */
export function compararPublicaciones(lista = []) {
  const con = lista.map((p) => ({ ...p, lectura: leerMetricas(p) })).filter((p) => p.lectura.vistas > 0);
  const orden = [...con].sort((a, b) => (b.lectura.tasa || 0) - (a.lectura.tasa || 0));
  const promedio = con.length ? Math.round((con.reduce((s, p) => s + (p.lectura.tasa || 0), 0) / con.length) * 10) / 10 : null;
  return { repetir: orden.slice(0, 3), ajustar: orden.slice(-3).reverse().filter((p) => !orden.slice(0, 3).includes(p)), promedio };
}

/** Evaluación de 30 días: semana actual, piezas hechas contra la meta y semáforo. */
export function evaluacion30({ inicio, metaSemana = 3, publicaciones = [] } = {}, hoy = new Date()) {
  if (!inicio) return null;
  const ini = new Date(`${inicio}T00:00:00`);
  const dias = Math.floor((hoy - ini) / 86400000);
  const semana = Math.min(4, Math.max(1, Math.floor(dias / 7) + 1));
  const hechas = publicaciones.filter((p) => p.fecha && p.fecha >= inicio).length;
  const esperadas = Math.max(1, Math.min(4, Math.ceil((dias + 1) / 7)) * metaSemana);
  const avance = Math.round((hechas / esperadas) * 100);
  const color = avance >= 90 ? "verde" : avance >= 60 ? "amarillo" : "rojo";
  return { dias: Math.max(0, dias), semana, hechas, esperadas, avance, color, terminado: dias >= 30 };
}

/** Atribución obligatoria de una imagen de licencia libre (autor, licencia y fuente). */
export const atribucion = (m) => [m.titulo || "Imagen", m.autor ? `de ${m.autor}` : "", m.licencia ? `(${m.licencia})` : "", m.fuente ? `vía ${m.fuente}` : ""].filter(Boolean).join(" ");
