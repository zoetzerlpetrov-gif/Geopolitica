// Centro de control (estado.html, solo admin): estado diario de los procesos automáticos (data/estado/, workflow
// «Estado de los procesos»), revisión en vivo desde el navegador (API pública de GitHub, sin llaves), bitácora de
// incidencias de 90 días y lector de informes de soporte. Las reglas son las de config/procesos.json y las mismas de
// tools/estado_procesos/estado_procesos.py.
import { esc, getJSON } from "./util.js";
import { leerBitacora, informe, leerInforme, borrarBitacora } from "./bitacora.js";

const $ = (id) => document.getElementById(id);
const ORDEN = { ok: 0, sin_datos: 1, atraso: 2, falla: 3, aviso: 1 };
const FALLA = ["failure", "timed_out", "startup_failure"];
export const ETIQ = { ok: "🟢 Al día", atraso: "🟡 Atraso", falla: "🔴 Falla", sin_datos: "⚪ Sin datos", aviso: "🟠 Aviso" };
const REPO = "zoetzerlpetrov-gif/Geopolitica";

const h = (ahora, t) => (t ? Math.round((ahora - new Date(t)) / 36e5 * 10) / 10 : null);

export function calificar(horas, max, seguidas = 0) {
  if (horas == null || horas > 2 * max || seguidas >= 3) return "falla";
  if (horas > max || seguidas >= 1) return "atraso";
  return "ok";
}

/** Igual que evaluar_workflow() de Python, con las corridas de la API (más recientes primero). */
export function evaluarWorkflow(p, corridas, ahora = new Date()) {
  const term = corridas.filter((c) => c.status === "completed");
  const ok = term.find((c) => c.conclusion === "success");
  let seguidas = 0;
  for (const c of term) { if (["cancelled", "skipped"].includes(c.conclusion)) continue; if (FALLA.includes(c.conclusion)) seguidas++; else break; }
  const dia = corridas.filter((c) => ahora - new Date(c.created_at) <= 864e5);
  const cuenta = { exito: 0, falla: 0, cancelada: 0, en_curso: 0 };
  for (const c of dia) {
    const k = c.status !== "completed" ? "en_curso" : c.conclusion === "success" ? "exito" : FALLA.includes(c.conclusion) ? "falla" : c.conclusion === "cancelled" ? "cancelada" : null;
    if (k) cuenta[k]++;
  }
  const horas = h(ahora, ok?.updated_at);
  let estado = corridas.length ? calificar(horas, p.max_horas, seguidas) : "falla";
  const partes = [];
  if (!ok) partes.push("Ninguna corrida reciente terminó bien.");
  else if (horas > p.max_horas) partes.push(`Lleva ${horas} h sin terminar bien (límite ${p.max_horas} h).`);
  if (seguidas) partes.push(`${seguidas} falla(s) seguida(s).`);
  if (cuenta.cancelada && cuenta.cancelada >= Math.max(3, cuenta.exito)) {
    partes.push(`${cuenta.cancelada} corridas canceladas en 24 h: revisar la concurrencia del workflow.`);
    if (ORDEN[estado] < ORDEN.atraso) estado = "atraso";
  }
  const u = corridas[0];
  const dur = term.filter((c) => c.conclusion === "success").slice(0, 10).map((c) => (new Date(c.updated_at) - new Date(c.run_started_at || c.created_at)) / 6e4);
  return { ...p, estado, duracion_media_min: dur.length ? Math.round(dur.reduce((a, b) => a + b, 0) / dur.length * 10) / 10 : null, ultimo_exito_utc: ok?.updated_at || null, horas_sin_exito: horas, fallas_seguidas: seguidas, corridas_24h: cuenta,
    ultima_corrida: u ? { estado: u.conclusion || u.status, inicio_utc: u.created_at, url: u.html_url } : null, detalle: partes.join(" ") || "Al día." };
}

/** Fuentes con error dentro de un archivo publicado («pasos», «fuentes» o «errores»). */
/** datos.a.b para la ruta «a.b»; undefined si falta algún tramo. */
export const valor = (datos, ruta) => String(ruta || "").split(".").reduce((x, k) => (x && typeof x === "object" ? x[k] : undefined), datos);

export function erroresDe(datos, tipo) {
  const v = tipo && datos ? valor(datos, tipo) : null, out = [];
  if (Array.isArray(v)) for (const x of v) {
    if (typeof x === "string") out.push(x.slice(0, 160));
    else if (x && x.estado != null && x.estado !== "ok") out.push(`${x.nombre || x.id}: ${String(x.error || x.estado).slice(0, 160)}`);
  } else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) {
    if (typeof x === "string" && /^error/i.test(x)) out.push(`${k}: ${x.slice(0, 160)}`);
    else if (x && typeof x === "object" && x.estado != null && x.estado !== "ok") out.push(`${k}: ${String(x.error || x.estado).slice(0, 160)}`);
  }
  return out.slice(0, 25);
}

export function evaluarDato(regla, datos, ahora = new Date()) {
  if (!datos) return { ...regla, estado: "falla", generado_utc: null, horas: null, errores: [], detalle: "No se pudo leer el archivo publicado." };
  const t = datos[regla.campo] || null, horas = h(ahora, t), errores = erroresDe(datos, regla.errores);
  let detalle = !t ? "Sin fecha en el archivo." : horas > regla.max_horas ? `Generado hace ${horas} h (límite ${regla.max_horas} h).` : "Al día.";
  if (errores.length) detalle += ` ${errores.length} fuente(s) con error (se conservan sus datos anteriores).`;
  let estado = calificar(horas, regla.max_horas);
  const m = regla.minimo;  // p. ej. el Portafolio: al día pero sin una sola noticia también es un problema
  if (m) {
    const n = valor(datos, m.campo) ?? 0;
    if (typeof n !== "number" || n < m.valor) {
      detalle += ` ${m.texto || m.campo}: ${n} (mínimo ${m.valor}).`;
      if (ORDEN[estado] < ORDEN.atraso) estado = "atraso";
    }
  }
  return { ...regla, estado, generado_utc: t, horas, errores, detalle };
}

export const peor = (items) => items.reduce((a, x) => (ORDEN[x.estado] > ORDEN[a] ? x.estado : a), "ok");
const local = (t) => (t ? new Date(t).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "—");

function pintar(res, origen) {
  const todos = [...res.workflows, ...res.datos];
  const n = (k) => todos.filter((x) => x.estado === k).length;
  $("es-resumen").innerHTML = `<div class="semaforo s-${esc(res.estado_global)}">${esc(ETIQ[res.estado_global] || res.estado_global)}</div>
    <p>${esc(origen)} · ${esc(local(res.fecha_utc))} (hora de tu equipo)</p>
    <p class="meta">🟢 ${n("ok")} al día · 🟡 ${n("atraso")} con atraso · 🔴 ${n("falla")} en falla · ⚪ ${n("sin_datos")} sin datos</p>`;
  $("es-procesos").innerHTML = res.workflows.map((w) => `<tr class="f-${esc(w.estado)}"><td>${esc(ETIQ[w.estado] || w.estado)}</td>
    <td><b>${esc(w.nombre)}</b><br><span class="meta">cada ${esc(w.cada || "—")} · ${esc(w.afecta || "")}</span></td>
    <td>${esc(local(w.ultimo_exito_utc))}${w.horas_sin_exito != null ? `<br><span class="meta">hace ${w.horas_sin_exito} h</span>` : ""}</td>
    <td>${w.corridas_24h ? `✅ ${w.corridas_24h.exito} · ❌ ${w.corridas_24h.falla} · ⏹ ${w.corridas_24h.cancelada} · ⏳ ${w.corridas_24h.en_curso}` : "—"}</td>
    <td>${w.duracion_media_min != null ? `${w.duracion_media_min} min` : "—"}</td>
    <td>${esc(w.detalle)}${w.pasos_fallidos?.length ? `<br><span class="meta">Pasos fallidos: ${esc(w.pasos_fallidos.join("; "))}</span>` : ""}
      ${w.pasos_lentos?.length ? `<details><summary class="meta">Pasos más lentos</summary><span class="meta">${w.pasos_lentos.map((p) => `${esc(p.paso)}: ${p.min} min`).join("<br>")}</span></details>` : ""}
      ${w.ultima_corrida?.url ? `<br><a href="${esc(w.ultima_corrida.url)}" target="_blank" rel="noopener noreferrer">Última corrida (${esc(w.ultima_corrida.estado || "")})</a>` : ""}</td></tr>`).join("");
  $("es-datos").innerHTML = res.datos.map((d) => `<tr class="f-${esc(d.estado)}"><td>${esc(ETIQ[d.estado] || d.estado)}</td><td><b>${esc(d.nombre)}</b><br><code>${esc(d.archivo)}</code></td>
    <td>${esc(local(d.generado_utc))}${d.horas != null ? `<br><span class="meta">hace ${d.horas} h (límite ${d.max_horas} h)</span>` : ""}</td>
    <td>${esc(d.detalle)}${d.errores?.length ? `<details><summary>${d.errores.length} fuente(s) con error</summary><ul class="meta">${d.errores.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></details>` : ""}</td></tr>`).join("");
}

async function enVivo() {
  const btn = $("es-vivo"); btn.disabled = true; btn.textContent = "Revisando…";
  try {
    const cfg = await getJSON("config/procesos.json", { bust: true }), ahora = new Date();
    const workflows = await Promise.all(cfg.workflows.map(async (p) => {
      try {
        const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${p.workflow}/runs?branch=main&per_page=60`);
        if (!r.ok) throw new Error(r.status === 403 ? "límite de consultas de GitHub (60 por hora): intenta más tarde" : `HTTP ${r.status}`);
        return evaluarWorkflow(p, (await r.json()).workflow_runs || [], ahora);
      } catch (e) { return { ...p, estado: "sin_datos", detalle: `No se pudo consultar GitHub: ${e.message}` }; }
    }));
    const datos = await Promise.all(cfg.datos.map(async (d) => evaluarDato(d, await getJSON(d.archivo, { bust: true }).catch(() => null), ahora)));
    const res = { fecha_utc: ahora.toISOString(), workflows, datos };
    res.estado_global = peor([...workflows, ...datos]);
    pintar(res, "Revisión en vivo desde este navegador");
  } finally { btn.disabled = false; btn.textContent = "🔄 Revisar ahora (en vivo)"; }
}

function pintarBitacora(bit) {
  const f = $("es-bit-filtro").value, q = $("es-bit-q").value.trim().toLowerCase();
  const filas = bit.filter((e) => (!f || e.estado === f || e.tipo === f) && (!q || `${e.nombre} ${e.detalle}`.toLowerCase().includes(q)));
  $("es-bit").innerHTML = `<tr><th>Fecha</th><th>Estado</th><th>Tipo</th><th>Proceso o dato</th><th>Detalle</th></tr>` + filas.slice(0, 400).map((e) =>
    `<tr class="f-${esc(e.estado)}"><td>${esc(local(e.fecha_utc))}</td><td>${esc(ETIQ[e.estado] || e.estado)}</td><td>${esc(e.tipo)}</td><td>${esc(e.nombre)}</td>
      <td>${esc(e.detalle)}${e.url ? ` <a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">corrida</a>` : ""}</td></tr>`).join("")
    + (filas.length ? "" : `<tr><td colspan="5">Sin incidencias con ese filtro.</td></tr>`);
}

function pintarHistorial(hist) {
  $("es-hist").innerHTML = hist.slice(-30).map((x) => `<span class="dia s-${esc(x.global)}" title="${esc(x.fecha_utc.slice(0, 10))}: ${esc(ETIQ[x.global] || x.global)} · ${x.ok} ok, ${x.atraso} atraso, ${x.falla} falla"></span>`).join("")
    || `<span class="meta">Sin historial todavía.</span>`;
}

function soporte() {
  const tabla = (filas) => `<tr><th>Fecha</th><th>Página</th><th>Tipo</th><th>Mensaje</th></tr>` + filas.map((x) =>
    `<tr><td>${esc(x.t.slice(0, 19).replace("T", " "))}</td><td>${esc(x.pagina)}</td><td>${esc(x.tipo)}</td><td>${esc(x.msg)}${x.veces > 1 ? ` (×${x.veces})` : ""}</td></tr>`).join("");
  const mio = () => { const b = leerBitacora(); $("so-mio").innerHTML = b.length ? tabla(b.slice().reverse()) : `<tr><td>Este navegador no tiene errores registrados.</td></tr>`; };
  mio();
  $("so-borrar").addEventListener("click", () => { borrarBitacora(); mio(); });
  $("so-copiar").addEventListener("click", () => navigator.clipboard?.writeText(informe(leerBitacora())));
  $("so-leer").addEventListener("click", () => {
    const { cab, filas } = leerInforme($("so-pegado").value);
    $("so-cab").innerHTML = Object.entries(cab).map(([k, v]) => `<b>${esc(k)}:</b> ${esc(v)}`).join("<br>");
    $("so-tabla").innerHTML = filas.length ? tabla(filas) : `<tr><td>No se reconocieron entradas. Pega el texto completo del informe.</td></tr>`;
  });
}

async function iniciar() {
  document.querySelector(".pestanas").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-p]"); if (!b) return;
    for (const x of document.querySelectorAll(".pestanas button")) x.setAttribute("aria-selected", String(x === b));
    for (const p of document.querySelectorAll("section.panel")) p.hidden = p.id !== `p-${b.dataset.p}`;
    history.replaceState(null, "", `#${b.dataset.p}`);
  });
  const ini = location.hash.slice(1);
  if (ini) document.querySelector(`.pestanas button[data-p="${CSS.escape(ini)}"]`)?.click();
  $("es-vivo").addEventListener("click", enVivo);
  soporte();
  try {
    pintar(await getJSON("data/estado/ultimo.json", { bust: true }), "Revisión diaria automática");
    pintarHistorial(await getJSON("data/estado/historial.json", { bust: true }).catch(() => []));
  } catch {
    $("es-resumen").innerHTML = `<p class="meta">Aún no hay revisión diaria publicada (workflow «Estado de los procesos», 07:07 de Ciudad de México). Usa «Revisar ahora».</p>`;
  }
  const bit = await getJSON("data/estado/bitacora.json", { bust: true }).catch(() => []);
  for (const id of ["es-bit-filtro", "es-bit-q"]) $(id).addEventListener("input", () => pintarBitacora(bit));
  pintarBitacora(bit);
}

if (typeof document !== "undefined" && $("p-procesos")) iniciar();
