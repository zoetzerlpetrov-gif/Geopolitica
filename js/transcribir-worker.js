// Trabajador de transcripción: corre Whisper fuera de la página (no la congela y se puede detener) y avisa tramo por tramo.
const TRANSFORMERS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/dist/transformers.min.js";
const SR = 16000, TRAMO = 30; // segundos por tramo
let tubo = null, modeloActual = "", Tensor = null;
// Códigos de Whisper → nombre que usa el resto del proyecto (los demás quedan con su código).
const NOMBRES = { en: "english", es: "spanish", pt: "portuguese", fr: "french", it: "italian", de: "german", ja: "japanese", ko: "korean", zh: "chinese",
  th: "thai", lo: "lao", my: "burmese", ar: "arabic", he: "hebrew", ru: "russian", hi: "hindi", vi: "vietnamese", yue: "cantonese", yo: "yoruba", pa: "punjabi", ha: "hausa", ln: "lingala" };

/** Idioma más probable del tramo: un paso del decodificador tras <|startoftranscript|>, comparando solo los tokens de idioma.
 *  (transformers.js no lo detecta solo: sin idioma, transcribe como inglés.) */
async function detectarIdioma(trozo) {
  const gc = tubo.model.generation_config, l2i = gc.lang_to_id || {};
  const { input_features } = await tubo.processor(trozo);
  const dec = new Tensor("int64", BigInt64Array.from([BigInt(gc.decoder_start_token_id)]), [1, 1]);
  const { logits } = await tubo.model({ input_features, decoder_input_ids: dec });
  const V = logits.dims.at(-1), d = logits.data, base = d.length - V;
  let mejor = -Infinity, cual = "";
  for (const [tok, id] of Object.entries(l2i)) if (d[base + id] > mejor) { mejor = d[base + id]; cual = tok.slice(2, -2); }
  return cual;
}

/** ¿El tramo es casi silencio? (Whisper inventa texto en silencio y además gasta tiempo.) */
function silencio(x) {
  let s = 0; for (let i = 0; i < x.length; i += 4) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, x.length / 4)) < 0.004;
}

self.onmessage = async ({ data }) => {
  const { audio, inicio = 0, idioma = "", modelo } = data;
  try {
    if (!tubo || modeloActual !== modelo) {
      const tf = await import(TRANSFORMERS); const { pipeline } = tf; Tensor = tf.Tensor;
      let gpu = false; try { gpu = !!(await self.navigator?.gpu?.requestAdapter()); } catch (e) { gpu = false; }
      const archivos = {};
      tubo = await pipeline("automatic-speech-recognition", modelo, {
        dtype: "q8", device: gpu ? "webgpu" : "wasm",
        progress_callback: (p) => {
          if (p.status === "progress" && p.total) {
            archivos[p.file] = [p.loaded, p.total];
            const [a, b] = Object.values(archivos).reduce((s, [x, y]) => [s[0] + x, s[1] + y], [0, 0]);
            self.postMessage({ tipo: "descarga", a, b });
          }
        },
      });
      modeloActual = modelo;
      self.postMessage({ tipo: "listo", dispositivo: gpu ? "webgpu" : "wasm" });
    }
    const paso = TRAMO * SR, total = Math.max(1, Math.ceil(audio.length / paso));
    for (let i = 0; i < total; i++) {
      const trozo = audio.subarray(i * paso, Math.min(audio.length, (i + 1) * paso));
      let segs = [];
      if (trozo.length >= SR / 2 && !silencio(trozo)) {
        // task «transcribe»: escribe en el idioma original (sin traducir). Sin idioma elegido, se detecta en cada tramo.
        const cod = idioma || (await detectarIdioma(trozo)) || "";
        const r = await tubo(trozo, { ...(cod ? { language: cod } : {}), task: "transcribe", return_timestamps: true });
        const nombre = idioma || NOMBRES[cod] || cod;
        const base = inicio + i * TRAMO;
        segs = (r.chunks || [{ timestamp: [0, trozo.length / SR], text: r.text || "" }]).map((c) => ({
          t0: base + (c.timestamp?.[0] ?? 0), t1: base + (c.timestamp?.[1] ?? c.timestamp?.[0] ?? 0), texto: String(c.text || "").trim(), idioma: nombre,
        }));
      }
      self.postMessage({ tipo: "tramo", i, total, segs });
    }
    self.postMessage({ tipo: "fin" });
  } catch (e) { self.postMessage({ tipo: "error", mensaje: e?.message || String(e) }); }
};
