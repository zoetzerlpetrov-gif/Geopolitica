// Aviso de eventos nuevos: parpadeo de 60 s en el mapa (lo dibuja app.js) y un sonido corto opcional.
//
// Los navegadores solo permiten reproducir sonido después de un gesto del usuario (tocar o hacer clic).
// Por eso el sonido se activa con una casilla: al marcarla se crea el contexto de audio y suena una prueba.
// La preferencia se recuerda; si la página se recarga, el audio queda listo con el primer toque en la página.
import { storage } from "./util.js";

export const PARPADEO_EV_MS = 60000;
const SEPARACION_MS = 8000;   // dos avisos seguidos se juntan en uno (una corrida trae muchos eventos a la vez)

/** Ids de `eventos` que no estaban en `antes` (Set de ids). Funciona igual con eventos o con claves. */
export function idsNuevos(antes, eventos, clave = (e) => e.id) {
  if (!antes.size) return [];   // primera carga: nada es «nuevo»
  return eventos.map(clave).filter((k) => !antes.has(k));
}

let ctx = null;
let ultimo = 0;
export const sonidoActivo = () => storage.get("gp_sonido") === "1";

function contexto() {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

/** Dos tonos cortos (o tres si es severo). Volumen bajo; dura menos de 1 s. */
export function sonar({ severo = false, forzar = false } = {}) {
  if (!forzar && !sonidoActivo()) return false;
  const ahora = Date.now();
  if (!forzar && ahora - ultimo < SEPARACION_MS) return false;
  ultimo = ahora;
  const ac = contexto();
  if (!ac) return false;
  const tonos = severo ? [880, 660, 880] : [740, 990];
  tonos.forEach((f, i) => {
    const t = ac.currentTime + i * 0.18;
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = "sine"; osc.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    osc.connect(g).connect(ac.destination);
    osc.start(t); osc.stop(t + 0.16);
  });
  return true;
}

/** Conecta la casilla de sonido. */
export function iniciarSonido(casilla) {
  casilla.checked = sonidoActivo();
  casilla.onchange = () => {
    storage.set("gp_sonido", casilla.checked ? "1" : "0");
    if (casilla.checked) sonar({ forzar: true });
  };
  // Con la preferencia guardada, el primer toque en la página habilita el audio.
  const desbloquear = () => { if (sonidoActivo()) contexto(); };
  document.addEventListener("pointerdown", desbloquear, { once: true });
  document.addEventListener("keydown", desbloquear, { once: true });
}
