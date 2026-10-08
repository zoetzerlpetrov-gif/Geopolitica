// Medición de rendimiento del mapa (Fase A). No modifica la aplicación: la observa desde fuera.
//
// Uso:  node medir.mjs --url https://zoetzerlpetrov-gif.github.io/Geopolitica/ [--rapido]
// Salida: resultados/medicion.json y resultados/medicion.md (tabla), y la tabla en consola.
//
// Qué mide por escenario (escritorio / móvil 4G con CPU 4x más lenta; con y sin ?carga=50000):
//   - tiempo hasta mapa usable: primer evento "idle" de MapLibre (todo dibujado y sin cargas pendientes)
//   - FPS durante paneo y durante zoom (cuadros por segundo con requestAnimationFrame)
//   - long tasks > 50 ms (tareas que bloquean el hilo principal)
//   - latencia de interacción al cambiar filtros (Event Timing API, equivalente de laboratorio de INP)
//   - JS heap tras 2 minutos
//   - bytes transferidos por categoría (estilo, mosaicos, fuentes, sprites, MapLibre, datos propios)
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith("--") ? [a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] === undefined ? true : all[i + 1]] : null).filter(Boolean));
const URL_BASE = String(args.url || "https://zoetzerlpetrov-gif.github.io/Geopolitica/");
const RAPIDO = Boolean(args.rapido);
const SALIDA = String(args.salida || "medicion");
const ESPERA_HEAP_MS = RAPIDO ? 15000 : 120000;

// 4G simulado: mismos valores que usa Lighthouse para móvil (150 ms RTT, ~1.6 Mbps de bajada).
const RED_4G = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };
const ESCENARIOS = [
  { id: "escritorio", viewport: { width: 1366, height: 800 }, movil: false },
  { id: "movil-4g", viewport: { width: 390, height: 844 }, movil: true },
];

// Se inyecta antes que cualquier script de la página: captura la instancia del mapa y observa el rendimiento.
const SONDA = () => {
  window.__m = { longtasks: [], eventos: [], t0: performance.now() };
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.longtasks.push(Math.round(e.duration)); }).observe({ type: "longtask", buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.eventos.push({ n: e.name, d: Math.round(e.duration) }); }).observe({ type: "event", durationThreshold: 16, buffered: true });
  } catch (e) { /* navegador sin soporte */ }
  let ml;
  Object.defineProperty(window, "maplibregl", {
    configurable: true,
    get() { return ml; },
    set(v) {
      const Orig = v.Map;
      v.Map = class extends Orig {
        constructor(o) {
          super(o);
          window.__map = this;
          this.once("idle", () => { window.__m.idle = performance.now(); });
        }
      };
      ml = v;
    },
  });
};

function categoria(url) {
  if (url.includes("maplibre-gl")) return "maplibre";
  if (/openfreemap\.org\/styles\//.test(url)) return "estilo base";
  if (/openfreemap\.org\/(planet|natural_earth)/.test(url) && !/\.pbf|\.png/.test(url)) return "tilejson";
  if (/openfreemap\.org\/fonts\//.test(url)) return "fuentes (glyphs)";
  if (/openfreemap\.org\/sprites\//.test(url)) return "sprites";
  if (/openfreemap\.org\/.*\.(pbf|png)/.test(url) || /openfreemap\.org\/planet\//.test(url)) return "mosaicos base";
  if (url.includes("countries.geojson")) return "countries.geojson";
  if (url.includes("events.json")) return "events.json";
  if (/\/config\/|run-log\.json/.test(url)) return "config + run-log";
  if (/\.(js|css|html)(\?|$)/.test(url) || url.endsWith("/")) return "app (html/css/js)";
  return "otros";
}

async function fps(page, accion) {
  await page.evaluate(() => {
    window.__f = { n: 0, max: 0, last: performance.now(), on: true };
    const tick = (t) => { const f = window.__f; if (!f.on) return; f.max = Math.max(f.max, t - f.last); f.last = t; f.n++; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    window.__f.t0 = performance.now();
  });
  await accion();
  return page.evaluate(() => { const f = window.__f; f.on = false; const s = (performance.now() - f.t0) / 1000; return { fps: +(f.n / s).toFixed(1), peor_cuadro_ms: Math.round(f.max) }; });
}

async function medir(browser, esc, carga) {
  const ctx = await browser.newContext({ viewport: esc.viewport, isMobile: esc.movil, hasTouch: esc.movil, deviceScaleFactor: esc.movil ? 3 : 1 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Performance.enable");
  if (esc.movil) {
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", RED_4G);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  await page.addInitScript(SONDA);

  const bytes = {};
  const conteo = {};
  page.on("requestfinished", async (req) => {
    try {
      const s = await req.sizes();
      const c = categoria(req.url());
      bytes[c] = (bytes[c] || 0) + s.responseBodySize + s.responseHeadersSize;
      conteo[c] = (conteo[c] || 0) + 1;
    } catch (e) { /* petición cancelada */ }
  });

  const url = URL_BASE + (carga ? "?carga=50000" : "");
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.__m && window.__m.idle, null, { timeout: 120000 }).catch(() => null);
  const usable = await page.evaluate(() => (window.__m.idle ? Math.round(window.__m.idle) : null));
  const tCarga = Date.now() - t0;
  const longAntes = await page.evaluate(() => window.__m.longtasks.length);

  // Paneo: 3 arrastres en el centro del mapa.
  const box = await page.locator("#map").boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const paneo = await fps(page, async () => {
    for (let i = 0; i < 3; i++) {
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx - 250, cy + 60, { steps: 30 });
      await page.mouse.up();
      await page.waitForTimeout(300);
    }
  });
  // Zoom: rueda hacia adentro y hacia afuera.
  const zoom = await fps(page, async () => {
    await page.mouse.move(cx, cy);
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(150); }
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 300); await page.waitForTimeout(150); }
    await page.waitForTimeout(500);
  });

  // Interacción con filtros (en móvil el panel está oculto: se abre primero).
  await page.evaluate(() => { window.__m.eventos = []; });
  if (esc.movil) await page.click("#btn-panel");
  await page.click("#areas-ninguna");
  await page.click("#areas-todas");
  await page.selectOption("#f-severidad", "3");
  await page.click("#f-mexico");
  await page.click("#f-mexico");
  await page.selectOption("#f-severidad", "1");
  await page.waitForTimeout(800);
  const interaccion = await page.evaluate(() => Math.max(0, ...window.__m.eventos.map((e) => e.d)));

  await page.waitForTimeout(ESPERA_HEAP_MS);
  const { metrics } = await cdp.send("Performance.getMetrics");
  const heap = metrics.find((m) => m.name === "JSHeapUsedSize")?.value || 0;
  const lt = await page.evaluate(() => window.__m.longtasks);

  const r = {
    escenario: esc.id, carga: carga ? 50000 : 0,
    mapa_usable_ms: usable, load_ms: tCarga,
    fps_paneo: paneo.fps, peor_cuadro_paneo_ms: paneo.peor_cuadro_ms,
    fps_zoom: zoom.fps, peor_cuadro_zoom_ms: zoom.peor_cuadro_ms,
    long_tasks_carga: longAntes, long_tasks_navegacion: lt.length - longAntes,
    long_task_max_ms: Math.max(0, ...lt), long_task_max_nav_ms: Math.max(0, ...lt.slice(longAntes)),
    interaccion_max_ms: interaccion,
    heap_mb_2min: +(heap / 1048576).toFixed(1),
    bytes_por_categoria: Object.fromEntries(Object.entries(bytes).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, { kb: Math.round(v / 1024), peticiones: conteo[k] }])),
  };
  await ctx.close();
  return r;
}

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const resultados = [];
for (const esc of ESCENARIOS) for (const carga of [false, true]) {
  const r = await medir(browser, esc, carga);
  console.log(JSON.stringify(r));
  resultados.push(r);
}
await browser.close();

const fila = (r) => `| ${r.escenario} | ${r.carga || "—"} | ${r.mapa_usable_ms ?? "n/d"} | ${r.fps_paneo} (${r.peor_cuadro_paneo_ms}) | ${r.fps_zoom} (${r.peor_cuadro_zoom_ms}) | ${r.long_tasks_carga} / ${r.long_tasks_navegacion} | ${r.long_task_max_ms} / ${r.long_task_max_nav_ms} | ${r.interaccion_max_ms} | ${r.heap_mb_2min} |`;
const pesos = (r) => Object.entries(r.bytes_por_categoria).map(([k, v]) => `| ${r.escenario}${r.carga ? " +50k" : ""} | ${k} | ${v.kb} | ${v.peticiones} |`).join("\n");
const md = [
  `## Medición «${SALIDA}» ${new Date().toISOString()} · ${URL_BASE}`,
  "",
  "| Escenario | Carga | Mapa usable (ms) | FPS paneo (peor cuadro ms) | FPS zoom (peor cuadro ms) | Long tasks carga / navegación | Long task máx carga / navegación (ms) | Interacción máx (ms) | Heap tras espera (MB) |",
  "|---|---|---|---|---|---|---|---|---|",
  ...resultados.map(fila),
  "",
  "| Escenario | Categoría | KB transferidos | Peticiones |",
  "|---|---|---|---|",
  ...resultados.map(pesos),
].join("\n");
mkdirSync("resultados", { recursive: true });
writeFileSync(`resultados/${SALIDA}.json`, JSON.stringify(resultados, null, 2));
writeFileSync(`resultados/${SALIDA}.md`, md + "\n");
console.log("\n" + md);
