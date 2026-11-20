// DESTINOS_FIJOS: «fetch» aquí es el manejador de peticiones del Worker, no una llamada saliente.
// Los archivos se incluyen como módulos de texto: el Worker autentica todas las rutas.
import page from "./assets/index.html";
import login from "./assets/ingreso.html";
import css from "./assets/huella.css";
import client from "./assets/huella.js.txt";
import paginasAdmin from "./paginas-admin.js";  // páginas de administración empaquetadas (sin pasar por /ops/)
import { serve } from "./service.js";

const assets = new Map([
  ["", [page, "text/html; charset=utf-8"]],
  ["ingreso", [login, "text/html; charset=utf-8"]],
  ["huella.css", [css, "text/css; charset=utf-8"]],
  ["huella.js", [client, "text/javascript; charset=utf-8"]]
]);

/** Encabezados de seguridad comunes a toda respuesta del Worker (si la ruta no puso los suyos). */
export function endurecer(respuesta) {
  const r = new Response(respuesta.body, respuesta);
  r.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  if (!r.headers.has("X-Content-Type-Options")) r.headers.set("X-Content-Type-Options", "nosniff");
  if (!r.headers.has("Referrer-Policy")) r.headers.set("Referrer-Policy", "no-referrer");
  r.headers.delete("X-Powered-By");
  return r;
}

export default {
  async fetch(request, env) {
    return endurecer(await serve(request, env, assets, paginasAdmin));
  }
};
