// Sonda temporal: capturas a nivel de calle (celular, LITE) con la foto de prueba y con satélite.
import { chromium, devices } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const ctx = await b.newContext({ ...devices["iPhone 13"] });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("pageerror", e.message));
await p.goto("http://localhost:8080/", { waitUntil: "load" }); await p.waitForTimeout(5000);
console.log("LITE:", await p.evaluate(() => document.documentElement.classList.contains("lite")), "base:", await p.$eval("#sel-base", (e) => e.value));
await p.click("#btn-panel"); await p.evaluate(() => { document.getElementById("g-herramientas").open = true; });
await p.setInputFiles("#foto-exif", "/tmp/con_gps.jpg"); await p.waitForTimeout(1500);
await p.click("#foto-ir"); await p.waitForTimeout(9000);
console.log("tras el botón → base:", await p.$eval("#sel-base", (e) => e.value), "zoom:", await p.evaluate(() => document.querySelector("#map") && window.__z));
await p.screenshot({ path: "sonda/calles.png" });
await p.selectOption("#sel-base", "satelite"); await p.waitForTimeout(9000);
await p.screenshot({ path: "sonda/satelite.png" });
await p.selectOption("#sel-base", "calles"); await p.waitForTimeout(6000);
await p.evaluate(() => {}); await p.click(".maplibregl-ctrl-zoom-in"); await p.waitForTimeout(5000);
await p.screenshot({ path: "sonda/calles18.png" });
await b.close();
