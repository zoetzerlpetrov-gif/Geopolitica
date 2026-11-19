// Dirección del Worker de administración (inicio de sesión, guardado de Admin y datos públicos del Worker).
// Desde noviembre de 2026 vive en un subdominio propio; la dirección workers.dev se sigue aceptando mientras exista.
export const ADMIN_ORIGEN = "https://admin.dominusosint.com";
export const ADMIN_HOSTS = ["admin.dominusosint.com"];
/** ¿La página se abrió desde el Worker de administración (donde sí se puede guardar)? */
export const enAdmin = (host = globalThis.location?.hostname || "") => ADMIN_HOSTS.includes(host) || /\.workers\.dev$/.test(host);
