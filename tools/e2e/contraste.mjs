// Contraste de textos (WCAG 2.2 AA: 4.5:1 texto normal, 3:1 texto grande) en cada página, con tema claro y oscuro.
// Abre todos los <details> y pestañas para medir también lo que está plegado. Se omiten textos sobre imágenes,
// textos con relleno degradado y lo que está dentro del mapa (canvas). Informativo: nunca falla la corrida.
// Uso: BASE=http://127.0.0.1:8000 node tools/e2e/contraste.mjs   (PAGS=a.html,b.html para limitar)
// Salida: e2e/contraste.json y e2e/contraste.md
import { createRequire } from "node:module";
import { readdirSync, writeFileSync, mkdirSync } from "node:fs";
const { chromium } = process.env.PLAYWRIGHT_MODULE ? createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE) : createRequire(import.meta.url)("playwright");
const RAIZ = new URL("../../", import.meta.url).pathname;
const BASE = (process.env.BASE || "http://127.0.0.1:8000").replace(/\/$/, "");
const pags = (process.env.PAGS ? process.env.PAGS.split(",") : readdirSync(RAIZ).filter(f => f.endsWith(".html")));
const b = await chromium.launch();
const total = {};
for (const tema of ["light", "dark"]) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, colorScheme: tema });
  await ctx.addInitScript((t) => { try { localStorage.setItem("gp_theme", t); } catch {} }, tema);
  for (const pg of pags) {
    const p = await ctx.newPage();
    try { await p.goto(`${BASE}/${pg}?e2e=1`, { waitUntil: "load", timeout: 45000 }); } catch { await p.close(); continue; }
    await p.waitForTimeout(pg === "index.html" ? 7000 : 2500);
    await p.evaluate(() => { document.querySelectorAll("details").forEach((d) => (d.open = true)); document.querySelectorAll("section.panel[hidden],[role=tabpanel][hidden]").forEach((x) => (x.hidden = false)); }).catch(() => {});
    await p.waitForTimeout(800);
    const malos = await p.evaluate(() => {
      const rgb = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [r, g, b, a]; };
      const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const mezcla = (fg, bg) => [0, 1, 2].map(i => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
      function fondo(el) {
        const capas = [];
        for (let e = el; e; e = e.parentElement) {
          const cs = getComputedStyle(e);
          if (cs.backgroundImage && cs.backgroundImage !== "none" && !/gradient/.test(cs.backgroundImage)) return null; // imagen: no se puede medir
          const c = rgb(cs.backgroundColor); if (c && c[3] > 0) { capas.push(c); if (c[3] >= 1) break; }
          if (+cs.opacity < 1) return null;
        }
        let bg = [255, 255, 255];
        for (const c of capas.reverse()) bg = mezcla(c, bg);
        return bg;
      }
      const cs0 = (e) => getComputedStyle(e);
      const out = []; const vistos = new Set();
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) {
        const t = n.textContent.trim(); if (t.length < 2) continue;
        const el = n.parentElement; if (!el || vistos.has(el)) continue; vistos.add(el);
        if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
        if (/text/.test(cs0(el).backgroundClip || "") || cs0(el).webkitTextFillColor === "transparent") continue;
        if (el.closest("svg,canvas,.maplibregl-canvas-container,[aria-hidden=true]")) continue;
        const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
        const cs = getComputedStyle(el); const fg = rgb(cs.color); if (!fg) continue;
        const bg = fondo(el); if (!bg) continue;
        const L1 = lum(mezcla(fg, bg)), L2 = lum(bg); const cr = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        const px = parseFloat(cs.fontSize), grande = px >= 24 || (px >= 18.66 && +cs.fontWeight >= 700);
        if (cr < (grande ? 3 : 4.5)) out.push({ t: t.slice(0, 50), cr: +cr.toFixed(2), color: cs.color, fondo: `rgb(${bg.map(Math.round).join(",")})`, sel: el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0,2).join(".") : "") });
      }
      return out;
    }).catch(() => []);
    if (malos.length) { total[`${pg} [${tema}]`] = malos; }
    await p.close();
  }
  await ctx.close();
}
await b.close();
mkdirSync(new URL("e2e/", `file://${RAIZ}`), { recursive: true });
writeFileSync(new URL("e2e/contraste.json", `file://${RAIZ}`), JSON.stringify(total, null, 1));
const md = ["## Contraste de textos (WCAG AA)", "", Object.keys(total).length ? "| Página [tema] | Textos bajo el mínimo | Ejemplos |" : "Sin textos bajo el mínimo en tema claro ni oscuro.", ...(Object.keys(total).length ? ["|---|---|---|"] : []),
  ...Object.entries(total).map(([k, v]) => `| ${k} | ${v.length} | ${v.slice(0, 3).map((x) => `${x.sel} «${x.t.replace(/[|]/g, "/")}» ${x.cr}:1`).join("; ")} |`)];
writeFileSync(new URL("e2e/contraste.md", `file://${RAIZ}`), md.join("\n") + "\n");
for (const [k, v] of Object.entries(total)) console.log(k, v.length);
console.log(`Contraste: ${Object.values(total).reduce((s, v) => s + v.length, 0)} textos bajo el mínimo en ${Object.keys(total).length} página(s)/tema(s).`);
