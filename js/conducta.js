// Página «Conducta y escritura»: lenguaje corporal (video/foto) y grafología (imagen). Todo local en el navegador.
import { AVISO_CONDUCTA, rasgosCuadro, mapaBlend, eventosDeSerie, lineaBasePorOmision, lectura, senalDeAuto, reloj, tipoEnlace, REGLAS } from "./conducta-logica.js";
import { medir } from "./grafo-medir.js";
import { AVISO, clasificar, clasificarFirma, informe, clave } from "./grafo-logica.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const estado = (t, error = false) => { $("estado").textContent = t; $("estado").style.color = error ? "#C62828" : ""; };
const descargar = (nombre, obj) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: "application/json" })); a.download = nombre; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
const fx = (v, d = 1) => (v == null || Number.isNaN(v) ? "—" : Number(v).toFixed(d));

// ---------- pestañas ----------
for (const b of document.querySelectorAll(".pestanas button")) b.onclick = () => {
  for (const o of document.querySelectorAll(".pestanas button")) { o.setAttribute("aria-selected", String(o === b)); $(o.dataset.panel).hidden = o !== b; }
  try { history.replaceState(null, "", `#${b.dataset.panel === "p-grafo" ? "grafologia" : "cuerpo"}`); } catch (e) { /* nada */ }
};
if (location.hash === "#grafologia") document.querySelector('[data-panel="p-grafo"]').click();

const [CAT_C, CAT_G] = await Promise.all([fetch("config/lenguaje_corporal.json").then((r) => r.json()), fetch("config/grafologia.json").then((r) => r.json())]);
$("c-aviso").textContent = AVISO_CONDUCTA;
$("g-aviso").textContent = AVISO;
$("c-principios").innerHTML = `<ol>${CAT_C.principios.map((p) => `<li><b>${esc(p.nombre)}.</b> ${esc(p.texto)}</li>`).join("")}</ol><p class="meta">${esc(CAT_C.fuente)}</p>`;

// ---------- imágenes HEIC (fotos de iPhone y algunos Android) ----------
async function aImagen(file) {
  try { return await createImageBitmap(file); } catch (e) { /* formato no soportado de forma nativa */ }
  if (/\.(heic|heif)$/i.test(file.name) || /hei[cf]/i.test(file.type)) {
    estado("Convirtiendo la foto HEIC en el navegador…");
    if (!window.heic2any) await new Promise((ok, mal) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js"; s.onload = ok; s.onerror = () => mal(new Error("No se pudo cargar el convertidor de HEIC.")); document.head.appendChild(s); });
    const jpg = await window.heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
    return createImageBitmap(Array.isArray(jpg) ? jpg[0] : jpg);
  }
  throw new Error("No pude abrir esa imagen. Prueba con JPEG, PNG, WebP o HEIC.");
}

// =====================================================================
// LENGUAJE CORPORAL
// =====================================================================
const MP = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const MODELO_CARA = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const MODELO_POSE = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
let medio = null, marcas = [], auto = null, foto = null, detener = false, yt = null;
const crono = { inicio: null, acumulado: 0, timer: null };
const tiempoCrono = () => crono.acumulado + (crono.inicio ? (performance.now() - crono.inicio) / 1000 : 0);

function tiempoActual() {
  if (medio?.tipo === "video") return medio.el.currentTime;
  if (medio?.tipo === "youtube" && yt?.getCurrentTime) return yt.getCurrentTime();
  return tiempoCrono();
}
function irA(t) {
  if (medio?.tipo === "video") { medio.el.currentTime = Math.max(0, t); medio.el.scrollIntoView({ block: "center", behavior: "smooth" }); }
  else if (medio?.tipo === "youtube" && yt?.seekTo) yt.seekTo(Math.max(0, t), true);
}

// botones de señales por zona (plegables) y guía completa
const ayuda = (s) => [s.como && `Qué observar: ${s.como}`, s.lectura && `Lectura frecuente: ${s.lectura}`, s.alternativas && `Otras explicaciones: ${s.alternativas}`, s.nota].filter(Boolean).join("\n");
$("c-zonas").innerHTML = CAT_C.zonas.map((z, i) => { const ss = CAT_C.senales.filter((s) => s.zona === z.id); return `<details ${i < 4 ? "open" : ""}><summary>${esc(z.nombre)} (${ss.length})</summary>${ss.map((s) => `<button type="button" data-senal="${esc(s.id)}" class="${s.auto ? "auto" : ""}" title="${esc(ayuda(s))}">${esc(s.nombre)}</button>`).join("")}</details>`; }).join("");
function pintarGuia(filtro = "") {
  const q = filtro.trim().toLowerCase();
  const pasa = (s) => !q || [s.nombre, s.como, s.lectura, s.alternativas, ...s.estados.map((e) => CAT_C.estados[e].nombre)].join(" ").toLowerCase().includes(q);
  $("c-guia-n").textContent = `(${CAT_C.senales.length} señales en ${CAT_C.zonas.length} zonas)`;
  $("c-guia").innerHTML = CAT_C.zonas.map((z) => {
    const ss = CAT_C.senales.filter((s) => s.zona === z.id && pasa(s)); if (!ss.length) return "";
    return `<div class="guia-zona"><h3>${esc(z.nombre)}</h3><div class="desliza"><table class="t"><tr><th>Señal</th><th>Qué observar</th><th>Lectura frecuente</th><th>Otras explicaciones</th><th>Apunta a</th></tr>
      ${ss.map((s) => `<tr><td><b>${esc(s.nombre)}</b>${s.auto ? " 🤖" : ""}</td><td>${esc(s.como || "")}</td><td>${esc(s.lectura || "")}</td><td>${esc(s.alternativas || "—")}</td><td>${esc(s.estados.map((e) => CAT_C.estados[e].nombre).join(", "))}</td></tr>`).join("")}</table></div></div>`;
  }).join("") || `<p class="meta">Nada coincide con «${esc(filtro)}».</p>`;
}
pintarGuia();
$("c-guia-buscar").oninput = (e) => pintarGuia(e.target.value);
$("c-emociones").innerHTML = `<table class="t"><tr><th>Emoción</th><th>Signos en el rostro</th></tr>${(CAT_C.emociones || []).map((e) => `<tr><td><b>${esc(e.nombre)}</b></td><td>${esc(e.signos)}</td></tr>`).join("")}</table><p class="meta">${esc(CAT_C.fuente_emociones || "")}</p>`;
$("c-entrevista").innerHTML = `<ol>${(CAT_C.entrevista || []).map((t) => `<li>${esc(t)}</li>`).join("")}</ol><p class="aviso">${esc(CAT_C.evidencia || "")}</p>`;
$("c-zonas").addEventListener("click", (e) => {
  const b = e.target.closest("[data-senal]"); if (!b) return;
  const t = tiempoActual();
  marcas.push({ senal: b.dataset.senal, t0: t, t1: t + 1, origen: "manual", nota: $("c-nota").value.trim(), enBase: false });
  $("c-nota").value = "";
  b.style.outline = "2px solid #2E7D32"; setTimeout(() => { b.style.outline = ""; }, 400);
  pintarResultado();
});

function limpiarMedio() {
  if (medio?.url) URL.revokeObjectURL(medio.url);
  medio = null; auto = null; foto = null; yt = null; $("c-medio").innerHTML = ""; $("c-auto-caja").hidden = true; $("c-crono").hidden = true;
}
function mostrarCrono() { $("c-crono").hidden = false; }
setInterval(() => { if (!$("c-crono").hidden) $("c-crono-t").textContent = reloj(tiempoCrono()); }, 250);
$("c-crono-ini").onclick = () => { if (!crono.inicio) crono.inicio = performance.now(); };
$("c-crono-pausa").onclick = () => { if (crono.inicio) { crono.acumulado += (performance.now() - crono.inicio) / 1000; crono.inicio = null; } };
$("c-crono-cero").onclick = () => { crono.inicio = null; crono.acumulado = 0; };

$("c-archivo").onchange = async (e) => {
  const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
  limpiarMedio();
  try {
    if (f.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|ogv|3gp)$/i.test(f.name)) {
      const url = URL.createObjectURL(f), v = document.createElement("video");
      Object.assign(v, { src: url, controls: true, playsInline: true, preload: "auto" });
      $("c-medio").appendChild(v); medio = { tipo: "video", el: v, url, nombre: f.name, analizable: true };
      v.onloadedmetadata = () => { const [b0, b1] = lineaBasePorOmision(v.duration || 0); $("c-b0").value = Math.round(b0); $("c-b1").value = Math.round(b1); };
      prepararAuto(false);
      estado(`Video listo: ${f.name}. No se sube a ningún lado.`);
    } else {
      const bmp = await aImagen(f), c = document.createElement("canvas");
      c.width = bmp.width; c.height = bmp.height; c.getContext("2d").drawImage(bmp, 0, 0); c.style.maxWidth = "100%"; c.style.maxHeight = "60vh";
      $("c-medio").appendChild(c); medio = { tipo: "imagen", el: c, nombre: f.name, analizable: true };
      prepararAuto(true);
      estado(`Foto lista: ${f.name}. Una foto es un instante: sirve para describir la postura y la expresión, no para ver cambios.`);
    }
  } catch (err) { estado(err.message, true); }
};

$("c-usar-url").onclick = () => {
  const info = tipoEnlace($("c-url").value.trim());
  limpiarMedio();
  if (info.tipo === "invalido") { estado("Escribe un enlace que empiece con https://", true); return; }
  if (info.tipo === "youtube") {
    $("c-medio").innerHTML = `<div id="c-yt"></div><p class="meta">Reproductor oficial de YouTube (modo sin cookies de seguimiento). Las marcas toman el segundo del video. El análisis automático no es posible: YouTube no permite leer los cuadros.</p>`;
    medio = { tipo: "youtube", id: info.id };
    const crear = () => { yt = new window.YT.Player("c-yt", { host: "https://www.youtube-nocookie.com", videoId: info.id, playerVars: { rel: 0, playsinline: 1 } }); };
    if (window.YT?.Player) crear(); else { window.onYouTubeIframeAPIReady = crear; const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(s); }
    estado("Video de YouTube listo para marcar señales a mano.");
  } else if (info.tipo === "vimeo") {
    $("c-medio").innerHTML = `<iframe src="${esc(info.inserta)}" allow="fullscreen; picture-in-picture" title="Video de Vimeo"></iframe>`;
    medio = { tipo: "vimeo" }; mostrarCrono();
    estado("Video de Vimeo listo. Arranca el cronómetro junto con el video para marcar señales.");
  } else if (info.tipo === "archivo") {
    const v = document.createElement("video");
    Object.assign(v, { crossOrigin: "anonymous", src: info.url, controls: true, playsInline: true, preload: "auto" });
    $("c-medio").appendChild(v); medio = { tipo: "video", el: v, nombre: info.url, analizable: true };
    v.onloadedmetadata = () => { const [b0, b1] = lineaBasePorOmision(v.duration || 0); $("c-b0").value = Math.round(b0); $("c-b1").value = Math.round(b1); prepararAuto(false); };
    v.onerror = () => {
      // Sin permiso CORS: se puede ver y marcar a mano, pero no leer los cuadros.
      const w = document.createElement("video"); Object.assign(w, { src: info.url, controls: true, playsInline: true });
      $("c-medio").innerHTML = ""; $("c-medio").appendChild(w); medio = { tipo: "video", el: w, nombre: info.url, analizable: false }; $("c-auto-caja").hidden = true;
      estado("El sitio no permite leer los cuadros de ese video desde otra página (CORS). Puedes verlo y marcar a mano; para el análisis automático, descárgalo y súbelo como archivo.");
    };
    estado("Cargando el video del enlace…");
  } else {
    const donde = info.tipo === "red_social" ? `${info.sitio} (red social)` : info.tipo === "nube" ? `${info.sitio} (nube)` : info.sitio;
    $("c-medio").innerHTML = `<p class="aviso">No descargo ni leo videos de ${esc(donde)}: sus términos de uso no lo permiten a herramientas externas. Opciones:</p>
      <ol class="meta"><li><a href="${esc($("c-url").value.trim())}" target="_blank" rel="noopener noreferrer">Abre el video en su sitio</a> en otra ventana, arranca el cronómetro de abajo al mismo tiempo y marca las señales aquí.</li>
      <li>Si el video es tuyo o tienes permiso, descárgalo con la opción oficial de la app (por ejemplo «Guardar video») o desde tu nube, y súbelo con «Subir video o foto» para el análisis automático.</li></ol>`;
    medio = { tipo: "externo" }; mostrarCrono();
    estado("Enlace externo: marca a mano con el cronómetro.");
  }
};

function prepararAuto(esFoto) {
  $("c-auto-caja").hidden = false;
  for (const id of ["c-b0", "c-b1", "c-fps"]) $(id).closest("label").hidden = esFoto;
  $("c-analizar").textContent = esFoto ? "🔍 Analizar la foto" : "🔍 Analizar el video";
}

let det = null;
async function detectores(modo, conPose) {
  if (!det) {
    estado("Descargando los modelos de detección (≈ 10 MB, solo la primera vez)…");
    const v = await import(`${MP}/vision_bundle.mjs`);
    const fs = await v.FilesetResolver.forVisionTasks(`${MP}/wasm`);
    const crear = async (Clase, modelo, extra) => {
      try { return await Clase.createFromOptions(fs, { baseOptions: { modelAssetPath: modelo, delegate: "GPU" }, runningMode: modo, ...extra }); }
      catch (e) { return Clase.createFromOptions(fs, { baseOptions: { modelAssetPath: modelo, delegate: "CPU" }, runningMode: modo, ...extra }); }
    };
    det = { modo, cara: await crear(v.FaceLandmarker, MODELO_CARA, { numFaces: 1, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: false }), pose: null, v, crear };
  }
  if (conPose && !det.pose) det.pose = await det.crear(det.v.PoseLandmarker, MODELO_POSE, { numPoses: 1 });
  if (det.modo !== modo) { await det.cara.setOptions({ runningMode: modo }); if (det.pose) await det.pose.setOptions({ runningMode: modo }); det.modo = modo; }
  return det;
}

const buscar = (v, t) => new Promise((ok) => { const fin = () => { v.removeEventListener("seeked", fin); ok(); }; v.addEventListener("seeked", fin); v.currentTime = t; });

$("c-detener").onclick = () => { detener = true; };
$("c-analizar").onclick = async () => {
  if (!medio?.analizable) return;
  const conPose = $("c-pose").checked;
  $("c-analizar").disabled = true;
  try {
    if (medio.tipo === "imagen") {
      const d = await detectores("IMAGE", conPose);
      const rc = d.cara.detect(medio.el), rp = d.pose ? d.pose.detect(medio.el) : null;
      if (!rc.faceLandmarks?.length && !rp?.landmarks?.length) throw new Error("No encontré un rostro ni un cuerpo en la foto.");
      const f = rasgosCuadro({ b: rc.faceBlendshapes?.[0] ? mapaBlend(rc.faceBlendshapes[0].categories) : null, cara: rc.faceLandmarks?.[0] || null, pose: rp?.landmarks?.[0] || null, ancho: medio.el.width, alto: medio.el.height });
      foto = Object.entries(REGLAS).filter(([k, r]) => (f[k] ?? 0) >= r.umbral).map(([k]) => ({ senal: k, t0: 0, t1: 0, origen: "automático", enBase: false, detalle: `valor ${fx(f[k], 2)}` }));
      if (Number.isFinite(f.roll) && Math.abs(f.roll) > 12) foto.push({ senal: "cabeza_ladeada", t0: 0, t1: 0, origen: "automático", enBase: false, detalle: `${fx(f.roll, 0)}°` });
      estado(`Foto analizada: ${foto.length} señal(es) presentes. ${rc.faceLandmarks?.length ? "" : "No se vio el rostro. "}${conPose && !rp?.landmarks?.length ? "No se vio el cuerpo." : ""}`);
    } else {
      const v = medio.el, dur = v.duration;
      if (!Number.isFinite(dur) || dur <= 0) throw new Error("El video aún no está listo; espera a que cargue.");
      if (dur > 600 && !confirm(`El video dura ${reloj(dur)}. El análisis puede tardar varios minutos. ¿Continuar?`)) return;
      const d = await detectores("VIDEO", conPose), fps = Number($("c-fps").value), paso = 1 / fps, cuadros = [];
      detener = false; $("c-detener").hidden = false; $("c-progreso").hidden = false; v.pause();
      let sinCara = 0;
      for (let t = 0; t <= dur && !detener; t += paso) {
        await buscar(v, t);
        const ms = Math.round(t * 1000) + 1;
        const rc = d.cara.detectForVideo(v, ms), rp = d.pose ? d.pose.detectForVideo(v, ms) : null;
        if (!rc.faceLandmarks?.length) sinCara++;
        cuadros.push({ t, f: rasgosCuadro({ b: rc.faceBlendshapes?.[0] ? mapaBlend(rc.faceBlendshapes[0].categories) : null, cara: rc.faceLandmarks?.[0] || null, pose: rp?.landmarks?.[0] || null, ancho: v.videoWidth, alto: v.videoHeight }) });
        $("c-progreso").value = t / dur;
        if (cuadros.length % 10 === 0) { estado(`Analizando ${reloj(t)} de ${reloj(dur)}…`); await new Promise((r) => setTimeout(r, 0)); }
      }
      const b0 = Number($("c-b0").value) || 0, b1 = Math.max(b0 + 1, Number($("c-b1").value) || lineaBasePorOmision(dur)[1]);
      auto = { ...eventosDeSerie(cuadros, [b0, b1]), cuadros: cuadros.length, sinCara, duracion: dur, fps };
      estado(`${detener ? "Análisis detenido" : "Análisis terminado"}: ${cuadros.length} cuadros, ${auto.eventos.length} evento(s).${sinCara > cuadros.length * 0.3 ? ` En ${Math.round((sinCara / cuadros.length) * 100)} % de los cuadros no se vio el rostro.` : ""}`);
    }
    pintarResultado();
  } catch (err) { estado(`No se pudo analizar: ${err.message}`, true); }
  finally { $("c-analizar").disabled = false; $("c-detener").hidden = true; $("c-progreso").hidden = true; }
};

function todosEventos() {
  const a = (auto?.eventos || []).concat(foto || []);
  return [...a, ...marcas].map((e) => ({ ...e, s: senalDeAuto(CAT_C, e.senal) })).filter((e) => e.s);
}

function svgLinea(evs, dur, base) {
  const filas = [...new Set(evs.map((e) => e.s.id))], W = 900, fila = 18, H = filas.length * fila + 24, x = (t) => 170 + (t / dur) * (W - 180);
  const marcasT = []; for (let t = 0; t <= dur; t += Math.max(5, Math.ceil(dur / 10 / 5) * 5)) marcasT.push(t);
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Línea de tiempo de señales" style="font-size:11px">
    ${base ? `<rect x="${x(base[0])}" y="0" width="${Math.max(1, x(base[1]) - x(base[0]))}" height="${H - 18}" fill="#2E7D32" opacity="0.12"><title>Línea base</title></rect>` : ""}
    ${marcasT.map((t) => `<line x1="${x(t)}" x2="${x(t)}" y1="0" y2="${H - 18}" stroke="currentColor" opacity="0.12"/><text x="${x(t)}" y="${H - 5}" text-anchor="middle" fill="currentColor" opacity="0.7">${reloj(t)}</text>`).join("")}
    ${filas.map((id, i) => { const s = CAT_C.senales.find((z) => z.id === id); return `<text x="0" y="${i * fila + 13}" fill="currentColor">${esc(s.nombre.slice(0, 28))}</text>${evs.filter((e) => e.s.id === id).map((e) => `<rect data-t="${e.t0}" x="${x(e.t0)}" y="${i * fila + 3}" width="${Math.max(3, x(e.t1) - x(e.t0))}" height="12" rx="3" fill="${e.origen === "manual" ? "#1565C0" : e.enBase ? "#9E9E9E" : "#E65100"}" style="cursor:pointer"><title>${reloj(e.t0)} ${esc(s.nombre)}${e.detalle ? ` · ${esc(e.detalle)}` : ""}${e.nota ? ` · ${esc(e.nota)}` : ""}</title></rect>`).join("")}`; }).join("")}
  </svg><p class="meta">🟧 automático · 🟦 marcado a mano · ⬜ dentro de la línea base (verde). Toca una barra para ir a ese segundo.</p>`;
}

function pintarResultado() {
  const evs = todosEventos();
  if (!evs.length) { $("c-resumen").innerHTML = `<p class="meta">${auto ? "El análisis no encontró cambios frente a la línea base. " : ""}Aún no hay señales. Analiza el video o marca señales a mano.</p>`; return; }
  const L = lectura(CAT_C, evs);
  const dur = auto?.duracion || Math.max(10, ...evs.map((e) => e.t1)) ;
  const maxPeso = Math.max(1, ...L.estados.map((e) => e.peso));
  const esFoto = !!foto && !auto;
  $("c-resumen").innerHTML = `
    ${esFoto ? `<p class="aviso">Foto: es un solo instante. No hay línea base ni cambios en el tiempo; las lecturas son aún más inciertas que en video.</p>` : ""}
    <h3>Lecturas con más señales distintas</h3>
    <div class="barras">${L.estados.slice(0, 8).map((e) => `<div class="fila"><span title="${esc(e.texto)}">${esc(e.nombre)}</span><div style="width:${(e.peso / maxPeso) * 100}%"></div><span>${e.peso}</span></div><p class="meta" style="margin:0 0 6px">${esc(e.senales.join(" · "))}</p>`).join("")}</div>
    <p class="meta">El número es cuántas señales distintas apuntan a esa lectura (fuera de la línea base). Una lectura con 1 o 2 señales no es concluyente.</p>
    ${esFoto ? "" : `<h3>🎯 Momentos para explorar (cúmulos de 3 o más señales en 5 s)</h3>
    ${L.momentos.length ? L.momentos.map((m) => `<div class="momento"><b>${reloj(m.t0)}–${reloj(m.t1)}</b> · ${esc(m.estados.map((e) => `${e.nombre} (${e.n})`).join(", "))}
      <br><span class="meta">${esc(m.senales.join(" · "))}</span><br><button type="button" data-t="${Math.max(0, m.t0 - 3)}" class="btn no-imprimir">▶️ Ver desde 3 s antes</button>
      <span class="meta">Revisa qué se preguntó o dijo justo antes y vuelve a preguntar sobre ese punto de otra forma.</span></div>`).join("") : `<p class="meta">No hay cúmulos: ninguna combinación de 3 señales distintas en 5 s.</p>`}
    <h3>Línea de tiempo</h3><div class="desliza">${svgLinea(evs, dur, auto?.base)}</div>`}
    <details class="tarjeta"><summary><b>Todas las señales (${evs.length})</b></summary><div class="desliza"><table class="t"><tr><th>Tiempo</th><th>Señal</th><th>Origen</th><th>Detalle</th><th class="no-imprimir"></th></tr>
      ${evs.sort((a, b) => a.t0 - b.t0).map((e, i) => `<tr><td>${esFoto ? "—" : `<a href="#" data-t="${e.t0}">${reloj(e.t0)}</a>`}</td><td>${esc(e.s.nombre)}</td><td>${e.origen}${e.enBase ? " (línea base)" : ""}</td><td>${esc([e.detalle, e.nota].filter(Boolean).join(" · "))}</td>
      <td class="no-imprimir">${e.origen === "manual" ? `<button type="button" data-quitar="${marcas.indexOf(marcas.find((m) => m.t0 === e.t0 && m.senal === e.senal))}">Quitar</button>` : ""}</td></tr>`).join("")}</table></div></details>
    ${auto ? `<p class="meta">Análisis automático: ${auto.cuadros} cuadros a ${auto.fps} por segundo · línea base ${reloj(auto.base[0])}–${reloj(auto.base[1])}${auto.sinCara ? ` · sin rostro visible en ${auto.sinCara} cuadros` : ""}.</p>` : ""}
    <p class="aviso">${esc(AVISO_CONDUCTA)}</p>`;
}
$("c-resumen").addEventListener("click", (e) => {
  const q = e.target.closest("[data-quitar]"); if (q) { marcas.splice(Number(q.dataset.quitar), 1); pintarResultado(); return; }
  const t = e.target.closest("[data-t]"); if (t) { e.preventDefault(); irA(Number(t.dataset.t)); }
});
$("c-imprimir").onclick = () => window.print();
$("c-limpiar").onclick = () => { if (marcas.length && confirm("¿Borrar las señales marcadas a mano?")) { marcas = []; pintarResultado(); } };
$("c-json").onclick = () => {
  const evs = todosEventos();
  descargar("lenguaje-corporal.json", { generado: new Date().toISOString(), medio: medio?.nombre || medio?.tipo || "", lineaBase: auto?.base || null, aviso: AVISO_CONDUCTA,
    eventos: evs.map((e) => ({ t0: +e.t0.toFixed(2), t1: +e.t1.toFixed(2), senal: e.s.id, nombre: e.s.nombre, origen: e.origen, enBase: !!e.enBase, detalle: e.detalle || "", nota: e.nota || "" })),
    lectura: lectura(CAT_C, evs) });
};

// =====================================================================
// GRAFOLOGÍA
// =====================================================================
const lienzo = $("g-lienzo"), ctx = lienzo.getContext("2d");
let base = null, rTexto = null, rFirma = null, modo = "texto", arrastre = null, medTexto = null, medFirma = null, seleccion = new Map();

$("g-archivo").onchange = async (e) => {
  const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
  try {
    const bmp = await aImagen(f), lado = 2400, k = Math.min(1, lado / Math.max(bmp.width, bmp.height));
    base = document.createElement("canvas"); base.width = Math.round(bmp.width * k); base.height = Math.round(bmp.height * k);
    base.getContext("2d").drawImage(bmp, 0, 0, base.width, base.height);
    lienzo.width = base.width; lienzo.height = base.height;
    rTexto = { x: 0, y: 0, w: base.width, h: base.height }; rFirma = null; medTexto = medFirma = null; seleccion = new Map();
    $("g-trabajo").hidden = false; $("g-lista-caja").hidden = true; $("g-informe-caja").hidden = true; $("g-medidas").innerHTML = "";
    dibujar();
    estado(`Imagen lista: ${f.name} (${base.width}×${base.height}). No sale de tu navegador.`);
  } catch (err) { estado(err.message, true); }
};

function dibujar() {
  if (!base) return;
  ctx.drawImage(base, 0, 0);
  const lw = Math.max(2, base.width / 400);
  const rect = (r, color, txt) => { if (!r) return; ctx.lineWidth = lw; ctx.strokeStyle = color; ctx.setLineDash([lw * 4, lw * 2]); ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.setLineDash([]); ctx.fillStyle = color; ctx.font = `${lw * 9}px sans-serif`; ctx.fillText(txt, r.x + lw * 2, r.y + lw * 10); };
  rect(rTexto, "#1565C0", "TEXTO"); rect(rFirma, "#C62828", "FIRMA");
  // renglones medidos (dirección de cada renglón)
  for (const [m, r, color] of [[medTexto, rTexto, "#1565C0"], [medFirma, rFirma, "#C62828"]]) {
    if (!m || m.vacio || !r) continue;
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.globalAlpha = 0.7;
    const cx = r.x + (m.caja.x0 + m.caja.x1) / 2, cy = r.y + r.h / 2, L = (m.caja.x1 - m.caja.x0) / 2, a = (m.direccion * Math.PI) / 180;
    ctx.beginPath(); ctx.moveTo(cx - L * Math.cos(a), cy + L * Math.sin(a)); ctx.lineTo(cx + L * Math.cos(a), cy - L * Math.sin(a)); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
const punto = (ev) => { const b = lienzo.getBoundingClientRect(); return { x: ((ev.clientX - b.left) * lienzo.width) / b.width, y: ((ev.clientY - b.top) * lienzo.height) / b.height }; };
lienzo.addEventListener("pointerdown", (ev) => { if (!base) return; lienzo.setPointerCapture(ev.pointerId); arrastre = punto(ev); });
lienzo.addEventListener("pointermove", (ev) => {
  if (!arrastre) return; const p = punto(ev);
  const r = { x: Math.min(arrastre.x, p.x), y: Math.min(arrastre.y, p.y), w: Math.abs(p.x - arrastre.x), h: Math.abs(p.y - arrastre.y) };
  if (modo === "texto") rTexto = r; else rFirma = r; dibujar();
});
lienzo.addEventListener("pointerup", () => { arrastre = null; for (const r of [rTexto, rFirma]) if (r && (r.w < 10 || r.h < 10)) { if (r === rTexto) rTexto = null; else rFirma = null; } dibujar(); });
const fijarModo = (m) => { modo = m; $("g-modo-texto").setAttribute("aria-pressed", String(m === "texto")); $("g-modo-firma").setAttribute("aria-pressed", String(m === "firma")); };
$("g-modo-texto").onclick = () => fijarModo("texto");
$("g-modo-firma").onclick = () => fijarModo("firma");
$("g-todo").onclick = () => { if (base) { rTexto = { x: 0, y: 0, w: base.width, h: base.height }; dibujar(); } };
$("g-sin-firma").onclick = () => { rFirma = null; medFirma = null; dibujar(); };
$("g-escala").onchange = () => { $("g-mm-caja").hidden = $("g-escala").value !== "otra"; };

function mmPorPx() {
  const v = $("g-escala").value, ref = rTexto || rFirma; if (!ref || v === "nada") return null;
  const mm = { carta: 216, a4: 210, media: 140 }[v] ?? Number($("g-mm").value);
  return mm > 0 ? mm / ref.w : null;
}

$("g-medir").onclick = () => {
  if (!base || (!rTexto && !rFirma)) { estado("Marca al menos un rectángulo de texto o de firma.", true); return; }
  estado("Midiendo…");
  setTimeout(() => {
    try {
      const img = base.getContext("2d").getImageData(0, 0, base.width, base.height), k = mmPorPx(), hoja = $("g-hoja").checked;
      medTexto = rTexto ? medir(img, rTexto, k) : null;
      medFirma = rFirma ? medir(img, rFirma, k) : null;
      seleccion = new Map();
      if (medTexto && !medTexto.vacio) for (const c of clasificar(medTexto, { hojaCompleta: hoja })) seleccion.set(c.clave, { ...c, origen: "medido" });
      if (medFirma && !medFirma.vacio) for (const c of clasificarFirma(medFirma, medTexto, rFirma, rTexto, { hojaCompleta: hoja })) seleccion.set(c.clave, { ...c, origen: "medido" });
      dibujar(); pintarMedidas(k); pintarLista(); pintarInforme();
      estado(`Medición lista: ${seleccion.size} rasgo(s) sugeridos por las medidas. Revisa la lista y marca lo demás observando el original.`);
    } catch (err) { estado(`No se pudo medir: ${err.message}`, true); }
  }, 30);
};

function pintarMedidas(k) {
  const fila = (n, t, f) => `<tr><th>${n}</th><td>${t ?? "—"}</td><td>${f ?? "—"}</td></tr>`;
  const m = (x) => x && !x.vacio;
  const T = medTexto, F = medFirma;
  $("g-medidas").innerHTML = `<div class="desliza"><table class="t"><tr><th>Medida</th><th>Texto</th><th>Firma</th></tr>
    ${fila("Renglones · palabras", m(T) ? `${T.renglones} · ${T.palabras}` : null, m(F) ? `${F.renglones} · ${F.palabras}` : null)}
    ${fila("Zona media (altura de letras como a, e, o)", m(T) ? `${T.zonaMediaPx} px${T.zonaMediaMm != null ? ` · ${fx(T.zonaMediaMm)} mm` : ""}` : null, m(F) ? `${F.zonaMediaPx} px${F.zonaMediaMm != null ? ` · ${fx(F.zonaMediaMm)} mm` : ""}` : null)}
    ${fila("Hampas / jambas (× zona media)", m(T) ? `${fx(T.hampa)} / ${fx(T.jamba)}` : null, m(F) ? `${fx(F.hampa)} / ${fx(F.jamba)}` : null)}
    ${fila("Inclinación (90° vertical)", m(T) ? `${fx(T.inclinacion, 0)}° ± ${fx(T.variacionInclinacion)}°` : null, m(F) ? `${fx(F.inclinacion, 0)}°` : null)}
    ${fila("Dirección del renglón (+ sube)", m(T) ? `${fx(T.direccion)}° ± ${fx(T.variacionDireccion)}°` : null, m(F) ? `${fx(F.direccion)}°` : null)}
    ${fila("Espacio entre palabras · renglones (× zona media)", m(T) ? `${fx(T.espacioPalabras)} · ${fx(T.interlineado)}` : null, null)}
    ${fila("Márgenes izq. · der. · sup. · inf.", m(T) ? ["izquierdo", "derecho", "superior", "inferior"].map((q) => `${Math.round(T.margenes[q] * 100)} %`).join(" · ") : null, null)}
    ${fila("Grosor del trazo", m(T) ? `${T.grosorPx} px${T.grosorMm != null ? ` · ${fx(T.grosorMm, 2)} mm` : ""}` : null, m(F) ? `${F.grosorPx} px${F.grosorMm != null ? ` · ${fx(F.grosorMm, 2)} mm` : ""}` : null)}
    ${fila("Cuchillos · chimeneas", m(T) ? `${T.cuchillos} · ${T.chimeneas}` : null, null)}
  </table></div>
  <p class="meta">${k ? `Escala: ${fx(k, 3)} mm por píxel.` : "Sin escala: no hay milímetros (tamaño y calibre no se clasifican)."} La dirección se mide respecto del borde de la foto: si la hoja salió girada, ese giro se suma.
    ${(T && T.vacio) || (F && F.vacio) ? "<b>En un rectángulo no encontré tinta.</b>" : ""}</p>`;
}

function pintarLista() {
  $("g-lista-caja").hidden = false;
  $("g-lista").innerHTML = CAT_G.secciones.filter((s) => s.id !== "temperamento").map((s) => {
    const n = s.grupos.reduce((a, g) => a + g.rasgos.filter((r) => seleccion.has(clave(s.id, g.id, r.id))).length, 0);
    return `<details class="tarjeta grafo-sec" ${n ? "open" : ""}><summary><b>${esc(s.nombre)}</b>${s.lema ? ` <span class="meta">(${esc(s.lema)})</span>` : ""} ${n ? `<span class="medido-tag">· ${n} marcado(s)</span>` : ""}</summary>
      ${s.descripcion ? `<p class="meta">${esc(s.descripcion)}</p>` : ""}
      ${s.grupos.map((g) => `<div class="grafo-grupo">${g.nombre ? `<h4>${esc(g.nombre)}</h4>` : ""}${g.rasgos.map((r) => {
        const k = clave(s.id, g.id, r.id), e = seleccion.get(k);
        return `<label class="rasgo ${e?.origen === "medido" ? "medido" : ""}"><input type="checkbox" data-k="${esc(k)}" ${e ? "checked" : ""}>
          <span><b>${esc(r.nombre)}</b>${r.nota ? ` <span class="det">${esc(r.nota)}</span>` : ""}
          ${r.variantes.length ? ` <select data-var="${esc(k)}" aria-label="Variante"><option value="">—</option>${r.variantes.map((v) => `<option ${e?.variante === v ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>` : ""}
          ${e?.origen === "medido" ? ` <span class="medido-tag">📏 ${esc(e.valor)}</span>` : ""}
          ${r.interpretacion ? `<br><span class="det">${esc(r.interpretacion)}</span>` : ""}</span></label>`;
      }).join("")}</div>`).join("")}</details>`;
  }).join("");
}
$("g-lista").addEventListener("change", (e) => {
  const k = e.target.dataset.k, kv = e.target.dataset.var;
  if (k) { if (e.target.checked) seleccion.set(k, { origen: "manual", variante: e.target.closest("label").querySelector("select")?.value || "" }); else seleccion.delete(k); e.target.closest("label").classList.remove("medido"); }
  if (kv) { const s = seleccion.get(kv) || { origen: "manual" }; s.variante = e.target.value; seleccion.set(kv, s); e.target.closest("label").querySelector("input").checked = true; }
  pintarInforme();
});

function pintarInforme() {
  const inf = informe(CAT_G, seleccion);
  $("g-informe-caja").hidden = false;
  const maxT = Math.max(...inf.temperamento.map((t) => t.puntaje), 0.01);
  $("g-informe").innerHTML = `
    ${inf.secciones.length ? inf.secciones.map((s) => `<h3>${esc(s.nombre)}${s.lema ? ` · <span class="meta">${esc(s.lema)}</span>` : ""}</h3>
      ${s.items.map((i) => `<div class="inf-item"><b>${esc(i.rasgo)}</b>${i.variante ? ` (${esc(i.variante)})` : ""} ${i.origen === "medido" ? `<span class="medido-tag">📏 ${esc(i.valor)}</span>` : `<span class="meta">observado</span>`}
        ${i.interpretacion ? `<br>${esc(i.interpretacion)}` : `<br><span class="meta">Tu resumen no trae interpretación para este rasgo.</span>`}
        ${i.origen === "medido" && i.motivo ? `<br><span class="meta">Cómo se midió: ${esc(i.motivo)}</span>` : ""}</div>`).join("")}`).join("") : `<p class="meta">Aún no hay rasgos marcados.</p>`}
    <h3>Temperamento (indicadores de tu resumen que se cumplen)</h3>
    <div class="barras">${inf.temperamento.map((t) => `<div class="fila"><span>${esc(t.nombre)}</span><div style="width:${(t.puntaje / maxT) * 100}%;${t.puntaje ? "" : "opacity:.15"}"></div><span>${t.cumple.length}/${t.total}</span></div>
      <p class="meta" style="margin:0 0 6px">${t.cumple.length ? `Cumple: ${esc(t.cumple.join(" · "))}. ` : ""}${esc(t.descripcion)}</p>`).join("")}</div>
    <p class="meta">Los temperamentos suelen mezclarse; el puntaje solo cuenta cuántos de sus indicadores marcaste.</p>
    <p class="aviso">${esc(inf.aviso)}</p>`;
}
$("g-imprimir").onclick = () => window.print();
$("g-json").onclick = () => descargar("grafologia.json", { generado: new Date().toISOString(), medidas: { texto: medTexto, firma: medFirma }, informe: informe(CAT_G, seleccion) });
