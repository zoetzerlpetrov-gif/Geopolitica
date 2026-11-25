import { enAdmin } from "./admin_origen.js";
// Marketing de DOMINUS (marketing.html, solo admin): tablero de métricas, publicaciones listas para revisar y publicar,
// calendario semanal, plan (públicos, mensajes, pilares, fases con avance), revisión periódica y reglas legales.
// Fuentes: config/marketing.json (el plan), data/vivos/marketing_borradores.json (tools/marketing/contenido.py, cada
// corrida de «Datos en movimiento») y data/marketing/metricas.json (tools/marketing/metricas_youtube.py, diario).
// Lo que marca la administración (publicado, descartado, tareas hechas, notas de revisión) queda en este navegador y se
// puede exportar e importar. Ningún botón publica solo: abre la red social con el texto listo para que lo revises.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const n0 = (v) => (v == null || !Number.isFinite(Number(v)) ? "—" : Number(v).toLocaleString("es-MX"));
export const REPO = "zoetzerlpetrov-gif/Geopolitica";
const CLAVE = "gp_marketing_estado";

export const REDES = {
  x: { nombre: "X", url: (t) => `https://x.com/intent/post?text=${encodeURIComponent(t)}` },
  bluesky: { nombre: "Bluesky", url: (t) => `https://bsky.app/intent/compose?text=${encodeURIComponent(t)}` },
  threads: { nombre: "Threads", url: (t) => `https://www.threads.net/intent/post?text=${encodeURIComponent(t)}` },
  linkedin: { nombre: "LinkedIn", url: (t) => `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(t)}` },
  facebook: { nombre: "Facebook", url: (t) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent((t.match(/https?:\/\/\S+/) || [""])[0])}` },
  telegram: { nombre: "Telegram", url: (t) => `https://t.me/share/url?url=${encodeURIComponent((t.match(/https?:\/\/\S+/) || [""])[0])}&text=${encodeURIComponent(t.replace(/https?:\/\/\S+/, "").trim())}` },
  whatsapp: { nombre: "WhatsApp", url: (t) => `https://wa.me/?text=${encodeURIComponent(t)}` },
  // Instagram y TikTok no aceptan texto por enlace: se copia el texto y se abre la página para subir el contenido.
  instagram: { nombre: "Instagram", copiar: true, url: () => "https://www.instagram.com/" },
  tiktok: { nombre: "TikTok", copiar: true, url: () => "https://www.tiktok.com/upload" },
};

/** Caracteres como los cuenta X (cada enlace vale 23). */
export const largoX = (t) => String(t || "").replace(/https?:\/\/\S+/g, "x".repeat(23)).length;

export function leerEstado(alm) {
  try { return { publicados: {}, descartados: {}, tareas: {}, notas: [], ...JSON.parse(alm?.getItem(CLAVE) || "{}") }; } catch { return { publicados: {}, descartados: {}, tareas: {}, notas: [] }; }
}
export function guardarEstado(alm, e) { try { alm?.setItem(CLAVE, JSON.stringify(e)); } catch { /* sin almacenamiento */ } }

/** Avance del plan: tareas hechas / total por fase. */
export function avance(plan, tareas = {}) {
  return (plan?.fases || []).map((f) => {
    const t = f.tareas || [], h = t.filter((x) => tareas[`${f.id}.${x.id}`]).length;
    return { id: f.id, nombre: f.nombre, hechas: h, total: t.length, pct: t.length ? Math.round((h / t.length) * 100) : 0 };
  });
}

/** Cambio en N días a partir del historial diario. */
export function cambio(historial, campo, dias) {
  const h = (historial || []).filter((x) => x[campo] != null);
  if (h.length < 2) return null;
  const ult = h[h.length - 1], lim = new Date(new Date(`${ult.fecha}T00:00:00Z`).getTime() - dias * 86400000).toISOString().slice(0, 10);
  const base = h.find((x) => x.fecha >= lim) || h[0];
  return base === ult ? null : ult[campo] - base[campo];
}

/** Línea SVG simple de un campo del historial. */
export function svgLinea(historial, campo, color = "#C8102E") {
  const h = (historial || []).filter((x) => x[campo] != null);
  if (h.length < 2) return `<p class="meta">La tendencia aparece a partir del segundo día de datos.</p>`;
  const W = 300, H = 70, vals = h.map((x) => x[campo]), mn = Math.min(...vals), mx = Math.max(...vals), r = mx - mn || 1;
  const pts = vals.map((v, i) => `${(4 + (i / (vals.length - 1)) * (W - 8)).toFixed(1)},${(H - 6 - ((v - mn) / r) * (H - 14)).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 ${W} ${H}" class="mk-svg" role="img" aria-label="Tendencia de ${esc(campo)}"><polyline fill="none" stroke="${color}" stroke-width="2" points="${pts}"/>
    <text x="4" y="10" font-size="9" fill="currentColor">${n0(mx)}</text><text x="4" y="${H - 1}" font-size="9" fill="currentColor">${n0(mn)}</text>
    <text x="${W - 4}" y="${H - 1}" font-size="9" text-anchor="end" fill="currentColor">${esc(h[h.length - 1].fecha)}</text></svg>`;
}

export function htmlTablero(m, plan, est, borradores) {
  const c = m?.canal || {}, h = m?.historial || [];
  const pub = (m?.videos || []).filter((v) => v.privacidad === "public").length, priv = (m?.videos || []).filter((v) => v.privacidad === "private").length;
  const semana = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const hechasSemana = Object.values(est.publicados || {}).filter((x) => (x.fecha || "") >= semana).length;
  const pendientes = (borradores || []).filter((b) => !est.publicados[b.id] && !est.descartados[b.id]).length;
  const delta = (campo) => { const d = cambio(h, campo, 30); return d == null ? "" : `<span class="meta">${d >= 0 ? "+" : ""}${n0(d)} en 30 días</span>`; };
  const tarjeta = (t, v, extra = "") => `<div class="kpi"><div class="meta">${esc(t)}</div><div class="kpi-v">${v}</div>${extra}</div>`;
  const av = avance(plan, est.tareas);
  return `${m?.aviso ? `<p class="aviso">⚠️ ${esc(m.aviso)}</p>` : ""}
    <div class="kpis">
      ${tarjeta("Suscriptores de YouTube", n0(c.suscriptores), delta("suscriptores"))}
      ${tarjeta("Vistas totales", n0(c.vistas), delta("vistas"))}
      ${tarjeta("Videos (últimos 25)", `${pub} públicos · ${priv} privados`, priv ? `<span class="meta">Los privados no los ve nadie: publícalos en YouTube Studio.</span>` : "")}
      ${tarjeta("Publicaciones esta semana", n0(hechasSemana), `<span class="meta">${pendientes} borradores pendientes</span>`)}
      ${av.map((f) => tarjeta(f.nombre, `${f.pct} %`, `<span class="meta">${f.hechas} de ${f.total} tareas</span>`)).join("")}
    </div>
    ${m ? `<div class="dos"><div><h4>Suscriptores</h4>${svgLinea(h, "suscriptores")}</div><div><h4>Vistas</h4>${svgLinea(h, "vistas", "#1565C0")}</div></div>
      <p class="meta">Métricas de ${esc(c.titulo || "YouTube")} al ${esc(String(m.generado_utc || "").replace("T", " ").slice(0, 16))} UTC (se actualizan una vez al día).</p>` : `<p class="meta">Aún no hay métricas de YouTube: se generan con el flujo «Comentarios de YouTube» (una vez al día) cuando el permiso de YouTube está vigente.</p>`}
    <p class="meta">Visitas al sitio, registros y conversión: se agregan cuando el sitio esté en Cloudflare (Web Analytics, sin cookies) y se conecte Supabase.</p>`;
}

export function htmlVideos(m) {
  const v = m?.videos || [];
  if (!v.length) return `<div class="aviso"><p><b>Aún no hay métricas del canal.</b> YouTube rechaza la consulta (HTTP 403): el permiso guardado
    en <code>YT_REFRESH_TOKEN</code> solo permite subir videos, no leer el canal ni los comentarios.</p>
    <ol><li>En tu computadora, dentro de la carpeta del proyecto, corre <code>python3 tools/noticiero_video/autorizar.py</code>.</li>
    <li>En la pantalla de Google elige la cuenta del canal y <b>marca todas las casillas</b> (subir videos y «Ver, editar y eliminar
      de forma permanente tus videos, calificaciones, comentarios y subtítulos»). Si alguna queda sin marcar, el script avisa qué falta.</li>
    <li>Copia el valor nuevo que imprime y reemplaza el secreto en GitHub → Settings → Secrets and variables → Actions → <code>YT_REFRESH_TOKEN</code> → Update.</li>
    <li>En Actions corre «Comentarios de YouTube» (Run workflow). En unos minutos aparecen aquí los videos con vistas, me gusta y comentarios.</li></ol></div>`;
  return `<table class="tabla-ficha"><tr><th>Fecha</th><th>Video</th><th>Estado</th><th>Vistas</th><th>Me gusta</th><th>Comentarios</th></tr>
    ${v.slice(0, 15).map((x) => `<tr><td>${esc(x.fecha)}</td><td><a href="https://www.youtube.com/watch?v=${encodeURIComponent(x.id)}" target="_blank" rel="noopener noreferrer">${esc(x.titulo)}</a></td>
      <td>${x.privacidad === "public" ? "🌐 público" : x.privacidad === "private" ? "🔒 privado" : esc(x.privacidad)}</td><td>${n0(x.vistas)}</td><td>${n0(x.me_gusta)}</td><td>${n0(x.comentarios)}</td></tr>`).join("")}</table>`;
}

export function htmlBorrador(b, est, red) {
  const t = b.textos?.[red] || "", estado = est.publicados[b.id] ? "publicado" : est.descartados[b.id] ? "descartado" : "";
  const largo = red === "x" ? largoX(t) : t.length;
  return `<div class="tarjeta borrador ${estado}" data-id="${esc(b.id)}">
    <div><span class="chip">${esc(b.fecha)}</span> <span class="chip">${esc(b.pilar)}</span> ${(b.audiencias || []).map((a) => `<span class="chip">${esc(a)}</span>`).join(" ")}
      ${estado ? `<b>${estado === "publicado" ? "✅ Publicado" : "🗑️ Descartado"}</b>` : ""}</div>
    <textarea class="mk-texto" aria-label="Texto para ${esc(REDES[red]?.nombre || red)}">${esc(t)}</textarea>
    <div class="meta">${largo} caracteres${red === "x" ? " (X cuenta cada enlace como 23)" : ""} · Fuente: ${b.fuente_url ? `<a href="${esc(b.fuente_url)}" target="_blank" rel="noopener noreferrer">${esc(b.fuente)}</a>` : esc(b.fuente)}</div>
    <div class="barra"><button data-acc="copiar">📋 Copiar</button><button data-acc="abrir" class="si">↗️ Abrir en ${esc(REDES[red]?.nombre || red)}</button>
      <button data-acc="publicado">✅ Marcar publicado</button><button data-acc="descartar">🗑️ Descartar</button></div></div>`;
}

/** Calendario semanal sugerido a partir de la frecuencia de cada canal y los pilares. */
export function semana(plan) {
  const dias = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  const filas = dias.map((d) => ({ dia: d, items: [] }));
  const poner = (idx, txt) => idx.forEach((i) => filas[i].items.push(txt));
  for (const c of plan?.canales || []) {
    const f = String(c.frecuencia || "");
    if (/diario|al día/.test(f)) poner([0, 1, 2, 3, 4, 5, 6], c.nombre);
    else if (/3 por semana/.test(f)) poner([0, 2, 4], c.nombre);
    else if (/semanal/.test(f)) poner([4], c.nombre);
  }
  const pil = plan?.pilares || [];
  const temas = [pil.find((p) => p.id === "dato"), pil.find((p) => p.id === "herramienta"), pil.find((p) => p.id === "contraste"), pil.find((p) => p.id === "dato"), pil.find((p) => p.id === "metodo"), null, null];
  return filas.map((f, i) => ({ ...f, tema: temas[i]?.nombre || "Brújula Diaria y reciclar lo mejor de la semana" }));
}

export function htmlPlan(plan, est) {
  if (!plan) return `<p class="meta">No se pudo leer config/marketing.json.</p>`;
  const p = plan.posicionamiento || {};
  return `<p><b>${esc(plan.marca)}</b>: ${esc(plan.lema)}</p><p class="meta">${esc(p.que_es)} Presupuesto: ${plan.presupuesto_mxn_mes ? `$${n0(plan.presupuesto_mxn_mes)} MXN al mes` : "cero (orgánico)"}.</p>
    <div class="dos"><div><h4>Diferenciadores</h4><ul>${(p.diferenciadores || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <div><h4>No decir</h4><ul>${(p.no_decir || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div></div>
    <h4>Públicos</h4><table class="tabla-ficha"><tr><th>Público</th><th>Problema</th><th>Mensaje</th><th>Lo que lo demuestra</th><th>Oferta · canales · llamado</th></tr>
      ${(plan.audiencias || []).map((a) => `<tr><td><b>${esc(a.nombre)}</b></td><td>${esc(a.problema)}</td><td>${esc(a.mensaje)}</td><td>${esc(a.prueba)}</td><td>${esc(a.oferta)} · ${esc((a.canales || []).join(", "))} · «${esc(a.cta)}»</td></tr>`).join("")}</table>
    <h4>Pilares de contenido</h4><ul>${(plan.pilares || []).map((x) => `<li><b>${esc(x.nombre)}</b> (${esc(x.frecuencia)}): ${esc(x.descripcion)}</li>`).join("")}</ul>
    <h4>Canales</h4><table class="tabla-ficha"><tr><th>Canal</th><th>Formato</th><th>Frecuencia</th><th>Publicación</th></tr>
      ${(plan.canales || []).map((c) => `<tr><td>${esc(c.nombre)}</td><td>${esc(c.formato)}</td><td>${esc(c.frecuencia)}</td><td>${esc(c.publicacion)}</td></tr>`).join("")}</table>
    <h4>Fases y tareas</h4>${(plan.fases || []).map((f) => `<details class="tarjeta" open><summary>${esc(f.nombre)}</summary><p class="meta">${esc(f.objetivo)}</p>
      ${(f.tareas || []).map((t) => `<label class="tarea"><input type="checkbox" data-tarea="${esc(f.id)}.${esc(t.id)}" ${est.tareas[`${f.id}.${t.id}`] ? "checked" : ""}> ${esc(t.texto)}</label>`).join("")}</details>`).join("")}
    <h4>KPI y metas</h4><table class="tabla-ficha"><tr><th>Indicador</th><th>Fuente</th><th>Meta a 90 días</th></tr>
      ${(plan.kpis || []).map((k) => `<tr><td>${esc(k.nombre)}</td><td>${esc(k.fuente)}</td><td>${k.meta_90d == null ? `<span class="meta">por definir</span>` : n0(k.meta_90d)}</td></tr>`).join("")}</table>`;
}

export function proximaRevision(hoy = new Date()) {
  const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()));
  const lunes = new Date(d.getTime() + ((8 - d.getUTCDay()) % 7 || 7) * 86400000);
  let m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  while (m.getUTCDay() !== 1) m = new Date(m.getTime() + 86400000);
  return { semanal: lunes.toISOString().slice(0, 10), mensual: m.toISOString().slice(0, 10) };
}

/** Publicaciones marcadas y visitas por red en los últimos `dias` (visitas: contador del Worker, sin datos personales). */
export function porRed(est, visitas, plan, dias = 30, hoy = new Date()) {
  const desde = new Date(hoy.getTime() - dias * 86400000).toISOString().slice(0, 10);
  const filas = {};
  const fila = (r) => (filas[r] ??= { red: r, publicaciones: 0, visitas: 0 });
  for (const p of Object.values(est.publicados || {})) if ((p.fecha || "") >= desde && p.red) fila(p.red).publicaciones++;
  for (const v of visitas?.filas || []) if (v.dia >= desde) fila(v.red).visitas += Number(v.n) || 0;
  const nombre = Object.fromEntries((plan?.canales || []).map((c) => [c.id, c.nombre]));
  return Object.values(filas).map((f) => ({ ...f, nombre: nombre[f.red] || REDES[f.red]?.nombre || f.red, por_pub: f.publicaciones ? Math.round((f.visitas / f.publicaciones) * 10) / 10 : null }))
    .sort((a, b) => b.visitas - a.visitas || b.publicaciones - a.publicaciones);
}

export function htmlPorRed(filas, hayVisitas) {
  const nota = hayVisitas ? "Visitas = personas que llegaron al sitio desde un enlace de esa red (total por día, sin datos personales)."
    : "Las visitas por red se ven al abrir esta página desde 🔐 Acceso administrativo (el contador vive en el Worker).";
  if (!filas.length) return `<p class="meta">Aún no hay publicaciones marcadas ni visitas con UTM en los últimos 30 días. ${nota}</p>`;
  return `<table class="tabla-ficha"><tr><th>Red</th><th>Publicaciones (30 días)</th><th>Visitas al sitio (30 días)</th><th>Visitas por publicación</th></tr>
    ${filas.map((f) => `<tr><td>${esc(f.nombre)}</td><td>${n0(f.publicaciones)}</td><td>${hayVisitas ? n0(f.visitas) : "—"}</td><td>${hayVisitas && f.por_pub != null ? f.por_pub : "—"}</td></tr>`).join("")}</table>
    <p class="meta">${nota} Las métricas internas de cada red (alcance, reacciones) se consultan en su propia analítica: LinkedIn y X no dan esos datos gratis por API.</p>`;
}

export const borradorSerie = (s) => [s.gancho, "", ...(s.estructura || []).map((x) => `→ ${x}: [desarrolla con un ejemplo]`), "", s.cierre].join("\n");

export function htmlLinkedin(lp) {
  if (!lp) return "";
  const v = lp.decision_visibilidad || {}, p = lp.perfil || {}, e = lp.estilo || {};
  return `<p>${esc(lp.objetivo)}</p>
    <div class="tarjeta aviso"><b>Primero decide la visibilidad.</b> ${esc(v.nota)}<ul>${(v.opciones || []).map((o) => `<li><b>${esc(o.nombre)}:</b> ${esc(o.como)} <i>${esc(o.riesgo)}</i></li>`).join("")}</ul><p>${esc(v.recomendacion)}</p></div>
    <h4>Perfil</h4><p class="meta">Titular (elige uno):</p><ol>${(p.titulares || []).map((t) => `<li>${esc(t)} <button class="mk-copiar" data-t="${esc(t)}">📋</button></li>`).join("")}</ol>
    <details class="tarjeta"><summary>«Acerca de»</summary><textarea class="mk-texto" style="min-height:220px">${esc(p.acerca_de)}</textarea></details>
    <p class="meta">Destacado: ${(p.destacado || []).map(esc).join(" · ")}</p><p class="meta">Aptitudes: ${(p.habilidades || []).map(esc).join(", ")}</p>
    <div class="dos"><div><h4>Sí</h4><ul>${(e.si || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div><div><h4>No</h4><ul>${(e.no || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div></div>
    <p class="meta">${esc(e.frecuencia)} Usa enlaces con <code>utm_source=linkedin_personal</code> para medir las visitas que llegan de tu perfil.</p>
    <h4>Serie de 12 publicaciones (estructura; escribe con tu experiencia real)</h4>
    ${(lp.serie || []).map((s, i) => `<details class="tarjeta"><summary>${i + 1}. ${esc(s.titulo)} <span class="chip">${esc(s.formato)}</span></summary>
      <p><b>Primera línea:</b> ${esc(s.gancho)}</p><ol>${(s.estructura || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
      <p><b>Cierre:</b> ${esc(s.cierre)}</p><p class="meta">Qué mostrar: ${esc(s.muestra)}</p>
      ${s.texto ? `<textarea class="mk-texto" style="min-height:260px" aria-label="Publicación lista">${esc(s.texto)}</textarea><div class="meta">${s.texto.length} caracteres (LinkedIn corta en «ver más» cerca de 1,300). Revisa que el dato siga vigente antes de publicar.</div>` : ""}
      <div class="barra"><button class="mk-copiar" data-t="${esc(s.texto || borradorSerie(s))}">📋 ${s.texto ? "Copiar publicación" : "Copiar borrador"}</button></div></details>`).join("")}`;
}

/** Guía de lanzamiento (config/marketing.json → lanzamiento): redes por prioridad, segmentos y pasos con casillas. */
export function htmlLanzamiento(l, est = { tareas: {} }) {
  if (!l) return `<p class="meta">Falta «lanzamiento» en config/marketing.json.</p>`;
  const redes = (l.redes || []).slice().sort((a, b) => a.prioridad - b.prioridad);
  return `<div class="tarjeta"><h4>¿Qué redes abrir y por qué?</h4>
    <div class="desliza"><table class="tabla-ficha"><tr><th>#</th><th>Red</th><th>Para quién</th><th>Qué publicar</th><th>Cada cuánto</th><th>Horario (CDMX)</th></tr>
    ${redes.map((r) => `<tr><td>${esc(r.prioridad)}</td><td><b>${esc(r.nombre)}</b><div class="meta">${esc(r.por_que)}</div></td><td>${esc(r.para_quien)}</td>
      <td>${esc(r.formatos)}</td><td>${esc(r.frecuencia)}</td><td>${esc(r.horarios)}</td></tr>`).join("")}</table></div>
    <p class="meta">${esc(l.despues || "")}</p><p class="meta">${esc(l._nota || "")}</p></div>
    <div class="tarjeta"><h4>¿A quién le hablamos?</h4><div class="dos">${(l.segmentos || []).map((g) => `<div><b>${esc(g.nombre)}</b>
      <div class="meta">${esc(g.quien)}</div><p>«${esc(g.mensaje)}»</p><div class="meta">Qué se le ofrece: ${esc(g.oferta)}</div></div>`).join("")}</div></div>
    ${(l.pasos || []).map((p, i) => `<div class="tarjeta"><h4>${esc(p.cuando)}</h4>${(p.tareas || []).map((t, j) => {
      const k = `lanz-${i}-${j}`;
      return `<label class="tarea"><input type="checkbox" data-tarea="${k}" ${est.tareas?.[k] ? "checked" : ""}> ${esc(t)}${est.tareas?.[k] ? ` <span class="meta">(${esc(est.tareas[k])})</span>` : ""}</label>`;
    }).join("")}</div>`).join("")}
    <div class="tarjeta"><h4>Reglas</h4><ul>${(l.reglas || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`;
}

/** Piezas visuales del día (tools/marketing/piezas.mjs → data/marketing/piezas/indice.json). */
export function htmlPiezas(ind, base = "data/marketing/piezas/") {
  const ps = ind?.piezas || [];
  if (!ps.length) return `<p class="meta">Aún no hay piezas. Se generan cada mañana con el flujo «Piezas de marketing» (también se puede correr a mano en Actions).</p>`;
  const url = (f) => base + encodeURIComponent(f);
  return `<p class="meta">Piezas del ${esc(ind.fecha)} · generadas ${esc(String(ind.generado_utc || "").replace("T", " ").slice(0, 16))} UTC.
    Descarga la que toque hoy, súbela a la red y pega el texto de «2 · Contenido listo» (mismo tema).</p>
    <div class="piezas">${ps.map((p) => `<div class="tarjeta pieza"><span class="chip">${esc(p.pilar)}</span>
      <p><b>${esc(p.titular)}</b></p><div class="pieza-medios">
      ${p.archivos?.post ? `<a href="${url(p.archivos.post)}" target="_blank" rel="noopener"><img src="${url(p.archivos.post)}" alt="Publicación: ${esc(p.titular)}" loading="lazy"></a>` : ""}
      ${p.archivos?.short ? `<video src="${url(p.archivos.short)}" controls muted playsinline preload="none" poster="${p.archivos.historia ? url(p.archivos.historia) : ""}" aria-label="Short: ${esc(p.titular)}"></video>` : ""}</div>
      <div class="barra">${p.archivos?.post ? `<a class="boton" href="${url(p.archivos.post)}" download>⬇️ Publicación 1080×1350</a>` : ""}
        ${p.archivos?.historia ? `<a class="boton" href="${url(p.archivos.historia)}" download>⬇️ Historia 1080×1920</a>` : ""}
        ${p.archivos?.short ? `<a class="boton" href="${url(p.archivos.short)}" download>⬇️ Short / Reel / TikTok (15 s)</a>` : ""}</div>
      <p class="meta">Fuente: ${p.fuente_url ? `<a href="${esc(p.fuente_url)}" target="_blank" rel="noopener noreferrer">${esc(p.fuente)}</a>` : esc(p.fuente || "")}</p></div>`).join("")}</div>`;
}

export const urlEditarPlan = () => `https://github.com/${REPO}/edit/main/config/marketing.json`;

export async function iniciar(doc = document) {
  const $ = (id) => doc.getElementById(id);
  // «await» dentro del try: un archivo vacío o dañado se trata como «sin datos» en lugar de romper la página.
  const pedir = async (u) => { try { const r = await fetch(u, { cache: "no-store" }); return r.ok ? await r.json() : null; } catch { return null; } };
  const [plan, bor, met, piezas] = await Promise.all([pedir("config/marketing.json"), pedir("data/vivos/marketing_borradores.json"), pedir("data/marketing/metricas.json"),
    pedir("data/marketing/piezas/indice.json")]);
  const est = leerEstado(globalThis.localStorage);
  const borradores = bor?.borradores || [];
  const guardar = () => guardarEstado(globalThis.localStorage, est);

  const pintarTablero = () => { $("mk-tablero").innerHTML = htmlTablero(met, plan, est, borradores); $("mk-videos").innerHTML = htmlVideos(met); };
  $("mk-red").innerHTML = Object.entries(REDES).map(([k, r]) => `<option value="${k}">${esc(r.nombre)}</option>`).join("");
  const pintarBorradores = () => {
    const red = $("mk-red").value, ver = $("mk-ver").value;
    const lista = borradores.filter((b) => ver === "todos" || (ver === "pendientes" ? !est.publicados[b.id] && !est.descartados[b.id] : est.publicados[b.id]));
    $("mk-borradores").innerHTML = lista.map((b) => htmlBorrador(b, est, red)).join("") || `<p class="meta">${borradores.length ? "Nada en este filtro." : "Aún no hay borradores: se generan con «Datos en movimiento»."}</p>`;
    $("mk-bor-estado").textContent = bor ? `${borradores.length} borradores de los últimos 30 días · generados ${String(bor.generado_utc || "").replace("T", " ").slice(0, 16)} UTC. ${bor.nota || ""}` : "";
  };
  $("mk-red").addEventListener("change", pintarBorradores);
  $("mk-ver").addEventListener("change", pintarBorradores);
  $("mk-borradores").addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const caja = b.closest(".borrador"), id = caja.dataset.id, texto = caja.querySelector("textarea").value, red = $("mk-red").value;
    if (b.dataset.acc === "copiar") { try { await navigator.clipboard.writeText(texto); b.textContent = "✔️ Copiado"; } catch { caja.querySelector("textarea").select(); } return; }
    if (b.dataset.acc === "abrir") {
      if (REDES[red].copiar) { try { await navigator.clipboard.writeText(texto); } catch { /* */ } $("mk-bor-estado").textContent = `Texto copiado: pégalo como descripción en ${REDES[red].nombre} (la imagen o el video se suben desde la app).`; }
      window.open(REDES[red].url(texto), "_blank", "noopener"); return;
    }
    if (b.dataset.acc === "publicado") { est.publicados[id] = { fecha: new Date().toISOString().slice(0, 10), red }; delete est.descartados[id]; }
    if (b.dataset.acc === "descartar") { est.descartados[id] = { fecha: new Date().toISOString().slice(0, 10) }; delete est.publicados[id]; }
    guardar(); pintarBorradores(); pintarTablero();
  });

  $("mk-semana").innerHTML = `<table class="tabla-ficha"><tr><th>Día</th><th>Tema sugerido</th><th>Canales</th></tr>${semana(plan).map((f) => `<tr><td>${f.dia}</td><td>${esc(f.tema)}</td><td>${esc(f.items.join(", "))}</td></tr>`).join("")}</table>`;
  $("mk-plan").innerHTML = htmlPlan(plan, est);
  if ($("mk-lanzamiento")) {
    $("mk-lanzamiento").innerHTML = htmlLanzamiento(plan?.lanzamiento, est);
    $("mk-lanzamiento").addEventListener("change", (e) => { const k = e.target.dataset?.tarea; if (!k) return; if (e.target.checked) est.tareas[k] = new Date().toISOString().slice(0, 10); else delete est.tareas[k]; guardar(); });
  }
  if ($("mk-piezas")) $("mk-piezas").innerHTML = htmlPiezas(piezas);
  $("mk-plan").addEventListener("change", (e) => { const k = e.target.dataset?.tarea; if (!k) return; if (e.target.checked) est.tareas[k] = new Date().toISOString().slice(0, 10); else delete est.tareas[k]; guardar(); pintarTablero(); });

  const rev = proximaRevision(), pr = plan?.revision || {};
  $("mk-revision").innerHTML = `<p>Próxima revisión semanal: <b>${rev.semanal}</b> · mensual: <b>${rev.mensual}</b></p>
    <div class="dos"><div><h4>Semanal</h4><ol>${(pr.semanal?.preguntas || []).map((q) => `<li>${esc(q)}</li>`).join("")}</ol></div><div><h4>Mensual</h4><ol>${(pr.mensual?.preguntas || []).map((q) => `<li>${esc(q)}</li>`).join("")}</ol></div></div>`;
  const pintarNotas = () => { $("mk-notas").innerHTML = est.notas.slice().reverse().map((n) => `<li><b>${esc(n.fecha)}</b>: ${esc(n.texto)}</li>`).join("") || `<li class="meta">Sin notas.</li>`; };
  $("mk-nota-agregar").addEventListener("click", () => { const t = $("mk-nota").value.trim(); if (!t) return; est.notas.push({ fecha: new Date().toISOString().slice(0, 10), texto: t }); $("mk-nota").value = ""; guardar(); pintarNotas(); });
  $("mk-legal").innerHTML = (plan?.legal || []).map((x) => `<li>${esc(x)}</li>`).join("");
  $("mk-editar").href = urlEditarPlan();
  $("mk-exportar").addEventListener("click", () => { const a = doc.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(est, null, 1)], { type: "application/json" })); a.download = `marketing-avance-${new Date().toISOString().slice(0, 10)}.json`; a.click(); });
  $("mk-importar").addEventListener("change", async (e) => { const f = e.target.files?.[0]; if (!f) return; try { Object.assign(est, leerEstado({ getItem: () => "" }), JSON.parse(await f.text())); guardar(); location.reload(); } catch { alert("El archivo no es un respaldo válido."); } });
  // Visitas por red (contador del Worker; solo con la sesión de administración en el dominio del Worker).
  let visitas = null;
  if (enAdmin(location.hostname)) {
    try { const r = await fetch("/admin/huella/marketing/visitas", { cache: "no-store" }); if (r.ok) visitas = await r.json(); } catch { /* */ }
  }
  const pintarRedes = () => { $("mk-redes").innerHTML = htmlPorRed(porRed(est, visitas, plan), !!visitas); };
  $("mk-linkedin").innerHTML = htmlLinkedin(plan?.linkedin_personal);
  doc.addEventListener("click", async (e) => {
    const b = e.target.closest("button.mk-copiar"); if (!b) return;
    try { await navigator.clipboard.writeText(b.dataset.t); b.textContent = "✔️"; } catch { /* */ }
  });
  $("mk-borradores").addEventListener("click", () => setTimeout(pintarRedes, 50));
  pintarTablero(); pintarBorradores(); pintarNotas(); pintarRedes();
}

if (typeof document !== "undefined" && document.getElementById("mk-tablero")) iniciar();
