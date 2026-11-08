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
export async function transcribir(audio16k, { inicio = 0, idioma = "spanish", progreso = () => {} } = {}) {
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
  const r = await tubo(audio16k, { language: idioma, task: "transcribe", chunk_length_s: 30, stride_length_s: 5, return_timestamps: true });
  const trozos = r.chunks || [{ timestamp: [0, audio16k.length / 16000], text: r.text || "" }];
  return trozos.map((c) => ({ t0: inicio + (c.timestamp?.[0] ?? 0), t1: inicio + (c.timestamp?.[1] ?? c.timestamp?.[0] ?? 0), texto: String(c.text || "").trim() }))
    .filter((s) => s.texto && !/^\[.*\]$|^\(.*\)$/.test(s.texto)); // quita «[Música]», «(aplausos)»
}
