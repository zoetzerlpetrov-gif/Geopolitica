// Piezas visuales para la campaña de DOMINUS OSINT a partir de los borradores del día (vivos/marketing_borradores.json).
// Para cada borrador del día más reciente (máx. MAX_PIEZAS): publicación 1080×1350 (Instagram, Facebook, LinkedIn, X),
// historia 1080×1920 (Instagram/Facebook Stories) y, para los primeros MAX_SHORTS, un short vertical de ~15 s
// (YouTube Shorts, Reels, TikTok) sin audio: se le agrega música desde la biblioteca de cada red al publicarlo.
// No inventa nada: el texto es el mismo del borrador (cifra y fuente verificables).
// Uso: node tools/marketing/piezas.mjs vivos/marketing_borradores.json SALIDA
// Salida: SALIDA/indice.json, post-<id>.png, historia-<id>.png, short-<id>.mp4
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const MAX_PIEZAS = Number(process.env.MAX_PIEZAS || 4);
const MAX_SHORTS = Number(process.env.MAX_SHORTS || 2);
const DUR = 15, FPS = Number(process.env.FPS || 24);
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const plantilla = "file://" + path.join(path.dirname(fileURLToPath(import.meta.url)), "piezas.html");

/** Borradores del día más reciente, sin repetir tema, primero los de mayor interés (alerta y contraste). */
export function elegir(borradores, max = MAX_PIEZAS) {
  const lista = (borradores || []).filter((b) => b && b.titular && b.id);
  if (!lista.length) return [];
  const dia = lista.map((b) => b.fecha).sort().at(-1);
  const orden = { alerta: 0, contraste: 1, tendencia: 2, explicador: 3, herramienta: 4 };
  const vistos = new Set();
  return lista.filter((b) => b.fecha === dia).sort((a, b) => (orden[a.pilar] ?? 9) - (orden[b.pilar] ?? 9))
    .filter((b) => (vistos.has(b.tema) ? false : vistos.add(b.tema))).slice(0, max);
}
const seguro = (id) => String(id).replace(/[^A-Za-z0-9_-]/g, "_");

async function grabarShort(pagina, destino) {
  const ff = spawn("ffmpeg", ["-y", "-v", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-r", String(FPS), destino], { stdio: ["pipe", "inherit", "inherit"] });
  for (let k = 0; k < DUR * FPS; k++) {
    await pagina.evaluate((t) => window.aTiempo(t), k / FPS);
    const jpg = await pagina.screenshot({ type: "jpeg", quality: 88 });
    if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await new Promise((r, x) => ff.on("close", (c) => (c === 0 ? r() : x(new Error(`ffmpeg terminó con ${c}`)))));
}

async function main() {
  const [, , archivo, salida] = process.argv;
  if (!archivo || !salida) { console.error("Uso: node piezas.mjs marketing_borradores.json SALIDA"); process.exit(2); }
  mkdirSync(salida, { recursive: true });
  const datos = JSON.parse(readFileSync(archivo, "utf8"));
  const marca = (() => { try { return JSON.parse(readFileSync(path.join(raiz, "config", "marketing.json"), "utf8")); } catch { return {}; } })();
  const elegidos = elegir(datos.borradores);
  const indice = { generado_utc: new Date().toISOString().replace(/\.\d+Z$/, "Z"), fecha: elegidos[0]?.fecha || null, piezas: [] };
  if (!elegidos.length) { writeFileSync(path.join(salida, "indice.json"), JSON.stringify(indice, null, 1)); console.log("Sin borradores: no hay piezas."); return; }
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");  // solo al generar (las pruebas no lo necesitan)
  const nav = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const post = await nav.newPage({ viewport: { width: 1080, height: 1350 } });
  const vert = await nav.newPage({ viewport: { width: 1080, height: 1920 } });
  for (const p of [post, vert]) { await p.goto(plantilla); await p.evaluate(() => document.fonts.ready); }
  for (const [i, b] of elegidos.entries()) {
    const id = seguro(b.id), r = { id: b.id, titular: b.titular, pilar: b.pilar, fuente: b.fuente, fuente_url: b.fuente_url, textos: b.textos || {}, archivos: {} };
    await post.evaluate(([b, l]) => window.pieza(b, "post", l), [b, marca.lema]);
    await post.screenshot({ path: path.join(salida, `post-${id}.png`) }); r.archivos.post = `post-${id}.png`;
    await vert.evaluate(([b, l]) => window.pieza(b, "vertical", l), [b, marca.lema]);
    await vert.screenshot({ path: path.join(salida, `historia-${id}.png`) }); r.archivos.historia = `historia-${id}.png`;
    if (i < MAX_SHORTS && process.env.SIN_VIDEO !== "1") {
      await vert.evaluate(([b, l, d]) => window.pieza(b, "vertical", l, d), [b, marca.lema, DUR]);
      await grabarShort(vert, path.join(salida, `short-${id}.mp4`)); r.archivos.short = `short-${id}.mp4`;
    }
    indice.piezas.push(r);
    console.log(`pieza ${i + 1}/${elegidos.length}: ${b.id} → ${Object.values(r.archivos).join(", ")}`);
  }
  await nav.close();
  writeFileSync(path.join(salida, "indice.json"), JSON.stringify(indice, null, 1));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
