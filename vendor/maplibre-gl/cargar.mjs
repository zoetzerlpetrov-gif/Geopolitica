// MapLibre GL JS 6 (solo ESM): se expone como window.maplibregl para el código del sitio, igual que la versión 5.
// El worker (maplibre-gl-worker.mjs) se carga solo, desde esta misma carpeta. Aquí también se precalientan los workers.
import * as maplibregl from "./maplibre-gl.mjs";

// Copia modificable: el módulo es de solo lectura y el sitio agrega ayudas (p. ej. js/antimeridiano.js).
globalThis.maplibregl = { ...maplibregl };
try { globalThis.maplibregl.prewarm?.(); } catch { /* sin workers: el mapa los crea al iniciar */ }
