// Mosaicos de NASA GIBS con respaldo: cuando GIBS responde con error (500 o 404, frecuentes fuera de la cobertura de
// un producto o cuando el servidor está saturado), MapLibre 5 dejaba la textura del mosaico sin inicializar y se veían
// rectángulos de «estática» gris donde no debería haber nada (por ejemplo, hielo marino en el ecuador). Con este
// protocolo el mapa recibe un mosaico transparente y avisa del fallo para que los bucles animados lo sigan contando.

const VACIO = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=";
const PNG_VACIO = Uint8Array.from(atob(VACIO), (c) => c.charCodeAt(0)).buffer;
export const PROTOCOLO = "gibsr";

/** «https://gibs…» → «gibsr://gibs…» (para las fuentes del mapa; las consultas propias siguen usando https). */
export const conRespaldo = (url) => url.replace(/^https:\/\//, `${PROTOCOLO}://`);
export const sinRespaldo = (url) => url.replace(new RegExp(`^${PROTOCOLO}://`), "https://");

/** Descarga un mosaico; si falla o no es imagen, devuelve el PNG transparente y llama a `alFallar(url)`. */
export async function cargarMosaico(url, senal, pedir = fetch, alFallar = () => {}) {
  try {
    const r = await pedir(sinRespaldo(url), { signal: senal });
    if (r.ok && /^image\//.test(r.headers.get("content-type") || "")) return { data: await r.arrayBuffer() };
  } catch (e) {
    if (senal?.aborted) throw e;  // MapLibre canceló el mosaico (ya no se ve): no es una falla
  }
  alFallar(sinRespaldo(url));
  return { data: PNG_VACIO.slice(0) };
}

let registrado = false;
/** Registra el protocolo una sola vez. Cada falla se anuncia con el evento «gibs-falla» (detail = url https). */
export function registrarProtocolo(gl = globalThis.maplibregl) {
  if (registrado || !gl?.addProtocol) return;
  registrado = true;
  gl.addProtocol(PROTOCOLO, (params, ctrl) => cargarMosaico(params.url, ctrl.signal, fetch,
    (url) => globalThis.dispatchEvent?.(new CustomEvent("gibs-falla", { detail: url }))));
}
