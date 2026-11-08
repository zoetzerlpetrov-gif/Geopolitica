// Transcripción local del audio con Whisper (modelo «whisper-base» multilingüe, ≈ 77 MB, de Hugging Face) mediante
// transformers.js. El modelo se descarga una vez y queda en la caché del navegador; el audio nunca sale de la computadora.
const TRANSFORMERS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/dist/transformers.min.js";
const MODELO = "onnx-community/whisper-base";

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

let tubo = null;
/**
 * Transcribe audio mono a 16 kHz. `inicio`: segundo en que empieza ese audio (para alinear con el análisis).
 * Devuelve [{ t0, t1, texto }]. `progreso(texto)` informa la descarga del modelo.
 */
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

/**
 * idioma: nombre en inglés que entiende Whisper («spanish», «english»…) o vacío para detectarlo solo.
 * Devuelve [{ t0, t1, texto, idioma }] (idioma = el detectado o el elegido).
 */
export async function transcribir(audio16k, { inicio = 0, idioma = "", progreso = () => {} } = {}) {
  if (!tubo) {
    const { pipeline } = await import(TRANSFORMERS);
    const archivos = {};
    // WebGPU solo si el navegador entrega un adaptador; si no, en CPU (WebAssembly)
    let gpu = false; try { gpu = !!(await globalThis.navigator?.gpu?.requestAdapter()); } catch (e) { gpu = false; }
    tubo = await pipeline("automatic-speech-recognition", MODELO, {
      dtype: "q8",
      device: gpu ? "webgpu" : "wasm",
      progress_callback: (p) => {
        if (p.status === "progress" && p.total) { archivos[p.file] = [p.loaded, p.total]; const [a, b] = Object.values(archivos).reduce((s, [x, y]) => [s[0] + x, s[1] + y], [0, 0]); progreso(`Descargando el modelo de transcripción: ${Math.round(a / 1e6)} de ${Math.round(b / 1e6)} MB (solo la primera vez)…`); }
      },
    });
  }
  progreso("Transcribiendo el audio en tu navegador…");
  // task «transcribe»: escribe en el idioma original (sin traducir). Sin idioma, Whisper lo detecta en cada tramo.
  const r = await tubo(audio16k, { ...(idioma ? { language: idioma } : {}), task: "transcribe", chunk_length_s: 30, stride_length_s: 5, return_timestamps: true, return_language: true });
  const trozos = r.chunks || [{ timestamp: [0, audio16k.length / 16000], text: r.text || "" }];
  return trozos.map((c) => ({ t0: inicio + (c.timestamp?.[0] ?? 0), t1: inicio + (c.timestamp?.[1] ?? c.timestamp?.[0] ?? 0), texto: String(c.text || "").trim(), idioma: idioma || c.language || idiomaDeTexto(c.text) }))
    .filter((s) => s.texto && !/^\[.*\]$|^\(.*\)$/.test(s.texto)); // quita «[Música]», «(aplausos)»
}

/** Resumen de idiomas de una transcripción: { idiomas: [...], tonal, varios }. */
export function idiomasDe(segmentos) {
  const n = {}; for (const s of segmentos || []) if (s.idioma) n[s.idioma] = (n[s.idioma] || 0) + 1;
  const idiomas = Object.entries(n).filter(([, c]) => c >= 2 || Object.keys(n).length === 1).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return { idiomas, tonal: idiomas.some((i) => TONALES.has(i)), varios: idiomas.length > 1 };
}
