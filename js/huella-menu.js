import { vistaActual } from "./licencias.js";

const plantilla = document.getElementById("huella-admin-menu");
const menu = plantilla?.closest("details");
let consultando = false;
menu?.addEventListener("toggle", async () => {
  if (!menu.open || !plantilla.isConnected || consultando || vistaActual() === "pago") return;
  consultando = true;
  try {
    const r = await fetch("admin/huella/sesion", { cache: "no-store", redirect: "error" });
    if (r.status === 204 && r.headers.get("X-Dominus-Huella") === "admin" && plantilla.isConnected) {
      plantilla.replaceWith(plantilla.content.cloneNode(true));
    }
  } catch {
    // El sitio público o una sesión sin acceso dejan la opción fuera del menú.
  } finally {
    consultando = false;
  }
});
