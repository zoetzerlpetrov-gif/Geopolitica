// Sonda temporal: flujo completo en Chromium (biblioteca de jsDelivr, modelo de Hugging Face, vectores precalculados).
import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage();
p.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("consola:", m.text().slice(0, 200)); });
p.on("requestfailed", (r) => console.log("falló:", r.url().slice(0, 120)));
p.on("response", (r) => { if (/jsdelivr|huggingface|monumentos/.test(r.url())) console.log("descarga:", r.status(), r.url().slice(0, 140)); });
await p.goto("http://localhost:8080/", { waitUntil: "load" });
await p.waitForTimeout(4000);
for (const f of ["/tmp/real.jpg", "/tmp/souvenir.jpg"]) {
  const t0 = Date.now();
  await p.setInputFiles("#foto-exif", f);
  await p.waitForFunction(() => !document.getElementById("foto-reconocer").hidden, null, { timeout: 30000 });
  await p.evaluate(() => document.getElementById("foto-reconocer").click());
  await p.waitForFunction(() => /Lugares parecidos|No se pudo/.test(document.getElementById("foto-lugares-res").innerText), null, { timeout: 300000, polling: 1000 });
  console.log(`\n=== ${f} (${((Date.now() - t0) / 1000).toFixed(1)} s)\n${await p.evaluate(() => document.getElementById("foto-lugares-res").innerText)}`);
}
await b.close();
