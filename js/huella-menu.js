import { vistaActual } from "./licencias.js";
import { enAdmin } from "./admin_origen.js";

const acceso = document.getElementById("acceso-mapa-admin");
const publico = !enAdmin(location.hostname);  // dominusosint.com, Pages o GitHub Pages
if (acceso && vistaActual() !== "pago") {
  acceso.hidden = false;
  // Ya dentro del acceso administrativo: el mismo enlace lleva a la consola y dice que la sesión está abierta.
  if (!publico) acceso.textContent = "✅ Sesión administrativa: abrir la consola";
}

const plantilla = document.getElementById("huella-admin-menu");
const menu = plantilla?.closest("details");
let consulta = 0;
let enlace;
menu?.addEventListener("toggle", async () => {
  const turno = ++consulta;
  enlace?.remove();
  if (!menu.open || !plantilla.isConnected || publico || vistaActual() === "pago") return;
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
