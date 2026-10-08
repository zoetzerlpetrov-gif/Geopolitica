// Ficha del evento (se abre al hacer clic en un punto o en la lista).
import { esc, safeUrl, fecha } from "./util.js";
import { ordenarLentes, rellenar } from "./analisis-logica.js";

export const REGION = {
  norteamerica: "Norteamérica", centroamerica_caribe: "Centroamérica y Caribe", sudamerica: "Sudamérica",
  europa_occidental: "Europa Occidental", europa_este_rusia: "Europa del Este y Rusia", medio_oriente: "Medio Oriente",
  africa_norte_sahel: "África del Norte y Sahel", africa_subsahariana: "África Subsahariana", asia_central: "Asia Central",
  asia_sur: "Asia del Sur", indopacifico_taiwan: "Indo-Pacífico y Taiwán", artico: "Ártico",
};
const TIPO = { noticia: "Noticia", base_datos: "Base de datos", red_social: "Red social", analisis: "Análisis" };
const DELTA = { nuevo: "Nuevo", escala: "Escala ▲", desescala: "Desescala ▼", sin_cambio: "Sin cambio" };
const ESTADO = { tiempo_real: "Tiempo real", retrasado: "Retrasado", estimado: "Estimado", estatico: "Estático" };
const ZONA = (z) => z.replace(/_/g, " ");

/**
 * @param {object} ev     evento (ver schema/event.schema.json)
 * @param {object} tax    { areas: Map(id -> área), subtemas: Map(id -> nombre) }
 * @param {object} paises gazetteer.paises (iso3 -> {es})
 * @param {Map} porId      eventos por id (para mostrar los correlacionados)
 * @param {object} extra   { analisis: config/analisis.json, cuaderno: {c, n} } (Fase 4; opcional)
 */
export function htmlFicha(ev, tax, paises, porId = new Map(), extra = {}) {
  const a = tax.areas.get(ev.area_principal);
  const secundarias = ev.areas_secundarias.map((id) => tax.areas.get(id)).filter(Boolean);
  const sev = "●".repeat(ev.severidad) + "○".repeat(5 - ev.severidad);
  const pais = ev.pais_iso3 ? (paises[ev.pais_iso3]?.es || ev.pais_iso3) : "Sin país asignado";

  return `
    <h3 id="ficha-titulo">${esc(ev.titulo)}</h3>
    <div class="fecha">${esc(fecha(ev.fecha_utc))} · ${esc(pais)}${ev.region ? " · " + esc(REGION[ev.region] || ev.region) : ""}</div>

    <div class="chips" aria-label="Alerta y estado">
      ${ev.nivel_alerta ? `<span class="chip alerta alerta-${esc(ev.nivel_alerta)}" title="Reglas en docs/INDICADORES.md">${esc(ev.nivel_alerta)}</span>` : ""}
      ${ev.delta ? `<span class="chip">${esc(DELTA[ev.delta] || ev.delta)}</span>` : ""}
      ${ev.estado_dato ? `<span class="chip estado-${esc(ev.estado_dato)}">Dato ${esc(ESTADO[ev.estado_dato] || ev.estado_dato)}</span>` : ""}
    </div>

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

    ${relaciones(ev, porId, tax)}

    ${ev.impacto_mexico ? `<div class="pregunta impacto-mx"><b>Impacto para México</b>${esc(ev.impacto_mexico)}</div>` : ""}

    <h4>Fuentes (${ev.fuentes.length})</h4>
    <ul class="fuentes">
      ${ev.fuentes.map((f) => `<li><a href="${esc(safeUrl(f.url))}" target="_blank" rel="noopener noreferrer">${esc(f.fuente)}</a> · ${esc(TIPO[f.tipo_fuente] || f.tipo_fuente)}</li>`).join("")}
    </ul>

    ${extra.analisis ? htmlAnalisis(ev, tax, pais, extra) : ""}

    ${ev.es_ejemplo ? `<div class="ejemplo">Dato de ejemplo (Fase 1): hecho público clasificado a mano. El enlace abre una búsqueda en Wikipedia, no un artículo de prensa.</div>` : ""}
  `;
}

function relaciones(ev, porId, tax) {
  const r = ev.relaciones || {};
  const corr = (ev.correlaciones || []).map((id) => porId.get(id)).filter(Boolean);
  const partes = [];
  if (r.zonas?.length) partes.push(`<dt>Zonas</dt><dd>${r.zonas.map((z) => esc(ZONA(z))).join(", ")}</dd>`);
  if (r.entidades?.length) partes.push(`<dt>Entidades</dt><dd>${r.entidades.map((x) => esc(ZONA(x.split(":").pop()))).join(", ")}</dd>`);
  if (r.personas?.length) partes.push(`<dt>Personas (rol público)</dt><dd>${r.personas.map(esc).join(", ")}</dd>`);
  if (corr.length) partes.push(`<dt>Correlacionados</dt><dd>${corr.map((c) => `<a href="#evento=${esc(c.id)}" data-evento="${esc(c.id)}">${esc(c.titulo)}</a> <span class="meta">(${esc(tax.areas.get(c.area_principal)?.nombre || "")})</span>`).join("<br>")}</dd>`);
  return partes.length ? `<h4>Relaciones</h4><dl>${partes.join("")}</dl>` : "";
}

/** Checklist de 10 pasos, notas del analista y lentes teóricas (Fase 4). */
function htmlAnalisis(ev, tax, pais, { analisis, cuaderno = { c: [], n: "" } }) {
  const marcados = new Set(cuaderno.c);
  const hechos = analisis.checklist.filter((p) => marcados.has(p.id)).length;
  const ctx = { pais: ev.pais_iso3 ? pais : "", region: REGION[ev.region] || "", area: tax.areas.get(ev.area_principal)?.nombre };
  const lentes = ordenarLentes(analisis.lentes, ev);
  return `
    <details class="analisis" id="det-checklist">
      <summary><h4>Checklist de análisis <span class="contador" id="check-avance">${hechos}/${analisis.checklist.length}</span></h4></summary>
      <ol class="checklist">
        ${analisis.checklist.map((p, i) => `<li><label>
          <input type="checkbox" data-check="${esc(p.id)}" ${marcados.has(p.id) ? "checked" : ""}>
          <span><b>${i + 1}. ${esc(p.titulo)}.</b> ${esc(rellenar(p.pregunta, ev, ctx))}<span class="meta">${esc(rellenar(p.ayuda, ev, ctx))}</span></span>
        </label></li>`).join("")}
      </ol>
      <label class="notas">Notas (solo en este navegador)
        <textarea id="notas-evento" rows="4" maxlength="4000" placeholder="Hechos, juicios, escenarios e indicadores…">${esc(cuaderno.n)}</textarea>
      </label>
    </details>
    <details class="analisis">
      <summary><h4>Lentes teóricas (${lentes.length})</h4></summary>
      <p class="meta">Ordenadas por afinidad con las áreas del evento. Úsalas en el paso 8 del checklist.</p>
      ${lentes.map((l) => `<div class="lente ${l.afinidad ? "afin" : ""}">
        <b>${esc(l.nombre)}</b>${l.afinidad ? ` <span class="chip">afín</span>` : ""}
        <p>${esc(l.idea)}</p>
        <ul>${l.preguntas.map((q) => `<li>${esc(rellenar(q, ev, ctx))}</li>`).join("")}</ul>
        <div class="meta">${esc(l.autores)}</div>
      </div>`).join("")}
    </details>`;
}
