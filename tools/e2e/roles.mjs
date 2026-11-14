// Pruebas integrales por rol con un navegador real (Playwright + Chromium).
//
// Para cada rol (admin = versión completa, y cada plan de config/planes.json en la versión de pago):
//   1. Abre el mapa y espera a que termine de arrancar; anota errores de JavaScript y datos propios que fallen.
//   2. Revisa que no se vea nada de solo administración ([data-solo-admin]) ni grupos de menú vacíos.
//   3. Prende y apaga cada casilla de amenazas y riesgos, trenes, anomalías y corporativo: anota cuántos objetos dice
//      la casilla («sin datos», 0 o el número) y si al apagarla quedan capas en el mapa.
//   4. Prende y apaga cada imagen satelital: debe aparecer su capa y, al apagarla, desaparecer (sin quedar pegada).
//   5. Prende y apaga cada categoría «en movimiento» (aviones, barcos, satélites…).
//   6. Abre cada página que el rol puede ver y anota errores.
// Salida: e2e/informe.json y e2e/informe.md (resumen por rol). Termina con código 1 si hay errores de JavaScript,
// imágenes que no se quitan o páginas que no cargan; capas vacías se informan sin fallar (pueden depender de la hora).
//
// Uso:  BASE=https://zoetzerlpetrov-gif.github.io/Geopolitica node tools/e2e/roles.mjs [rol ...]
//       (roles: admin demo recon analyst command; por omisión, todos)
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

// Playwright: PLAYWRIGHT_MODULE (ruta instalada en el flujo, como en grabar.mjs) o el paquete global (NODE_PATH).
const { chromium } = process.env.PLAYWRIGHT_MODULE ? createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE) : createRequire(import.meta.url)("playwright");

const BASE = (process.env.BASE || "http://127.0.0.1:8000").replace(/\/$/, "");
const RAIZ = new URL("../../", import.meta.url);
const planes = JSON.parse(readFileSync(new URL("config/planes.json", RAIZ), "utf8"));
const IDS_PLAN = planes.planes.map((p) => p.id);
const ROLES = process.argv.slice(2).length ? process.argv.slice(2) : ["admin", ...IDS_PLAN];
const ESPERA_CAPA_MS = Number(process.env.ESPERA_CAPA_MS || 25000);
const SALIDA = new URL("e2e/", RAIZ);

const consulta = (rol) => (rol === "admin" ? "?e2e=1" : `?vista=pago&plan=${rol}&e2e=1`);
const nivel = (id) => IDS_PLAN.indexOf(id);
const orden = (rol) => (rol === "admin" ? Infinity : nivel(rol));

/** Páginas que el rol puede abrir: admin, todas; pago, las de acceso_por_plan.paginas cuyo plan mínimo alcance. */
function paginasDe(rol) {
  const todas = readdirSync(RAIZ).filter((f) => f.endsWith(".html"));
  if (rol === "admin") return todas;
  const min = planes.acceso_por_plan?.paginas || {};
  return Object.entries(min).filter(([, p]) => nivel(p) <= orden(rol)).map(([f]) => f).filter((f) => todas.includes(f));
}

/** Errores de la página: JavaScript, consola y datos propios con HTTP ≥ 400 o sin respuesta. */
function vigilar(page, errores) {
  const propio = (u) => u.startsWith(BASE);
  page.on("pageerror", (e) => errores.push({ tipo: "js", msg: String(e.message || e).slice(0, 300) }));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|ERR_BLOCKED_BY_CLIENT/.test(m.text())) errores.push({ tipo: "consola", msg: m.text().slice(0, 300) }); });
  page.on("response", (r) => { if (propio(r.url()) && r.status() >= 400 && r.status() !== 304) errores.push({ tipo: "datos", msg: `HTTP ${r.status()} ${r.url().slice(BASE.length)}` }); });
  page.on("requestfailed", (r) => { if (propio(r.url()) && !/aborted|ERR_ABORTED/.test(r.failure()?.errorText || "")) errores.push({ tipo: "red", msg: `${r.failure()?.errorText} ${r.url().slice(BASE.length)}` }); });
}

/** Marca/desmarca una casilla aunque esté dentro de un <details> cerrado (sin depender de que sea visible). */
const alternar = (page, selector, valor) => page.evaluate(([s, v]) => {
  const cb = document.querySelector(s);
  if (!cb || cb.disabled) return false;
  cb.checked = v;
  cb.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}, [selector, valor]);

/** Capas del mapa cuyo id empieza con alguno de los prefijos. */
const capasMapa = (page, prefijos) => page.evaluate((p) => {
  const m = globalThis.__e2e?.map;
  return m ? m.getStyle().layers.map((l) => l.id).filter((id) => p.some((x) => id.startsWith(x))) : null;
}, prefijos);

async function probarRol(navegador, rol) {
  const r = { rol, errores: [], capas: [], imagenes: [], movimiento: [], paginas: [], solo_admin_visible: [], grupos_vacios: [] };
  const page = await navegador.newPage({ viewport: { width: 1440, height: 900 } });
  vigilar(page, r.errores);
  const t0 = Date.now();
  await page.goto(`${BASE}/index.html${consulta(rol)}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  // Con ?e2e=1 la app expone el mapa (globalThis.__e2e); un sitio publicado sin ese acceso se prueba igual, sin revisar capas.
  await page.waitForFunction(() => document.querySelector("[data-riesgo]") && (!globalThis.__e2e || globalThis.__e2e.arranque?.mapaListo), null, { timeout: 120000 })
    .catch(() => r.errores.push({ tipo: "arranque", msg: "el mapa o el menú de amenazas no terminó de cargar en 2 min" }));
  r.arranque_s = Math.round((Date.now() - t0) / 1000);

  if (rol !== "admin") {
    r.solo_admin_visible = await page.evaluate(() => [...document.querySelectorAll("[data-solo-admin]")].map((e) => (e.textContent || e.id).trim().slice(0, 80)));
    r.grupos_vacios = await page.evaluate(() => [...document.querySelectorAll("details.subgrupo-d")]
      .filter((d) => !d.querySelector("input[type=checkbox]")).map((d) => d.querySelector("summary")?.textContent.trim().slice(0, 80)));
  }

  // Casillas de capas (amenazas y riesgos, trenes, anomalías, corporativo).
  const ids = await page.evaluate(() => [...document.querySelectorAll("[data-riesgo]")].map((c) => ({ id: c.dataset.riesgo, nombre: c.closest("label")?.textContent.trim().slice(0, 120) })));
  for (const { id, nombre } of ids) {
    const antes = r.errores.length;
    if (!(await alternar(page, `[data-riesgo="${id}"]`, true))) { r.capas.push({ id, nombre, resultado: "deshabilitada" }); continue; }
    const marca = await page.waitForFunction((i) => { const t = document.getElementById(`rg-n-${i}`)?.textContent || ""; return t && t !== "cargando…" ? t : null; },
      id, { timeout: ESPERA_CAPA_MS }).then((h) => h.jsonValue()).catch(() => "sin respuesta en " + ESPERA_CAPA_MS / 1000 + " s");
    await alternar(page, `[data-riesgo="${id}"]`, false);
    await page.waitForTimeout(150);
    const restos = await capasMapa(page, [`rg-${id}`, `riesgo-${id}`, `${id}-`]);
    r.capas.push({ id, nombre, resultado: marca, ...(restos?.length ? { quedaron: restos } : {}), ...(r.errores.length > antes ? { errores: r.errores.slice(antes).map((e) => e.msg) } : {}) });
  }

  // Imágenes satelitales: deben aparecer y desaparecer.
  const imgs = await page.evaluate(() => [...document.querySelectorAll("[data-img]")].map((c) => c.dataset.img));
  for (const id of imgs) {
    await alternar(page, `[data-img="${id}"]`, true);
    const conMapa = await page.evaluate(() => !!globalThis.__e2e?.map);
    const puesta = !conMapa ? null : await page.waitForFunction((i) => !!globalThis.__e2e?.map?.getLayer(`img-${i}`), id, { timeout: 30000 }).then(() => true).catch(() => false);
    await alternar(page, `[data-img="${id}"]`, false);
    await page.waitForTimeout(400);
    const restos = await capasMapa(page, [`img-${id}`]);
    // Desmarcar en seco (sin esperar a que termine de buscar el día): no debe quedar pegada.
    await alternar(page, `[data-img="${id}"]`, true);
    await alternar(page, `[data-img="${id}"]`, false);
    await page.waitForTimeout(8000);
    const restosRapido = await capasMapa(page, [`img-${id}`]);
    r.imagenes.push({ id, aparece: puesta, quedo_al_quitar: restos || [], quedo_al_quitar_rapido: restosRapido || [] });
  }

  // En movimiento.
  const movs = await page.evaluate(() => [...document.querySelectorAll("[data-mov]")].map((c) => ({ id: c.dataset.mov, habilitada: !c.disabled })));
  for (const { id, habilitada } of movs) {
    if (!habilitada) { r.movimiento.push({ id, resultado: "deshabilitada (plan)" }); continue; }
    const antes = r.errores.length;
    await alternar(page, `[data-mov="${id}"]`, true);
    await page.waitForTimeout(6000);
    await alternar(page, `[data-mov="${id}"]`, false);
    r.movimiento.push({ id, resultado: r.errores.length > antes ? "con errores" : "ok", ...(r.errores.length > antes ? { errores: r.errores.slice(antes).map((e) => e.msg) } : {}) });
  }
  await page.close();

  // Páginas del rol.
  for (const f of paginasDe(rol)) {
    if (f === "index.html") continue;
    const p = await navegador.newPage();
    const errs = [];
    vigilar(p, errs);
    const resp = await p.goto(`${BASE}/${f}${consulta(rol).replace("&e2e=1", "").replace("?e2e=1", "")}`, { waitUntil: "load", timeout: 60000 }).catch((e) => ({ status: () => 0, e }));
    await p.waitForTimeout(2500);
    const bloqueada = await p.evaluate(() => /Sección no disponible|Disponible desde el plan/.test(document.body?.innerText || "")).catch(() => false);
    r.paginas.push({ pagina: f, http: resp.status(), bloqueada, errores: errs.map((e) => `${e.tipo}: ${e.msg}`) });
    await p.close();
  }
  return r;
}

function resumen(r) {
  const vacias = r.capas.filter((c) => /^0\b|sin datos|sin respuesta/.test(String(c.resultado)));
  const pegadas = r.imagenes.filter((i) => i.quedo_al_quitar.length || i.quedo_al_quitar_rapido.length);
  const sinImagen = r.imagenes.filter((i) => i.aparece === false);
  const paginasMal = r.paginas.filter((p) => p.http >= 400 || p.http === 0 || p.errores.some((e) => e.startsWith("js")));
  const js = r.errores.filter((e) => e.tipo === "js" || e.tipo === "arranque");
  return { vacias, pegadas, sinImagen, paginasMal, js, grave: js.length + pegadas.length + paginasMal.length + r.solo_admin_visible.length };
}

function markdown(resultados, inicio) {
  const l = [`# Pruebas integrales por rol`, ``, `Sitio: ${BASE} · inicio ${inicio} · fin ${new Date().toISOString()}`, ``];
  l.push(`| Rol | Arranque | Capas probadas | Vacías o sin datos | Imágenes (pegadas / sin imagen) | Páginas con error | Errores JS | Solo admin visible |`, `|---|---|---|---|---|---|---|---|`);
  for (const r of resultados) {
    const s = resumen(r);
    l.push(`| ${r.rol} | ${r.arranque_s} s | ${r.capas.length} | ${s.vacias.length} | ${s.pegadas.length} / ${s.sinImagen.length} | ${s.paginasMal.length} | ${s.js.length} | ${r.solo_admin_visible.length} |`);
  }
  for (const r of resultados) {
    const s = resumen(r);
    l.push(``, `## ${r.rol}`);
    if (s.js.length) l.push(``, `Errores de JavaScript:`, ...[...new Set(s.js.map((e) => e.msg))].map((m) => `- ${m}`));
    if (s.vacias.length) l.push(``, `Capas vacías o sin datos:`, ...s.vacias.map((c) => `- ${c.nombre} → ${c.resultado}`));
    if (s.pegadas.length) l.push(``, `Imágenes que no se quitaron:`, ...s.pegadas.map((i) => `- ${i.id}`));
    if (s.sinImagen.length) l.push(``, `Imágenes que no aparecieron en 30 s:`, ...s.sinImagen.map((i) => `- ${i.id}`));
    if (s.paginasMal.length) l.push(``, `Páginas con error:`, ...s.paginasMal.map((p) => `- ${p.pagina} (HTTP ${p.http}) ${p.errores.slice(0, 2).join(" · ")}`));
    if (r.solo_admin_visible.length) l.push(``, `Elementos de solo admin visibles:`, ...r.solo_admin_visible.map((x) => `- ${x}`));
    if (r.grupos_vacios.length) l.push(``, `Grupos del menú sin casillas:`, ...r.grupos_vacios.map((x) => `- ${x}`));
    const datos = [...new Set(r.errores.filter((e) => e.tipo === "datos" || e.tipo === "red").map((e) => e.msg))];
    if (datos.length) l.push(``, `Datos propios que fallaron:`, ...datos.slice(0, 40).map((m) => `- ${m}`));
  }
  return l.join("\n") + "\n";
}

const inicio = new Date().toISOString();
const navegador = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const resultados = [];
for (const rol of ROLES) {
  console.log(`== ${rol}`);
  try { resultados.push(await probarRol(navegador, rol)); }
  catch (e) { resultados.push({ rol, errores: [{ tipo: "arranque", msg: String(e.message || e) }], capas: [], imagenes: [], movimiento: [], paginas: [], solo_admin_visible: [], grupos_vacios: [], arranque_s: null }); }
  const s = resumen(resultados.at(-1));
  console.log(`   capas ${resultados.at(-1).capas.length} (vacías ${s.vacias.length}) · imágenes pegadas ${s.pegadas.length} · páginas con error ${s.paginasMal.length} · JS ${s.js.length}`);
}
await navegador.close();
mkdirSync(SALIDA, { recursive: true });
writeFileSync(new URL("informe.json", SALIDA), JSON.stringify({ base: BASE, inicio, fin: new Date().toISOString(), resultados }, null, 1));
writeFileSync(new URL("informe.md", SALIDA), markdown(resultados, inicio));
const graves = resultados.reduce((n, r) => n + resumen(r).grave, 0);
console.log(graves ? `${graves} problema(s) grave(s): ver e2e/informe.md` : "Sin problemas graves.");
process.exit(graves ? 1 : 0);
