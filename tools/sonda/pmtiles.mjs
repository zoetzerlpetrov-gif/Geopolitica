import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
let actual = "carga";
p.on("console", async (m) => { if (m.type() === "error") { const args = await Promise.all(m.args().map((a) => a.evaluate((x) => x instanceof Error ? `${x.message} | ${x.stack?.slice(0, 300)}` : String(x?.error?.message || x?.message || JSON.stringify(x)?.slice(0, 200))).catch(() => "?"))); console.log(`[${actual}] ${m.text().slice(0, 120)} :: ${args.join(" ; ").slice(0, 500)}`); } });
p.on("response", (r) => { if (/pmtiles/.test(r.url()) && r.status() >= 300) console.log(`[${actual}] RESP ${r.status()} ${r.url()}`); });
await p.goto("https://zoetzerlpetrov-gif.github.io/Geopolitica/", { waitUntil: "load" });
await p.waitForTimeout(14000);
await p.evaluate(() => document.querySelectorAll("aside details").forEach((d) => { d.open = true; }));
await p.waitForTimeout(3000);
for (const f of ["cables", "zonas", "turismo", "nuclear", "aeropuertos"]) {
  actual = f;
  await p.evaluate((id) => document.querySelector(`[data-fam="${id}"]`)?.click(), f);
  await p.waitForTimeout(5000);
  await p.screenshot({ path: `capturas/pm-${f}.png` });
  await p.evaluate((id) => document.querySelector(`[data-fam="${id}"]`)?.click(), f);
  await p.waitForTimeout(800);
}
await b.close();
