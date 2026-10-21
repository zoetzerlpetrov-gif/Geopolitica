// Botón «▶ Animar» de la barra superior: arranca y detiene a la vez todas las animaciones que tengan sentido con lo que
// está encendido (eventos en la línea de tiempo, pronóstico del clima, cambio en el tiempo…). Cada parte se registra con
// registrarAnimacion(); el botón no sabe nada de ellas más allá de esta interfaz.
import { traducir, idiomaGuardado } from "./idioma.js";

const partes = [];
let boton = null, reloj = null;

/**
 * parte: { id, nombre, disponible(): bool (¿tiene algo que animar ahora?), activa(): bool, iniciar(), detener() }
 * Se reemplaza si ya existe una con el mismo id.
 */
export function registrarAnimacion(parte) {
  const i = partes.findIndex((p) => p.id === parte.id);
  if (i >= 0) partes[i] = parte; else partes.push(parte);
  actualizar();
}

/** Partes que se animarían ahora (las disponibles). */
export function disponibles() {
  return partes.filter((p) => { try { return p.disponible(); } catch { return false; } });
}

const algunaActiva = () => partes.some((p) => { try { return p.activa(); } catch { return false; } });

export function animarTodo() {
  const lista = disponibles();
  for (const p of lista) if (!p.activa()) { try { p.iniciar(); } catch (e) { console.warn("No se pudo animar", p.id, e); } }
  actualizar();
  return lista.map((p) => p.nombre);
}

export function detenerTodo() {
  for (const p of partes) if (p.activa()) { try { p.detener(); } catch { /* sigue con las demás */ } }
  actualizar();
}

function actualizar() {
  if (!boton) return;
  const activa = algunaActiva();
  const texto = activa ? "⏸ Pausar" : "▶ Animar";
  boton.textContent = traducir(texto, idiomaGuardado()) || texto;
  boton.setAttribute("aria-pressed", String(activa));
  boton.classList.toggle("animando", activa);
  const nombres = (activa ? partes.filter((p) => p.activa()) : disponibles()).map((p) => p.nombre);
  boton.title = activa ? `Animando: ${nombres.join(", ")}. Clic para pausar todo.`
    : `Anima a la vez todo lo que se puede animar con lo que tienes encendido${nombres.length ? `: ${nombres.join(", ")}` : ""}.`;
}

/** Conecta el botón de la barra superior. Revisa el estado cada segundo (una animación puede terminar sola). */
export function iniciarBotonAnimar(el) {
  boton = el;
  if (!boton) return;
  boton.addEventListener("click", () => (algunaActiva() ? detenerTodo() : animarTodo()));
  clearInterval(reloj);
  reloj = setInterval(actualizar, 1000);
  actualizar();
}
