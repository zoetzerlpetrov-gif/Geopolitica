// DESTINOS_FIJOS: «fetch» aquí es el manejador de peticiones del Worker, no una llamada saliente.
// Los archivos se incluyen como módulos de texto: el Worker autentica todas las rutas.
import page from "./assets/index.html";
import login from "./assets/ingreso.html";
import css from "./assets/huella.css";
import client from "./assets/huella.js.txt";
import paginasAdmin from "./paginas-admin.js";  // páginas de administración empaquetadas (sin pasar por /ops/)
import { serve } from "./service.js";
import { conSesionRenovada } from "./auth.js";
import { renovarCorreo } from "../planes/google.js";
import lectura from '../../css/lectura.css';
import { css as cssApariencia, DEFECTO } from '../../js/apariencia.js';
import { leer as leerApariencia } from '../apariencia/service.js';
import { TEMA_JS } from '../apariencia/tema-publico.js';

const assets = new Map([
  ["", [page, "text/html; charset=utf-8"]],
  ["ingreso", [login, "text/html; charset=utf-8"]],
  ["huella.css", [css, "text/css; charset=utf-8"]],
  ["tema.js", [TEMA_JS, "text/javascript; charset=utf-8"]],
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
    let respuesta = await serve(request, env, assets, paginasAdmin);
    const path = new URL(request.url).pathname;
    if(respuesta.ok && (path === '/admin/huella/huella.css' || path === '/cuenta/cuenta.css')) {
      const c = await leerApariencia(env.OSINT_PLANS_DB).catch(()=>null);
      respuesta = new Response('@import url("https://dominusosint.com/vendor/fonts/fuentes.css");\n'+await respuesta.text()+'\n'+lectura+'\n'+cssApariencia(c?.claro?c:DEFECTO), respuesta);
    }
    return endurecer(await conSesionRenovada(request, env, respuesta, renovarCorreo));
  }
};
