// Página de reportes diarios (reporte.html): lee data/reportes/indice.json y el reporte elegido.
// Los reportes los genera la ingesta horaria (ingest/reporte.py); aquí solo se muestran.
import { getJSON, esc, safeUrl } from "./util.js";

const $ = (id) => document.getElementById(id);
const HORIZONTES = [["corto_plazo", "Corto plazo"], ["mediano_plazo", "Mediano plazo"], ["largo_plazo", "Largo plazo"]];
const TEND = { sube: "▲ por encima de su promedio", baja: "▼ por debajo de su promedio", estable: "≈ en su promedio", "sin base": "sin base de comparación" };
const SEV = { 5: "extrema", 4: "alta", 3: "media", 2: "baja", 1: "informativa" };

const fechaLarga = (f) => new Date(`${f}T12:00:00`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const hora = (iso) => (iso ? new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export function htmlEvento(e) {
  return `<li id="ev-${esc(e.id)}"><span class="sev sev-${e.severidad}" title="Severidad ${e.severidad} · ${SEV[e.severidad] || ""}">${e.severidad}</span>
    <a href="${esc(safeUrl(e.url))}" target="_blank" rel="noopener noreferrer">${esc(e.titulo)}</a>
    <span class="meta">${esc(e.fuente || "")} · ${esc(hora(e.fecha_utc))}${e.automatico ? " · señal automática (GDELT, verificar)" : ""}${e.verificado ? " · 2 o más medios" : ""}</span>
    ${e.resumen ? `<p>${esc(e.resumen)}</p>` : ""}</li>`;
}

function htmlIA(ia, porId) {
  if (!ia?.horizontes) {
    return `<section class="rp-bloque rp-ia"><h3>🤖 Panorama con IA</h3><p class="rp-vacio">Todavía no hay panorama con IA para este día.
      Se genera hasta 4 veces al día cuando el proyecto tiene la clave de Groq y hay suficientes eventos.</p></section>`;
  }
  const bloques = HORIZONTES.filter(([k]) => ia.horizontes[k]).map(([k, nombre]) => {
    const h = ia.horizontes[k];
    return `<div class="rp-horizonte">${nombre} · ${esc(h.horizonte)}</div>${h.escenarios.map((s) => `<div class="rp-esc">
      <h4>${esc(s.titulo)}<span class="prob ${esc(s.probabilidad)}">probabilidad ${esc(s.probabilidad)}</span></h4>
      <p>${esc(s.descripcion)}</p>
      ${s.senales?.length ? `<b>Señales a vigilar</b><ul>${s.senales.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      <p class="rp-base">Basado en: ${s.eventos.map((id) => porId.get(id) ? `<a href="#ev-${esc(id)}">${esc(porId.get(id).titulo)}</a>` : "").filter(Boolean).join(" · ")}</p>
    </div>`).join("")}`;
  }).join("");
  return `<section class="rp-bloque rp-ia"><h3>🤖 Panorama con IA: ¿qué podría pasar?</h3>
    <p class="aviso">${esc(ia.aviso)} Modelo: ${esc(ia.modelo)} · generado ${esc(hora(ia.generado_utc))}.</p>${bloques}</section>`;
}

export function htmlReporte(r, regiones = {}) {
  const porId = new Map();
  for (const e of [...(r.destacados || []), ...r.secciones.flatMap((s) => s.eventos), ...(r.entorno?.eventos || [])]) porId.set(e.id, e);
  const c = r.cifras, alta = Number(c.por_severidad["5"]) + Number(c.por_severidad["4"]);
  const fix = r.indicadores?.fix;
  const secciones = r.secciones.map((s) => `<section class="rp-bloque">
    <div class="rp-sec-cab"><h3>${esc(s.nombre)}</h3><span>${s.total} eventos</span>
      <span class="tend ${esc(s.tendencia.replace(" ", "-"))}" title="Notas de medios hoy frente al promedio diario de los 7 días anteriores (${s.promedio_7d})">${esc(TEND[s.tendencia] || s.tendencia)}</span></div>
    <p class="rp-base">${s.notas} notas de medios · ${s.senales_automaticas} señales automáticas · ${s.alta_severidad} de severidad alta</p>
    ${s.eventos.length ? `<ol class="rp-ev">${s.eventos.map(htmlEvento).join("")}</ol>` : `<p class="rp-vacio">Sin eventos en este tema en las últimas ${r.ventana.horas} horas.</p>`}
  </section>`).join("");
  const entorno = r.entorno?.eventos?.length ? `<section class="rp-bloque"><h3>${esc(r.entorno.nombre)}</h3>
    <p class="rp-base">${esc(r.entorno.nota)}</p><ol class="rp-ev">${r.entorno.eventos.map(htmlEvento).join("")}</ol></section>` : "";
  const reg = r.regiones?.length ? `<section class="rp-bloque"><h3>Por región</h3><table class="rp-regiones"><thead><tr><th>Región</th><th>Eventos</th><th>Severidad alta</th><th>Principal</th></tr></thead>
    <tbody>${r.regiones.map((x) => `<tr><td>${esc(regiones[x.region]?.nombre || x.region.replace(/_/g, " "))}</td><td>${x.total}</td><td>${x.alta_severidad}</td>
      <td>${x.eventos[0] ? `<a href="${esc(safeUrl(x.eventos[0].url))}" target="_blank" rel="noopener noreferrer">${esc(x.eventos[0].titulo)}</a>` : ""}</td></tr>`).join("")}</tbody></table></section>` : "";
  return `<div class="rp-cab"><h2>${esc(r.titulo)}</h2>
      <p class="meta">${esc(fechaLarga(r.fecha))} · corte a las ${esc(r.corte_mx)} (hora del centro de México) · últimas ${r.ventana.horas} horas · se actualiza cada hora durante el día</p></div>
    <div class="rp-cifras">
      <div><b>${c.total.toLocaleString("es-MX")}</b><span>eventos</span></div>
      <div><b>${c.notas.toLocaleString("es-MX")}</b><span>notas de medios</span></div>
      <div><b>${c.senales_automaticas.toLocaleString("es-MX")}</b><span>señales automáticas</span></div>
      <div><b>${alta}</b><span>severidad alta o extrema</span></div>
      ${fix ? `<div><b>$${fix.valor.toFixed(2)}</b><span>dólar FIX Banxico (${esc(fix.fecha)})</span></div>` : ""}
    </div>
    <section class="rp-bloque"><h3>Resumen</h3><p>${esc(r.panorama_reglas)}</p></section>
    ${htmlIA(r.panorama_ia, porId)}
    ${r.destacados?.length ? `<section class="rp-bloque"><h3>Lo más grave del día</h3><ol class="rp-ev">${r.destacados.map(htmlEvento).join("")}</ol></section>` : ""}
    ${secciones}${entorno}${reg}
    <section class="rp-bloque"><h3>Método y fuentes</h3><p class="rp-base">${esc(r.metodo)}</p>
      <p class="rp-base">Fuentes con más eventos: ${(r.fuentes || []).map(([f, n]) => `${esc(f)} (${n})`).join(" · ")}</p>
      <p class="rp-base">Del contenido de los medios solo se usan título, fuente, fecha y enlace; los resúmenes son propios. La clasificación es automática y puede tener errores. No es asesoría.</p></section>`;
}

async function iniciar() {
  const params = new URLSearchParams(location.search);
  let tipo = params.get("tipo") === "global" ? "global" : "mexico";
  const [indice, regiones] = await Promise.all([getJSON("data/reportes/indice.json", { bust: true }).catch(() => null),
    getJSON("config/regions.json").then((x) => x.regiones).catch(() => ({}))]);
  if (!indice) { $("rp-contenido").innerHTML = `<p class="rp-vacio">Todavía no hay reportes publicados. Se generan con la ingesta horaria; vuelve en una hora.</p>`; return; }

  const mostrar = async (fecha) => {
    const lista = indice[tipo] || [];
    $("rp-fecha").innerHTML = lista.map((d) => `<option value="${esc(d.fecha)}">${esc(fechaLarga(d.fecha))}${d.ia ? " · con IA" : ""}</option>`).join("");
    const dia = lista.find((d) => d.fecha === fecha) || lista[0];
    for (const b of document.querySelectorAll(".rp-tabs button")) b.setAttribute("aria-pressed", String(b.dataset.tipo === tipo));
    if (!dia) { $("rp-contenido").innerHTML = `<p class="rp-vacio">No hay reportes de este tipo todavía.</p>`; $("rp-pdf").hidden = true; return; }
    $("rp-fecha").value = dia.fecha;
    history.replaceState(null, "", `?tipo=${tipo}&fecha=${dia.fecha}`);
    $("rp-contenido").textContent = "Cargando…";
    try {
      const r = await getJSON(`data/reportes/${tipo}/${dia.fecha}.json`, { bust: true });
      $("rp-contenido").innerHTML = htmlReporte(r, regiones);
      document.title = `${r.titulo} · ${r.fecha}`;
      $("rp-pdf").hidden = !r.pdf;
      if (r.pdf) { $("rp-pdf").href = `data/${r.pdf}`; $("rp-pdf").setAttribute("download", `${tipo}-${r.fecha}.pdf`); }
    } catch (e) {
      $("rp-contenido").innerHTML = `<p class="rp-vacio">No se pudo cargar el reporte (${esc(e.message)}).</p>`;
    }
  };
  for (const b of document.querySelectorAll(".rp-tabs button")) b.onclick = () => { tipo = b.dataset.tipo; mostrar(); };
  $("rp-fecha").onchange = (e) => mostrar(e.target.value);
  $("rp-imprimir").onclick = () => window.print();
  mostrar(params.get("fecha"));
}

if (typeof document !== "undefined" && document.getElementById("rp-contenido")) iniciar();
