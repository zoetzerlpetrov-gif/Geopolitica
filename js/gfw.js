// Bloques de ficha para las capas de Global Fishing Watch: revisión del barco (listas de pesca ilegal, pesca en áreas
// protegidas o sin autorización, historial de nombres y banderas, registro) y lista de visitas a un puerto.
import { esc } from "./util.js";

const fechaCorta = (t) => String(t || "").slice(0, 10) || "—";
export const enlaceGfw = (b) => (b?.mmsi ? `https://globalfishingwatch.org/map/vessel-search?query=${encodeURIComponent(b.mmsi)}` : "https://globalfishingwatch.org/map");

/** Filas de la revisión de un barco (para <dl>). */
export function filasRevision(rev) {
  if (!rev) return [];
  const f = [];
  const iuu = rev.iuu_veces || rev.iuu_registro;
  const veces = rev.iuu_veces ? `${rev.iuu_veces} ${rev.iuu_veces === 1 ? "vez" : "veces"}${rev.iuu_en_el_anio ? ` (${rev.iuu_en_el_anio} en el último año)` : ""}` : "según su registro";
  f.push(["Listas de pesca ilegal (IUU)", iuu ? `Sí: ${veces}` : "No aparece"]);
  if (rev.pesca_eventos != null) f.push(["Pesca aparente en el último año", `${rev.pesca_eventos} eventos; ${rev.pesca_anp_sin_pesca || 0} en áreas protegidas sin pesca; ${rev.pesca_sin_autorizacion || 0} en zonas sin autorización conocida`]);
  if (rev.apagados_anio != null) f.push(["Apagados de AIS en el último año", String(rev.apagados_anio)]);
  if (rev.nombres?.length) f.push(["Nombres usados", rev.nombres.join(" · ")]);
  if (rev.banderas?.length) f.push(["Banderas (según su AIS)", rev.banderas.map((b) => `${b.bandera} (${b.desde || "?"} a ${b.hasta || "?"})`).join(" → ")]);
  const reg = [rev.imo && `IMO ${rev.imo}`, rev.indicativo && `indicativo ${rev.indicativo}`, rev.eslora_m && `${rev.eslora_m} m`, rev.tonelaje_gt && `${rev.tonelaje_gt} GT`].filter(Boolean);
  if (reg.length) f.push(["Registro", reg.join(" · ")]);
  if (rev.duenos?.length) f.push(["Dueños según registros públicos", rev.duenos.map((d) => `${d.nombre}${d.bandera ? ` (${d.bandera})` : ""}${d.desde ? ` desde ${d.desde}` : ""}`).join("; ")]);
  return f;
}

/** Bloque HTML con la revisión de uno o dos barcos. */
export function htmlRevision(barcos) {
  const con = (barcos || []).filter((b) => b && b.revision);
  if (!con.length) return `<p class="meta">Revisión del barco pendiente: se hace por lotes cada día.</p>`;
  return con.map((b) => `<div class="gfw-rev">
    <h4>Revisión: ${esc(b.nombre || `MMSI ${b.mmsi}`)}${b.alerta ? ` <span class="chip alerta">⚠️ ${esc(b.alerta)}</span>` : ""}</h4>
    <dl>${filasRevision(b.revision).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
    <p class="meta"><a href="${esc(enlaceGfw(b))}" target="_blank" rel="noopener noreferrer">Ver el barco en el mapa de Global Fishing Watch</a></p></div>`).join("")
    + `<p class="meta">Revisión de Global Fishing Watch del último año (registros públicos, listas IUU de las organizaciones regionales de pesca y eventos detectados por AIS). Un dato aislado no prueba una infracción; sirve para priorizar qué revisar con la autoridad.</p>`;
}

/** Tabla de visitas recientes a un puerto. */
export function htmlVisitas(visitas) {
  const v = visitas || [];
  if (!v.length) return "";
  return `<h4>Visitas recientes</h4><table class="tabla-mini"><thead><tr><th>Barco</th><th>Bandera</th><th>Tipo</th><th>Llegó</th><th>Salió</th></tr></thead><tbody>${
    v.map((x) => `<tr${x.alerta ? ` class="con-alerta" title="${esc(x.alerta)}"` : ""}><td><a href="${esc(enlaceGfw(x))}" target="_blank" rel="noopener noreferrer">${esc(x.nombre || `MMSI ${x.mmsi}`)}</a>${x.alerta ? " ⚠️" : ""}</td><td>${esc(x.bandera || "—")}</td><td>${esc(x.tipo || "—")}</td><td>${esc(fechaCorta(x.llegada_utc))}</td><td>${esc(fechaCorta(x.salida_utc))}</td></tr>`).join("")
  }</tbody></table>${v.some((x) => x.alerta) ? `<p class="meta">⚠️ = la revisión de Global Fishing Watch encontró algo que conviene mirar (ver el barco en GFW).</p>` : ""}`;
}
