// Service worker del Monitor Geopolítico.
//
// Estrategias:
//   CacheFirst   vendor/ (MapLibre), fuentes y sprites de OpenFreeMap, mosaicos del mapa base
//                (sus URL llevan la fecha de la versión del planeta, así que no cambian).
//   NetworkFirst HTML, CSS, JS y config/ propios: siempre la versión publicada (revalidando la caché HTTP);
//                la copia guardada solo se usa sin conexión. Antes era StaleWhileRevalidate y, tras publicar
//                un cambio, el navegador podía mezclar un app.js nuevo con un foto.js viejo y romper la página.
//   StaleWhileRevalidate  estilos y TileJSON de OpenFreeMap.
//   NetworkFirst data/*.json (eventos, run-log): siempre intenta lo más reciente; sin red usa la copia.
// No intercepta peticiones con encabezado Range (archivos .pmtiles): el navegador las cachea solo.
const VERSION = "v11"; // subir al cambiar la estructura de index.html/js: borra la copia vieja de la app
const C_ESTATICO = `estatico-${VERSION}`;
const C_APP = `app-${VERSION}`;
const C_MOSAICOS = `mosaicos-${VERSION}`;
const C_DATOS = `datos-${VERSION}`;
const MAX_MOSAICOS = 600;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const vigentes = new Set([C_ESTATICO, C_APP, C_MOSAICOS, C_DATOS]);
    for (const k of await caches.keys()) if (!vigentes.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function cacheFirst(req, nombre, limite) {
  const cache = await caches.open(nombre);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    await cache.put(req, res.clone());
    if (limite) recortar(cache, limite);
  }
  return res;
}

async function staleWhileRevalidate(req, nombre, evento) {
  const cache = await caches.open(nombre);
  const hit = await cache.match(req);
  const red = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; });
  if (hit) { evento.waitUntil(red.catch(() => null)); return hit; }
  return red;
}

async function networkFirst(req, nombre, opciones) {
  const cache = await caches.open(nombre);
  try {
    // Con opciones se pide por URL: una petición de navegación no se puede copiar con opciones nuevas.
    const res = await (opciones ? fetch(req.url, opciones) : fetch(req));
    if (res.ok) cache.put(stripQuery(req.url), res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(stripQuery(req.url));
    if (hit) return hit;
    throw e;
  }
}

// events.json?t=123 se guarda como events.json para no acumular una copia por cada consulta.
const stripQuery = (u) => u.split("?")[0];

async function recortar(cache, max) {
  const claves = await cache.keys();
  for (let i = 0; i < claves.length - max; i++) await cache.delete(claves[i]);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    const p = url.pathname;
    if (p.includes("/data/") && p.endsWith(".json")) return e.respondWith(networkFirst(req, C_DATOS));
    if (p.includes("/vendor/")) return e.respondWith(cacheFirst(req, C_ESTATICO));
    if (/\.(html|css|js|json|geojson)$|\/$/.test(p)) return e.respondWith(networkFirst(req, C_APP, { cache: "no-cache" }));
    return;
  }
  if (url.hostname === "tiles.openfreemap.org") {
    if (url.pathname.startsWith("/fonts/") || url.pathname.startsWith("/sprites/")) return e.respondWith(cacheFirst(req, C_ESTATICO));
    if (/\.(pbf|png|mvt)$/.test(url.pathname)) return e.respondWith(cacheFirst(req, C_MOSAICOS, MAX_MOSAICOS));
    return e.respondWith(staleWhileRevalidate(req, C_ESTATICO, e));
  }
});
