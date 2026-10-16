// Chat de análisis sobre las noticias del monitor con Groq (API compatible con OpenAI), usando la LLAVE DE CADA PERSONA.
// El sitio no tiene llave propia en el navegador: quien quiera usar el chat crea su llave gratuita en console.groq.com y
// la pega aquí. La llave se guarda solo en su navegador (sesión o, si lo pide, de forma permanente) y solo se envía a
// api.groq.com. La pregunta y los títulos/resúmenes de las noticias elegidas sí viajan a Groq para generar la respuesta.
// Cómo responde: para cada pregunta se eligen las noticias del monitor más relacionadas (palabras en común con el
// título, el resumen propio, el país y los actores) y se le pasan al modelo numeradas; se le pide citar [n]. Al final se
// muestran esas noticias con su enlace original para verificar.
import { esc, sinAcentos } from "./util.js";

export const MAX_NOTICIAS = 12;
export const URL_GROQ = "https://api.groq.com/openai/v1/chat/completions";
// Modelos activos en Groq (consultados el 2026-10-16). Si uno se retira, se intenta el siguiente.
export const MODELOS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"];
export const ESPERA_MS = 60000;  // sin recibir nada de Groq en este tiempo, se corta
const VACIAS = new Set("para como cual cuales donde cuando porque sobre entre desde hasta esta este estos estas tiene tienen pasa paso habra hacia segun puede pueden mexico".split(" "));
export const SISTEMA = "Eres un analista de geopolítica y seguridad. Responde en español, claro y breve (máximo 10 líneas o viñetas). "
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


// ---------------------------------------------------------------- Llave de Groq (solo en este navegador)

const CLAVE = "gp_groq_llave";
const almacen = (recordar) => { try { return recordar ? localStorage : sessionStorage; } catch { return null; } };

/** Formato de las llaves de Groq: empiezan con «gsk_». */
export const llaveValida = (k) => /^gsk_[A-Za-z0-9]{20,}$/.test(String(k || "").trim());

export function leerLlave() {
  for (const r of [false, true]) { try { const k = almacen(r)?.getItem(CLAVE); if (k) return { llave: k, recordada: r }; } catch { /* sin almacenamiento */ } }
  return null;
}

/** `recordar` = guardarla aunque se cierre el navegador; si no, se borra al cerrar la pestaña. */
export function guardarLlave(llave, recordar = false) {
  borrarLlave();
  try { almacen(recordar)?.setItem(CLAVE, String(llave).trim()); } catch { /* modo privado */ }
}

export function borrarLlave() {
  for (const r of [false, true]) { try { almacen(r)?.removeItem(CLAVE); } catch { /* nada */ } }
}

/** Lee el flujo SSE de Groq y llama `onDelta(texto)` con cada trozo. */
async function leerFlujo(res, onDelta, latido, signal) {
  const lector = res.body.getReader(), dec = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      latido();
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const linea = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!linea.startsWith("data:")) continue;
        const dato = linea.slice(5).trim();
        if (dato === "[DONE]") return;
        try { const d = JSON.parse(dato).choices?.[0]?.delta?.content; if (d) onDelta(d); } catch { /* línea incompleta */ }
      }
    }
  } finally { if (signal.aborted) lector.cancel().catch(() => {}); }
}

class ErrorGroq extends Error {
  constructor(estado, cuerpo) { super(cuerpo?.error?.message || `HTTP ${estado}`); this.name = "ErrorGroq"; this.estado = estado; this.codigo = cuerpo?.error?.code || ""; }
}

/**
 * Pregunta con respuesta en flujo. `onTexto(textoAcumulado)` se llama mientras llega; `signal` permite cancelar.
 * Devuelve {texto, noticias, modelo}. `fetchFn` es para pruebas.
 */
export async function preguntar(pregunta, eventos, llave, { onTexto = () => {}, signal, esperaMs = ESPERA_MS, fetchFn = globalThis.fetch, modelos = MODELOS } = {}) {
  if (!llaveValida(llave)) throw new ErrorGroq(401, { error: { code: "invalid_api_key" } });
  const noticias = relevantes(eventos, pregunta);
  const ctrl = new AbortController();
  signal?.addEventListener("abort", () => ctrl.abort(signal.reason), { once: true });
  let t;
  const latido = () => { clearTimeout(t); t = setTimeout(() => ctrl.abort(Object.assign(new Error("sin respuesta"), { name: "TimeoutError" })), esperaMs); };
  try {
    for (const [n, modelo] of modelos.entries()) {
      latido();
      const cuerpo = { model: modelo, stream: true, temperature: 0.3, max_completion_tokens: 1500,
        messages: [{ role: "system", content: SISTEMA }, { role: "user", content: promptUsuario(pregunta, noticias) }] };
      if (modelo.startsWith("openai/gpt-oss")) cuerpo.reasoning_effort = "low";
      let res;
      try {
        res = await fetchFn(URL_GROQ, { method: "POST", signal: ctrl.signal, headers: { Authorization: `Bearer ${String(llave).trim()}`, "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
      } catch (e) { if (ctrl.signal.aborted) throw ctrl.signal.reason ?? e; throw Object.assign(new Error(e.message), { name: "RedError" }); }
      if (!res.ok) {
        const err = new ErrorGroq(res.status, await res.json().catch(() => null));
        // Modelo retirado o inexistente: se intenta el siguiente.
        if ((res.status === 404 || err.codigo === "model_decommissioned" || err.codigo === "model_not_found") && n < modelos.length - 1) continue;
        throw err;
      }
      let texto = "";
      await leerFlujo(res, (d) => { texto += d; onTexto(texto); }, latido, ctrl.signal);
      if (ctrl.signal.aborted) throw ctrl.signal.reason;
      return { texto, noticias, modelo };
    }
    throw new ErrorGroq(404, { error: { code: "model_not_found" } });
  } finally { clearTimeout(t); }
}

/** Error → mensaje en español. */
export function mensajeError(e) {
  if (e?.name === "AbortError") return "Pregunta cancelada.";
  if (e?.name === "TimeoutError") return `Groq no respondió en ${Math.round(ESPERA_MS / 1000)} segundos. Intenta de nuevo en un momento.`;
  if (e?.name === "RedError") return "No hubo conexión con Groq. Revisa tu internet (o si una extensión o la red de tu trabajo bloquea api.groq.com).";
  if (e?.estado === 401 || e?.codigo === "invalid_api_key") return "Groq no aceptó la llave. Revisa que la copiaste completa (empieza con «gsk_») o crea una nueva en console.groq.com/keys.";
  if (e?.estado === 429) return "Llegaste al límite gratuito de Groq por minuto o por día. Espera un momento y vuelve a intentar.";
  if (e?.estado === 413 || e?.codigo === "context_length_exceeded") return "La pregunta junto con las noticias es demasiado larga. Haz una pregunta más corta.";
  if (e?.estado === 404) return "Los modelos configurados ya no están disponibles en Groq. Avísale a quien mantiene el monitor.";
  if (e?.estado >= 500) return "Groq tiene una falla temporal. Intenta en unos minutos.";
  return `No se pudo consultar a Groq: ${e?.message || e}`;
}

/** Texto del modelo → HTML seguro con las citas [n] enlazadas a la noticia. */
export function htmlRespuesta(texto, noticias, modelo = "") {
  const cuerpo = esc(texto).replace(/\[(\d{1,2})\]/g, (m, n) => (noticias[n - 1] ? `<a href="${esc(noticias[n - 1].url || "#")}" target="_blank" rel="noopener noreferrer" title="${esc(noticias[n - 1].titulo)}">[${n}]</a>` : m)).replace(/\n/g, "<br>");
  return `<div class="ia-resp">${cuerpo}</div>
    <details class="ia-fuentes"><summary>Noticias usadas (${noticias.length})</summary><ol>${noticias.map((e) => `<li><a href="${esc(e.url || "#")}" target="_blank" rel="noopener noreferrer">${esc(e.titulo)}</a> <span class="meta">· ${esc(e.fuente || "")} · ${esc(String(e.fecha_utc || "").slice(0, 10))}</span></li>`).join("")}</ol></details>
    <p class="meta">Respuesta generada por un modelo de lenguaje (${esc(modelo || "Groq")}): puede equivocarse u omitir hechos. Verifica en las fuentes.</p>`;
}
