// Indicador de frescura de datos y cuenta regresiva a la siguiente corrida del bot.
//
// El workflow de ingesta corre con cron "17 * * * *" (minuto 17 de cada hora, UTC).
// GitHub puede retrasar los cron varios minutos en horas de carga, por eso el texto dice "≈".
import { getJSON, hace, hora, mmss, fechaHora } from "./util.js";

const ATRASO_MAX_MIN = 150; // si los datos tienen más de 2.5 h, se marcan como atrasados

/** Próxima ocurrencia del minuto `min` (UTC) a partir de `now`. */
export function proximaCorrida(now, min = 17) {
  const d = new Date(now);
  d.setUTCMinutes(min, 0, 0);
  if (d.getTime() <= now) d.setUTCHours(d.getUTCHours() + 1);
  return d;
}

/**
 * @param {object} o
 * @param {object} o.runLog          contenido inicial de data/run-log.json
 * @param {HTMLElement} o.elDatos
 * @param {HTMLElement} o.elProxima
 * @param {() => Promise<void>} o.onNuevosDatos  se llama cuando el bot publicó datos nuevos
 */
export function iniciarRefresco({ runLog, elDatos, elProxima, onNuevosDatos }) {
  let log = runLog;
  let consultando = false;
  let ultimaConsulta = Date.now();
  const minuto = Number(String(log.cron || "17").split(" ")[0]) || 17;

  function pintar() {
    const now = Date.now();
    const edadMin = (now - new Date(log.generado_utc).getTime()) / 60000;
    const atrasado = log.modo !== "ejemplo" && edadMin > ATRASO_MAX_MIN;
    elDatos.textContent = log.modo === "ejemplo"
      ? `Datos de ejemplo (${log.eventos_total} eventos) · la ingesta automática los reemplaza en la siguiente corrida`
      : `Actualizado ${hace(log.generado_utc, now)} · ${log.eventos_total} eventos (${log.eventos_nuevos} nuevos)`;
    elDatos.className = atrasado ? "atrasado" : "";
    const caidas = (log.fuentes || []).filter((f) => f.estado === "error").map((f) => f.nombre);
    elDatos.title = `Generado: ${fechaHora(log.generado_utc)}` + (caidas.length ? `\nFuentes con error en esta corrida: ${caidas.join(", ")}` : "");

    const prox = proximaCorrida(now, minuto);
    elProxima.textContent = `Próxima actualización ≈ ${hora(prox)} · en ${mmss(prox - now)}`;
    if (atrasado) elProxima.textContent += " · el bot no ha publicado a tiempo";
  }

  async function revisar() {
    if (consultando) return;
    consultando = true;
    ultimaConsulta = Date.now();
    try {
      const nuevo = await getJSON("data/run-log.json", { bust: true });
      if (nuevo.generado_utc !== log.generado_utc) {
        log = nuevo;
        await onNuevosDatos();
      }
    } catch (e) {
      console.warn("No se pudo revisar run-log.json:", e.message);
    } finally {
      consultando = false;
      pintar();
    }
  }

  pintar();
  setInterval(() => {
    pintar();
    const now = Date.now();
    // Revisa cada 5 min, y cada minuto durante los 20 min siguientes a la hora programada
    // (GitHub Actions + caché de Pages pueden tardar en reflejar la corrida).
    const desdeProgramada = (now - proximaCorrida(now - 3600000, minuto).getTime()) / 60000;
    const ventana = desdeProgramada >= 2 && desdeProgramada <= 20;
    if (now - ultimaConsulta > (ventana ? 60000 : 300000)) revisar();
  }, 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) revisar(); });
}
