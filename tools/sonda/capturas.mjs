// Sonda temporal: capturas del sitio en vivo con cada capa (se borra antes del PR).
import { chromium } from "./node_modules/playwright/index.mjs";
import fs from "node:fs";
fs.mkdirSync("capturas", { recursive: true });
const URL = process.env.SITIO || "https://zoetzerlpetrov-gif.github.io/Geopolitica/";
const casos = [["hielo", '[data-img="hielo_marino"]'], ["ozono", '[data-img="ozono_total"]'], ["tempo", '[data-img="no2_tempo"]'],
  ["nubes", '[data-clima="nubes_ir"]'], ["geocolor", '[data-clima="geocolor"]']];
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const log = [];
for (const proy of ["mercator"]) {
  for (const [n, sel] of casos) {
    const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
    const fallas = [];
    p.on("requestfailed", (r) => fallas.push(`FALLÓ ${r.url().slice(0, 160)} ${r.failure()?.errorText}`));
    p.on("response", (r) => { if (r.status() >= 400 && /gibs|eumetsat|data\//.test(r.url())) fallas.push(`${r.status()} ${r.url().slice(0, 160)}`); });
    p.on("console", (m) => { if (m.type() === "error") fallas.push(`consola: ${m.text().slice(0, 200)}`); });
    await p.goto(URL, { waitUntil: "load", timeout: 90000 });
    await p.waitForTimeout(8000);
    await p.evaluate((v) => { const s = document.getElementById("sel-proyeccion"); if (s && s.value !== v) { s.value = v; s.dispatchEvent(new Event("change", { bubbles: true })); } }, proy);
    await p.waitForTimeout(3000);
    const ok = await p.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; e.click(); return true; }, sel);
    await p.waitForTimeout(30000);
    await p.screenshot({ path: `capturas/${proy}-${n}.png` });
    if (n === "nubes" || n === "geocolor") { await p.waitForTimeout(25000); await p.screenshot({ path: `capturas/${proy}-${n}-2.png` }); }
    log.push(`== ${proy} ${n} checkbox=${ok}`, ...[...new Set(fallas)].slice(0, 25));
    await p.close();
  }
}
fs.writeFileSync("capturas/registro.txt", log.join("\n"));
console.log(log.join("\n"));
await b.close();
