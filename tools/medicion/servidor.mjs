// Servidor estático mínimo con compresión gzip, para medir la rama en CI igual que GitHub Pages
// (Pages también comprime y responde con Cache-Control: max-age=600).
// Uso: node servidor.mjs <carpeta> <puerto>
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { gzipSync } from "node:zlib";

const raiz = process.argv[2] || "../..";
const puerto = Number(process.argv[3] || 8080);
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".geojson": "application/geo+json", ".pmtiles": "application/octet-stream", ".png": "image/png", ".svg": "image/svg+xml" };
const COMPRIMIBLE = new Set([".html", ".js", ".css", ".json", ".geojson", ".svg", ".mjs"]);

createServer(async (req, res) => {
  try {
    let ruta = normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
    if (ruta.endsWith("/")) ruta += "index.html";
    const archivo = join(raiz, ruta);
    const info = await stat(archivo);
    const ext = extname(archivo);
    const datos = await readFile(archivo);
    const cabeceras = { "Content-Type": TIPOS[ext] || "application/octet-stream", "Cache-Control": "max-age=600", "Accept-Ranges": "bytes" };
    const rango = req.headers.range?.match(/bytes=(\d+)-(\d*)/);
    if (rango) {
      const ini = Number(rango[1]);
      const fin = rango[2] ? Number(rango[2]) : info.size - 1;
      res.writeHead(206, { ...cabeceras, "Content-Range": `bytes ${ini}-${fin}/${info.size}`, "Content-Length": fin - ini + 1 });
      return res.end(datos.subarray(ini, fin + 1));
    }
    if (COMPRIMIBLE.has(ext) && /gzip/.test(req.headers["accept-encoding"] || "")) {
      const gz = gzipSync(datos);
      res.writeHead(200, { ...cabeceras, "Content-Encoding": "gzip", "Content-Length": gz.length });
      return res.end(gz);
    }
    res.writeHead(200, { ...cabeceras, "Content-Length": datos.length });
    res.end(datos);
  } catch (e) {
    res.writeHead(404); res.end("no encontrado");
  }
}).listen(puerto, () => console.log(`sirviendo ${raiz} en http://localhost:${puerto}/`));
