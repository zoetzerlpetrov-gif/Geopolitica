// Economía (economia.html, solo admin): indicadores de México, EUA y la UE e índices «curiosos». Lee config/economia.json
// (qué es cada indicador) y data/economia/indicadores.json (datos del workflow «Economía», una vez al día). No depende de
// Pulso Ciudadano ni del Portafolio: si el Portafolio no responde, solo su pestaña dice «no disponible».
import { esc, getJSON } from "./util.js";

const $ = (id) => document.getElementById(id);
const PORTAFOLIO = "https://zoetzerlpetrov-gif.github.io/portafolio/daily_report.json";
const REGIONES = { MX: "🇲🇽 México", US: "🇺🇸 Estados Unidos", EU: "🇪🇺 Unión Europea", GL: "🌐 Global" };
const CONF = { oficial: "🟢 Oficial", aproximacion: "🟡 Aproximación", anecdota: "⚪ Anécdota" };
// Meses sin dato nuevo antes de marcarlo como «dato viejo», según su frecuencia.
const VIEJO = { diaria: 1, mensual: 4, trimestral: 7, semestral: 9, anual: 15 };

/** Último valor, anterior, hace un año y comparación contra el promedio de los 12 puntos previos. */
export function resumen(puntos, frecuencia = "mensual") {
  const p = (puntos || []).filter((x) => x && x[1] != null);
  if (!p.length) return null;
  const [fecha, valor] = p.at(-1);
  const previo = p.length > 1 ? p.at(-2)[1] : null;
  const porAnio = { mensual: 12, diaria: 12, trimestral: 4, semestral: 2, anual: 1 }[frecuencia] || 12;
  const haceAnio = p.length > porAnio ? p.at(-1 - porAnio)[1] : null;
  const base = p.slice(-13, -1).map((x) => x[1]);
  const promedio = base.length ? base.reduce((a, b) => a + b, 0) / base.length : null;
  return { fecha, valor, previo, haceAnio, promedio };
}

/** Señal según cómo se lee el indicador: verde si va hacia lo bueno contra su promedio reciente, rojo si va hacia lo malo. */
export function senal(r, lectura) {
  if (!r || r.promedio == null || lectura === "neutral") return "gris";
  const tol = Math.max(Math.abs(r.promedio) * 0.01, 1e-9);
  if (Math.abs(r.valor - r.promedio) <= tol) return "gris";
  const arriba = r.valor > r.promedio;
  return (arriba === (lectura === "sube_bien")) ? "verde" : "rojo";
}

/** ¿El último dato es más viejo de lo normal para su frecuencia? */
export function viejo(fecha, frecuencia, hoy = new Date()) {
  if (!fecha) return true;
  const [a, m] = fecha.split("-").map(Number);
  const meses = (hoy.getUTCFullYear() - a) * 12 + (hoy.getUTCMonth() + 1 - m);
  return meses > (VIEJO[frecuencia] ?? 4);
}

/** Polilínea SVG simple (sin ejes) para la tendencia. */
export function linea(puntos, w = 220, h = 46) {
  const v = puntos.map((x) => x[1]);
  if (v.length < 2) return "";
  const min = Math.min(...v), max = Math.max(...v), r = max - min || 1;
  const pts = v.map((y, i) => `${(i / (v.length - 1) * (w - 4) + 2).toFixed(1)},${(h - 2 - (y - min) / r * (h - 4)).toFixed(1)}`).join(" ");
  const cero = min < 0 && max > 0 ? `<line x1="0" x2="${w}" y1="${(h - 2 - (0 - min) / r * (h - 4)).toFixed(1)}" y2="${(h - 2 - (0 - min) / r * (h - 4)).toFixed(1)}" class="cero"/>` : "";
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Tendencia">${cero}<polyline points="${pts}"/></svg>`;
}

const num = (v) => (v == null ? "—" : Math.abs(v) >= 1e6 ? v.toLocaleString("es-MX", { maximumFractionDigits: 0 })
  : v.toLocaleString("es-MX", { maximumFractionDigits: Math.abs(v) < 10 ? 2 : 1 }));
const fechaTxt = (f) => (f ? new Date(`${f}T12:00:00Z`).toLocaleDateString("es-MX", { year: "numeric", month: "short", day: f.endsWith("-01") ? undefined : "numeric" }) : "—");
const dif = (a, b) => (a == null || b == null ? "" : `${a - b >= 0 ? "▲" : "▼"} ${num(Math.abs(a - b))}`);

export function tarjeta(meta, dato) {
  const pts = dato?.puntos || [];
  const r = resumen(pts, meta.frecuencia);
  const s = senal(r, meta.lectura);
  const f = meta.fuente;
  const nota = !pts.length ? `<p class="aviso">Sin datos todavía${dato?.error ? `: ${esc(dato.error)}` : ""}.</p>`
    : dato?.error ? `<p class="aviso">La fuente falló en la última corrida; se muestra el último dato bueno. (${esc(dato.error)})</p>`
      : viejo(r.fecha, meta.frecuencia) ? `<p class="aviso">Dato viejo: la fuente no ha publicado algo más reciente.</p>` : "";
  return `<article class="ind s-${s}" data-id="${esc(meta.id)}">
    <header><h3>${esc(meta.nombre)}</h3><span class="chip">${esc(CONF[meta.confiabilidad] || "")}</span></header>
    ${r ? `<p class="valor">${esc(num(r.valor))} <small>${esc(meta.unidad)}</small></p>
      <p class="meta">${esc(fechaTxt(r.fecha))} · ${esc(meta.frecuencia)} · vs. anterior ${esc(dif(r.valor, r.previo))}${r.haceAnio != null ? ` · vs. hace un año ${esc(dif(r.valor, r.haceAnio))}` : ""}</p>
      <div class="graf"><figure>${linea(pts)}<figcaption>10 años</figcaption></figure><figure>${linea(pts.slice(-13))}<figcaption>último año</figcaption></figure></div>` : ""}
    ${nota}
    <p>${esc(meta.que_mide)}</p>${meta.como_leer ? `<p class="meta">💡 ${esc(meta.como_leer)}</p>` : ""}
    <p class="meta">${meta.lectura === "sube_bien" ? "Subir es buena señal." : meta.lectura === "sube_mal" ? "Subir es mala señal." : "No es bueno ni malo por sí solo."}
      Fuente: ${f?.enlace ? `<a href="${esc(f.enlace)}" target="_blank" rel="noopener noreferrer">${esc(f.nombre || f.tipo)}</a>` : esc(f?.nombre || "cálculo propio con las dos series")}</p>
  </article>`;
}

function pintarRegion(cont, metas, datos) {
  const grupos = [["macro", "Economía general"], ["consumo", "Consumo y hogares"], ["curioso", "Índices curiosos"]];
  cont.innerHTML = grupos.map(([g, t]) => {
    const m = metas.filter((x) => x.grupo === g);
    return m.length ? `<h2>${esc(t)}</h2><div class="rejilla">${m.map((x) => tarjeta(x, datos[x.id])).join("")}</div>` : "";
  }).join("");
}

export function conteo(metas, datos) {
  const c = { verde: 0, rojo: 0, gris: 0 };
  for (const m of metas) { const r = resumen(datos[m.id]?.puntos, m.frecuencia); if (r) c[senal(r, m.lectura)]++; }
  return c;
}

async function portafolio() {
  const cont = $("p-portafolio");
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
    const r = await fetch(PORTAFOLIO, { cache: "no-store", signal: ctl.signal }); clearTimeout(t);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json(), rep = d.report || {};
    const lista = (k) => (rep[k] || []).slice(0, 12).map((x) => `<li><b>${esc(x.ticker)}</b> ${esc(x.name || "")} · ${esc(num(x.price))}
      <span class="meta">${esc((x.reasons || []).join(" · "))}</span></li>`).join("") || "<li class=\"meta\">Ninguno.</li>";
    cont.querySelector(".pf-datos").innerHTML = `<p class="meta">Generado: ${esc(String(d.generated_at || "").slice(0, 16).replace("T", " "))} (hora de Ciudad de México) ·
      comprar ${(rep.comprar || []).length} · esperar ${(rep.esperar || []).length} · vender ${(rep.vender || []).length} · con error ${(rep.error || []).length}</p>
      <div class="rejilla"><div class="ind"><h3>Señal «comprar»</h3><ul>${lista("comprar")}</ul></div><div class="ind"><h3>Señal «vender»</h3><ul>${lista("vender")}</ul></div></div>`;
  } catch (e) {
    cont.querySelector(".pf-datos").innerHTML = `<p class="aviso">El Portafolio no está disponible en este momento (${esc(e.name === "AbortError" ? "no respondió" : e.message)}). El resto de esta página no depende de él.</p>`;
  }
}

async function iniciar() {
  document.querySelector(".pestanas").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-p]"); if (!b) return;
    for (const x of document.querySelectorAll(".pestanas button")) x.setAttribute("aria-selected", String(x === b));
    for (const p of document.querySelectorAll("section.panel")) p.hidden = p.id !== `p-${b.dataset.p}`;
    history.replaceState(null, "", `#${b.dataset.p}`);
    if (b.dataset.p === "portafolio" && !b.dataset.cargado) { b.dataset.cargado = "1"; portafolio(); }
  });
  const cfg = await getJSON("config/economia.json", { bust: true });
  let datos = {}, gen = null;
  try {
    const d = await getJSON("data/economia/indicadores.json", { bust: true });
    datos = Object.fromEntries(d.indicadores.map((i) => [i.id, i])); gen = d.generado_utc;
  } catch { /* sin datos publicados todavía */ }
  const metas = [...cfg.indicadores, ...cfg.derivados];
  $("ec-estado").textContent = gen ? `Datos actualizados: ${new Date(gen).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })} (se actualizan una vez al día).`
    : "Aún no hay datos publicados: el workflow «Economía» corre una vez al día.";
  for (const reg of ["MX", "US", "EU", "GL"]) pintarRegion($(`p-${reg.toLowerCase()}`), metas.filter((m) => m.region === reg), datos);
  $("ec-resumen").innerHTML = ["MX", "US", "EU"].map((reg) => {
    const c = conteo(metas.filter((m) => m.region === reg && m.grupo !== "curioso"), datos), ci = conteo(metas.filter((m) => m.region === reg && m.grupo === "curioso"), datos);
    return `<div class="ind"><h3>${esc(REGIONES[reg])}</h3><p>Indicadores: 🟢 ${c.verde} · 🔴 ${c.rojo} · ⚪ ${c.gris}</p><p class="meta">Curiosos: 🟢 ${ci.verde} · 🔴 ${ci.rojo} · ⚪ ${ci.gris}</p></div>`;
  }).join("");
  $("ec-sin-datos").innerHTML = cfg.sin_datos.map((x) => `<article class="ind"><h3>${esc(x.nombre)}</h3><span class="chip">⚪ Anécdota o sin datos abiertos</span>
    <p>${esc(x.que_mide)}</p><p class="meta">${esc(x.nota)}${x.enlace ? ` <a href="${esc(x.enlace)}" target="_blank" rel="noopener noreferrer">Quién lo publica</a>` : ""}</p></article>`).join("");
  const ini = location.hash.slice(1);
  if (ini) document.querySelector(`.pestanas button[data-p="${CSS.escape(ini)}"]`)?.click();
}

if (typeof document !== "undefined" && $("p-mx")) iniciar();
