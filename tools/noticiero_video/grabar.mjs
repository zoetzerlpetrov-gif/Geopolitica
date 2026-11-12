// Graba cada escena de Brújula Diaria cuadro por cuadro con Chromium (Playwright) y la codifica con ffmpeg.
// Uso: node grabar.mjs escenas.json DIR_SALIDA
// escenas.json: {"meta": {fecha, titulares:[{s,t}]}, "escenas": [{...escena, dur}]} → DIR_SALIDA/NN.video.mp4 (sin audio)
// Cada cuadro: window.aTiempo(t) congela todas las animaciones CSS en el instante t; así el video es fluido y repetible.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const FPS = Number(process.env.FPS || 25);
const [, , archivo, salida] = process.argv;
const { meta, escenas } = JSON.parse(readFileSync(archivo, "utf8"));
const plantilla = "file://" + path.join(path.dirname(fileURLToPath(import.meta.url)), "plantilla.html");

const opciones = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const navegador = await chromium.launch(opciones);
const pagina = await navegador.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await pagina.goto(plantilla);

for (const [i, e] of escenas.entries()) {
  const destino = path.join(salida, `${String(i + 1).padStart(2, "0")}.video.mp4`);
  await pagina.evaluate(([e, m]) => window.escena(e, m), [e, { ...meta, dur: e.dur, t0: e.t0 || 0, cortina: i > 0 && e.tipo !== "cierre" }]);
  await pagina.evaluate(() => document.fonts.ready);
  const ff = spawn("ffmpeg", ["-y", "-v", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(FPS), destino], { stdio: ["pipe", "inherit", "inherit"] });
  const cuadros = Math.max(1, Math.round(e.dur * FPS));
  for (let k = 0; k < cuadros; k++) {
    await pagina.evaluate((t) => window.aTiempo(t), k / FPS);
    const jpg = await pagina.screenshot({ type: "jpeg", quality: 88 });
    if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await new Promise((r, x) => ff.on("close", (c) => (c === 0 ? r() : x(new Error(`ffmpeg ${c}`)))));
  if (i === 0) await pagina.evaluate((t) => window.aTiempo(t), Math.min(e.dur - 0.1, 3)), await pagina.screenshot({ path: path.join(salida, "..", "miniatura.png") });
  console.log(`escena ${i + 1}/${escenas.length}: ${e.tipo} · ${cuadros} cuadros`);
}
await navegador.close();
