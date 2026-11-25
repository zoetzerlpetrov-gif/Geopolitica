// Interfaz de creadores.html (herramientas gratuitas para creadores). La lógica está en creadores-logica.js.
import * as L from "./creadores-logica.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const $ = (id) => document.getElementById(id);
const seguro = (u) => (/^https:\/\//i.test(String(u || "")) ? esc(u) : "#");

// ---------------------------------------------------------------- 1 · textos por red
const datos = () => ({ titulo: $("tx-titulo").value, cuerpo: $("tx-cuerpo").value, cta: $("tx-cta").value, enlace: $("tx-enlace").value, etiquetas: $("tx-etiquetas").value });
function pintarTexto() {
  const red = $("tx-red").value, t = L.adaptar(datos(), red), n = L.contar(t, red), lim = L.REDES[red].limite;
  $("tx-salida").textContent = t || "Escribe tu texto a la izquierda.";
  $("tx-cuenta").textContent = `${n} / ${lim} caracteres`;
  $("tx-cuenta").classList.toggle("pasa", n > lim);
}
async function copiar(texto, boton) {
  try { await navigator.clipboard.writeText(texto); const v = boton.textContent; boton.textContent = "✔️ Copiado"; setTimeout(() => { boton.textContent = v; }, 1500); } catch { /* sin portapapeles */ }
}

// ---------------------------------------------------------------- 2 · imagen
let logo = null;
function lineas(ctx, texto, ancho) {
  const out = []; let linea = "";
  for (const p of String(texto).split(/\s+/)) {
    const prueba = linea ? `${linea} ${p}` : p;
    if (ctx.measureText(prueba).width > ancho && linea) { out.push(linea); linea = p; } else linea = prueba;
  }
  if (linea) out.push(linea);
  return out;
}
function dibujar() {
  const f = L.FORMATOS[$("im-formato").value], c = $("im-canvas"), ctx = c.getContext("2d");
  c.width = f.w; c.height = f.h;
  const fondo = $("im-fondo").value, texto = $("im-texto").value, acento = $("im-acento").value, m = Math.round(f.w * 0.07);
  ctx.fillStyle = fondo; ctx.fillRect(0, 0, f.w, f.h);
  ctx.fillStyle = acento; ctx.fillRect(0, f.h - Math.round(f.h * 0.012), f.w, Math.round(f.h * 0.012));
  const familia = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  const horizontal = f.w > f.h;
  let tam = Math.round(f.w * (horizontal ? 0.085 : 0.095));
  ctx.textBaseline = "top";
  let ls;
  do { ctx.font = `800 ${tam}px ${familia}`; ls = lineas(ctx, $("im-titulo").value, f.w - m * 2 - (horizontal && logo ? f.h * 0.5 : 0)); tam -= 4; } while (ls.length * tam * 1.15 > f.h * 0.5 && tam > 30);
  tam += 4;
  let y = horizontal ? Math.round(f.h * 0.2) : Math.round(f.h * 0.3);
  ctx.fillStyle = texto;
  for (const l of ls) { ctx.fillText(l, m, y); y += tam * 1.12; }
  ctx.font = `500 ${Math.round(tam * 0.45)}px ${familia}`; ctx.fillStyle = texto; ctx.globalAlpha = 0.85;
  for (const l of lineas(ctx, $("im-sub").value, f.w - m * 2)) { y += 6; ctx.fillText(l, m, y + tam * 0.2); y += tam * 0.55; }
  ctx.globalAlpha = 1;
  ctx.font = `700 ${Math.round(f.w * 0.035)}px ${familia}`; ctx.fillStyle = acento;
  ctx.fillText($("im-marca").value, m, f.h - m - Math.round(f.w * 0.04));
  if (logo) {
    const lado = Math.round(Math.min(f.w, f.h) * (horizontal ? 0.42 : 0.18));
    const x = horizontal ? f.w - m - lado : f.w - m - lado, ly = horizontal ? Math.round((f.h - lado) / 2) : m;
    ctx.drawImage(logo, x, ly, lado, lado);
  }
  const cr = L.contraste(fondo, texto), cr2 = L.contraste(fondo, acento);
  $("im-contraste").innerHTML = `Contraste texto/fondo: <b>${cr}:1</b> ${cr >= 4.5 ? "✔️ se lee bien" : "⚠️ bajo: aclara u oscurece uno de los dos (mínimo 4.5:1)"} · acento/fondo: <b>${cr2}:1</b> ${cr2 >= 3 ? "✔️" : "⚠️ bajo (mínimo 3:1)"}`;
}

// ---------------------------------------------------------------- 3 · temas
let noticiero = null;
function pintarTemas() {
  const lista = L.temasDelDia(noticiero, $("te-seccion").value, 12);
  $("te-lista").innerHTML = lista.map((t) => `<li><a href="${seguro(t.url)}" target="_blank" rel="noopener noreferrer">${esc(t.titulo)}</a> <span class="meta">· ${esc(t.medio)} · ${esc(String(t.fecha).slice(0, 10))}</span></li>`).join("")
    || `<li class="meta">${noticiero ? "Sin titulares en este tema por ahora." : "No se pudo cargar el Noticiero."}</li>`;
}

if (typeof document !== "undefined" && $("tx-red")) {
  $("tx-red").innerHTML = Object.entries(L.REDES).map(([k, r]) => `<option value="${k}">${esc(r.nombre)} · ${r.limite}</option>`).join("");
  for (const id of ["tx-titulo", "tx-cuerpo", "tx-cta", "tx-enlace", "tx-etiquetas", "tx-red"]) $(id).addEventListener("input", pintarTexto);
  $("tx-copiar").addEventListener("click", (e) => copiar(L.adaptar(datos(), $("tx-red").value), e.currentTarget));
  $("tx-todas").addEventListener("click", (e) => copiar(Object.entries(L.REDES).map(([k, r]) => `=== ${r.nombre} ===\n${L.adaptar(datos(), k)}`).join("\n\n"), e.currentTarget));
  pintarTexto();

  $("im-formato").innerHTML = Object.entries(L.FORMATOS).map(([k, f]) => `<option value="${k}">${esc(f.nombre)}</option>`).join("");
  for (const id of ["im-formato", "im-titulo", "im-sub", "im-marca", "im-fondo", "im-texto", "im-acento"]) $(id).addEventListener("input", dibujar);
  $("im-logo").addEventListener("change", (e) => {
    const f = e.target.files?.[0]; if (!f) { logo = null; dibujar(); return; }
    const img = new Image(); img.onload = () => { logo = img; dibujar(); }; img.src = URL.createObjectURL(f);
  });
  $("im-descargar").addEventListener("click", () => {
    $("im-canvas").toBlob((b) => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `imagen-${$("im-formato").value}.png`; a.click(); }, "image/png");
  });
  document.fonts?.ready.then(dibujar); dibujar();

  $("ho-tabla").innerHTML = `<table class="t"><tr><th>Red</th><th>Horario de partida (hora del centro de México)</th></tr>${L.HORARIOS.map(([r, h]) => `<tr><td>${esc(r)}</td><td>${esc(h)}</td></tr>`).join("")}</table>
    <p class="meta">Es un punto de partida, no una regla: a las 3 o 4 semanas revisa en las estadísticas de cada red a qué hora está conectado tu público y ajusta.</p>`;
  fetch("data/vivos/noticiero.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then((d) => {
    noticiero = d;
    $("te-seccion").innerHTML = `<option value="">Todos</option>${(d?.secciones || []).map((s) => `<option value="${esc(s.id)}">${esc(s.titulo)}</option>`).join("")}`;
    $("te-seccion").addEventListener("input", pintarTemas); pintarTemas();
  }).catch(() => pintarTemas());
}
