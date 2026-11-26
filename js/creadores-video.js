// Estudio del creador → video con transiciones hecho en el navegador (canvas + MediaRecorder): fotos y clips propios o de
// una biblioteca libre (Wikimedia Commons), texto del guion en pantalla, marca del canal y audio opcional (narración
// grabada aquí mismo o un archivo de música/voz). Nada se sube a un servidor: el video se descarga en este equipo.
import { kenBurns, LIENZO, atribucion } from "./creadores-estudio-logica.js";

/** Carga una foto o un clip (File o URL) como elemento listo para dibujar. */
export function cargarMedio(fuente, extra = {}) {
  const url = typeof fuente === "string" ? fuente : URL.createObjectURL(fuente);
  const esVideo = typeof fuente === "string" ? /\.(webm|mp4|ogv|mov)(\?|$)/i.test(fuente) || extra.tipo === "video" : /^video\//.test(fuente.type);
  return new Promise((ok, mal) => {
    if (esVideo) {
      const v = document.createElement("video");
      Object.assign(v, { muted: true, playsInline: true, preload: "auto", crossOrigin: "anonymous", src: url });
      v.onloadeddata = () => ok({ tipo: "video", el: v, nombre: extra.titulo || fuente.name || "clip", ...extra });
      v.onerror = () => mal(new Error("No se pudo abrir el clip."));
    } else {
      const i = new Image();
      i.crossOrigin = "anonymous";
      i.onload = () => ok({ tipo: "imagen", el: i, nombre: extra.titulo || fuente.name || "imagen", ...extra });
      i.onerror = () => mal(new Error("No se pudo abrir la imagen."));
      i.src = url;
    }
  });
}

/** Busca imágenes o videos de licencia libre en Wikimedia Commons (sin llave; con autor y licencia para dar crédito). */
export async function buscarLibres(q, tipo = "imagen") {
  const filtro = tipo === "video" ? "filetype:video" : "filetype:bitmap";
  const u = new URL("https://commons.wikimedia.org/w/api.php");
  Object.entries({ action: "query", generator: "search", gsrsearch: `${filtro} ${q}`, gsrnamespace: "6", gsrlimit: "12", prop: "imageinfo",
    iiprop: "url|extmetadata|mime", iiurlwidth: "1280", format: "json", origin: "*" }).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { cache: "no-store" });
  if (!r.ok) throw new Error(`La biblioteca respondió ${r.status}.`);
  const d = await r.json();
  const texto = (h) => { const x = document.createElement("div"); x.innerHTML = String(h || ""); return (x.textContent || "").trim().slice(0, 120); };
  return Object.values(d.query?.pages || {}).map((p) => {
    const ii = p.imageinfo?.[0] || {}, m = ii.extmetadata || {};
    return { titulo: String(p.title || "").replace(/^File:|^Archivo:/, "").replace(/\.[a-z0-9]+$/i, ""), url: tipo === "video" ? ii.url : ii.thumburl || ii.url,
      miniatura: ii.thumburl || "", autor: texto(m.Artist?.value), licencia: texto(m.LicenseShortName?.value), fuente: "Wikimedia Commons", pagina: ii.descriptionurl || "", tipo };
  }).filter((x) => x.url && /^https:\/\/upload\.wikimedia\.org\//.test(x.url) && x.licencia);
}

/** Dibuja la imagen o el cuadro del clip cubriendo el lienzo (recorta lo que sobra), con el movimiento lento de la escena. */
function cubrir(ctx, el, W, H, mov) {
  const w = el.videoWidth || el.naturalWidth || el.width, h = el.videoHeight || el.naturalHeight || el.height;
  if (!w || !h) return;
  const esc = Math.max(W / w, H / h) * mov.escala;
  const dw = w * esc, dh = h * esc;
  ctx.drawImage(el, (W - dw) / 2 + mov.dx * W, (H - dh) / 2 + mov.dy * H, dw, dh);
}

function lineas(ctx, texto, ancho) {
  const out = []; let l = "";
  for (const p of String(texto || "").split(/\s+/).filter(Boolean)) {
    const prueba = l ? `${l} ${p}` : p;
    if (ctx.measureText(prueba).width > ancho && l) { out.push(l); l = p; } else l = prueba;
  }
  if (l) out.push(l);
  return out;
}

/** Texto de la escena en una franja inferior legible, y la marca del canal arriba. */
function rotulos(ctx, W, H, texto, estilo) {
  const tam = Math.round(Math.min(W, H) * (W < H ? 0.062 : 0.05));
  ctx.font = `800 ${tam}px system-ui, -apple-system, Segoe UI, sans-serif`;
  const ls = lineas(ctx, texto, W * 0.84).slice(0, 4);
  if (ls.length) {
    const alto = ls.length * tam * 1.25 + tam * 0.9, y0 = H * (W < H ? 0.72 : 0.78) - alto / 2;
    ctx.fillStyle = estilo.franja || "rgba(0,0,0,0.55)";
    ctx.fillRect(W * 0.05, y0, W * 0.9, alto);
    ctx.fillStyle = estilo.texto || "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "top";
    ls.forEach((l, i) => ctx.fillText(l, W / 2, y0 + tam * 0.45 + i * tam * 1.25));
  }
  if (estilo.marca) {
    ctx.font = `700 ${Math.round(tam * 0.55)}px system-ui, sans-serif`; ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(0,0,0,0.45)"; const w = ctx.measureText(estilo.marca).width;
    ctx.fillRect(W * 0.04, H * 0.035, w + tam * 0.6, tam * 0.95);
    ctx.fillStyle = estilo.acento || "#f9a825"; ctx.fillText(estilo.marca, W * 0.04 + tam * 0.3, H * 0.035 + tam * 0.2);
  }
}

/** Lámina final con los créditos de las imágenes libres (obligatorio por su licencia) y la marca. */
function creditos(ctx, W, H, medios, estilo) {
  ctx.fillStyle = estilo.fondo || "#0a0f17"; ctx.fillRect(0, 0, W, H);
  const tam = Math.round(Math.min(W, H) * 0.03);
  ctx.fillStyle = estilo.texto || "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.font = `800 ${tam * 1.6}px system-ui, sans-serif`; ctx.fillText(estilo.marca || "Gracias por ver", W / 2, H * 0.18);
  ctx.font = `600 ${tam}px system-ui, sans-serif`;
  const libres = medios.filter((m) => m.licencia);
  let y = H * 0.32;
  if (libres.length) { ctx.fillText("Créditos de imágenes y videos:", W / 2, y); y += tam * 1.8; }
  for (const m of libres.slice(0, 10)) for (const l of lineas(ctx, atribucion(m), W * 0.86)) { ctx.fillText(l, W / 2, y); y += tam * 1.35; }
}

/**
 * Dibuja el instante `t` (segundos) del video. escenas: [{ texto, medio, dur }]; medios: [{ el, tipo, ... }].
 * Transición: la siguiente escena aparece encima con un fundido de `fundido` segundos.
 */
export function dibujarInstante(ctx, W, H, t, escenas, medios, estilo = {}, fundido = 0.6) {
  ctx.fillStyle = estilo.fondo || "#000"; ctx.fillRect(0, 0, W, H);
  let ini = 0, k = 0;
  while (k < escenas.length && t >= ini + escenas[k].dur) { ini += escenas[k].dur; k++; }
  if (k >= escenas.length) { creditos(ctx, W, H, medios, estilo); return { escena: -1 }; }
  const pintar = (j, local, alfa) => {
    const e = escenas[j], m = medios[e.medio];
    ctx.globalAlpha = alfa;
    if (m) cubrir(ctx, m.el, W, H, m.tipo === "video" ? { escala: 1, dx: 0, dy: 0 } : kenBurns(Math.min(1, local / e.dur), j));
    else { ctx.fillStyle = estilo.fondo || "#0a0f17"; ctx.fillRect(0, 0, W, H); }
    rotulos(ctx, W, H, e.texto, estilo);
    ctx.globalAlpha = 1;
  };
  const local = t - ini, e = escenas[k];
  pintar(k, local, Math.min(1, local / fundido + (k === 0 ? 0 : 1)));
  if (local > e.dur - fundido && k + 1 < escenas.length) pintar(k + 1, 0, (local - (e.dur - fundido)) / fundido);
  return { escena: k };
}

/** Formato de video que este navegador puede grabar (MP4 si se puede: lo aceptan todas las redes). */
export function formatoGrabacion() {
  const opciones = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return (typeof MediaRecorder !== "undefined" && opciones.find((m) => MediaRecorder.isTypeSupported(m))) || "";
}

/**
 * Graba el video completo en tiempo real y devuelve { blob, tipo, segundos }.
 * op = { canvas, escenas, medios, estilo, audio (File|Blob|null), creditosSeg, alProgreso(0..1), senal (AbortSignal) }
 */
export async function grabarVideo({ canvas, escenas, medios, estilo = {}, audio = null, creditosSeg = 3, alProgreso = () => {}, senal = null }) {
  const tipo = formatoGrabacion();
  if (!tipo || !canvas.captureStream) throw new Error("Este navegador no puede grabar video. Usa Chrome, Edge o Firefox actualizados en computadora.");
  const [W, H] = [canvas.width, canvas.height], ctx = canvas.getContext("2d");
  const total = escenas.reduce((s, e) => s + e.dur, 0) + (medios.some((m) => m.licencia) || estilo.marca ? creditosSeg : 0);
  const flujo = canvas.captureStream(30);
  let audioCtx = null, pista = null;
  if (audio) {
    audioCtx = new AudioContext();
    pista = new Audio(URL.createObjectURL(audio));
    const fuente = audioCtx.createMediaElementSource(pista), destino = audioCtx.createMediaStreamDestination();
    fuente.connect(destino);
    destino.stream.getAudioTracks().forEach((a) => flujo.addTrack(a));
  }
  const partes = [], rec = new MediaRecorder(flujo, { mimeType: tipo, videoBitsPerSecond: 6_000_000 });
  rec.ondataavailable = (e) => { if (e.data.size) partes.push(e.data); };
  const fin = new Promise((ok) => { rec.onstop = ok; });
  let actual = -2;
  const reproducirClip = (k) => {
    for (const m of medios) if (m.tipo === "video") m.el.pause();
    const m = k >= 0 ? medios[escenas[k].medio] : null;
    if (m?.tipo === "video") { m.el.currentTime = 0; m.el.loop = true; m.el.play().catch(() => {}); }
  };
  rec.start(500);
  if (pista) { await audioCtx.resume(); pista.currentTime = 0; pista.play().catch(() => {}); }
  const t0 = performance.now();
  await new Promise((ok) => {
    const paso = () => {
      const t = (performance.now() - t0) / 1000;
      if (t >= total || senal?.aborted) return ok();
      const { escena } = dibujarInstante(ctx, W, H, t, escenas, medios, estilo);
      if (escena !== actual) { actual = escena; reproducirClip(escena); }
      alProgreso(t / total);
      requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  });
  rec.stop(); await fin;
  reproducirClip(-1);
  if (pista) { pista.pause(); audioCtx.close(); }
  alProgreso(1);
  return { blob: new Blob(partes, { type: tipo.split(";")[0] }), tipo: tipo.split(";")[0], segundos: Math.round(total) };
}

/** Graba la voz con el micrófono hasta que se llame a detener(). Devuelve { detener: () => Promise<Blob> }. */
export async function grabarVoz() {
  const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const partes = [], rec = new MediaRecorder(s);
  rec.ondataavailable = (e) => { if (e.data.size) partes.push(e.data); };
  rec.start(250);
  return { detener: () => new Promise((ok) => { rec.onstop = () => { s.getTracks().forEach((x) => x.stop()); ok(new Blob(partes, { type: rec.mimeType || "audio/webm" })); }; rec.stop(); }) };
}

export { LIENZO };
