// DOMINUS OPS → Autoauditoría (solo admin): muestra el resultado semanal de tools/autoauditoria/autoauditoria.py
// (data/autoauditoria/ultimo.json e historial.json, publicados por el workflow «Autoauditoría semanal»).
import { esc, getJSON } from "./util.js";

const $ = (id) => document.getElementById(id);
const ETIQ = { cumple: "✅ Cumple", parcial: "🟡 Parcial", no_cumple: "❌ No cumple", sin_evaluar: "⚪ Sin evaluar", no_aplica: "— No aplica" };
const COLOR = (p) => (p == null ? "#888" : p >= 80 ? "#2E9E6E" : p >= 50 ? "#E0A100" : "#D23B3B");

/** Barra horizontal con el puntaje (0–100). */
export const barra = (p) => `<span style="display:inline-block;width:120px;height:10px;background:#8884;border-radius:5px;vertical-align:middle">
  <span style="display:block;width:${p ?? 0}%;height:100%;background:${COLOR(p)};border-radius:5px"></span></span> <b>${p == null ? "—" : `${p} %`}</b>`;

/** Variación contra la corrida anterior del historial: «▲ 5», «▼ 3» o «=». */
export function tendencia(historial, clave) {
  if (!Array.isArray(historial) || historial.length < 2) return "";
  const [a, b] = historial.slice(-2).map((h) => h[clave]);
  if (a == null || b == null) return "";
  return b > a ? `▲ ${b - a}` : b < a ? `▼ ${a - b}` : "=";
}

async function iniciar() {
  let res, hist = [];
  try {
    res = await getJSON("data/autoauditoria/ultimo.json", { bust: true });
    hist = await getJSON("data/autoauditoria/historial.json", { bust: true }).catch(() => []);
  } catch {
    $("aa-estado").textContent = "Aún no hay resultados: el workflow «Autoauditoría semanal» corre cada lunes (o a mano desde Actions).";
    return;
  }
  $("aa-estado").innerHTML = `Última evaluación: ${esc(res.fecha_utc.replace("T", " ").slice(0, 16))} UTC · ${hist.length} semana(s) en el historial.`;
  $("aa-resumen").innerHTML = `<p style="font-size:1.2em">Puntaje global: ${barra(res.puntaje_global)} <span class="meta">${esc(tendencia(hist, "global"))}</span></p>
    <div class="desliza"><table class="t"><tr><th>Marco</th><th>Puntaje</th><th>Cambio</th><th>Cumple</th><th>Parcial</th><th>No cumple</th><th>Sin evaluar</th></tr>
    ${res.marcos.map((m) => `<tr><td>${esc(m.nombre)}</td><td>${barra(m.puntaje)}</td><td>${esc(tendencia(hist, m.id))}</td><td>${m.cumple}</td><td>${m.parcial}</td><td>${m.no_cumple}</td><td>${m.sin_evaluar}</td></tr>`).join("")}</table></div>`;
  const nombres = Object.fromEntries(res.marcos.map((m) => [m.id, m.nombre]));
  $("aa-mejoras").innerHTML = res.mejoras.slice(0, 15).map((x) => `<li><b>[${esc(x.prioridad)}] ${esc(x.mejora)}</b>
    <br><span class="meta">${esc(ETIQ[x.estado])} · ${esc(x.titulo)} · ${esc((x.marcos || [x.marco]).map((k) => nombres[k] || k).join(" · "))}${x.detalle ? ` · ${esc(x.detalle)}` : ""}</span></li>`).join("")
    || "<li>Nada pendiente.</li>";
  $("aa-marco").insertAdjacentHTML("beforeend", res.marcos.map((m) => `<option value="${esc(m.id)}">${esc(m.nombre)}</option>`).join(""));
  const pintar = () => {
    const mk = $("aa-marco").value, f = $("aa-filtro").value;
    const filas = res.controles.filter((c) => (!mk || c.marco === mk) && (!f || c.estado === f));
    $("aa-tabla").innerHTML = `<tr><th>Marco</th><th>Ref.</th><th>Control</th><th>Estado</th><th>Detalle</th><th>Cómo mejorar</th><th>Tipo</th></tr>`
      + filas.map((c) => `<tr><td>${esc(nombres[c.marco] || c.marco)}</td><td>${esc(c.ref)}</td><td>${esc(c.titulo)}</td><td>${esc(ETIQ[c.estado] || c.estado)}</td>
        <td>${esc(c.detalle)}</td><td>${esc(c.estado === "cumple" ? "" : c.mejora)}</td><td>${esc(c.tipo === "auto" ? "automático" : "manual")}</td></tr>`).join("");
  };
  $("aa-marco").addEventListener("change", pintar);
  $("aa-filtro").addEventListener("change", pintar);
  pintar();
}

if (typeof document !== "undefined" && $("p-autoaud")) iniciar();
