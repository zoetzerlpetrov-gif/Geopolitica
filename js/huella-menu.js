import { vistaActual } from "./licencias.js";

const plantilla = document.getElementById("huella-admin-menu");
const menu = plantilla?.closest("details");
let consulta = 0;
let enlace;
menu?.addEventListener("toggle", async () => {
  const turno = ++consulta;
  enlace?.remove();
  if (!menu.open || !plantilla.isConnected || vistaActual() === "pago") return;
  try {
    const r = await fetch("admin/huella/sesion", { cache: "no-store", redirect: "error" });
    if (r.status === 204 && r.headers.get("X-Dominus-Huella") === "admin" &&
        turno === consulta && menu.open && plantilla.isConnected) {
      enlace = plantilla.content.firstElementChild.cloneNode(true);
      plantilla.after(enlace);
    }
  } catch {
    // El sitio público o una sesión sin acceso dejan la opción fuera del menú.
  }
});
