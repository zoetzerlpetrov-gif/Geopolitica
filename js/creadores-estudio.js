// Estudio para creadores (creadores.html): 11 pasos de la idea a la evaluación de 30 días. La lógica pura está en
// creadores-estudio-logica.js y el video en creadores-video.js. Lo que el creador escribe se guarda en su navegador y, con
// cuenta activa (demo de 7 días o plan), también en el servidor (/cuenta/creador/datos). Fotos, clips y audio no se suben.
import * as L from "./creadores-estudio-logica.js";
import { REDES } from "./creadores-logica.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const $ = (id) => document.getElementById(id);
const seguro = (u) => (/^https:\/\//i.test(String(u || "")) ? esc(u) : "#");
const API = location.hostname === "admin.dominusosint.com" ? "/cuenta/creador/" : "https://admin.dominusosint.com/cuenta/creador/";
const ACCESO = location.hostname === "admin.dominusosint.com" ? "/cuenta/" : "https://admin.dominusosint.com/cuenta/";

const PASOS = [
  ["perfil", "🙋", "¿Cómo quieres crear?", "Antes de empezar"], ["nicho", "🎯", "Objetivo y nicho", "Antes de empezar"], ["ideas", "💡", "Acomoda tus ideas", "Crear"],
  ["guion", "✍️", "Guion", "Crear"], ["set", "🎥", "Set y grabación", "Crear"], ["video", "🎬", "Arma tu video", "Crear"], ["publicar", "📣", "Publica", "Publicar"],
  ["metricas", "📊", "Métricas", "Mejorar"], ["monetizacion", "💵", "Monetización", "Mejorar"], ["legal", "⚖️", "Lo que dice la ley", "Mejorar"], ["evaluacion", "🗓️", "Evaluación de 30 días", "Mejorar"],
];
const REDES_PUB = [["youtube", "YouTube"], ["tiktok", "TikTok"], ["instagram", "Instagram"], ["facebook", "Facebook"], ["linkedin", "LinkedIn"], ["x", "X"], ["threads", "Threads"]];

// ------------------------------------------------------------------ estado (navegador + servidor)
const CLAVES = ["cr_perfil", "cr_nicho", "cr_ideas", "cr_guion", "cr_publicaciones", "cr_evaluacion", "cr_paso"];
const leer = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
let cuenta = { activo: false, local: true }, pendientes = {}, reloj = 0;
function guardar(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ }
  if (!cuenta.activo || cuenta.local) return;
  pendientes[k] = JSON.stringify(v); clearTimeout(reloj);
  reloj = setTimeout(async () => {
    const lote = pendientes; pendientes = {};
    try {
      const r = await fetch(`${API}datos`, { method: "POST", credentials: "include", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ cambios: lote }) });
      if (!r.ok) throw new Error();
      $("cr-guardado")?.replaceChildren(document.createTextNode(`☁️ Guardado en tu cuenta ${new Date().toLocaleTimeString("es-MX")}`));
    } catch { pendientes = { ...lote, ...pendientes }; }
  }, 1200);
}
const S = {
  perfil: leer("cr_perfil", { modo: "", marca: "", publico: "", redes: [] }),
  nicho: leer("cr_nicho", { objetivo: "", id: "", sub: "" }),
  ideas: leer("cr_ideas", []),
  guion: leer("cr_guion", null),
  publicaciones: leer("cr_publicaciones", []),
  evaluacion: leer("cr_evaluacion", { inicio: "", meta: 3 }),
};
let CFG = null, paso = leer("cr_paso", "perfil");

async function cargarCuenta() {
  const caja = $("cr-cuenta");
  try {
    const r = await fetch(`${API}datos`, { credentials: "include", cache: "no-store" });
    if (r.status === 401) {
      cuenta = { activo: false, local: false, sinSesion: true };
      caja.innerHTML = `<p><b>Entra para empezar tu demo de 7 días.</b> Sin cuenta puedes recorrer las guías y usar los textos e imágenes del paso 7, pero tu trabajo solo se queda en este navegador.</p>
        <p><a class="boton si" href="acceso.html?volver=creadores.html">Entrar con mi cuenta DOMINUS</a> <a class="boton" href="${ACCESO}google">Entrar con Google</a></p>`;
      return;
    }
    if (!r.ok) throw new Error(String(r.status));
    const d = await r.json();
    cuenta = { ...d.estado, local: false };
    // Lo del servidor manda; lo que solo está en este navegador se sube la primera vez.
    const subir = {};
    for (const k of CLAVES) {
      if (d.datos[k] != null) { try { localStorage.setItem(k, d.datos[k]); } catch { /* */ } }
      else if (localStorage.getItem(k) != null) subir[k] = localStorage.getItem(k);
    }
    Object.assign(S, { perfil: leer("cr_perfil", S.perfil), nicho: leer("cr_nicho", S.nicho), ideas: leer("cr_ideas", S.ideas), guion: leer("cr_guion", S.guion),
      publicaciones: leer("cr_publicaciones", S.publicaciones), evaluacion: leer("cr_evaluacion", S.evaluacion) });
    if (cuenta.activo && Object.keys(subir).length) for (const [k, v] of Object.entries(subir)) guardar(k, JSON.parse(v));
    const NOM = { demo: "Demo", inicial: "Creador inicial", creador: "Creador", vencido: "Demo terminada" };
    caja.innerHTML = cuenta.activo
      ? `<p>✅ <b>${esc(cuenta.email)}</b> · plan <b>${esc(NOM[cuenta.plan] || cuenta.plan)}</b> · ${cuenta.dias_restantes} días restantes. <span id="cr-guardado" class="meta">Tu trabajo se guarda en tu cuenta.</span></p>`
      : `<p>⏳ <b>Tu demo terminó.</b> Puedes consultar lo que guardaste; para seguir creando y guardando elige un plan (abajo).</p>`;
  } catch {
    cuenta = { activo: true, local: true };
    caja.innerHTML = '<p class="meta">Sin conexión con el servidor: el estudio funciona y guarda en este navegador.</p>';
  }
}
const puedeCrear = () => cuenta.activo || cuenta.local;
const avisoCuenta = () => (cuenta.sinSesion ? '<p class="tarjeta">🔑 <b>Entra (arriba) para usar esta herramienta</b> y empezar tu demo de 7 días.</p>' : '<p class="tarjeta">⏳ Tu demo terminó: elige un plan para seguir creando.</p>');

// ------------------------------------------------------------------ navegación
function indice() {
  let grupo = "";
  $("cr-indice").innerHTML = PASOS.map(([id, ic, t, g], k) => `${g !== grupo ? `<li class="grupo">${esc((grupo = g))}</li>` : ""}<li><button type="button" data-ir="${id}" ${id === paso ? 'aria-current="step"' : ""}><span class="num">${k + 1}</span><span>${ic} ${esc(t)}</span></button></li>`).join("");
}
function ir(id) {
  if (!PASOS.some(([p]) => p === id)) id = "perfil";
  paso = id; guardar("cr_paso", id);
  for (const s of document.querySelectorAll("section.paso")) s.hidden = s.dataset.paso !== id;
  const k = PASOS.findIndex(([p]) => p === id);
  $("cr-nav").innerHTML = `${k > 0 ? `<button type="button" data-ir="${PASOS[k - 1][0]}">← ${esc(PASOS[k - 1][2])}</button>` : "<span></span>"}${k < PASOS.length - 1 ? `<button type="button" class="si" data-ir="${PASOS[k + 1][0]}">Siguiente: ${esc(PASOS[k + 1][2])} →</button>` : ""}`;
  indice();
  PINTAR[id]?.();
}

// ------------------------------------------------------------------ 1 · perfil
function pintarPerfil() {
  for (const b of document.querySelectorAll("#pe-modo [data-modo]")) b.setAttribute("aria-pressed", String(b.dataset.modo === S.perfil.modo));
  $("pe-marca").value = S.perfil.marca || ""; $("pe-publico").value = S.perfil.publico || "";
  $("pe-redes").innerHTML = REDES_PUB.map(([k, n]) => `<label class="chip"><input type="checkbox" value="${k}" ${S.perfil.redes?.includes(k) ? "checked" : ""}> ${esc(n)}</label>`).join("");
}

// ------------------------------------------------------------------ 2 · nicho
function pintarNicho() {
  $("ni-objetivo").innerHTML = `<option value="">Elige…</option>${CFG.objetivos.map(([k, n]) => `<option value="${k}" ${k === S.nicho.objetivo ? "selected" : ""}>${esc(n)}</option>`).join("")}`;
  $("ni-lista").innerHTML = Object.entries(CFG.nichos).sort((a, b) => a[1].nombre.localeCompare(b[1].nombre, "es"))
    .map(([k, n]) => `<button type="button" class="opcion" data-nicho="${k}" aria-pressed="${k === S.nicho.id}">${n.icono} ${esc(n.nombre)}</button>`).join("");
  const n = CFG.nichos[S.nicho.id];
  $("ni-detalle").innerHTML = n ? `<div class="tarjeta"><h3>${n.icono} ${esc(n.nombre)}</h3>
    <label>Subnicho (más específico = más fácil destacar) <select id="ni-sub">${n.subnichos.map((s) => `<option ${s === S.nicho.sub ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></label>
    <p><b>Formatos que funcionan:</b></p><ul>${n.formatos.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    <p><b>Cómo se gana en este nicho:</b> ${esc(n.monetizacion.join(" · "))}</p>
    <p><b>⚠️ Cuidado:</b></p><ul>${n.cuidado.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : '<p class="meta">Elige un nicho para ver formatos, ideas y cuidados.</p>';
}

// ------------------------------------------------------------------ 3 · ideas
function pintarIdeas() {
  const xs = [...S.ideas].sort((a, b) => L.prioridad(b) - L.prioridad(a));
  $("id-lista").innerHTML = xs.length ? `<table class="t"><tr><th>Idea</th><th>Interés</th><th>Facilidad</th><th>Prioridad</th><th></th></tr>${xs.map((x) => `<tr><td>${esc(x.texto)}</td><td>${esc(x.interes)}</td><td>${esc(x.facilidad)}</td>
    <td><b>${L.prioridad(x)}</b></td><td><button type="button" data-guion="${esc(x.id)}">✍️ Guion</button> <button type="button" data-quitar-idea="${esc(x.id)}">🗑️</button></td></tr>`).join("")}</table>`
    : '<p class="meta">Aún no hay ideas. Agrega las tuyas o genera ideas de tu nicho.</p>';
}
const nuevaIdea = (texto, interes = 3, facilidad = 3) => ({ id: Math.random().toString(36).slice(2, 10), texto: String(texto).slice(0, 160), interes: Number(interes) || 3, facilidad: Number(facilidad) || 3 });

// ------------------------------------------------------------------ 4 · guion
function pintarGuion() {
  $("gu-idea").innerHTML = S.ideas.length ? S.ideas.map((x) => `<option value="${esc(x.id)}" ${S.guion?.idea === x.id ? "selected" : ""}>${esc(x.texto)}</option>`).join("") : '<option value="">Primero agrega ideas (paso 3)</option>';
  $("gu-formato").innerHTML = Object.entries(L.FORMATOS).map(([k, f]) => `<option value="${k}" ${S.guion?.formato === k ? "selected" : ""}>${esc(f.nombre)}</option>`).join("");
  if (S.guion) { $("gu-puntos").value = S.guion.puntos?.join("\n") || ""; $("gu-cta").value = S.guion.cta || ""; }
  pintarSalidaGuion();
}
function pintarSalidaGuion() {
  const g = S.guion?.resultado;
  if (!g) { $("gu-salida").innerHTML = ""; return; }
  const aviso = L.revisarDuracion(g.total, S.guion.formato);
  $("gu-salida").innerHTML = `<div class="tarjeta">${g.partes.map((p, k) => `<label><b>${esc(p.etiqueta)}</b>${p.seg ? ` <span class="meta">~${p.seg} s</span>` : ""}<textarea data-parte="${k}" rows="2">${esc(p.texto)}</textarea></label>`).join("")}
    <p>${g.total ? `Duración estimada: <b>${g.total} s</b>. ` : ""}${aviso ? `<span class="error">${esc(aviso)}</span>` : ""}</p>
    <p><button type="button" id="gu-copiar">📋 Copiar guion</button> <button type="button" data-ir="set">🎥 Ir a grabar</button> <button type="button" data-ir="video">🎬 Armar video con este guion</button></p></div>`;
}

// ------------------------------------------------------------------ 5 · set
let tpReloj = 0;
function pintarSet() {
  const modo = S.perfil.modo || "mixto";
  const listas = modo === "mixto" ? ["con_cara", "sin_cara"] : [modo];
  $("se-lista").innerHTML = listas.map((m) => `<div class="tarjeta"><h3>${m === "con_cara" ? "🎥 Si te grabas" : "🙈 Sin mostrar tu cara"}</h3><ul>${CFG.set[m].map((x) => `<li><label><input type="checkbox"> ${esc(x)}</label></li>`).join("")}</ul></div>`).join("");
  $("se-texto").textContent = S.guion?.resultado ? S.guion.resultado.partes.map((p) => p.texto).join("\n\n") : "Escribe tu guion en el paso 4 y aparecerá aquí.";
}

// ------------------------------------------------------------------ 6 · video
const V = { medios: [], escenas: [], audio: null, grabadora: null, mod: null };
async function modVideo() { V.mod ||= await import("./creadores-video.js"); return V.mod; }
function estiloVideo() { return { fondo: $("vi-fondo").value, texto: $("vi-texto").value, acento: $("vi-acento").value, marca: S.perfil.marca || "", franja: "rgba(0,0,0,0.55)" }; }
function prepararEscenas() {
  const partes = S.guion?.resultado?.partes?.filter((p) => S.guion.formato !== "carrusel") || [];
  const nuevas = L.escenas(partes, V.medios);
  // Conserva lo que la persona ya editó si el número de escenas no cambió.
  V.escenas = V.escenas.length === nuevas.length
    ? V.escenas.map((e, k) => ({ ...nuevas[k], ...e, medio: e.medio >= 0 && V.medios.length ? Math.min(e.medio, V.medios.length - 1) : nuevas[k].medio })) : nuevas;
  if (!V.escenas.length && V.medios.length) V.escenas = V.medios.map((_, k) => ({ texto: "", medio: k, dur: 3 }));
}
function pintarEscenas() {
  prepararEscenas();
  $("vi-escenas").innerHTML = V.escenas.length ? V.escenas.map((e, k) => {
    const m = V.medios[e.medio];
    return `<div class="escena" data-escena="${k}">${m ? (m.tipo === "video" ? `<video src="${esc(m.el.src)}" muted></video>` : `<img src="${esc(m.el.src)}" alt="">`) : '<span class="meta">Sin imagen</span>'}
      <input data-e="texto" value="${esc(e.texto)}" aria-label="Texto de la escena ${k + 1}">
      <select data-e="medio" aria-label="Imagen o clip">${V.medios.map((x, j) => `<option value="${j}" ${j === e.medio ? "selected" : ""}>${j + 1}. ${esc(String(x.nombre).slice(0, 18))}</option>`).join("") || '<option value="-1">—</option>'}</select>
      <input data-e="dur" type="number" min="1" max="30" step="0.5" value="${e.dur}" aria-label="Segundos"></div>`;
  }).join("") + `<p class="meta">Total: ${Math.round(V.escenas.reduce((s, e) => s + Number(e.dur), 0))} s (más 3 s de créditos al final si usas imágenes libres).</p>`
    : '<p class="meta">Agrega fotos o clips (arriba) y escribe un guion (paso 4): cada parte del guion se vuelve una escena.</p>';
  previaCuadro(0);
}
async function previaCuadro(t) {
  const M = await modVideo(), c = $("vi-canvas"), [W, H] = M.LIENZO[$("vi-formato").value];
  if (c.width !== W) { c.width = W; c.height = H; }
  M.dibujarInstante(c.getContext("2d"), W, H, t, V.escenas.length ? V.escenas : [{ texto: S.guion?.resultado?.partes?.[0]?.texto || "Tu video aparece aquí", medio: -1, dur: 3 }], V.medios, estiloVideo());
}

// ------------------------------------------------------------------ 7 · publicar
function pintarPublicar() {
  const mias = S.perfil.redes?.length ? CFG.plataformas.filter((p) => S.perfil.redes.includes(p.id)) : CFG.plataformas;
  $("pu-plataformas").innerHTML = mias.map((p) => `<details class="tarjeta"><summary><b>${esc(p.nombre)}</b>: cómo recomienda los videos</summary><p>${esc(p.como)}</p>
    <ul>${p.consejos.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p class="meta">Fuente: <a href="${seguro(p.fuente)}" target="_blank" rel="noopener noreferrer">explicación oficial de ${esc(p.nombre)}</a></p></details>`).join("");
  const lista = ["La música, imágenes y clips que usé son míos o tienen licencia (y doy crédito)", "Las personas que salen de forma principal me dieron permiso; difuminé a desconocidos y placas",
    "No muestro datos de menores (escuela, uniforme, domicilio)", "Si hay marca o regalo de por medio, activé la etiqueta de colaboración pagada", "Si usé IA realista, activé la etiqueta de contenido alterado o sintético",
    "Revisé que no se vean direcciones, pantallas o documentos personales", "Las afirmaciones (salud, dinero, resultados) tienen sustento"];
  $("pu-checklist").innerHTML = `<ul>${lista.map((x) => `<li><label><input type="checkbox"> ${esc(x)}</label></li>`).join("")}</ul><p class="meta">Detalle de cada punto en el paso 10.</p>`;
}

// ------------------------------------------------------------------ 8 · métricas
function pintarMetricas() {
  $("me-red").innerHTML = REDES_PUB.map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join("");
  if (!$("me-fecha").value) $("me-fecha").value = new Date().toISOString().slice(0, 10);
  const c = L.compararPublicaciones(S.publicaciones);
  $("me-res").innerHTML = S.publicaciones.length ? `<div class="desliza"><table class="t"><tr><th>Pieza</th><th>Red</th><th>Fecha</th><th>Vistas</th><th>Interacción</th><th>Retención</th><th>Qué hacer</th><th></th></tr>
    ${S.publicaciones.map((p) => { const l = L.leerMetricas(p); return `<tr><td>${esc(p.titulo)}</td><td>${esc(p.red)}</td><td>${esc(p.fecha)}</td><td>${l.vistas.toLocaleString("es-MX")}</td>
      <td>${l.tasa == null ? "—" : `${l.tasa} %`}</td><td>${l.retencion == null ? "—" : `${l.retencion} %`}</td><td class="meta">${esc(l.consejos.join(" "))}</td><td><button type="button" data-quitar-pub="${esc(p.id)}">🗑️</button></td></tr>`; }).join("")}</table></div>
    <div class="tarjeta"><p><b>Interacción promedio:</b> ${c.promedio ?? "—"} % (me gusta + comentarios + compartidos + guardados entre vistas)</p>
      <p><b>🔁 Repite:</b> ${esc(c.repetir.map((p) => p.titulo).join(" · ") || "—")}</p><p><b>🔧 Ajusta:</b> ${esc(c.ajustar.map((p) => p.titulo).join(" · ") || "—")}</p></div>` : '<p class="meta">Guarda tu primera pieza para ver el análisis.</p>';
}

// ------------------------------------------------------------------ 9, 10 · guías
function pintarMonetizacion() {
  $("mo-lista").innerHTML = CFG.monetizacion.map((m) => `<div class="tarjeta"><h3>${esc(m.plataforma)}</h3><p><b>Requisitos:</b></p><ul>${m.requisitos.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    <p><b>Formas de ganar:</b> ${esc(m.formas.join(" · "))}</p><p class="meta"><a href="${seguro(m.fuente)}" target="_blank" rel="noopener noreferrer">Página oficial de ${esc(m.plataforma)}</a> · revisado ${esc(CFG.revisado)}</p></div>`).join("")
    + '<p class="meta">Otras fuentes de ingreso: colaboraciones con marcas (con contrato por escrito y etiqueta de publicidad), afiliados, productos o cursos propios y membresías. Los ingresos de plataformas extranjeras se declaran ante el SAT (en México); consulta a un contador.</p>';
}
function pintarLegal() {
  $("le-lista").innerHTML = CFG.legal.map((x) => `<details class="tarjeta"><summary><b>${esc(x.tema)}</b> <span class="chip">${esc(x.pais)}</span></summary><p>${esc(x.regla)}</p>
    <p><b>Qué hacer:</b></p><ul>${x.hacer.map((h) => `<li>${esc(h)}</li>`).join("")}</ul><p class="meta">Base: ${esc(x.fuente[0])} · <a href="${seguro(x.fuente[1])}" target="_blank" rel="noopener noreferrer">texto oficial</a></p></details>`).join("")
    + '<p class="meta">Resumen práctico, no es asesoría legal. Las leyes cambian: confirma en el texto oficial vigente. Para un caso concreto consulta a un abogado.</p>';
}

// ------------------------------------------------------------------ 11 · evaluación
function pintarEvaluacion() {
  $("ev-inicio").value = S.evaluacion.inicio || ""; $("ev-meta").value = S.evaluacion.meta || 3;
  const e = L.evaluacion30({ inicio: S.evaluacion.inicio, metaSemana: Number(S.evaluacion.meta) || 3, publicaciones: S.publicaciones });
  const COL = { verde: "#24733b", amarillo: "#c79100", rojo: "#b3261e" };
  $("ev-res").innerHTML = !e ? '<p class="meta">Elige la fecha de inicio para empezar.</p>' : `<div class="tarjeta"><p><span class="semaforo" style="background:${COL[e.color]}"></span>
    Día <b>${Math.min(30, e.dias + 1)}</b> de 30 · semana <b>${e.semana}</b> · publicaste <b>${e.hechas}</b> de <b>${e.esperadas}</b> piezas planeadas hasta hoy (${e.avance} %).</p>
    ${e.terminado ? "<p><b>🏁 Terminaste los 30 días.</b> Revisa el paso 8: repite las 3 mejores piezas, deja de hacer las que no funcionaron y decide si ajustas tu nicho.</p>" : ""}</div>
    ${CFG.evaluacion.semanas.map((s) => `<details class="tarjeta" ${s.n === e.semana ? "open" : ""}><summary><b>Semana ${s.n}</b>: ${esc(s.meta)}</summary><ul>${s.revisar.map((x) => `<li><label><input type="checkbox"> ${esc(x)}</label></li>`).join("")}</ul></details>`).join("")}`;
}

const PINTAR = { perfil: pintarPerfil, nicho: pintarNicho, ideas: pintarIdeas, guion: pintarGuion, set: pintarSet, video: pintarEscenas, publicar: pintarPublicar,
  metricas: pintarMetricas, monetizacion: pintarMonetizacion, legal: pintarLegal, evaluacion: pintarEvaluacion };

// ------------------------------------------------------------------ eventos
function eventos() {
  document.addEventListener("click", async (e) => {
    const irA = e.target.closest("[data-ir]"); if (irA) { ir(irA.dataset.ir); window.scrollTo({ top: $("cr-indice").offsetTop - 10, behavior: "smooth" }); return; }
    const modo = e.target.closest("#pe-modo [data-modo]"); if (modo) { S.perfil.modo = modo.dataset.modo; guardar("cr_perfil", S.perfil); pintarPerfil(); return; }
    const ni = e.target.closest("[data-nicho]"); if (ni) { S.nicho.id = ni.dataset.nicho; S.nicho.sub = CFG.nichos[ni.dataset.nicho].subnichos[0]; guardar("cr_nicho", S.nicho); pintarNicho(); return; }
    const q = e.target.closest("[data-quitar-idea]"); if (q) { S.ideas = S.ideas.filter((x) => x.id !== q.dataset.quitarIdea); guardar("cr_ideas", S.ideas); pintarIdeas(); return; }
    const g = e.target.closest("[data-guion]"); if (g) { S.guion = { ...(S.guion || { formato: "corto" }), idea: g.dataset.guion, resultado: null }; guardar("cr_guion", S.guion); ir("guion"); return; }
    const qp = e.target.closest("[data-quitar-pub]"); if (qp) { S.publicaciones = S.publicaciones.filter((x) => x.id !== qp.dataset.quitarPub); guardar("cr_publicaciones", S.publicaciones); pintarMetricas(); return; }
    if (e.target.id === "gu-copiar" && S.guion?.resultado) { try { await navigator.clipboard.writeText(L.guionTexto(S.guion.resultado)); e.target.textContent = "✔️ Copiado"; } catch { /* */ } }
    const lib = e.target.closest("[data-libre]");
    if (lib) {
      const x = JSON.parse(lib.dataset.libre), M = await modVideo();
      try { V.medios.push(await M.cargarMedio(x.url, x)); lib.closest("figure").style.outline = "3px solid var(--accent)"; pintarEscenas(); } catch (err) { $("vi-msg").textContent = err.message; }
    }
  });
  // 1
  for (const id of ["pe-marca", "pe-publico"]) $(id).addEventListener("input", () => { S.perfil.marca = $("pe-marca").value.trim(); S.perfil.publico = $("pe-publico").value.trim(); guardar("cr_perfil", S.perfil); });
  $("pe-redes").addEventListener("change", () => { S.perfil.redes = [...$("pe-redes").querySelectorAll("input:checked")].map((x) => x.value); guardar("cr_perfil", S.perfil); });
  // 2
  $("ni-objetivo").addEventListener("change", (e) => { S.nicho.objetivo = e.target.value; guardar("cr_nicho", S.nicho); });
  $("ni-detalle").addEventListener("change", (e) => { if (e.target.id === "ni-sub") { S.nicho.sub = e.target.value; guardar("cr_nicho", S.nicho); } });
  // 3
  $("id-agregar").addEventListener("click", () => {
    if (!puedeCrear()) { $("id-lista").insertAdjacentHTML("afterbegin", avisoCuenta()); return; }
    const t = $("id-texto").value.trim(); if (!t) return;
    S.ideas.push(nuevaIdea(t, $("id-interes").value, $("id-facil").value)); $("id-texto").value = ""; guardar("cr_ideas", S.ideas); pintarIdeas();
  });
  $("id-generar").addEventListener("click", () => {
    const n = CFG.nichos[S.nicho.id];
    if (!n) { $("id-lista").insertAdjacentHTML("afterbegin", '<p class="tarjeta">Primero elige tu nicho en el paso 2.</p>'); return; }
    const ya = new Set(S.ideas.map((x) => x.texto.toLowerCase()));
    for (const t of L.ideasDe(n, S.nicho.sub)) if (!ya.has(t.toLowerCase())) S.ideas.push(nuevaIdea(t));
    guardar("cr_ideas", S.ideas); pintarIdeas();
  });
  // 4
  $("gu-armar").addEventListener("click", () => {
    if (!puedeCrear()) { $("gu-salida").innerHTML = avisoCuenta(); return; }
    const idea = S.ideas.find((x) => x.id === $("gu-idea").value);
    if (!idea) { $("gu-salida").innerHTML = '<p class="tarjeta">Primero agrega una idea en el paso 3.</p>'; return; }
    const puntos = $("gu-puntos").value.split("\n").map((x) => x.trim()).filter(Boolean), formato = $("gu-formato").value, cta = $("gu-cta").value.trim();
    S.guion = { idea: idea.id, formato, puntos, cta, resultado: L.guion({ idea: idea.texto, formato, puntos, cta, publico: S.perfil.publico }) };
    guardar("cr_guion", S.guion); pintarSalidaGuion();
  });
  $("gu-salida").addEventListener("input", (e) => {
    const k = e.target.dataset.parte; if (k === undefined || !S.guion?.resultado) return;
    const p = S.guion.resultado.partes[k]; p.texto = e.target.value; p.seg = S.guion.formato === "carrusel" ? 0 : L.segundosDe(p.texto);
    S.guion.resultado.total = S.guion.resultado.partes.reduce((s, x) => s + x.seg, 0); guardar("cr_guion", S.guion);
  });
  // 5
  $("se-tp").addEventListener("click", () => {
    const caja = $("se-texto");
    if (tpReloj) { clearInterval(tpReloj); tpReloj = 0; $("se-tp").textContent = "▶️ Iniciar"; return; }
    caja.scrollTop = 0; $("se-tp").textContent = "⏸️ Pausar";
    tpReloj = setInterval(() => { caja.scrollTop += Number($("se-vel").value) / 2; if (caja.scrollTop + caja.clientHeight >= caja.scrollHeight) { clearInterval(tpReloj); tpReloj = 0; $("se-tp").textContent = "▶️ Iniciar"; } }, 50);
  });
  $("se-escuchar").addEventListener("click", () => {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance($("se-texto").textContent); u.lang = "es-MX"; speechSynthesis.speak(u);
  });
  // 6
  $("vi-archivos").addEventListener("change", async (e) => {
    const M = await modVideo();
    for (const f of e.target.files) { try { V.medios.push(await M.cargarMedio(f)); } catch (err) { $("vi-msg").textContent = err.message; } }
    pintarEscenas();
  });
  $("vi-buscar").addEventListener("click", async () => {
    const q = $("vi-q").value.trim(); if (q.length < 2) return;
    $("vi-galeria").innerHTML = '<p class="meta">Buscando…</p>';
    try {
      const M = await modVideo(), xs = await M.buscarLibres(q, $("vi-tipo").value);
      $("vi-galeria").innerHTML = xs.length ? xs.map((x) => `<figure>${x.miniatura ? `<img src="${esc(x.miniatura)}" alt="${esc(x.titulo)}" loading="lazy">` : '<div class="meta" style="height:100px">🎞️ Video</div>'}
        <figcaption>${esc(x.titulo.slice(0, 40))}<br><span class="meta">${esc(x.licencia)} · ${esc(x.autor.slice(0, 30))}</span><br><button type="button" data-libre="${esc(JSON.stringify(x))}">➕ Usar</button></figcaption></figure>`).join("")
        : '<p class="meta">Sin resultados con licencia libre. Prueba otras palabras (en inglés suele haber más).</p>';
    } catch (err) { $("vi-galeria").innerHTML = `<p class="error">${esc(err.message)}</p>`; }
  });
  $("vi-escenas").addEventListener("input", (e) => {
    const fila = e.target.closest("[data-escena]"); if (!fila) return;
    const es = V.escenas[fila.dataset.escena], k = e.target.dataset.e;
    es[k] = k === "texto" ? e.target.value : Number(e.target.value);
    if (k === "medio") pintarEscenas(); else previaCuadro(0);
  });
  for (const id of ["vi-formato", "vi-fondo", "vi-texto", "vi-acento"]) $(id).addEventListener("input", () => previaCuadro(0));
  $("vi-audio").addEventListener("change", (e) => { V.audio = e.target.files[0] || null; $("vi-audio-estado").textContent = V.audio ? `🎵 Audio: ${V.audio.name}` : "Sin audio."; });
  $("vi-grabar").addEventListener("click", async () => {
    const M = await modVideo();
    if (V.grabadora) { V.audio = await V.grabadora.detener(); V.grabadora = null; $("vi-grabar").textContent = "⏺️ Grabar mi voz"; $("vi-audio-estado").textContent = "🎙️ Tu voz quedó lista: se agrega al generar el video."; return; }
    try { V.grabadora = await M.grabarVoz(); $("vi-grabar").textContent = "⏹️ Detener grabación"; $("vi-audio-estado").textContent = "Grabando… lee tu guion (el paso 5 tiene el teleprompter)."; }
    catch { $("vi-audio-estado").textContent = "No se pudo usar el micrófono: revisa el permiso del navegador."; }
  });
  let previa = 0;
  $("vi-previa").addEventListener("click", () => {
    if (previa) { cancelAnimationFrame(previa); previa = 0; return; }
    const total = V.escenas.reduce((s, x) => s + Number(x.dur), 0), t0 = performance.now();
    const paso = () => { const t = (performance.now() - t0) / 1000; if (t > total) { previa = 0; return; } previaCuadro(t); previa = requestAnimationFrame(paso); };
    previa = requestAnimationFrame(paso);
  });
  $("vi-generar").addEventListener("click", async () => {
    if (!puedeCrear()) { $("vi-msg").innerHTML = avisoCuenta(); return; }
    if (!V.escenas.length) { $("vi-msg").textContent = "Agrega fotos o clips y un guion primero."; return; }
    const limite = cuenta.plan === "inicial" ? 60 : 180, total = V.escenas.reduce((s, x) => s + Number(x.dur), 0);
    if (total > limite) { $("vi-msg").textContent = `Tu plan permite videos de hasta ${limite} s; este dura ${Math.round(total)} s.`; return; }
    const M = await modVideo(), c = $("vi-canvas"), [W, H] = M.LIENZO[$("vi-formato").value];
    c.width = W; c.height = H; $("vi-generar").disabled = true; $("vi-msg").textContent = "Grabando el video en tiempo real… no cambies de pestaña.";
    try {
      const r = await M.grabarVideo({ canvas: c, escenas: V.escenas, medios: V.medios, estilo: estiloVideo(), audio: V.audio, alProgreso: (p) => { $("vi-prog").style.width = `${Math.round(p * 100)}%`; } });
      const a = document.createElement("a"); a.href = URL.createObjectURL(r.blob); a.download = `video-${$("vi-formato").value.replace(":", "x")}.${r.tipo.includes("mp4") ? "mp4" : "webm"}`; a.click();
      $("vi-msg").innerHTML = `✅ Video listo (${r.segundos} s, ${r.tipo.includes("mp4") ? "MP4" : "WebM"}). ${r.tipo.includes("mp4") ? "" : "Si una red no acepta WebM, conviértelo a MP4 (YouTube sí lo acepta)."} Súbelo desde la app de cada red con el texto del paso 7.`;
    } catch (err) { $("vi-msg").innerHTML = `<span class="error">${esc(err.message)}</span>`; }
    $("vi-generar").disabled = false;
  });
  // 7: trae el guion a los textos por red
  $("pu-desde-guion").addEventListener("click", () => {
    const g = S.guion?.resultado; if (!g) return;
    const partes = g.partes, ultimo = partes.at(-1);
    $("tx-titulo").value = partes[0].texto; $("tx-cuerpo").value = partes.slice(1, -1).map((p) => p.texto).join("\n"); $("tx-cta").value = ultimo.texto;
    const n = CFG.nichos[S.nicho.id]; if (n && !$("tx-etiquetas").value) $("tx-etiquetas").value = [S.nicho.sub, n.nombre.split(" ")[0]].join(", ");
    $("im-titulo").value = partes[0].texto.slice(0, 120); if (S.perfil.marca) $("im-marca").value = S.perfil.marca;
    for (const id of ["tx-titulo", "im-titulo"]) $(id).dispatchEvent(new Event("input", { bubbles: true }));
  });
  // 8
  $("me-agregar").addEventListener("click", () => {
    if (!puedeCrear()) { $("me-res").insertAdjacentHTML("afterbegin", avisoCuenta()); return; }
    const p = { id: Math.random().toString(36).slice(2, 10), titulo: $("me-titulo").value.trim() || "Sin título", red: $("me-red").value, fecha: $("me-fecha").value };
    for (const k of ["vistas", "me_gusta", "comentarios", "compartidos", "guardados", "seguidores", "retencion"]) p[k] = $(`me-${k}`).value === "" ? "" : Number($(`me-${k}`).value);
    S.publicaciones.push(p); guardar("cr_publicaciones", S.publicaciones);
    for (const k of ["titulo", "vistas", "me_gusta", "comentarios", "compartidos", "guardados", "seguidores", "retencion"]) $(`me-${k}`).value = "";
    pintarMetricas();
  });
  // 11
  for (const id of ["ev-inicio", "ev-meta"]) $(id).addEventListener("change", () => { S.evaluacion = { inicio: $("ev-inicio").value, meta: Number($("ev-meta").value) || 3 }; guardar("cr_evaluacion", S.evaluacion); pintarEvaluacion(); });
}

function pintarPlanes() {
  $("cr-planes").innerHTML = CFG.planes.map((p) => `<div class="plan"><b>${esc(p.nombre)}</b><b class="precio">${p.precio_usd ? `${p.precio_usd} USD/mes` : `Gratis ${p.dias} días`}</b>
    <ul>${p.incluye.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("")
    + '<p class="meta">Para contratar un plan escribe a DOMINUS desde <a href="soporte.html">Soporte</a>; el acceso se activa en tu misma cuenta.</p>';
}

if (typeof document !== "undefined" && $("cr-indice")) {
  CFG = await fetch("config/creadores.json", { cache: "no-cache" }).then((r) => r.json());
  pintarPlanes();
  await cargarCuenta();
  eventos();
  ir(paso);
}
