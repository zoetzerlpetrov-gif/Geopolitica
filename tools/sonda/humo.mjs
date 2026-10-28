// Prueba de humo de la rama: sirve los archivos de la rama y, para data/ que no esté en el repositorio, usa el sitio publicado.
// Recorre todas las casillas del menú una por una, las pestañas de herramientas.html y las páginas secundarias, y
// registra errores de la página (excepciones) y de consola. Salida: capturas/humo.txt y capturas.
import { chromium } from "playwright";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
const RAIZ = process.argv[2] || ".", VIVO = "https://zoetzerlpetrov-gif.github.io/Geopolitica/", BASE = "http://rama.local/";
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".geojson": "application/geo+json", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, serviceWorkers: "block" });
await ctx.route(`${BASE}**`, async (route) => {
  const u = new URL(route.request().url());
  let ruta = decodeURIComponent(u.pathname.slice(1)) || "index.html";
  if (ruta.endsWith("/")) ruta += "index.html";
  try {
    if (ruta.startsWith("data/")) throw new Error("datos: del sitio publicado (con rangos para PMTiles)");
    const f = join(RAIZ, ruta);
    if ((await stat(f)).isFile()) return route.fulfill({ status: 200, body: await readFile(f), headers: { "Content-Type": TIPOS[extname(f)] || "application/octet-stream" } });
  } catch (e) { /* no está en la rama: se pide al sitio publicado */ }
  try {
    const r = await route.fetch({ url: VIVO + ruta + u.search });
    return route.fulfill({ response: r });
  } catch (e) { return route.fulfill({ status: 404, body: "no" }); }
});
const errores = []; let actual = "carga";
const p = await ctx.newPage();
p.on("pageerror", (e) => errores.push(`[${actual}] EXCEPCIÓN ${e.message.slice(0, 220)}`));
p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR|status of 4\d\d|status of 5\d\d|AJAXError|CORS|Access-Control/.test(m.text())) errores.push(`[${actual}] CONSOLA ${m.text().slice(0, 220)}`); });
const t0 = Date.now();
await p.goto(BASE + "index.html", { waitUntil: "load" });
await p.waitForTimeout(15000);
console.log(`carga ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await p.screenshot({ path: "capturas/humo-inicio.png" });
// Abre todos los grupos y bloques del menú para que se generen las casillas perezosas.
await p.evaluate(() => document.querySelectorAll("aside details").forEach((d) => { d.open = true; d.dispatchEvent(new Event("toggle")); }));
await p.waitForTimeout(6000);
await p.evaluate(() => document.querySelectorAll("aside details").forEach((d) => { if (!d.open) { d.open = true; d.dispatchEvent(new Event("toggle")); } }));
await p.waitForTimeout(3000);
const sel = await p.evaluate(() => [...document.querySelectorAll('aside input[type="checkbox"]')]
  .filter((x) => !x.disabled && !x.checked)
  .map((x) => { const a = [...x.attributes].find((at) => at.name.startsWith("data-")); return a ? `input[${a.name}="${CSS.escape(a.value)}"]` : null; })
  .filter(Boolean));
const unicos = [...new Set(sel)];
console.log(`casillas a probar: ${unicos.length}`);
let probadas = 0;
for (const s of unicos) {
  actual = s;
  const antes = errores.length;
  try {
    await p.evaluate((q) => { const x = document.querySelector(q); if (x && !x.checked) x.click(); }, s);
    await p.waitForTimeout(/clima|img/.test(s) ? 3500 : 1500);
    await p.evaluate((q) => { const x = document.querySelector(q); if (x && x.checked) x.click(); }, s);
    await p.waitForTimeout(300);
    probadas++;
  } catch (e) { errores.push(`[${s}] PRUEBA ${e.message.slice(0, 160)}`); }
  if (errores.length > antes) console.log(`  ✗ ${s}: ${errores.length - antes} error(es)`);
  // Cierra diálogos o fichas que algún clic haya abierto.
  await p.keyboard.press("Escape").catch(() => {});
}
console.log(`casillas probadas: ${probadas}`);
// Investigación (Fase 3) y búsqueda de lugares
actual = "investigacion";
await p.evaluate(() => { for (const id of ["b-inv-patentes", "b-inv-agencias", "b-inv-crimen-tec", "b-inv-extranjeras", "b-inv-licitaciones"]) { const d = document.getElementById(id); if (d) { d.open = true; d.dispatchEvent(new Event("toggle")); } } });
await p.waitForTimeout(3000);
const leer = (id) => p.evaluate((i) => document.getElementById(i)?.innerText.slice(0, 400) || "(vacío)", id);
await p.fill("#pat-q", "drone swarm"); await p.click("#pat-form button:not(.btn-limpiar)"); await p.waitForTimeout(800); console.log("PATENTES:", await leer("pat-res"));
await p.fill("#ag-q", "ghidra"); await p.waitForTimeout(1200); console.log("AGENCIAS:", await leer("ag-res"));
await p.fill("#ct-q", "drones"); await p.waitForTimeout(1200); console.log("CRIMEN TEC:", (await leer("ct-res")).slice(0, 200));
await p.waitForTimeout(3000);
console.log("EXTRANJERAS (sin filtro):", (await leer("ext-res")).slice(0, 300));
await p.fill("#ext-q", "nestle"); await p.waitForTimeout(1500); console.log("EXTRANJERAS nestle:", await leer("ext-res"));
await p.fill("#ext-q", "bimbo"); await p.click("#ext-gleif"); await p.waitForTimeout(12000); console.log("GLEIF bimbo:", await leer("ext-gleif-res"));
await p.fill("#ext-q", "nissan"); await p.click("#ext-gleif"); await p.waitForTimeout(12000); console.log("GLEIF nissan:", await leer("ext-gleif-res"));
await p.fill("#lic-q", "agua"); await p.click("#lic-form button:not(.btn-limpiar):not([type=button])").catch(() => p.evaluate(() => document.getElementById("lic-form").requestSubmit()));
await p.waitForTimeout(4000); console.log("LICITACIONES agua:", await leer("lic-res")); console.log("PORTALES:", await leer("lic-portales"));
await p.screenshot({ path: "capturas/humo-investigacion.png", fullPage: false });
actual = "tempo";
await p.evaluate(() => { const x = document.querySelector('[data-img="no2_tempo"]'); for (let d = x?.parentElement; d; d = d.parentElement) if (d.tagName === "DETAILS") d.open = true; x?.click(); });
await p.waitForTimeout(15000); console.log("TEMPO:", await p.evaluate(() => document.querySelector(".nota-tempo")?.textContent || "(sin nota)"));
await p.screenshot({ path: "capturas/humo-tempo.png" });
await p.evaluate(() => document.querySelector('[data-img="no2_tempo"]')?.click());
actual = "zonas_horarias";
await p.evaluate(() => document.querySelector('[data-riesgo="zonas_horarias"]')?.click()); await p.waitForTimeout(5000);
await p.screenshot({ path: "capturas/humo-zonas.png" }); await p.evaluate(() => document.querySelector('[data-riesgo="zonas_horarias"]')?.click());
actual = "nubes_ir";
await p.evaluate(() => document.querySelector('[data-clima="nubes_ir"]')?.click());
for (let i = 0; i < 12; i++) { await p.waitForTimeout(5000); console.log(`NUBES t=${(i + 1) * 5}s:`, await p.evaluate(() => (document.getElementById("carga-nubes_ir")?.hidden ? "LISTO " : "") + (document.getElementById("carga-nubes_ir")?.textContent.trim() || ""))); }
await p.screenshot({ path: "capturas/humo-nubes.png" });
await p.evaluate(() => document.querySelector('[data-clima="nubes_ir"]')?.click());
actual = "lugares";
await p.fill("#lug-q", "Paseo de Montejo Merida"); await p.waitForTimeout(3000); console.log("LUGARES:", await leer("lug-lista"));
await p.keyboard.press("Enter"); await p.waitForTimeout(3000); await p.screenshot({ path: "capturas/humo-lugar.png" });
// Herramientas
const h = await ctx.newPage(); actual = "herramientas";
h.on("pageerror", (e) => errores.push(`[${actual}] EXCEPCIÓN ${e.message.slice(0, 220)}`));
await h.goto(BASE + "herramientas.html", { waitUntil: "load" }); await h.waitForTimeout(3000);
for (const t of await h.evaluate(() => [...document.querySelectorAll(".pestanas button[data-p]")].map((x) => x.dataset.p))) { actual = `herramientas:${t}`; await h.click(`.pestanas button[data-p="${t}"]`); await h.waitForTimeout(800); }
actual = "agencias";
await h.fill("#cidr-q", "192.168.10.37/27"); await h.click("#cidr-btn"); console.log("CIDR:", await h.evaluate(() => document.getElementById("cidr-res").innerText.slice(0, 200)));
await h.fill("#ct-dominio", "sat.gob.mx"); await h.click("#ct-btn"); await h.waitForTimeout(10000); console.log("CERT:", await h.evaluate(() => document.getElementById("ct-res").innerText.slice(0, 500)));
await h.fill("#red-q", "8.8.8.8"); await h.click("#red-btn"); await h.waitForTimeout(15000); console.log("RED IP:", await h.evaluate(() => document.getElementById("red-res").innerText.slice(0, 300)));
await h.fill("#red-q", "AS8151"); await h.click("#red-btn"); await h.waitForTimeout(8000); console.log("RED AS:", await h.evaluate(() => document.getElementById("red-res").innerText.slice(0, 300)));
await h.fill("#cro-fecha", "2026-10-01"); await h.fill("#cro-hecho", "Recepción de denuncia"); await h.click("#cro-agregar");
await h.fill("#cro-fecha", "2026-10-20"); await h.fill("#cro-hecho", "Dictamen pericial"); await h.click("#cro-agregar");
console.log("CRONO:", await h.evaluate(() => document.getElementById("cro-res").innerText.slice(0, 300)));
await h.fill("#of-folio", "OF-123"); await h.fill("#of-recibido", "2026-10-28"); await h.fill("#of-asunto", "Solicitud de información"); await h.click("#of-agregar");
console.log("OFICIOS:", await h.evaluate(() => document.getElementById("of-tabla").innerText.slice(0, 300)));
await h.screenshot({ path: "capturas/humo-agencias.png", fullPage: true });
// Otras páginas
for (const pg of ["analitica.html", "camaras.html", "corporativo.html", "inmuebles.html", "marco.html", "matriz.html", "narrativas.html", "noticiero.html", "ops.html", "reporte.html", "taxonomia.html", "warroom.html"]) {
  actual = pg; const q = await ctx.newPage();
  q.on("pageerror", (e) => errores.push(`[${pg}] EXCEPCIÓN ${e.message.slice(0, 220)}`));
  const r = await q.goto(BASE + pg, { waitUntil: "load" }).catch(() => null);
  if (!r || r.status() === 404) { console.log(`${pg}: no existe`); await q.close(); continue; }
  await q.waitForTimeout(5000); console.log(`${pg}: cargó`); await q.close();
}
console.log(`\nERRORES (${errores.length}):`); for (const e of [...new Set(errores)]) console.log(" ", e);
await b.close();
