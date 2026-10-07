// Copia MapLibre GL JS (versión fija en package.json) a ../vendor/maplibre-gl/
// para que el sitio no dependa de un CDN.  Uso: cd tools && npm ci && npm run vendor
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
const src = "node_modules/maplibre-gl/";
const dst = "../vendor/maplibre-gl/";
mkdirSync(dst, { recursive: true });
for (const f of ["dist/maplibre-gl.js", "dist/maplibre-gl.css", "LICENSE.txt"]) copyFileSync(src + f, dst + f.split("/").pop());
console.log("MapLibre GL", JSON.parse(readFileSync(src + "package.json", "utf8")).version, "copiado a", dst);
