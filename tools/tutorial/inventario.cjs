// Inventario de todas las opciones del menú izquierdo y de la barra superior de index.html, para el tutorial
// (tutorial.html). Abre el sitio servido localmente con Chromium, espera a que carguen los catálogos y guarda
// config/tutorial_inventario.json. Se vuelve a correr cuando cambian los menús:
//   python3 -m http.server 8765 &   node tools/tutorial/inventario.cjs [http://localhost:8765/]
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const URL_SITIO = process.argv[2] || "http://localhost:8765/";
const SALIDA = path.join(__dirname, "..", "..", "config", "tutorial_inventario.json");

(async () => {
  const navegador = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const p = await navegador.newPage({ viewport: { width: 1400, height: 900 } });
  await p.route(/^(?!http:\/\/localhost)/, (r) => r.abort());  // solo el sitio local: los catálogos son archivos propios
  await p.goto(URL_SITIO);
  await p.waitForTimeout(15000);
  const inv = await p.evaluate(() => {
    const txt = (e) => (e?.textContent || "").replace(/\s+/g, " ").trim();
    // Sin conteos («1,176 · desde zoom 3», «(30)»): cambian en cada actualización y no ayudan en el tutorial.
    const limpio = (t) => t.replace(/\s*[\d,.]+\s*·\s*desde zoom \d+/g, "").replace(/\s*sin datos en la última construcción.*$/, "")
      .replace(/\s*desde zoom \d+/g, "").replace(/\s*\(\d[\d,]*\)\s*$/, "").replace(/\s*\d[\d,]*\s*hoy$/, "").replace(/\s*\d[\d,]*\s*hoy$/, "").replace(/\s+\d[\d,]* (objetos|capas?|titulares)$/, "").trim();
    // Texto propio de la etiqueta, sin las opciones de su <select> ni las insignias de estado.
    const textoEtiqueta = (l) => { const c = l.cloneNode(true); c.querySelectorAll("select, .insignia, .badge, .estado-capa, .num").forEach((x) => x.remove());
      return txt(c).replace(/\s+(Estático|Retrasado|Estimado|En vivo|Diario|Horario)$/, ""); };
    const opciones = (cont) => [...cont.querySelectorAll("label, button.chip-sub")]
      .filter((l) => l.closest("details") === cont.closest("details"))
      .map((l) => ({ t: limpio(textoEtiqueta(l)), ayuda: l.title || l.querySelector("input,select")?.title || "" }))
      .filter((o) => o.t && o.t.length < 160 && !/^\d+ [^·]+ · /.test(o.t));  // sin filas de datos (p. ej. «656 Diriyah · Arabia Saudita»)
    const bloque = (d) => ({
      titulo: limpio(txt(d.querySelector(":scope > summary"))).replace(/(sin filtros|\d+ de \d+|\d+ titulares|\d+ ciudades.*|G\d · R\d.*)$/, "").replace(/\s*\d+$/, "").trim(),
      opciones: opciones(d),
      sub: [...d.querySelectorAll(":scope details")].filter((x) => x.parentElement.closest("details") === d)
        .map(bloque),
    });
    const panel = [...document.querySelectorAll("#panel > details.grupo, #panel details.grupo")].filter((d) => !d.parentElement.closest("details.grupo")).map(bloque);
    const secciones = [...document.querySelectorAll("a[href$='.html'], a[href*='.html?']")].filter((a) => a.closest("#menu-secciones, .menu-secciones, details") && !/^https?:/.test(a.getAttribute("href")))
      .map((a) => ({ t: txt(a), href: a.getAttribute("href"), ayuda: a.title || "" }));
    return { panel, secciones };
  });
  const dedup = (l) => l.filter((x, i, a) => a.findIndex((y) => y.t === x.t) === i);
  const podar = (b) => ({ ...b, opciones: dedup(b.opciones), sub: b.sub.map(podar) });
  const out = { generado: new Date().toISOString().slice(0, 10), nota: "Generado por tools/tutorial/inventario.cjs a partir de index.html.",
    panel: inv.panel.map(podar), secciones: dedup(inv.secciones) };
  fs.writeFileSync(SALIDA, JSON.stringify(out, null, 1));
  const cuenta = (b) => b.opciones.length + b.sub.reduce((s, x) => s + cuenta(x), 0);
  console.log(`${out.panel.length} grupos, ${out.panel.reduce((s, b) => s + cuenta(b), 0)} opciones, ${out.secciones.length} secciones → ${SALIDA}`);
  await navegador.close();
})();
