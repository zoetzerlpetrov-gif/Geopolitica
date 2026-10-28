// Sonda temporal: de qué capa sale la «estática» (se borra antes del PR).
import { chromium } from "./node_modules/playwright/index.mjs";
import fs from "node:fs";
fs.mkdirSync("capturas", { recursive: true });
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const log = [];
for (const [n, sel] of [["tempo", '[data-img="no2_tempo"]'], ["hielo", '[data-img="hielo_marino"]']]) {
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  await p.goto("http://localhost:8000/?sonda", { waitUntil: "load" }); await p.waitForTimeout(8000);
  await p.evaluate((s) => document.querySelector(s).click(), sel); await p.waitForTimeout(30000);
  await p.screenshot({ path: `capturas/${n}-1.png` });
  log.push(`== ${n}`, await p.evaluate(() => JSON.stringify(window.__mapa.getStyle().layers.filter((l) => l.type === "raster").map((l) => [l.id, l.source, window.__mapa.getSource(l.source)?.tiles?.[0]?.slice(0, 120)]))));
  await p.evaluate(() => { for (const l of window.__mapa.getStyle().layers) if (l.type === "raster" && /-r\d$/.test(l.id)) window.__mapa.setLayoutProperty(l.id, "visibility", "none"); });
  await p.waitForTimeout(3000); await p.screenshot({ path: `capturas/${n}-2-sin-relleno.png` });
  await p.evaluate(() => { for (const l of window.__mapa.getStyle().layers) if (l.type === "raster") window.__mapa.setLayoutProperty(l.id, "visibility", "none"); });
  await p.waitForTimeout(3000); await p.screenshot({ path: `capturas/${n}-3-sin-raster.png` });
  await p.close();
}
fs.writeFileSync("capturas/registro.txt", log.join("\n"));
await b.close();
