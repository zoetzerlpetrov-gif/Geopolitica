// Herramientas gratuitas para creadores de contenido (creadores.html): adaptar un texto a cada red con su límite,
// contar caracteres como lo hace cada red, revisar el contraste de una imagen y elegir temas del día.
// Funciones puras (sin DOM ni red).

/** Límites de cada red (caracteres) y cómo cuenta los enlaces. Fuente: ayuda oficial de cada red (2026). */
export const REDES = {
  x: { nombre: "X (Twitter)", limite: 280, enlace: 23, hashtags: 2 },
  bluesky: { nombre: "Bluesky", limite: 300, hashtags: 3 },
  threads: { nombre: "Threads", limite: 500, hashtags: 1 },
  instagram: { nombre: "Instagram (pie de foto)", limite: 2200, hashtags: 5 },
  tiktok: { nombre: "TikTok (descripción)", limite: 2200, hashtags: 5 },
  facebook: { nombre: "Facebook", limite: 2000, hashtags: 3 },
  linkedin: { nombre: "LinkedIn", limite: 3000, hashtags: 3 },
  youtube_titulo: { nombre: "YouTube (título)", limite: 100, hashtags: 0, sinEnlace: true },
  youtube_desc: { nombre: "YouTube (descripción)", limite: 5000, hashtags: 3 },
};

const URL_RE = /https?:\/\/\S+/g;

/** Caracteres según la red: en X cada enlace cuenta 23 sin importar su largo. Los emoji cuentan como 2 en X. */
export function contar(texto, red) {
  const t = String(texto || "");
  const r = REDES[red];
  if (r?.enlace) {
    const sinEnlaces = t.replace(URL_RE, "");
    const enlaces = (t.match(URL_RE) || []).length;
    return [...sinEnlaces].reduce((n, c) => n + (c.codePointAt(0) > 0xffff ? 2 : 1), 0) + enlaces * r.enlace;
  }
  return [...t].length;
}

/** Normaliza etiquetas: sin espacios ni signos, con «#», sin repetir. */
export function etiquetas(texto) {
  const vistas = new Set();
  return String(texto || "").split(/[,\s]+/).map((x) => x.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "")).filter((x) => x && !vistas.has(x.toLowerCase()) && vistas.add(x.toLowerCase())).map((x) => `#${x}`);
}

/** Recorta en la última palabra completa que quepa y agrega «…». */
export function recortar(texto, max) {
  const cs = [...String(texto || "")];
  if (cs.length <= max) return cs.join("");
  const corte = cs.slice(0, Math.max(0, max - 1)).join("");
  const i = corte.lastIndexOf(" ");
  return (i > max * 0.6 ? corte.slice(0, i) : corte).trimEnd() + "…";
}

/**
 * Texto adaptado a una red: título, cuerpo, llamado a la acción, enlace y etiquetas según lo que admite.
 * d = { titulo, cuerpo, cta, enlace, etiquetas }
 */
export function adaptar(d, red) {
  const r = REDES[red];
  if (!r) return "";
  const tags = etiquetas(d.etiquetas).slice(0, r.hashtags).join(" ");
  if (red === "youtube_titulo") return recortar(String(d.titulo || "").trim(), r.limite);
  const enlace = r.sinEnlace ? "" : String(d.enlace || "").trim();
  const partes = (cuerpo) => [d.titulo, cuerpo, d.cta, enlace, tags].map((x) => String(x || "").trim()).filter(Boolean).join("\n\n");
  let texto = partes(d.cuerpo);
  if (contar(texto, red) > r.limite) {
    // Se recorta el cuerpo (lo demás es necesario) hasta que quepa.
    const fijo = contar(partes(""), red) + 2;
    texto = partes(recortar(d.cuerpo, Math.max(0, r.limite - fijo)));
    if (contar(texto, red) > r.limite) texto = recortar(texto, r.limite);
  }
  return texto;
}

/** Contraste WCAG entre dos colores #rrggbb. */
export function contraste(a, b) {
  const lum = (h) => {
    const c = String(h).replace("#", "").match(/../g)?.map((x) => parseInt(x, 16) / 255) || [0, 0, 0];
    const f = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
}

/** Formatos de imagen por uso. */
export const FORMATOS = {
  post: { nombre: "Publicación (Instagram, Facebook, LinkedIn) 1080×1350", w: 1080, h: 1350 },
  historia: { nombre: "Historia / Reel / TikTok 1080×1920", w: 1080, h: 1920 },
  miniatura: { nombre: "Miniatura de YouTube 1280×720", w: 1280, h: 720 },
  cuadrada: { nombre: "Cuadrada 1080×1080", w: 1080, h: 1080 },
};

/** Temas del día del Noticiero de DOMINUS por sección: los titulares más recientes (solo título, medio, fecha y enlace). */
export function temasDelDia(noticiero, seccion, max = 12) {
  const notas = (noticiero?.notas || []).filter((n) => !seccion || (n.s || []).includes(seccion));
  return notas.slice().sort((a, b) => String(b.f).localeCompare(String(a.f))).slice(0, max).map((n) => ({ titulo: n.t, medio: n.m, fecha: n.f, url: n.u }));
}

/** Horarios de partida por red (hora del centro de México). Son una estimación inicial, no una medición propia:
 *  cada creador debe ajustarlos con las estadísticas de su cuenta a las 3 o 4 semanas. */
export const HORARIOS = [
  ["YouTube (videos largos)", "Jueves a domingo, 14:00–17:00 (publica 2–3 h antes de tu hora pico)"],
  ["YouTube Shorts / Reels", "12:00–14:00 y 19:00–21:00"],
  ["TikTok", "19:00–22:00; fines de semana también 10:00–12:00"],
  ["Instagram (publicaciones)", "Lunes a viernes, 12:00–14:00"],
  ["LinkedIn", "Martes a jueves, 08:00–10:00 y 12:30–13:30"],
  ["X / Threads / Bluesky", "07:00–09:00 y 18:00–20:00"],
  ["Facebook", "13:00–16:00"],
];
