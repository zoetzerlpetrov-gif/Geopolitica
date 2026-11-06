import { vistaActual } from "./licencias.js";

const acceso = document.getElementById("acceso-mapa-admin");
if (acceso && location.hostname === "zoetzerlpetrov-gif.github.io" && vistaActual() !== "pago") {
  acceso.hidden = false;
}

const plantilla = document.getElementById("huella-admin-menu");
const menu = plantilla?.closest("details");
let consulta = 0;
let enlace;
menu?.addEventListener("toggle", async () => {
  const turno = ++consulta;
  enlace?.remove();
  if (!menu.open || !plantilla.isConnected || location.hostname === "zoetzerlpetrov-gif.github.io" || vistaActual() === "pago") return;
  try {
    const r = await fetch("admin/huella/sesion", { cache: "no-store", redirect: "error" });
    if (r.status === 204 && r.headers.get("X-Dominus-Huella") === "admin" &&
        turno === consulta && menu.open && plantilla.isConnected) {
      enlace = plantilla.content.firstElementChild.cloneNode(true);
      plantilla.after(enlace);
    }
  } catch {
    // Una sesión sin acceso deja la opción fuera del menú.
  }
});
