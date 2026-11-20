// Página de Admin «Vulnerabilidades y ataques». Lee las corridas diarias del Worker (solo con sesión de administración)
// y compara la última con la anterior para marcar hallazgos nuevos y resueltos. Todo el texto se escapa.
export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const $ = (id) => document.getElementById(id);
export const ORDEN = ["critica", "alta", "media", "baja", "info"];
const NOMBRE = { critica: "Crítica", alta: "Alta", media: "Media", baja: "Baja", info: "Info" };
const QUIEN = { claude: "🤖 Claude", tu: "👤 Tú", ambos: "🤝 Ambos" };

/** Cuántos hallazgos de cada severidad hay. */
export const conteo = (hallazgos) => Object.fromEntries(ORDEN.map((s) => [s, (hallazgos || []).filter((h) => h.severidad === s).length]));

/** Compara la corrida actual con las anteriores: { nuevos, resueltos, desde: {id → fecha de la primera vez visto} }. */
export function comparar(corridas) {
  const [actual, previa] = corridas;
  const antes = new Set((previa?.hallazgos || []).map((h) => h.id)), ahora = new Set((actual?.hallazgos || []).map((h) => h.id));
  const desde = {};
  for (const c of [...corridas].reverse()) for (const h of c.hallazgos || []) if (ahora.has(h.id) && !desde[h.id]) desde[h.id] = c.fecha;
  return {
    nuevos: [...ahora].filter((id) => previa && !antes.has(id)),
    resueltos: (previa?.hallazgos || []).filter((h) => !ahora.has(h.id)),
    desde,
  };
}

export function filaHallazgo(h, { nuevo = false, desde = "" } = {}) {
  return `<tr class="${nuevo ? "nueva" : ""}"><td><span class="sev sev-${esc(h.severidad)}">${esc(NOMBRE[h.severidad] || h.severidad)}</span>${nuevo ? ' <span class="chip">nuevo</span>' : ""}</td>
    <td><b>${esc(h.titulo)}</b><br><span class="meta">${esc(h.categoria)}</span></td><td>${esc(h.detalle)}</td><td>${esc(h.accion)}</td>
    <td><span class="chip">${esc(QUIEN[h.quien] || h.quien)}</span></td><td class="meta">${esc(String(desde).slice(0, 10))}</td></tr>`;
}

/** Barras apiladas por día (críticas, altas, medias) de las últimas 60 corridas. */
export function svgHistorial(corridas) {
  const datos = [...corridas].slice(0, 60).reverse().map((c) => ({ f: String(c.fecha).slice(5, 10), n: conteo(c.hallazgos) }));
  if (!datos.length) return '<p class="meta">Aún no hay corridas.</p>';
  const max = Math.max(1, ...datos.map((d) => d.n.critica + d.n.alta + d.n.media)), W = 900, H = 180, ancho = W / datos.length;
  const colores = { critica: "#8b0000", alta: "#C8102E", media: "#d4a017" };
  const barras = datos.map((d, i) => {
    let y = H - 20;
    return ["media", "alta", "critica"].map((s) => {
      const h = (d.n[s] / max) * (H - 40); y -= h;
      return h > 0 ? `<rect x="${(i * ancho + 2).toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1, ancho - 4).toFixed(1)}" height="${h.toFixed(1)}" fill="${colores[s]}"><title>${esc(d.f)}: ${d.n[s]} ${esc(NOMBRE[s])}</title></rect>` : "";
    }).join("") + (i % Math.ceil(datos.length / 10) === 0 ? `<text x="${(i * ancho + 2).toFixed(1)}" y="${H - 4}" font-size="11" fill="currentColor">${esc(d.f)}</text>` : "");
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Hallazgos críticos, altos y medios por día">${barras}</svg>
    <p class="meta"><span style="color:#8b0000">■</span> Críticos · <span style="color:#C8102E">■</span> Altos · <span style="color:#d4a017">■</span> Medios</p>`;
}

async function iniciar() {
  let datos;
  try {
    const r = await fetch("/admin/huella/vulnerabilidades", { credentials: "same-origin", cache: "no-store" });
    if (r.status === 401 || r.status === 403) throw new Error("Inicia sesión en admin.dominusosint.com para ver esta página.");
    if (!r.ok) throw new Error(`El Worker respondió ${r.status}.`);
    datos = await r.json();
  } catch (e) {
    $("vu-error").hidden = false;
    $("vu-error").textContent = `${e.message} Esta página solo funciona en https://admin.dominusosint.com/vulnerabilidades.html.`;
    $("vu-kpis").textContent = "";
    return;
  }
  const corridas = datos.corridas || [], actual = corridas[0];
  if (!actual) { $("vu-kpis").textContent = "Aún no hay corridas: la primera llega mañana a las 04:47 (o córrela a mano en GitHub → Actions → «Vulnerabilidades»)."; return; }
  const c = conteo(actual.hallazgos), cmp = comparar(corridas);
  $("vu-kpis").innerHTML = ORDEN.slice(0, 4).map((s) => `<div class="kpi"><span class="sev sev-${s}">${NOMBRE[s]}</span><b>${c[s]}</b></div>`).join("")
    + `<div class="kpi">Nuevos hoy<b>${cmp.nuevos.length}</b></div><div class="kpi">Resueltos desde ayer<b>${cmp.resueltos.length}</b></div>`
    + `<div class="kpi">Clientes de pago<b>${Number(datos.clientes_pago) || 0}</b></div>`
    + `<p class="meta" style="flex-basis:100%">Última revisión: ${esc(String(actual.fecha).replace("T", " ").slice(0, 16))} UTC.</p>`;
  const cats = [...new Set(actual.hallazgos.map((h) => h.categoria))].sort();
  $("vu-cat").insertAdjacentHTML("beforeend", cats.map((x) => `<option>${esc(x)}</option>`).join(""));
  const pintar = () => {
    const sev = $("vu-sev").value, quien = $("vu-quien").value, cat = $("vu-cat").value;
    const filas = actual.hallazgos.filter((h) => (!sev || h.severidad === sev) && (!quien || h.quien === quien) && (!cat || h.categoria === cat))
      .sort((a, b) => ORDEN.indexOf(a.severidad) - ORDEN.indexOf(b.severidad));
    $("vu-filas").innerHTML = filas.map((h) => filaHallazgo(h, { nuevo: cmp.nuevos.includes(h.id), desde: cmp.desde[h.id] })).join("")
      || '<tr><td colspan="6">Sin hallazgos con este filtro. ✅</td></tr>';
  };
  for (const id of ["vu-sev", "vu-quien", "vu-cat"]) $(id).addEventListener("change", pintar);
  pintar();
  $("vu-hist").innerHTML = svgHistorial(corridas);
  $("vu-revisiones").innerHTML = `<table><tr><th>Revisión</th><th>Estado</th><th>Nota</th></tr>${(actual.revisiones || []).map((r) => `<tr><td>${esc(r.nombre)}</td><td>${esc(r.estado)}</td><td class="meta">${esc(r.nota)}</td></tr>`).join("")}</table>`;
  $("vu-bitacora").innerHTML = `<table><tr><th>Fecha</th><th>Críticos</th><th>Altos</th><th>Medios</th><th>Bajos</th><th>Resueltos ese día</th></tr>${corridas.map((x, i) => {
    const n = conteo(x.hallazgos), prev = corridas[i + 1];
    const res = prev ? prev.hallazgos.filter((h) => !x.hallazgos.some((y) => y.id === h.id)) : [];
    return `<tr><td>${esc(String(x.fecha).slice(0, 16).replace("T", " "))}</td><td>${n.critica}</td><td>${n.alta}</td><td>${n.media}</td><td>${n.baja}</td><td class="meta">${res.map((h) => esc(h.titulo)).join("<br>") || "—"}</td></tr>`;
  }).join("")}</table>`;
}

if (typeof document !== "undefined" && document.getElementById("vu-filas")) iniciar();
