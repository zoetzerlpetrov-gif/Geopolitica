// Sonda temporal: TEMPO y hielo marino con el filtro de paleta (se borra antes del PR).
import { chromium } from "./node_modules/playwright/index.mjs";
import fs from "node:fs";
fs.mkdirSync("capturas", { recursive: true });
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
for (const [n, sel] of [["tempo", '[data-img="no2_tempo"]'], ["hielo", '[data-img="hielo_marino"]']]) {
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await p.goto("http://localhost:8000/?sonda", { waitUntil: "load" }); await p.waitForTimeout(8000);
  await p.evaluate((s) => document.querySelector(s).click(), sel); await p.waitForTimeout(30000);
  await p.screenshot({ path: `capturas/${n}.png` });
  await p.close();
}
await b.close();
