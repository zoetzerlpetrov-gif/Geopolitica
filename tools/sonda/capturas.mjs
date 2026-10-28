// Sonda temporal: estado y contenido de la textura de cada mosaico de TEMPO (se borra antes del PR).
import { chromium } from "./node_modules/playwright/index.mjs";
import fs from "node:fs";
fs.mkdirSync("capturas", { recursive: true });
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const log = [];
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
p.on("console", (m) => log.push(`console: ${m.text().slice(0, 300)}`));
await p.goto("http://localhost:8000/?sonda", { waitUntil: "load" }); await p.waitForTimeout(8000);
log.push("antes: " + await p.evaluate(() => JSON.stringify(Object.keys(window.__mapa.style.tileManagers))));
await p.evaluate(() => {
  window.__dec = [];
  const cib = window.createImageBitmap.bind(window);
  window.createImageBitmap = async (...a) => {
    const bmp = await cib(...a);
    try {
      const c = new OffscreenCanvas(bmp.width, bmp.height), x = c.getContext("2d"); x.drawImage(bmp, 0, 0);
      const px = x.getImageData(0, 128, bmp.width, 1).data; let s = 0, nz = 0; for (const v of px) { s = (s * 31 + v) >>> 0; if (v) nz++; }
      window.__dec.push(`${bmp.width}x${bmp.height} nz=${nz} h=${s.toString(16)} tam=${a[0]?.size ?? "?"}`);
    } catch (e) { window.__dec.push("error " + e); }
    return bmp;
  };
  const gl = window.__mapa.painter.context.gl;
  window.__glerr = () => { const l = []; for (let e = gl.getError(), i = 0; e && i < 20; e = gl.getError(), i++) l.push(e.toString(16)); return l.join(","); };
  window.__glerr();
  document.querySelector('[data-img="no2_tempo"]').click();
}); await p.waitForTimeout(30000);
await p.screenshot({ path: "capturas/tempo.png" });
log.push("errores GL: " + await p.evaluate(() => window.__glerr()));
log.push("decodificados:\n" + await p.evaluate(() => window.__dec.join("\n")));
log.push(await p.evaluate(() => {
  const m = window.__mapa, gl = m.painter.context.gl, out = [], vistos = new Map();
  const fb = gl.createFramebuffer();
  for (const [id, tm] of Object.entries(m.style.tileManagers)) {
    const tiles = tm._inViewTiles?.getAllTiles?.() || Object.values(tm._tiles || {});
    for (const t of tiles) {
      const tex = t.texture?.texture;
      let pix = "";
      if (tex) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        const px = new Uint8Array(4 * 256);
        gl.readPixels(0, 128, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let s = 0, nz = 0; for (const v of px) { s = (s * 31 + v) >>> 0; if (v) nz++; }
        pix = `fila128 hash=${s.toString(16)} noCero=${nz}`;
        if (vistos.has(tex)) pix += ` COMPARTIDA con ${vistos.get(tex)}`; else vistos.set(tex, `${id}:${t.tileID.key}`);
      }
      out.push(`${id} ${t.tileID.canonical.z}/${t.tileID.canonical.y}/${t.tileID.canonical.x} wrap=${t.tileID.wrap} estado=${t.state} tex=${!!tex} ${pix}`);
    }
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return out.filter((l) => l.startsWith("img-")).join("\n");
}));
fs.writeFileSync("capturas/registro.txt", log.join("\n"));
await b.close();
