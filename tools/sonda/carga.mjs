import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
for (const ronda of ["fria", "con-sw"]) {
  const ctx = ronda === "fria" ? await b.newContext({ viewport: { width: 1400, height: 900 } }) : globalThis.__ctx;
  globalThis.__ctx = ctx;
  const p = await ctx.newPage();
  const t0 = Date.now(); const lentos = [];
  p.on("pageerror", (e) => console.log(`[${ronda}] EXCEPCIÓN ${e.message.slice(0, 200)}`));
  p.on("console", (m) => { if (m.type() === "error" || /service worker|reintento/i.test(m.text())) console.log(`[${ronda}] CONSOLA ${m.type()} ${m.text().slice(0, 200)}`); });
  p.on("framenavigated", (f) => { if (f === p.mainFrame()) console.log(`[${ronda}] navegación ${((Date.now() - t0) / 1000).toFixed(1)} s ${f.url()}`); });
  const ini = new Map();
  p.on("request", (r) => ini.set(r, Date.now()));
  p.on("requestfinished", (r) => { const ms = Date.now() - ini.get(r); if (ms > 3000) lentos.push(`${ms} ms ${r.url().slice(0, 140)}`); });
  p.on("requestfailed", (r) => console.log(`[${ronda}] FALLO ${r.url().slice(0, 140)} ${r.failure()?.errorText}`));
  await p.goto("https://zoetzerlpetrov-gif.github.io/Geopolitica/", { waitUntil: "domcontentloaded" });
  for (const s of [3, 8, 15, 30, 45]) {
    await p.waitForTimeout(s * 1000 - (Date.now() - t0) > 0 ? s * 1000 - (Date.now() - t0) : 0);
    const estado = await p.evaluate(() => ({ estado: document.getElementById("estado-datos")?.textContent?.slice(0, 160), canvas: !!document.querySelector("#map canvas"), sw: !!navigator.serviceWorker?.controller })).catch((e) => ({ err: e.message }));
    console.log(`[${ronda}] t=${s}s`, JSON.stringify(estado));
    await p.screenshot({ path: `capturas/${ronda}-${s}.png` });
  }
  console.log(`[${ronda}] lentos:`, lentos.slice(0, 15));
  await p.close();
}
await b.close();
