// Sonda temporal: prueba controlada de mosaicos vacíos en MapLibre (se borra antes del PR).
import { chromium } from "./node_modules/playwright/index.mjs";
import fs from "node:fs";
fs.mkdirSync("capturas", { recursive: true });
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
// Antes se abre otra página con imágenes para «ensuciar» la memoria de texturas, como pasa en el sitio.
const sucia = await b.newPage({ viewport: { width: 1600, height: 900 } });
await sucia.goto("http://localhost:8000/tools/sonda/prueba.html"); await sucia.waitForTimeout(15000); await sucia.close();
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const log = [];
p.on("console", (m) => log.push(`${m.type()}: ${m.text().slice(0, 200)}`));
await p.goto("http://localhost:8000/tools/sonda/prueba.html"); await p.waitForTimeout(20000);
await p.screenshot({ path: "capturas/prueba.png" });
fs.writeFileSync("capturas/registro.txt", log.join("\n"));
await b.close();
