// Aplica el idioma elegido en el mapa (gp_idioma) a cualquier otra página del sitio. El mapa (index.html) lo hace
// desde app.js porque además cambia las etiquetas del mapa base; aquí no se repite si ya se inició.
import { iniciarIdioma } from "./idioma.js";

if (typeof document !== "undefined" && !document.getElementById("map") && !globalThis.__dominusIdioma) {
  globalThis.__dominusIdioma = true;
  const arrancar = () => {
    // Selector de idioma también en las demás páginas (en su barra superior), para no tener que volver al mapa.
    const barra = document.querySelector(".topbar, header");
    if (barra && !document.getElementById("sel-idioma")) {
      const sel = document.createElement("select");
      sel.id = "sel-idioma"; sel.className = "sel-idioma-pagina"; sel.setAttribute("aria-label", "Idioma");
      barra.append(sel);
    }
    iniciarIdioma({ raiz: document.body });
  };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", arrancar, { once: true }) : arrancar();
}
