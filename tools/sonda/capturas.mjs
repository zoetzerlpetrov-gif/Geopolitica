// Sonda temporal (se borra antes del PR): contornos de estados, «Solo países» y grupos con número.
import { chromium } from "./node_modules/playwright/index.mjs";
import fs from "node:fs";
fs.mkdirSync("capturas", { recursive: true });
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const log = [];
p.on("console", (m) => { if (m.type() === "error") log.push(m.text().slice(0, 200)); });
p.on("pageerror", (e) => log.push("pageerror " + e.message));
await p.goto("http://localhost:8000/", { waitUntil: "load" }); await p.waitForTimeout(10000);
await p.evaluate(() => {
  const c = document.getElementById("chk-estados"); c.checked = true; c.dispatchEvent(new Event("change", { bubbles: true }));
  document.querySelector('[data-etq="paises"]').click();
});
await p.waitForTimeout(6000);
await p.screenshot({ path: "capturas/estados-solo-paises.png" });
await p.mouse.move(500, 380); for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, -300); await p.waitForTimeout(400); }
await p.waitForTimeout(6000);
await p.screenshot({ path: "capturas/estados-zoom.png" });
await p.evaluate(() => {
  document.querySelector('[data-etq="todas"]').click();
  const c = document.getElementById("chk-estados"); c.checked = false; c.dispatchEvent(new Event("change", { bubbles: true }));
  for (const id of ["crimen_7d", "vial_protesta"]) { const x = document.querySelector(`[data-riesgo="${id}"]`); if (x) { x.checked = true; x.dispatchEvent(new Event("change", { bubbles: true })); } }
});
for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 300); await p.waitForTimeout(400); }
await p.waitForTimeout(12000);
await p.screenshot({ path: "capturas/grupos.png" });
log.push("estados encendido guardado: " + await p.evaluate(() => localStorage.getItem("gp_base_capas")));
fs.writeFileSync("capturas/registro.txt", log.join("\n"));
await b.close();
