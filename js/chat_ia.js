// Chat de análisis con la IA integrada de Chrome (Gemini Nano, «Prompt API»). Corre DENTRO del navegador: la pregunta
// y las noticias no salen del equipo, no hay llave ni servidor. Solo funciona en Chrome de escritorio con la IA
// integrada disponible; en otros navegadores se muestra un aviso.
// Cómo responde: para cada pregunta se eligen las noticias del monitor más relacionadas (palabras en común con el
// título, el resumen propio, el país y los actores) y se le pasan al modelo numeradas; se le pide citar [n]. Al final se
// muestran esas noticias con su enlace original para verificar.
import { esc, sinAcentos } from "./util.js";

export const MAX_NOTICIAS = 12;
const VACIAS = new Set("para como cual cuales donde cuando porque sobre entre desde hasta esta este estos estas tiene tienen pasa paso habra hacia segun puede pueden mexico".split(" "));
export const SISTEMA = "Eres un analista de geopolítica y seguridad. Responde en español, claro y breve (máximo 8 líneas o viñetas). "
  + "Usa SOLO las noticias numeradas que te doy; cita cada afirmación con su número entre corchetes, por ejemplo [2]. "
  + "Si las noticias no alcanzan para responder, dilo. Separa hechos de hipótesis y no inventes datos, cifras ni nombres.";

export const palabras = (t) => sinAcentos(String(t || "")).toLowerCase().split(/[^a-z0-9ñ]+/).filter((p) => p.length >= 4 && !VACIAS.has(p));

/** Las noticias más relacionadas con la pregunta (si ninguna coincide, las más graves y recientes). */
export function relevantes(eventos, pregunta, max = MAX_NOTICIAS) {
  const q = new Set(palabras(pregunta));
  const puntuar = (e) => {
    const texto = palabras(`${e.titulo} ${e.resumen} ${e.pais_iso3} ${(e.actores || []).join(" ")} ${e.area_principal}`);
    let s = 0;
    for (const p of texto) if (q.has(p)) s += 1;
    return s;
  };
  const conPuntos = (eventos || []).map((e) => [puntuar(e), e]).filter(([s]) => s > 0);
  const base = conPuntos.length ? conPuntos : (eventos || []).map((e) => [0, e]);
  return base.sort((a, b) => b[0] - a[0] || (b[1].severidad || 0) - (a[1].severidad || 0) || String(b[1].fecha_utc).localeCompare(String(a[1].fecha_utc)))
    .slice(0, max).map(([, e]) => e);
}

export function contexto(noticias) {
  return noticias.map((e, i) => `[${i + 1}] ${String(e.fecha_utc || "").slice(0, 10)} · ${e.pais_iso3 || "—"} · severidad ${e.severidad ?? "—"} · ${e.titulo}. ${String(e.resumen || "").slice(0, 240)}`).join("\n");
}

export function promptUsuario(pregunta, noticias) {
  return `Noticias del monitor:\n${contexto(noticias)}\n\nPregunta: ${pregunta}`;
}

/** Estado de la IA integrada: «no-api» (otro navegador), «unavailable», «downloadable», «downloading» o «available». */
export async function disponibilidad() {
  if (!("LanguageModel" in globalThis)) return "no-api";
  try { return await globalThis.LanguageModel.availability({ expectedInputs: [{ type: "text", languages: ["es"] }], expectedOutputs: [{ type: "text", languages: ["es"] }] }); }
  catch { return "unavailable"; }
}

export const MENSAJE_ESTADO = {
  "no-api": "Esta función solo trabaja en Google Chrome de escritorio (Windows, Mac, Linux o ChromeOS) con la IA integrada Gemini Nano. En este navegador no está disponible.",
  unavailable: "Chrome no puede usar la IA integrada en este equipo (requisitos de Google: espacio libre en disco y memoria suficientes). Esta función solo trabaja en Chrome.",
  downloadable: "La IA integrada de Chrome está disponible pero aún no se descarga. Al hacer tu primera pregunta, Chrome descargará el modelo (puede tardar varios minutos). Solo funciona en Chrome.",
  downloading: "Chrome está descargando el modelo de IA. Puedes preguntar cuando termine. Solo funciona en Chrome.",
  available: "IA integrada de Chrome lista. Tus preguntas y las noticias se procesan en tu equipo; no se envían a ningún servidor.",
};

let sesion = null;
async function crearSesion(onProgreso) {
  sesion ??= await globalThis.LanguageModel.create({
    initialPrompts: [{ role: "system", content: SISTEMA }],
    expectedInputs: [{ type: "text", languages: ["es"] }], expectedOutputs: [{ type: "text", languages: ["es"] }],
    monitor(m) { m.addEventListener("downloadprogress", (e) => onProgreso?.(e.loaded)); },
  });
  return sesion;
}

/** Pregunta con respuesta en flujo: `onTexto(textoAcumulado)` se llama mientras llega. Devuelve {texto, noticias}. */
export async function preguntar(pregunta, eventos, { onTexto = () => {}, onProgreso } = {}) {
  const noticias = relevantes(eventos, pregunta);
  const s = await crearSesion(onProgreso);
  // Cada pregunta va con su propio contexto: se clona la sesión para no acumular noticias de preguntas anteriores.
  const uno = s.clone ? await s.clone() : s;
  let texto = "";
  try {
    if (uno.promptStreaming) {
      for await (const trozo of uno.promptStreaming(promptUsuario(pregunta, noticias))) {
        // Chrome entrega trozos nuevos (versiones recientes) o el texto acumulado (versiones viejas).
        texto = trozo.startsWith(texto) ? trozo : texto + trozo;
        onTexto(texto);
      }
    } else {
      texto = await uno.prompt(promptUsuario(pregunta, noticias));
      onTexto(texto);
    }
  } finally { if (uno !== s) uno.destroy?.(); }
  return { texto, noticias };
}

/** Texto del modelo → HTML seguro con las citas [n] enlazadas a la noticia. */
export function htmlRespuesta(texto, noticias) {
  const cuerpo = esc(texto).replace(/\[(\d{1,2})\]/g, (m, n) => (noticias[n - 1] ? `<a href="${esc(noticias[n - 1].url || "#")}" target="_blank" rel="noopener noreferrer" title="${esc(noticias[n - 1].titulo)}">[${n}]</a>` : m)).replace(/\n/g, "<br>");
  return `<div class="ia-resp">${cuerpo}</div>
    <details class="ia-fuentes"><summary>Noticias usadas (${noticias.length})</summary><ol>${noticias.map((e) => `<li><a href="${esc(e.url || "#")}" target="_blank" rel="noopener noreferrer">${esc(e.titulo)}</a> <span class="meta">· ${esc(e.fuente || "")} · ${esc(String(e.fecha_utc || "").slice(0, 10))}</span></li>`).join("")}</ol></details>
    <p class="meta">Respuesta generada por un modelo de lenguaje en tu equipo: puede equivocarse u omitir hechos. Verifica en las fuentes.</p>`;
}
