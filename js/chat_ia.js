// Chat de análisis con la IA integrada de Chrome (Gemini Nano, «Prompt API»). Corre DENTRO del navegador: la pregunta
// y las noticias no salen del equipo, no hay llave ni servidor. Solo funciona en Chrome de escritorio con la IA
// integrada disponible; en otros navegadores se muestra un aviso.
// Cómo responde: para cada pregunta se eligen las noticias del monitor más relacionadas (palabras en común con el
// título, el resumen propio, el país y los actores) y se le pasan al modelo numeradas; se le pide citar [n]. Al final se
// muestran esas noticias con su enlace original para verificar.
import { esc, sinAcentos } from "./util.js";

export const MAX_NOTICIAS = 8;  // menos texto = respuesta más rápida en equipos sin tarjeta de video
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
  return noticias.map((e, i) => `[${i + 1}] ${String(e.fecha_utc || "").slice(0, 10)} · ${e.pais_iso3 || "—"} · severidad ${e.severidad ?? "—"} · ${e.titulo}. ${String(e.resumen || "").slice(0, 200)}`).join("\n");
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

// Límites de espera: si la descarga del modelo no avanza o el modelo no escribe nada en ese tiempo, se corta y se explica
// qué revisar (antes la pantalla se quedaba en «Pensando…» para siempre).
export const ESPERA_DESCARGA_MS = 120000;
export const ESPERA_RESPUESTA_MS = 180000;

let sesionP = null, sesionDe = null, avisarProgreso = null;
function crearSesion() {
  if (sesionDe !== globalThis.LanguageModel) { sesionP = null; sesionDe = globalThis.LanguageModel; }
  sesionP ??= globalThis.LanguageModel.create({
    initialPrompts: [{ role: "system", content: SISTEMA }],
    expectedInputs: [{ type: "text", languages: ["es"] }], expectedOutputs: [{ type: "text", languages: ["es"] }],
    monitor(m) { m.addEventListener("downloadprogress", (e) => avisarProgreso?.(e.loaded)); },
  }).catch((e) => { sesionP = null; throw e; });
  return sesionP;
}

/** Corta `ctrl` si pasan `ms` sin que se llame a `latido()`. */
function vigilante(ms, ctrl, motivo) {
  let t;
  const latido = () => { clearTimeout(t); t = setTimeout(() => ctrl.abort(Object.assign(new Error(motivo), { name: "TimeoutError", motivo })), ms); };
  latido();
  return { latido, fin: () => clearTimeout(t) };
}

/** La promesa o el aborto, lo que llegue primero. */
function conAborto(promesa, signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((ok, mal) => {
    const fuera = () => mal(signal.reason);
    signal.addEventListener("abort", fuera, { once: true });
    promesa.then((v) => { signal.removeEventListener("abort", fuera); ok(v); }, (e) => { signal.removeEventListener("abort", fuera); mal(e); });
  });
}

/**
 * Pregunta con respuesta en flujo. `onFase("preparando"|"pensando"|"escribiendo")`, `onProgreso(0..1)` durante la
 * descarga del modelo y `onTexto(textoAcumulado)` mientras llega. `signal` permite cancelar. Devuelve {texto, noticias}.
 */
export async function preguntar(pregunta, eventos, { onTexto = () => {}, onProgreso, onFase = () => {}, signal,
  esperaDescargaMs = ESPERA_DESCARGA_MS, esperaRespuestaMs = ESPERA_RESPUESTA_MS } = {}) {
  const noticias = relevantes(eventos, pregunta);
  const ctrl = new AbortController();
  signal?.addEventListener("abort", () => ctrl.abort(signal.reason), { once: true });
  onFase("preparando");
  let v = vigilante(esperaDescargaMs, ctrl, "descarga");
  avisarProgreso = (p) => { v.latido(); onProgreso?.(p); };
  let s;
  try { s = await conAborto(crearSesion(), ctrl.signal); }
  catch (e) { sesionP = null; throw e; }  // atorada o cancelada: el siguiente intento vuelve a pedirla a Chrome
  finally { v.fin(); avisarProgreso = null; }
  onFase("pensando");
  v = vigilante(esperaRespuestaMs, ctrl, "respuesta");
  // Cada pregunta va con su propio contexto: se clona la sesión para no acumular noticias de preguntas anteriores.
  const uno = s.clone ? await conAborto(s.clone({ signal: ctrl.signal }), ctrl.signal) : s;
  let texto = "";
  try {
    if (uno.promptStreaming) {
      const lector = uno.promptStreaming(promptUsuario(pregunta, noticias), { signal: ctrl.signal }).getReader();
      try {
        for (;;) {
          const { done, value } = await conAborto(lector.read(), ctrl.signal);
          if (done) break;
          v.latido();
          if (!texto) onFase("escribiendo");
          // Chrome entrega trozos nuevos (versiones recientes) o el texto acumulado (versiones viejas).
          texto = value.startsWith(texto) ? value : texto + value;
          onTexto(texto);
        }
      } finally { if (ctrl.signal.aborted) lector.cancel().catch(() => {}); }
    } else {
      texto = await conAborto(uno.prompt(promptUsuario(pregunta, noticias), { signal: ctrl.signal }), ctrl.signal);
      onTexto(texto);
    }
  } finally { v.fin(); if (uno !== s) uno.destroy?.(); }
  return { texto, noticias };
}

/** Qué revisar en Chrome cuando el modelo no se descarga o no responde. */
export const AYUDA_CHROME = `<details class="ia-ayuda" open><summary>Qué revisar en Chrome</summary><ol>
  <li>Abre <code>chrome://on-device-internals</code> en una pestaña nueva (cópialo y pégalo en la barra de direcciones). En «Model Status» verás si el modelo está descargado, descargándose o si tu equipo no cumple los requisitos.</li>
  <li>Si dice que falta descargarlo, abre <code>chrome://components</code>, busca «Optimization Guide On Device Model» y presiona «Buscar actualizaciones». Pesa varios GB: puede tardar de minutos a horas.</li>
  <li>Requisitos de Google: Windows 10/11, macOS 13 o más reciente, Linux o ChromeOS (Chromebook Plus); al menos 22 GB libres en el disco donde está tu perfil de Chrome; tarjeta de video con más de 4 GB de memoria, o 16 GB de RAM y 4 núcleos; red sin límite de datos para la descarga.</li>
  <li>Actualiza Chrome (Menú ⋮ → Ayuda → Información de Google Chrome) y reinícialo.</li>
  <li>Cuando el modelo ya esté descargado, recarga esta página y vuelve a preguntar.</li></ol></details>`;

/** Error → mensaje en español. */
export function mensajeError(e) {
  if (e?.motivo === "descarga") return `La descarga del modelo de Chrome no avanzó en ${Math.round(ESPERA_DESCARGA_MS / 60000)} minutos. Chrome puede seguir descargándolo en segundo plano.`;
  if (e?.motivo === "respuesta") return `El modelo no escribió nada en ${Math.round(ESPERA_RESPUESTA_MS / 60000)} minutos. Tu equipo puede estar muy ocupado o el modelo no terminó de instalarse.`;
  switch (e?.name) {
    case "AbortError": return "Pregunta cancelada.";
    case "NotAllowedError": return "Chrome necesita que la descarga del modelo empiece con un clic tuyo: presiona «Preguntar» otra vez.";
    case "NotSupportedError": return "Tu versión de Chrome no tiene el modelo en español. Actualiza Chrome.";
    case "QuotaExceededError": return "La pregunta junto con las noticias es demasiado larga para el modelo. Haz una pregunta más corta.";
    default: return `No se pudo usar la IA de Chrome: ${e?.message || e}`;
  }
}

/** Texto del modelo → HTML seguro con las citas [n] enlazadas a la noticia. */
export function htmlRespuesta(texto, noticias) {
  const cuerpo = esc(texto).replace(/\[(\d{1,2})\]/g, (m, n) => (noticias[n - 1] ? `<a href="${esc(noticias[n - 1].url || "#")}" target="_blank" rel="noopener noreferrer" title="${esc(noticias[n - 1].titulo)}">[${n}]</a>` : m)).replace(/\n/g, "<br>");
  return `<div class="ia-resp">${cuerpo}</div>
    <details class="ia-fuentes"><summary>Noticias usadas (${noticias.length})</summary><ol>${noticias.map((e) => `<li><a href="${esc(e.url || "#")}" target="_blank" rel="noopener noreferrer">${esc(e.titulo)}</a> <span class="meta">· ${esc(e.fuente || "")} · ${esc(String(e.fecha_utc || "").slice(0, 10))}</span></li>`).join("")}</ol></details>
    <p class="meta">Respuesta generada por un modelo de lenguaje en tu equipo: puede equivocarse u omitir hechos. Verifica en las fuentes.</p>`;
}
