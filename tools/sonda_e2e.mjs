// Sonda temporal: flujo completo en Chromium (biblioteca de jsDelivr, modelo de Hugging Face, vectores precalculados).
import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage();
p.on("pageerror", (e) => console.log("pageerror:", e.message.slice(0, 300)));
p.on("console", (m) => { const t = m.text(); if (!/glyph|GL Driver|WebGL|Expected value|404/.test(t)) console.log("consola:", m.type(), t.slice(0, 300)); });
p.on("requestfailed", (r) => { if (!/openfreemap/.test(r.url())) console.log("falló:", r.url().slice(0, 140), r.failure()?.errorText); });
p.on("response", (r) => { if (!/localhost|openfreemap|raw.githubusercontent/.test(r.url())) console.log("descarga:", r.status(), r.headers()["content-length"] || "", r.url().slice(0, 110)); });
await p.goto("http://localhost:8080/", { waitUntil: "load" });
await p.waitForTimeout(4000);
console.log("crossOriginIsolated:", await p.evaluate(() => crossOriginIsolated), "SAB:", await p.evaluate(() => typeof SharedArrayBuffer));
for (const f of ["/tmp/real.jpg", "/tmp/souvenir.jpg"]) {
  const t0 = Date.now();
  await p.setInputFiles("#foto-exif", f);
  await p.waitForFunction(() => !document.getElementById("foto-reconocer").hidden, null, { timeout: 30000 });
  await p.evaluate(() => document.getElementById("foto-reconocer").click());
  let txt = "";
  for (let i = 0; i < 40; i++) {
    await p.waitForTimeout(10000);
    const t = await p.evaluate(() => document.getElementById("foto-lugares-res").innerText);
    if (t !== txt) { console.log(`  [${((Date.now() - t0) / 1000).toFixed(0)} s] ${t.slice(0, 160).replace(/\n/g, " / ")}`); txt = t; }
    if (/Lugares parecidos|No se pudo/.test(t)) break;
  }
  console.log(`\n=== ${f} (${((Date.now() - t0) / 1000).toFixed(1)} s)\n${txt}`);
}
await b.close();
