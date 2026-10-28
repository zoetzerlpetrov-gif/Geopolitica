// Sonda temporal (se borra antes del PR): capas nuevas de la Fase 2 con datos reales.
import { chromium } from "./node_modules/playwright/index.mjs";
import fs from "node:fs";
fs.mkdirSync("capturas", { recursive: true });
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const log = [];
const marcar = async (p, sel) => p.evaluate((s) => { const x = document.querySelector(s); if (x) { x.checked = true; x.dispatchEvent(new Event("change", { bubbles: true })); return true; } return false; }, sel);
for (const [n, sels] of [["gps-eclipses", ['[data-riesgo="gps_interferencia"]', '[data-riesgo="eclipses"]']],
  ["desaparecidos", ['[data-riesgo="desap_fosa"]', '[data-riesgo="desap_busqueda"]', '[data-riesgo="desap_identificacion"]', '[data-riesgo="desap_desaparicion"]']],
  ["clima-frio", ['[data-clima="vortice"]', '[data-clima="bolsas"]']], ["nieve", ['[data-clima="nieve"]', '[data-img="nieve_viirs"]']],
  ["camaras-grupos", ['[data-fam="camaras"]']]]) {
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  p.on("pageerror", (e) => log.push(`${n} pageerror ${e.message}`));
  await p.goto("http://localhost:8000/", { waitUntil: "load" }); await p.waitForTimeout(9000);
  for (const s of sels) log.push(`${n} ${s}: ${await marcar(p, s)}`);
  await p.waitForTimeout(20000);
  await p.screenshot({ path: `capturas/${n}.png` });
  await p.close();
}
fs.writeFileSync("capturas/registro.txt", log.join("\n"));
await b.close();
