// Comentarios de Brújula Diaria (comentarios.html, solo admin). Lee data/comentarios/borradores.json (workflow
// «Comentarios de YouTube»: solo identificadores, categoría y respuesta propuesta), pide a YouTube el autor y el texto
// de cada comentario con el permiso de la persona (Google Identity Services, en el navegador) y publica SOLO las
// respuestas que la persona aprueba. Máximo MAX_POR_VIDEO respuestas por video. Nada de esto se guarda en el servidor:
// lo publicado o descartado se recuerda en este navegador.

export const MAX_POR_VIDEO = 10;
const API = "https://www.googleapis.com/youtube/v3/";
const SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";
const CLAVE_CLIENTE = "gp_yt_cliente_web";
const CLAVE_HECHOS = "gp_yt_comentarios_hechos";

/** {comentario: "publicado" | "descartado" | "mostrado" | "rechazado"} guardado en este navegador. */
export function leerHechos(almacen) {
  try { return JSON.parse(almacen.getItem(CLAVE_HECHOS) || "{}") || {}; } catch (e) { return {}; }
}

export function guardarHecho(almacen, id, estado) {
  const h = leerHechos(almacen);
  h[id] = estado;
  try { almacen.setItem(CLAVE_HECHOS, JSON.stringify(h)); } catch (e) { /* navegador sin almacenamiento */ }
  return h;
}

/** Respuestas publicadas por video (desde este navegador). */
export function publicadasPorVideo(borradores, hechos) {
  const n = {};
  for (const b of borradores) if (hechos[b.comentario] === "publicado") n[b.video] = (n[b.video] || 0) + 1;
  return n;
}

/** Separa en propuestas y retenidos; sin «verHechos» oculta lo ya publicado, descartado o resuelto. */
export function separar(borradores, hechos, verHechos = false) {
  const vivos = (borradores || []).filter((b) => verHechos || !hechos[b.comentario]);
  return { propuestas: vivos.filter((b) => b.categoria === "ok"), retenidos: vivos.filter((b) => b.categoria === "retenido") };
}

/** ¿Se puede publicar otra respuesta en este video sin pasar el tope? */
export const cabe = (video, porVideo, max = MAX_POR_VIDEO) => (porVideo[video] || 0) < max;

// ------------------------------------------------------------------ página
const $ = (id) => document.getElementById(id);
let token = "";
let datos = { borradores: [], videos: {}, aviso: "" };
const textos = {};  // comentario → {autor, texto} pedidos a YouTube (solo en memoria)

function el(tag, attrs = {}, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
  for (const h of hijos) e.append(h instanceof Node ? h : document.createTextNode(String(h ?? "")));
  return e;
}

async function yt(ruta, params = {}, metodo = "GET", cuerpo) {
  const url = API + ruta + "?" + new URLSearchParams(params);
  const r = await fetch(url, { method: metodo, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { msg += ": " + ((await r.json()).error?.message || ""); } catch (e) { /* sin cuerpo */ }
    throw new Error(msg);
  }
  return r.status === 204 ? {} : r.json().catch(() => ({}));
}

async function cargarTextos() {
  const ids = datos.borradores.map((b) => b.comentario).filter((id) => !textos[id]);
  for (let i = 0; i < ids.length; i += 50) {
    const r = await yt("comments", { part: "snippet", id: ids.slice(i, i + 50).join(","), textFormat: "plainText" });
    for (const c of r.items || []) textos[c.id] = { autor: c.snippet?.authorDisplayName || "", texto: c.snippet?.textOriginal || c.snippet?.textDisplay || "" };
  }
}

function pintar() {
  const hechos = leerHechos(localStorage);
  const porVideo = publicadasPorVideo(datos.borradores, hechos);
  const { propuestas, retenidos } = separar(datos.borradores, hechos, $("cm-ver-hechos").checked);
  const lista = $("cm-lista"), ret = $("cm-retenidos");
  lista.replaceChildren(); ret.replaceChildren();
  if (!propuestas.length) lista.append(el("p", { class: "meta" }, "No hay respuestas pendientes."));
  if (!retenidos.length) ret.append(el("p", { class: "meta" }, "No hay comentarios retenidos."));
  for (const b of propuestas) {
    const t = textos[b.comentario];
    const area = el("textarea", { "aria-label": "Respuesta propuesta" });
    area.value = b.borrador || "";
    const hecho = hechos[b.comentario];
    const pub = el("button", { type: "button", class: "si" }, "✅ Publicar respuesta");
    const des = el("button", { type: "button" }, "🗑️ Descartar");
    const msg = el("span", { class: "meta", "aria-live": "polite" }, hecho ? `(${hecho})` : "");
    pub.disabled = !token || !!hecho || !cabe(b.video, porVideo) || !area.value.trim();
    if (!cabe(b.video, porVideo) && !hecho) msg.textContent = `Ya hay ${MAX_POR_VIDEO} respuestas en este video.`;
    area.addEventListener("input", () => { pub.disabled = !token || !!hecho || !cabe(b.video, porVideo) || !area.value.trim(); });
    pub.addEventListener("click", async () => {
      pub.disabled = true; msg.textContent = "Publicando…";
      try {
        await yt("comments", { part: "snippet" }, "POST", { snippet: { parentId: b.comentario, textOriginal: area.value.trim() } });
        guardarHecho(localStorage, b.comentario, "publicado"); msg.textContent = "Publicada."; setTimeout(pintar, 800);
      } catch (e) { msg.textContent = "No se publicó: " + e.message; pub.disabled = false; }
    });
    des.addEventListener("click", () => { guardarHecho(localStorage, b.comentario, "descartado"); pintar(); });
    lista.append(el("div", { class: "tarjeta" },
      el("div", { class: "meta" }, el("span", { class: "chip" }, datos.videos?.[b.video] || b.video), " · ", (b.fecha || "").slice(0, 16).replace("T", " "), " · 👍 ", b.me_gusta || 0),
      el("div", { class: "comentario" }, t ? `${t.autor}: ${t.texto}` : (token ? "(YouTube no devolvió el comentario: quizá se borró)" : "Conecta con YouTube para ver el comentario.")),
      el("label", { class: "meta" }, "Respuesta (puedes editarla):"), area,
      el("div", { class: "barra" }, pub, des, msg)));
  }
  for (const b of retenidos) {
    const t = textos[b.comentario];
    const msg = el("span", { class: "meta", "aria-live": "polite" }, hechos[b.comentario] ? `(${hechos[b.comentario]})` : "");
    const moderar = (estado, etiqueta) => async () => {
      msg.textContent = "Enviando…";
      try { await yt("comments/setModerationStatus", { id: b.comentario, moderationStatus: estado }, "POST"); guardarHecho(localStorage, b.comentario, etiqueta); pintar(); }
      catch (e) { msg.textContent = "Error: " + e.message; }
    };
    const mostrar = el("button", { type: "button" }, "👁️ Mostrar en YouTube");
    const rechazar = el("button", { type: "button" }, "⛔ Rechazar");
    mostrar.disabled = rechazar.disabled = !token;
    mostrar.addEventListener("click", moderar("published", "mostrado"));
    rechazar.addEventListener("click", moderar("rejected", "rechazado"));
    const det = el("details", {}, el("summary", {}, "Ver el comentario (puede ser ofensivo)"),
      el("div", { class: "comentario" }, t ? `${t.autor}: ${t.texto}` : "Conecta con YouTube para verlo."));
    ret.append(el("div", { class: "tarjeta" },
      el("div", { class: "meta" }, el("span", { class: "chip" }, b.motivo || "retenido"), " · ", datos.videos?.[b.video] || b.video),
      det, el("div", { class: "barra" }, mostrar, rechazar, msg)));
  }
}

function cargarGis() {
  return new Promise((ok, mal) => {
    if (window.google?.accounts?.oauth2) return ok();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.onload = ok; s.onerror = () => mal(new Error("No cargó el inicio de sesión de Google"));
    document.head.append(s);
  });
}

async function conectar() {
  const cliente = (localStorage.getItem(CLAVE_CLIENTE) || "").trim();
  if (!cliente) { $("cm-config").open = true; $("cm-estado").textContent = "Primero guarda el ID de cliente web (paso de configuración)."; return; }
  await cargarGis();
  window.google.accounts.oauth2.initTokenClient({
    client_id: cliente, scope: SCOPE,
    callback: async (r) => {
      if (r.error) { $("cm-estado").textContent = "Google no dio permiso: " + r.error; return; }
      token = r.access_token;
      $("cm-estado").textContent = "Conectado. Cargando comentarios…";
      try { await cargarTextos(); $("cm-estado").textContent = "Conectado con YouTube (el permiso dura una hora)."; }
      catch (e) { $("cm-estado").textContent = "Conectado, pero YouTube respondió: " + e.message; }
      pintar();
    },
  }).requestAccessToken();
}

async function iniciar() {
  try { $("cm-cliente").value = localStorage.getItem(CLAVE_CLIENTE) || ""; } catch (e) { /* sin almacenamiento */ }
  $("cm-guardar").addEventListener("click", () => { try { localStorage.setItem(CLAVE_CLIENTE, $("cm-cliente").value.trim()); $("cm-estado").textContent = "ID de cliente guardado en este navegador."; } catch (e) { /* */ } });
  $("cm-conectar").addEventListener("click", () => conectar().catch((e) => { $("cm-estado").textContent = e.message; }));
  $("cm-ver-hechos").addEventListener("change", pintar);
  try {
    const r = await fetch("data/comentarios/borradores.json", { cache: "no-store" });
    if (r.ok) datos = await r.json();
  } catch (e) { /* aún no hay datos */ }
  const n = (datos.borradores || []).length;
  $("cm-estado").textContent = (datos.aviso ? "⚠️ " + datos.aviso + " " : "") +
    (datos.generado_utc ? `Revisión del ${datos.generado_utc.slice(0, 16).replace("T", " ")} UTC: ${n} comentario(s).` : "Aún no hay revisión de comentarios (el proceso corre a diario a las 18:43).");
  if (datos.aviso) $("cm-estado").className = "aviso";
  datos.borradores = datos.borradores || [];
  pintar();
}

if (typeof document !== "undefined" && document.getElementById("cm-lista")) iniciar();
