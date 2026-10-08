// Copia las bibliotecas del navegador (versiones fijas en package.json) a ../vendor/
// para que el sitio no dependa de un CDN.  Uso: cd tools && npm ci && npm run vendor
//   - MapLibre GL JS  (BSD-3-Clause)  motor del mapa
//   - pmtiles         (BSD-3-Clause)  lee archivos .pmtiles por rangos HTTP desde GitHub Pages
//   - satellite.js    (MIT)           propagación SGP4 de órbitas (en un Web Worker)
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
const libs = [
  ["maplibre-gl", ["dist/maplibre-gl.js", "dist/maplibre-gl.css", "LICENSE.txt"]],
  ["pmtiles", ["dist/pmtiles.js"]],
  ["satellite.js", ["dist/satellite.min.js", "LICENSE.md"]],
];
// El paquete npm de pmtiles no incluye el texto de la licencia: se deja la referencia.
const NOTA_PMTILES = "pmtiles (Protomaps) - BSD 3-Clause License\nhttps://github.com/protomaps/PMTiles/blob/main/LICENSE\n";
for (const [pkg, archivos] of libs) {
  const dst = `../vendor/${pkg.replace(".js", "")}/`;
  mkdirSync(dst, { recursive: true });
  for (const f of archivos) copyFileSync(`node_modules/${pkg}/${f}`, dst + f.split("/").pop());
  if (pkg === "pmtiles") writeFileSync(dst + "LICENSE.txt", NOTA_PMTILES);
  console.log(pkg, JSON.parse(readFileSync(`node_modules/${pkg}/package.json`, "utf8")).version, "→", dst);
}
