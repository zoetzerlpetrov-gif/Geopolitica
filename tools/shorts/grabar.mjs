// Graba cada escena del short (plantilla.html, 1080×1920) cuadro por cuadro con Chromium y la codifica con ffmpeg.
// Uso: node grabar.mjs escenas.json DIR → DIR/NN.video.mp4 (sin audio) y DIR/miniatura.png (de la portada).
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

const nav = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const p = await nav.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await p.goto(plantilla);
for (const [i, e] of escenas.entries()) {
  await p.evaluate(([e, m]) => window.escena(e, m), [e, meta]);
  await p.evaluate(() => document.fonts.ready);
  const destino = path.join(salida, `${String(i + 1).padStart(2, "0")}.video.mp4`);
  const ff = spawn("ffmpeg", ["-y", "-v", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(FPS), destino], { stdio: ["pipe", "inherit", "inherit"] });
  const cuadros = Math.max(1, Math.round(e.dur * FPS));
  for (let k = 0; k < cuadros; k++) {
    await p.evaluate((t) => window.aTiempo(t), k / FPS);
    const jpg = await p.screenshot({ type: "jpeg", quality: 88 });
    if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await new Promise((r, x) => ff.on("close", (c) => (c === 0 ? r() : x(new Error(`ffmpeg ${c}`)))));
  if (i === 0) { await p.evaluate(() => window.aTiempo(3)); await p.screenshot({ path: path.join(salida, "miniatura.png") }); }
  console.log(`escena ${i + 1}/${escenas.length}: ${e.tipo} · ${cuadros} cuadros`);
}
await nav.close();
