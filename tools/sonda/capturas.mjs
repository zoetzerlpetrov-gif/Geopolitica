// Sonda temporal: mosaicos transparentes de GIBS en una página controlada (se borra antes del PR).
import { chromium } from "./node_modules/playwright/index.mjs";
import fs from "node:fs";
fs.mkdirSync("capturas", { recursive: true });
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto("http://localhost:8000/tools/sonda/prueba.html", { waitUntil: "load" }); await p.waitForTimeout(20000);
await p.screenshot({ path: "capturas/control.png" });
await b.close();
