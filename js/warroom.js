// War Room del cliente (warroom.html#d=…): tablero de pantalla completa con la copia de datos del consultor y los
// eventos públicos del sitio, que se piden de nuevo cada minuto.
import * as T from "./tableros-logica.js";
import { publicosDelSitio } from "./ops-tableros.js";

const $ = (id) => document.getElementById(id);
const st = document.createElement("style"); st.textContent = T.CSS_TABLEROS; document.head.appendChild(st);
const m = location.hash.match(/d=([\w-]+)/);
let paquete = null;
try { paquete = m ? await T.desempaquetar(m[1]) : null; } catch (e) { paquete = null; }
if (!paquete) {
  $("wr-grid").innerHTML = `<p>Este enlace no trae un tablero válido. Pídele a tu consultor que lo genere de nuevo en DOMINUS OPS → Tableros.</p>`;
} else {
  const { tablero, datos } = paquete;
  document.title = `War Room · ${datos.cliente?.nombre || tablero.nombre}`;
  $("wr-titulo").textContent = `WAR ROOM · ${(datos.cliente?.nombre || "").toUpperCase()} · ${tablero.nombre}`;
  const ps = [datos.cliente?.pais, ...String(datos.cliente?.paises || "").split(/[,\s]+/)].map((x) => String(x || "").toUpperCase()).filter((x) => /^[A-Z]{3}$/.test(x));
  async function pintar() {
    try {
      const pub = (await publicosDelSitio())(ps);
      const d = { ...datos, ...pub, paisesCliente: ps };
      $("wr-grid").innerHTML = tablero.widgets.map((w) => T.widgetHTML(w, d)).join("");
      $("wr-act").textContent = `eventos: ${new Date().toLocaleTimeString("es-MX")} · datos de la empresa: ${String(datos.generado || "").slice(0, 16).replace("T", " ")} UTC`;
      $("wr-vivo").textContent = "En vivo";
    } catch (e) { $("wr-vivo").textContent = "Sin conexión (reintentando)"; }
  }
  await pintar();
  setInterval(pintar, 60000);
}
$("wr-full").onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
