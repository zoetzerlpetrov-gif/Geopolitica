import { chromium } from "playwright";
const SITIO = process.env.SITIO || "https://zoetzerlpetrov-gif.github.io/Geopolitica/";
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
const reqs = new Map(); let log = [];
p.on("request", (r) => reqs.set(r, Date.now()));
p.on("requestfinished", async (r) => { const t0 = reqs.get(r); const resp = await r.response(); log.push({ u: r.url(), ms: Date.now() - t0, s: resp?.status(), fin: Date.now() }); });
p.on("requestfailed", (r) => { const t0 = reqs.get(r); log.push({ u: r.url(), ms: Date.now() - t0, s: "FALLO " + r.failure()?.errorText, fin: Date.now() }); });
p.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 200)));
p.on("console", (m) => { if (m.type() === "error") console.log("CONSOLA", m.text().slice(0, 200)); });
await p.goto(SITIO, { waitUntil: "load" });
await p.waitForTimeout(12000);
const resumen = (desde, etiqueta) => {
  const l = log.filter((x) => x.fin >= desde);
  const host = {};
  for (const x of l) { const h = new URL(x.u).host + (x.u.includes("/wmts/") ? " " + (x.u.split("/")[6] || "") : ""); (host[h] ??= { n: 0, ms: 0, max: 0, malos: 0 }); host[h].n++; host[h].ms += x.ms; host[h].max = Math.max(host[h].max, x.ms); if (x.s !== 200 && x.s !== 304) host[h].malos++; }
  console.log(`--- ${etiqueta}: ${l.length} peticiones`);
  for (const [h, v] of Object.entries(host).sort((a, c) => c[1].n - a[1].n).slice(0, 12)) console.log(`   ${h}: n=${v.n} prom=${Math.round(v.ms / v.n)}ms max=${v.max}ms malos=${v.malos}`);
  const malos = l.filter((x) => x.s !== 200 && x.s !== 304).slice(0, 6);
  for (const x of malos) console.log(`   MALO ${x.s} ${x.u.slice(0, 180)}`);
};
async function abrir(sel) {
  await p.evaluate((s) => { const cb = document.querySelector(s); for (let d = cb?.parentElement; d; d = d.parentElement) if (d.tagName === "DETAILS") d.open = true; }, sel);
}
async function probar(sel, nombre, espera, leer) {
  const ex = await p.$(sel);
  if (!ex) { console.log(`=== ${nombre}: NO EXISTE ${sel}`); return; }
  await abrir(sel);
  const t0 = Date.now();
  await p.click(sel, { force: true });
  const marcas = [];
  for (let i = 0; i < espera; i++) {
    await p.waitForTimeout(1000);
    const txt = leer ? await p.evaluate(leer) : "";
    if (txt && marcas.at(-1)?.txt !== txt) marcas.push({ s: i + 1, txt });
  }
  console.log(`=== ${nombre}`);
  for (const m of marcas) console.log(`   t=${m.s}s ${m.txt}`);
  resumen(t0, nombre);
  await p.screenshot({ path: `capturas/${nombre}.png` });
  await p.click(sel, { force: true });
  await p.waitForTimeout(1500);
}
const progreso = (t) => `(() => { const d = document.getElementById("carga-${t}"); const m = document.getElementById("momento-${t}"); return (d ? (d.hidden ? "LISTO " : "") + d.textContent.trim() : "") + " | " + (m?.dataset.momento || ""); })()`;
// Vista: México y América
await p.evaluate(() => { window.__mapa?.jumpTo?.({ center: [-100, 23], zoom: 3 }); });
await probar('[data-img="no2_tempo"]', "tempo", 25, `(() => [...document.querySelectorAll("#img-capas .meta, #img-capas .aviso, .aviso-base")].map((x) => x.textContent.trim()).filter(Boolean).join(" / ").slice(0, 300))()`);
for (const t of ["nubes_ir", "geocolor", "lluvia_sat"]) await probar(`[data-clima="${t}"]`, t, 45, progreso(t));
for (const t of ["vortice", "nieve"]) await probar(`[data-clima="${t}"]`, t, 8, `document.getElementById("clima-leyendas")?.textContent.slice(0, 200)`);
await probar('[data-riesgo="zonas_horarias"]', "zonas_horarias", 8);
await probar('[data-riesgo="c2_botnets"]', "c2_botnets", 6);
await probar('[data-riesgo="desap_fosa"]', "desap", 6);
const ids = await p.evaluate(() => [...document.querySelectorAll("[data-riesgo]")].map((x) => x.dataset.riesgo).filter((x) => /desap|fosa|busq|ident/.test(x)));
console.log("ids desaparecidos", ids);
await b.close();
