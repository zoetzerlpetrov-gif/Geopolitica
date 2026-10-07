// Ficha del evento (se abre al hacer clic en un punto o en la lista).
import { esc, safeUrl, fecha } from "./util.js";

const REGION = {
  norteamerica: "Norteamérica", centroamerica_caribe: "Centroamérica y Caribe", sudamerica: "Sudamérica",
  europa_occidental: "Europa Occidental", europa_este_rusia: "Europa del Este y Rusia", medio_oriente: "Medio Oriente",
  africa_norte_sahel: "África del Norte y Sahel", africa_subsahariana: "África Subsahariana", asia_central: "Asia Central",
  asia_sur: "Asia del Sur", indopacifico_taiwan: "Indo-Pacífico y Taiwán", artico: "Ártico",
};
const TIPO = { noticia: "Noticia", base_datos: "Base de datos", red_social: "Red social", analisis: "Análisis" };

/**
 * @param {object} ev     evento (ver schema/event.schema.json)
 * @param {object} tax    { areas: Map(id -> área), subtemas: Map(id -> nombre) }
 * @param {object} paises gazetteer.paises (iso3 -> {es})
 */
export function htmlFicha(ev, tax, paises) {
  const a = tax.areas.get(ev.area_principal);
  const secundarias = ev.areas_secundarias.map((id) => tax.areas.get(id)).filter(Boolean);
  const sev = "●".repeat(ev.severidad) + "○".repeat(5 - ev.severidad);
  const pais = ev.pais_iso3 ? (paises[ev.pais_iso3]?.es || ev.pais_iso3) : "Sin país asignado";

  return `
    <h3 id="ficha-titulo">${esc(ev.titulo)}</h3>
    <div class="fecha">${esc(fecha(ev.fecha_utc))} · ${esc(pais)}${ev.region ? " · " + esc(REGION[ev.region] || ev.region) : ""}</div>

    <div class="chips" aria-label="Áreas">
      <span class="chip principal" style="background:${esc(a.color)}">${a.numero}. ${esc(a.nombre)}</span>
      ${secundarias.map((s) => `<span class="chip"><span class="swatch" style="background:${esc(s.color)}"></span>${esc(s.nombre)}</span>`).join("")}
    </div>

    <p>${esc(ev.resumen)}</p>

    <div class="pregunta"><b>Pregunta guía del área</b>${esc(a.pregunta_guia)}</div>

    <dl>
      <dt>Severidad</dt><dd><span class="sev" aria-label="${ev.severidad} de 5">${sev}</span> ${ev.severidad}/5</dd>
      <dt>Subtemas</dt><dd>${ev.subtemas.map((id) => esc(tax.subtemas.get(id) || id)).join("; ") || "—"}</dd>
      <dt>Actores</dt><dd>${ev.actores.map(esc).join(", ") || "—"}</dd>
      <dt>Confianza</dt><dd>${Math.round(ev.confianza_clasificacion * 100)} % ${ev.verificado ? "· verificado" : "· sin verificar"}</dd>
    </dl>

    ${ev.impacto_mexico ? `<div class="pregunta impacto-mx"><b>Impacto para México</b>${esc(ev.impacto_mexico)}</div>` : ""}

    <h4>Fuentes (${ev.fuentes.length})</h4>
    <ul class="fuentes">
      ${ev.fuentes.map((f) => `<li><a href="${esc(safeUrl(f.url))}" target="_blank" rel="noopener noreferrer">${esc(f.fuente)}</a> · ${esc(TIPO[f.tipo_fuente] || f.tipo_fuente)}</li>`).join("")}
    </ul>

    ${ev.es_ejemplo ? `<div class="ejemplo">Dato de ejemplo (Fase 1): hecho público clasificado a mano. El enlace abre una búsqueda en Wikipedia, no un artículo de prensa.</div>` : ""}
  `;
}
