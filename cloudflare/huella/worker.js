// Los archivos se incluyen como módulos de texto: el Worker autentica todas las rutas.
import page from "./assets/index.html";
import login from "./assets/ingreso.html";
import css from "./assets/huella.css";
import client from "./assets/huella.js.txt";
import { serve } from "./service.js";

const assets = new Map([
  ["", [page, "text/html; charset=utf-8"]],
  ["ingreso", [login, "text/html; charset=utf-8"]],
  ["huella.css", [css, "text/css; charset=utf-8"]],
  ["huella.js", [client, "text/javascript; charset=utf-8"]]
]);

export default {
  fetch(request, env) {
    return serve(request, env, assets);
  }
};
