// Tableros de DOMINUS OPS (sin DOM): catálogo de widgets, tableros predefinidos, dibujo de cada widget como HTML/SVG,
// validación de lo que proponga la IA y empaquetado del War Room para compartir por enlace.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const n0 = (x) => (x == null || !Number.isFinite(Number(x)) ? "—" : Number(x).toLocaleString("es-MX", { maximumFractionDigits: 0 }));
const COLOR = { bajo: "#2E7D32", medio: "#F9A825", alto: "#E65100", crítico: "#B71C1C", verde: "#2E7D32", amarillo: "#F9A825", ambar: "#F9A825", rojo: "#B71C1C" };

/** Widgets disponibles: tipo → nombre, descripción (también la lee la IA) y ancho sugerido (1–3 columnas). */
export const WIDGETS = {
  dmi_total: ["Índice de madurez (DMI)", "Número del DMI y su nivel", 1],
  riesgo_total: ["Pérdida esperada por riesgos", "Suma de la pérdida anual esperada y del VaR 95 % del registro", 1],
  eventos_total: ["Eventos en los países del cliente", "Cuántos eventos vigentes y cuántos graves", 1],
  kpi_n: ["KPIs por semáforo", "Cuántos KPIs en verde, ámbar y rojo", 1],
  reloj: ["Reloj y actualización", "Hora UTC, hora local y última actualización de datos", 1],
  dmi_radar: ["Radar de madurez", "Radar de las 9 dimensiones del DMI", 1],
  fases_avance: ["Avance de las 6 fases", "Barras de avance por fase", 2],
  kpis_semaforo: ["Tabla de KPIs", "KPIs con meta, valor, dueño y semáforo", 2],
  riesgos_matriz: ["Matriz de riesgos 5×5", "Riesgos simulados por probabilidad e impacto", 1],
  riesgos_top: ["Riesgos principales", "Los riesgos con mayor nivel y pérdida", 2],
  riesgos_perdida_cat: ["Pérdida esperada por categoría", "Barras por categoría de riesgo", 2],
  gob_semaforo: ["Gobernanza", "Semáforo de las dimensiones de gobierno", 2],
  eventos_area: ["Eventos por tema", "Barras de eventos por área temática en los países del cliente", 2],
  eventos_graves: ["Eventos graves recientes", "Lista con enlace a la fuente", 2],
  indice_pais: ["Índice de riesgo por país", "Índice DOMINUS (30 días) de cada país del cliente", 1],
  texto: ["Nota", "Texto libre del consultor", 1],
};

/** Tableros que vienen de fábrica. */
export const PREDEFINIDOS = [
  { id: "ejecutivo", nombre: "Ejecutivo (dirección general)", widgets: ["dmi_total", "riesgo_total", "eventos_total", "dmi_radar", "fases_avance", "riesgos_top", "kpis_semaforo"] },
  { id: "riesgos", nombre: "Riesgos (comité de riesgos)", widgets: ["riesgo_total", "riesgos_matriz", "riesgos_perdida_cat", "riesgos_top", "indice_pais"] },
  { id: "operacion", nombre: "Operación y KPIs", widgets: ["kpi_n", "dmi_total", "kpis_semaforo", "fases_avance", "gob_semaforo"] },
  { id: "warroom", nombre: "War Room (cliente, tiempo real)", widgets: ["reloj", "eventos_total", "indice_pais", "riesgo_total", "eventos_area", "eventos_graves", "riesgos_matriz", "kpis_semaforo"] },
].map((t) => ({ ...t, widgets: t.widgets.map((tipo) => ({ tipo, titulo: WIDGETS[tipo][0] })) }));

const barras = (filas, max = Math.max(1, ...filas.map((f) => f.v))) => `<div class="tb-barras">${filas.map((f) => `<div class="tb-fila"><span>${esc(f.k)}</span><span class="tb-barra"><i style="width:${Math.round((f.v / max) * 100)}%;background:${f.c || "#C8102E"}"></i></span><b>${esc(f.t ?? n0(f.v))}</b></div>`).join("")}</div>`;
const numero = (v, sub, c = "") => `<div class="tb-num" style="color:${c}">${v}</div><div class="tb-sub">${sub}</div>`;
const nivel = (r) => r.nivel || "";

/** Radar SVG genérico (valores 0–5). */
function radar(etiquetas, valores) {
  const n = etiquetas.length, c = 110, r = 80, pt = (k, v) => { const a = -Math.PI / 2 + (2 * Math.PI * k) / n; return [c + r * (v / 5) * Math.cos(a), c + r * (v / 5) * Math.sin(a)]; };
  const malla = [1, 2, 3, 4, 5].map((v) => `<polygon points="${etiquetas.map((_, k) => pt(k, v).join(",")).join(" ")}" fill="none" stroke="#8884"/>`).join("");
  return `<svg viewBox="-24 0 268 220" class="tb-radar" fill="currentColor">${malla}<polygon points="${valores.map((v, k) => pt(k, v || 0).join(",")).join(" ")}" fill="#C8102E55" stroke="#C8102E"/>
    ${etiquetas.map((e, k) => { const [x, y] = pt(k, 6.1); return `<text x="${x}" y="${y}" text-anchor="middle" font-size="9" fill="currentColor">${esc(e.split(" ")[0])}</text>`; }).join("")}</svg>`;
}

/**
 * Dibuja un widget con los datos del tablero. `d` = { cliente, dmi: {total, nivel, puntos, dimensiones}, fases, kpi, esc, gob, gobDims,
 * eventos, paises (iso3 → nombre), indice (iso3 → {indice}), actualizado, nombresArea }.
 */
export function widgetHTML(w, d) {
  const evs = d.eventos || [], esc_ = d.esc || [];
  const cuerpo = (() => {
    switch (w.tipo) {
      case "dmi_total": return numero(d.dmi?.total == null ? "—" : d.dmi.total.toFixed(1), d.dmi?.nivel ? `Nivel ${esc(d.dmi.nivel[0])} · ${esc(d.dmi.nivel[1])}` : "Sin medir");
      case "riesgo_total": { const pe = esc_.reduce((s, r) => s + (r.perdida || 0), 0), v = esc_.reduce((s, r) => s + (r.var95 || 0), 0);
        return numero(n0(pe), `pérdida anual esperada · VaR 95 % sumado ${n0(v)} · ${esc_.length} riesgos`); }
      case "eventos_total": { const g = evs.filter((e) => e.severidad >= 4).length; return numero(evs.length, `eventos vigentes · <b style="color:${g ? COLOR.rojo : COLOR.verde}">${g} graves</b>`); }
      case "kpi_n": { const c = { verde: 0, ambar: 0, rojo: 0 }; for (const k of d.kpi || []) if (c[k.estado] != null) c[k.estado]++;
        return `<div class="tb-semaf">${Object.entries(c).map(([k, v]) => `<span style="background:${COLOR[k]}">${v}</span>`).join("")}</div><div class="tb-sub">verde · ámbar · rojo</div>`; }
      case "reloj": return numero(new Date().toISOString().slice(11, 16) + " UTC", `local ${new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })} · datos ${esc(String(d.actualizado || "").slice(0, 16).replace("T", " "))}`);
      case "dmi_radar": return d.dmi?.dimensiones ? radar(d.dmi.dimensiones, d.dmi.dimensiones.map((x) => Number(d.dmi.puntos?.[x]) || 0)) : `<p class="tb-sub">Sin datos</p>`;
      case "fases_avance": return barras((d.fases || []).map((f) => ({ k: f.fase.replace(/^Fase /, ""), v: f.pct, t: `${f.pct} %`, c: f.pct >= 70 ? COLOR.verde : f.pct >= 10 ? COLOR.medio : "#999" })), 100);
      case "kpis_semaforo": return (d.kpi || []).length ? `<table class="tb-t"><tr><th>KPI</th><th>Meta</th><th>Valor</th><th>Dueño</th></tr>${d.kpi.map((k) => `<tr><td><span class="tb-p" style="background:${COLOR[k.estado] || "#999"}"></span>${esc(k.nombre)}</td><td>${esc(k.meta)}</td><td>${esc(k.valor)}</td><td>${esc(k.dueno)}</td></tr>`).join("")}</table>` : `<p class="tb-sub">Sin KPIs</p>`;
      case "riesgos_matriz": { const m = Array.from({ length: 5 }, () => Array(5).fill(0)); for (const r of esc_) if (r.nivel_prob && r.nivel_imp) m[5 - r.nivel_prob][r.nivel_imp - 1]++;
        const col = (p, i) => { const x = p * i; return x >= 15 ? COLOR.crítico : x >= 10 ? COLOR.alto : x >= 5 ? COLOR.medio : COLOR.bajo; };
        return `<div class="tb-matriz">${m.map((f, k) => f.map((v, i) => `<span style="background:${col(5 - k, i + 1)}${v ? "" : "55"}">${v || ""}</span>`).join("")).join("")}</div><div class="tb-sub">probabilidad ↑ · impacto →</div>`; }
      case "riesgos_top": { const t = [...esc_].sort((a, b) => (b.nivel_prob || 0) * (b.nivel_imp || 0) - (a.nivel_prob || 0) * (a.nivel_imp || 0) || (b.perdida || 0) - (a.perdida || 0)).slice(0, w.n || 6);
        return t.length ? `<table class="tb-t"><tr><th>Riesgo</th><th>Prob.</th><th>Pérdida esp.</th><th>Nivel</th></tr>${t.map((r) => `<tr><td>${esc(r.nombre)}</td><td>${r.prob == null ? "—" : `${(r.prob * 100).toFixed(1)} %`}</td><td>${n0(r.perdida)}</td><td style="color:${COLOR[nivel(r)] || ""}"><b>${esc(nivel(r) || "—")}</b></td></tr>`).join("")}</table>` : `<p class="tb-sub">Sin riesgos simulados</p>`; }
      case "riesgos_perdida_cat": { const c = {}; for (const r of esc_) c[r.categoria] = (c[r.categoria] || 0) + (r.perdida || 0);
        return barras(Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ k, v }))); }
      case "gob_semaforo": return (d.gobDims || []).length ? `<div class="tb-gob">${d.gobDims.map((x) => { const n = Number(d.gob?.[x]?.nota); const c = !n ? "#999" : n <= 2 ? COLOR.rojo : n === 3 ? COLOR.ambar : COLOR.verde; return `<span style="border-left:6px solid ${c}">${esc(x)} <b>${n || "—"}</b></span>`; }).join("")}</div>` : "";
      case "eventos_area": { const c = {}; for (const e of evs) c[e.area_principal] = (c[e.area_principal] || 0) + 1;
        return barras(Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ k: d.nombresArea?.[k] || k, v }))); }
      case "eventos_graves": { const g = evs.filter((e) => e.severidad >= 4).sort((a, b) => String(b.fecha_utc).localeCompare(String(a.fecha_utc))).slice(0, w.n || 8);
        return g.length ? `<ul class="tb-lista">${g.map((e) => `<li><a href="${esc(e.url || "#")}" target="_blank" rel="noopener noreferrer">${esc(e.titulo)}</a><span class="tb-sub"> ${esc(d.paises?.[e.pais_iso3] || e.pais_iso3 || "")} · ${esc(String(e.fecha_utc || "").slice(0, 16).replace("T", " "))}</span></li>`).join("")}</ul>` : `<p class="tb-sub">Sin eventos graves</p>`; }
      case "indice_pais": { const ps = d.paisesCliente || []; return ps.length ? barras(ps.map((p) => { const v = Number(d.indice?.[p]?.indice) || 0; return { k: d.paises?.[p] || p, v, t: v ? String(v) : "—", c: v >= 60 ? COLOR.rojo : v >= 35 ? COLOR.medio : COLOR.verde }; }), 100) : `<p class="tb-sub">Captura el país del cliente</p>`; }
      case "texto": return `<p>${esc(w.texto || "").replace(/\n/g, "<br>")}</p>`;
      default: return `<p class="tb-sub">Widget desconocido</p>`;
    }
  })();
  const ancho = Math.min(3, Math.max(1, Number(w.ancho) || WIDGETS[w.tipo]?.[2] || 1));
  return `<section class="tb-w" style="grid-column:span ${ancho}"><h3>${esc(w.titulo || WIDGETS[w.tipo]?.[0] || w.tipo)}</h3>${cuerpo}</section>`;
}

/** Estilos de los tableros (se reusan en ops.html y en warroom.html). */
export const CSS_TABLEROS = `.tb-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}@media(max-width:760px){.tb-grid{grid-template-columns:1fr}.tb-w{grid-column:span 1!important}}
.tb-w{border:1px solid var(--line,#8884);border-radius:10px;padding:10px 12px;background:var(--surface,#fff);overflow:auto}.tb-w h3{margin:0 0 6px;font-size:14px}
.tb-num{font-size:34px;font-weight:800;line-height:1.1}.tb-sub{font-size:12px;opacity:.75}.tb-barras{display:grid;gap:4px}.tb-fila{display:grid;grid-template-columns:minmax(80px,40%) 1fr auto;gap:6px;align-items:center;font-size:12px}
.tb-barra{height:12px;background:#8882;border-radius:6px;overflow:hidden}.tb-barra i{display:block;height:100%}.tb-t{border-collapse:collapse;width:100%;font-size:12px}.tb-t th,.tb-t td{border-bottom:1px solid #8883;padding:3px 5px;text-align:left}
.tb-p{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px}.tb-semaf{display:flex;gap:6px}.tb-semaf span{flex:1;text-align:center;color:#fff;font-weight:800;font-size:24px;border-radius:8px;padding:4px}
.tb-matriz{display:grid;grid-template-columns:repeat(5,1fr);gap:2px}.tb-matriz span{aspect-ratio:1.6;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;border-radius:3px}
.tb-gob{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:4px;font-size:12px}.tb-gob span{padding:3px 6px;background:#8881}.tb-lista{margin:0;padding-left:18px;font-size:12.5px}.tb-radar{width:100%;max-width:260px;display:block;margin:auto}`;

/** Instrucciones para que la IA diseñe un tablero con los widgets disponibles. */
export function promptTablero(pedido, contexto = "") {
  const lista = Object.entries(WIDGETS).map(([k, [n, dsc]]) => `${k}: ${n} — ${dsc}`).join("\n");
  return [{ role: "system", content: "Diseñas tableros de control (dashboards) para direcciones de empresas. Respondes SOLO con JSON válido: {\"nombre\":\"…\",\"widgets\":[{\"tipo\":\"<tipo>\",\"titulo\":\"…\",\"ancho\":1|2|3,\"texto\":\"(solo para tipo texto)\"}]}. Usa únicamente los tipos de la lista. Entre 4 y 10 widgets, los indicadores numéricos primero." },
    { role: "user", content: `Widgets disponibles:\n${lista}\n\nContexto del cliente: ${contexto}\n\nTablero que se necesita: ${pedido}` }];
}

/** Valida el diseño propuesto por la IA: solo tipos conocidos, máximo 12 widgets, textos acotados. */
export function leerTableroIA(texto) {
  const m = String(texto || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  let d;
  try { d = JSON.parse(m[0]); } catch (e) { return null; }
  const widgets = (Array.isArray(d.widgets) ? d.widgets : []).filter((w) => WIDGETS[w?.tipo]).slice(0, 12)
    .map((w) => ({ tipo: w.tipo, titulo: String(w.titulo || WIDGETS[w.tipo][0]).slice(0, 80), ancho: Math.min(3, Math.max(1, Number(w.ancho) || WIDGETS[w.tipo][2])), ...(w.tipo === "texto" ? { texto: String(w.texto || "").slice(0, 600) } : {}) }));
  return widgets.length ? { nombre: String(d.nombre || "Tablero").slice(0, 80), widgets } : null;
}

/** Empaqueta tablero + instantánea de datos del cliente (sin eventos: el War Room los pide en vivo) en texto base64url comprimido. */
export async function empaquetar(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  const comp = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
  let s = "";
  for (let i = 0; i < comp.length; i += 0x8000) s += String.fromCharCode(...comp.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export async function desempaquetar(txt) {
  const b = atob(String(txt).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(b, (c) => c.charCodeAt(0));
  const plano = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
  return JSON.parse(plano);
}

/** Instantánea mínima para el War Room (sin parámetros de simulación ni notas largas). */
export const instantanea = (d) => ({
  v: 1, generado: new Date().toISOString(), cliente: { nombre: d.cliente?.nombre || "", pais: d.cliente?.pais || "", paises: d.cliente?.paises || "", moneda: d.cliente?.moneda || "" },
  dmi: d.dmi, fases: d.fases, kpi: d.kpi, gob: d.gob, gobDims: d.gobDims,
  esc: (d.esc || []).map((r) => ({ nombre: r.nombre, categoria: r.categoria, prob: r.prob, perdida: r.perdida, var95: r.var95, nivel: r.nivel, nivel_prob: r.nivel_prob, nivel_imp: r.nivel_imp })),
});
