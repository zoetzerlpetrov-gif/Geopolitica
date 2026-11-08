// Transcripción local del audio con Whisper (multilingüe, de Hugging Face) mediante transformers.js, en un trabajador
// (js/transcribir-worker.js). El modelo se descarga una vez y queda en la caché del navegador; el audio nunca sale de la computadora.

/** Remuestrea a 16 kHz mono (lo que espera Whisper) con interpolación lineal. */
export function a16k(muestras, sr) {
  if (sr === 16000) return muestras;
  const n = Math.floor((muestras.length * 16000) / sr), out = new Float32Array(n), r = sr / 16000;
  for (let i = 0; i < n; i++) { const x = i * r, k = Math.floor(x), f = x - k; out[i] = (muestras[k] ?? 0) * (1 - f) + (muestras[k + 1] ?? muestras[k] ?? 0) * f; }
  return out;
}

/** Fragmentos de la transcripción que caen en [desde, hasta] (segundos), unidos en un texto. */
export function textoEntre(segmentos, desde, hasta) {
  return (segmentos || []).filter((s) => s.t1 >= desde && s.t0 <= hasta).map((s) => s.texto.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

// Palabras muy frecuentes para distinguir idiomas con alfabeto latino.
const FRECUENTES = {
  spanish: ["que", "de", "el", "la", "y", "en", "los", "no", "se", "por", "es", "lo", "pero", "con", "una", "para", "está", "yo"],
  english: ["the", "and", "you", "that", "is", "to", "of", "it", "what", "this", "not", "have", "for", "with", "was", "are"],
  portuguese: ["que", "não", "de", "e", "o", "a", "é", "um", "uma", "você", "para", "com", "isso", "eu", "está", "mas"],
  french: ["le", "la", "et", "les", "des", "est", "que", "vous", "pas", "je", "une", "pour", "qui", "dans", "ce", "c'est"],
  italian: ["che", "di", "il", "non", "e", "la", "è", "per", "un", "una", "sono", "ma", "con", "questo", "io", "lo"],
  german: ["der", "die", "und", "das", "ist", "nicht", "ich", "sie", "es", "zu", "ein", "mit", "den", "auf", "auch", "wir"],
};
/** Idioma probable de un texto (nombre en inglés como en Whisper) o "" si no alcanza para decidir. */
export function idiomaDeTexto(texto) {
  const t = String(texto || "");
  if (/[\u3040-\u30ff]/.test(t)) return "japanese";
  if (/[\uac00-\ud7af]/.test(t)) return "korean";
  if (/[\u4e00-\u9fff]/.test(t)) return "chinese";
  if (/[\u0e00-\u0e7f]/.test(t)) return "thai";
  if (/[\u0e80-\u0eff]/.test(t)) return "lao";
  if (/[\u1000-\u109f]/.test(t)) return "burmese";
  if (/[\u0600-\u06ff]/.test(t)) return "arabic";
  if (/[\u0590-\u05ff]/.test(t)) return "hebrew";
  if (/[\u0400-\u04ff]/.test(t)) return "russian";
  if (/[\u0900-\u097f]/.test(t)) return "hindi";
  if ((t.match(/[ơưđạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/gi) || []).length >= 2) return "vietnamese";
  const pal = t.toLowerCase().match(/[\p{L}']+/gu) || []; if (pal.length < 4) return "";
  let mejor = "", max = 0;
  for (const [id, lista] of Object.entries(FRECUENTES)) { const n = pal.filter((p) => lista.includes(p)).length / pal.length; if (n > max) { max = n; mejor = id; } }
  return max >= 0.08 ? mejor : "";
}
export const NOMBRE_IDIOMA = { spanish: "español", english: "inglés", portuguese: "portugués", french: "francés", italian: "italiano", german: "alemán", japanese: "japonés", korean: "coreano", chinese: "chino", thai: "tailandés", lao: "lao", burmese: "birmano", arabic: "árabe", hebrew: "hebreo", russian: "ruso", hindi: "hindi", vietnamese: "vietnamita", cantonese: "cantonés", yoruba: "yoruba", punjabi: "panyabí", hausa: "hausa", lingala: "lingala" };

/** Idiomas tonales: el tono distingue palabras, así que «tono más agudo» y «voz monótona» pierden valor. */
export const TONALES = new Set(["chinese", "cantonese", "vietnamese", "thai", "lao", "burmese", "yoruba", "punjabi", "hausa", "lingala"]);

/** Modelos disponibles: «base» es más preciso; «tiny» es unas 3 veces más rápido pero se equivoca más. */
export const MODELOS = { base: "onnx-community/whisper-base", tiny: "onnx-community/whisper-tiny" };

/** Texto para el usuario con el avance de la transcripción. hecho y total: segundos de audio; seg: segundos transcurridos. */
export function textoAvance(hecho, total, seg) {
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
  const pct = total ? Math.min(100, Math.round((hecho / total) * 100)) : 0;
  let falta = "";
  if (hecho > 0 && seg > 0 && hecho < total) {
    const r = ((total - hecho) * seg) / hecho;
    falta = r < 60 ? " · falta menos de 1 min" : ` · faltan ≈ ${Math.round(r / 60)} min`;
  }
  return `Transcribiendo el audio en tu navegador: ${mmss(hecho)} de ${mmss(total)} (${pct} %)${falta}. Pulsa «Detener transcripción» para quedarte con lo que lleve.`;
}

/** Quita marcas como «[Música]» y completa el idioma con el texto si Whisper no lo dio. */
export function limpiarSegmentos(segs, idioma = "") {
  return (segs || []).map((s) => ({ ...s, texto: String(s.texto || "").trim(), idioma: idioma || s.idioma || idiomaDeTexto(s.texto) }))
    .filter((s) => s.texto && !/^\[.*\]$|^\(.*\)$/.test(s.texto));
}

let trabajador = null, enCurso = null;
/** Detiene la transcripción en curso; la promesa se resuelve con lo transcrito hasta ese momento (parcial: true). */
export function detenerTranscripcion() {
  if (!enCurso) return false;
  trabajador?.terminate(); trabajador = null; // el modelo se vuelve a cargar de la caché la próxima vez
  enCurso.terminar(true);
  return true;
}
export const transcribiendo = () => !!enCurso;

/**
 * Transcribe audio mono a 16 kHz en un trabajador (no congela la página y se puede detener).
 * idioma: nombre en inglés que entiende Whisper («spanish», «english»…) o vacío para detectarlo solo.
 * modelo: "base" o "tiny". Devuelve [{ t0, t1, texto, idioma }] y, si se detuvo, la propiedad parcial = true.
 */
export function transcribir(audio16k, { inicio = 0, idioma = "", modelo = "base", progreso = () => {}, avance = () => {} } = {}) {
  if (enCurso) detenerTranscripcion();
  const dur = audio16k.length / 16000, t0 = performance.now(), segs = [];
  return new Promise((ok, mal) => {
    let empezo = null;
    enCurso = { terminar: (parcial) => { enCurso = null; const r = limpiarSegmentos(segs, idioma); if (parcial) r.parcial = true; ok(r); } };
    trabajador = trabajador || new Worker(new URL("./transcribir-worker.js", import.meta.url));
    trabajador.onmessage = ({ data: m }) => {
      if (m.tipo === "descarga") progreso(`Descargando el modelo de transcripción: ${Math.round(m.a / 1e6)} de ${Math.round(m.b / 1e6)} MB (solo la primera vez)…`);
      else if (m.tipo === "listo") { empezo = performance.now(); progreso(textoAvance(0, dur, 0)); avance(0); }
      else if (m.tipo === "tramo") {
        segs.push(...m.segs);
        const hecho = Math.min(dur, (m.i + 1) * 30);
        progreso(textoAvance(hecho, dur, (performance.now() - (empezo ?? t0)) / 1000)); avance(hecho / dur);
      } else if (m.tipo === "fin") enCurso?.terminar(false);
      else if (m.tipo === "error") { enCurso = null; trabajador?.terminate(); trabajador = null; mal(new Error(m.mensaje)); }
    };
    trabajador.onerror = (e) => { if (!enCurso) return; enCurso = null; trabajador?.terminate(); trabajador = null; mal(new Error(e.message || "falló el trabajador de transcripción")); };
    progreso(empezo ? textoAvance(0, dur, 0) : "Preparando el modelo de transcripción…");
    trabajador.postMessage({ audio: audio16k, inicio, idioma, modelo: MODELOS[modelo] || MODELOS.base });
  });
}

/** Resumen de idiomas de una transcripción: { idiomas: [...], tonal, varios }. */
export function idiomasDe(segmentos) {
  const n = {}; for (const s of segmentos || []) if (s.idioma) n[s.idioma] = (n[s.idioma] || 0) + 1;
  const idiomas = Object.entries(n).filter(([, c]) => c >= 2 || Object.keys(n).length === 1).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return { idiomas, tonal: idiomas.some((i) => TONALES.has(i)), varios: idiomas.length > 1 };
}
