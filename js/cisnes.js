// Cisnes blancos y negros (cisnes.html, solo admin). Lee data/vivos/cisnes.json (tools/cisnes/cisnes.py, cada corrida de
// «Datos en movimiento»): probabilidad base publicada y nivel de señales actuales de cada evento de alto impacto.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const seguro = (u) => (/^https?:\/\//i.test(String(u || "")) ? String(u) : "#");
const NIVEL = { alto: "🔴 Alto", elevado: "🟠 Elevado", normal: "⚪ Normal", bajo: "🟢 Bajo" };

/** 0.0127 → «1.3 %»; 2e-6 → «0.0002 %»; null → «sin tasa histórica». */
export function pct(p) {
  if (p === null || p === undefined) return "sin tasa histórica";
  const v = p * 100;
  if (v >= 10) return `${Math.round(v)} %`;
  if (v >= 1) return `${v.toFixed(1)} %`;
  if (v >= 0.01) return `${v.toFixed(2)} %`;
  return `${Number(v.toPrecision(1))} %`;
}

/** «1 en N» para que la probabilidad se entienda sin porcentajes pequeños. */
export const unoEn = (p) => (p ? (p >= 0.5 ? "" : `≈ 1 en ${Math.round(1 / p).toLocaleString("es-MX")} por año`) : "");

export function htmlEvento(e) {
  const tit = `${e.menciones_72h} ${e.menciones_72h === 1 ? "titular" : "titulares"} en 72 h`;
  const senal = e.razon === null || e.razon === undefined
    ? `${tit} (la comparación con su promedio empieza con 7 días de historial; van ${e.dias_historial})`
    : `${tit}; su promedio de 30 días es ${e.promedio_72h} (×${e.razon})`;
  return `<div class="tarjeta cisne ${esc(e.nivel)}">
    <h2><span class="chip ${esc(e.tipo)}">${e.tipo === "negro" ? "🦢 Cisne negro" : "🕊️ Cisne blanco"}</span><span class="chip ${esc(e.nivel)}">${NIVEL[e.nivel] || esc(e.nivel)}</span>${esc(e.nombre)}</h2>
    <p>${esc(e.impacto)}</p>
    <p><span class="prob">${esc(pct(e.prob_base_12m))}</span> <span class="meta">probabilidad base a 12 meses ${esc(unoEn(e.prob_base_12m))}</span>
      ${e.prob_ajustada_12m !== null && e.prob_ajustada_12m !== undefined && e.prob_ajustada_12m !== e.prob_base_12m
        ? `<br><b>${esc(pct(e.prob_ajustada_12m))}</b> <span class="meta">con el nivel de señales de hoy (heurística)</span>` : ""}</p>
    <p class="meta">${esc(e.base_texto)}</p>
    <p class="meta">Señales: ${esc(senal)}. Llamados oficiales relacionados: ${e.n_alertas} (${e.n_alertas_recientes ?? 0} de los últimos 90 días).</p>
    ${e.alertas?.length ? `<ul>${e.alertas.map((a) => `<li>${a.reciente ? "🆕 " : ""}<a href="${esc(seguro(a.url))}" target="_blank" rel="noopener noreferrer">${esc(a.titulo)}</a> <span class="meta">${esc(a.organismo)} · ${esc(a.fecha)}</span></li>`).join("")}</ul>` : ""}
    ${e.notas?.length ? `<details><summary>Titulares recientes (${e.notas.length})</summary><ul>${e.notas.map((n) => `<li><a href="${esc(seguro(n.u))}" target="_blank" rel="noopener noreferrer">${esc(n.t)}</a> <span class="meta">${esc(n.m)} · ${esc(String(n.f).slice(0, 10))}</span></li>`).join("")}</ul></details>` : ""}
    <p class="meta">Fuentes: ${(e.fuentes || []).map(([t, u]) => `<a href="${esc(seguro(u))}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>`).join(" · ")}</p>
  </div>`;
}

export function filtrar(eventos, { tipo = "", nivel = "" } = {}) {
  return (eventos || []).filter((e) => (!tipo || e.tipo === tipo) && (!nivel || e.nivel === nivel));
}

export const METODO = (f) => `<ol>
  <li><b>Probabilidad base.</b> Se toma de una fuente publicada (artículo científico u organismo) y se convierte a 12 meses. Ejemplo: «12 % por década» ≈ 1.3 % por año. Para eventos frecuentes se usa la frecuencia por año (λ) y la fórmula 1 − e<sup>−λ</sup>: con 3.2 crisis bancarias por año, la probabilidad de al menos una en 12 meses es ≈ 96 %.</li>
  <li><b>Sin tasa confiable</b> (guerra nuclear, apagón continental, reordenamiento monetario): no se inventa un número; solo se muestra el nivel de señales.</li>
  <li><b>Señales en noticias.</b> Se cuentan los titulares del Noticiero de las últimas 72 h que hablan del tema y se comparan con su propio promedio de 72 h en los últimos 30 días (se necesitan 7 días de historial). Elevado: 1.6 veces su promedio y al menos 3 titulares; alto: 3 veces y al menos 5.</li>
  <li><b>Llamados oficiales.</b> Del registro de protocolos (gobiernos y organismos): los de nivel 3 o más relacionados con el tema y emitidos en los últimos 90 días. Uno sube el nivel a elevado; tres, a alto. Los anteriores se listan como contexto.</li>
  <li><b>Probabilidad con señales.</b> Base × factor del nivel (bajo ${f?.bajo ?? 0.75}, normal ${f?.normal ?? 1}, elevado ${f?.elevado ?? 1.5}, alto ${f?.alto ?? 2.5}), con tope de 95 %. Es una regla fija para priorizar, no un modelo validado: más titulares no siempre significan más riesgo (puede ser un aniversario o una película).</li>
</ol>
<p class="meta">Para decidir: revisa las fuentes de cada tarjeta y los titulares que dispararon la señal. Un cisne negro, por definición, es lo que nadie esperaba: esta lista ayuda a no ignorar lo que ya muestra señales, no a predecir lo imprevisible.</p>`;

async function iniciar() {
  const $ = (id) => document.getElementById(id);
  let datos;
  try {
    const r = await fetch("data/vivos/cisnes.json", { cache: "no-cache" });
    datos = await r.json();
  } catch (e) {
    $("ci-estado").textContent = "Todavía no hay datos (se generan con «Datos en movimiento»).";
    return;
  }
  $("ci-metodo").innerHTML = METODO(datos.factores);
  const pintar = () => {
    const lista = filtrar(datos.eventos, { tipo: $("ci-tipo").value, nivel: $("ci-nivel").value });
    $("ci-estado").textContent = `${lista.length} de ${datos.eventos.length} eventos · actualizado ${String(datos.generado_utc).replace("T", " ").slice(0, 16)} UTC`;
    $("ci-lista").innerHTML = lista.map(htmlEvento).join("") || `<p class="meta">Ningún evento con esos filtros.</p>`;
  };
  $("ci-tipo").addEventListener("change", pintar);
  $("ci-nivel").addEventListener("change", pintar);
  pintar();
}

if (typeof document !== "undefined" && document.getElementById("ci-lista")) iniciar();
