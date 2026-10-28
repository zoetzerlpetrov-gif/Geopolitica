// Sonda temporal: respuestas de GIBS por mosaico (se borra antes del PR).
import { chromium } from "./node_modules/playwright/index.mjs";
import fs from "node:fs";
fs.mkdirSync("capturas", { recursive: true });
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const log = [];
for (const [n, sel] of [["tempo", '[data-img="no2_tempo"]'], ["hielo", '[data-img="hielo_marino"]']]) {
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const resp = [];
  p.on("response", async (r) => {
    if (!r.url().includes("gibs.earthdata")) return;
    let len = -1, md5 = "";
    try { const body = await r.body(); len = body.length; md5 = (await import("node:crypto")).createHash("md5").update(body).digest("hex").slice(0, 8);
      if (resp.length < 400) fs.writeFileSync(`capturas/${n}_${resp.length}.bin`, body); } catch {}
    resp.push(`${resp.length} ${r.status()} ${r.headers()["content-type"]} ${len} ${md5} ${r.url().split("/default/")[1]}`);
  });
  p.on("console", (m) => log.push(`console ${n}: ${m.text().slice(0, 200)}`));
  await p.goto("http://localhost:8000/?sonda", { waitUntil: "load" }); await p.waitForTimeout(8000);
  await p.evaluate(() => { window.__fallas = []; addEventListener("gibs-falla", (e) => window.__fallas.push(e.detail.split("/default/")[1])); });
  await p.evaluate((s) => document.querySelector(s).click(), sel); await p.waitForTimeout(30000);
  await p.screenshot({ path: `capturas/${n}-1.png` });
  log.push(`== ${n} respuestas`, ...resp, `== ${n} fallas`, ...(await p.evaluate(() => window.__fallas)));
  await p.close();
}
fs.writeFileSync("capturas/registro.txt", log.join("\n"));
await b.close();
