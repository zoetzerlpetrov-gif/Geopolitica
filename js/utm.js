// Cuenta la visita cuando alguien llega desde una publicación (enlace con utm_source): manda solo la red y la campaña
// al Worker (total por día, sin IP ni cookies) y quita los parámetros de la barra de direcciones. Una vez por pestaña.
const DESTINO = "https://geopolitica.zoetzerl-petrov.workers.dev/m/visita";

export function leerUtm(href) {
  const u = new URL(href);
  const red = u.searchParams.get("utm_source"), campania = u.searchParams.get("utm_campaign") || "";
  if (!red) return null;
  for (const k of [...u.searchParams.keys()]) if (k.startsWith("utm_")) u.searchParams.delete(k);
  return { red: red.toLowerCase(), campania, limpia: u.pathname + (u.search || "") + u.hash };
}

export function registrar(win = window) {
  const v = leerUtm(win.location.href);
  if (!v) return false;
  try {
    const clave = `gp_utm_${v.red}_${v.campania}`;
    if (!win.sessionStorage.getItem(clave)) {
      win.sessionStorage.setItem(clave, "1");
      win.fetch(DESTINO, { method: "POST", mode: "cors", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ red: v.red, campania: v.campania }) }).catch(() => {});
    }
  } catch { /* sin almacenamiento: no se cuenta */ }
  win.history.replaceState(null, "", v.limpia);
  return true;
}

if (typeof window !== "undefined" && window.location?.search.includes("utm_")) registrar();
