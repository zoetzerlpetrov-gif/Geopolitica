// Continuidad familiar (continuidad-familiar.html, solo admin). La plantilla genérica viene de
// data/continuidad/plantilla.json; todo lo que captura la familia se guarda SOLO en este navegador (localStorage) y se
// respalda cifrado. Sin analítica, sin envíos a servidores, sin llamadas externas con datos de la familia: lo único
// que se pide a la red son la plantilla y los indicadores públicos del propio sitio (data/vivos), de solo lectura.
import {
  NIVELES, nivelActual, validarCambio, estancia, avance, completarFase, informeMarkdown, exportarCifrado, importarCifrado,
  validarDestino, destinosVigentes,
} from "./continuidad-logica.js";
import { descargar } from "./web-cripto.js";
import { svgTraslado, LEYENDA, ROLES, desproyectar } from "./continuidad-mapa.js";

const CLAVE = "dominus_continuidad_v1";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const hoy = () => new Date().toISOString().slice(0, 10);
const NOMBRE = { verde: "Verde", amarillo: "Amarillo", naranja: "Naranja", rojo: "Rojo" };

const vacio = () => ({ bitacora: [], hechos: {}, completas: {}, faseActual: "f0", escenarios: {}, perfiles: {}, integrantes: {}, perfilesPropios: [], destinos: {}, pace: {}, destinosCambios: {}, destinosQuitados: [], destinosPropios: [] });
/** Destinos vigentes (plantilla editada + propios): los usan el tablero, el mapa y la pestaña Destinos. */
const DEST = () => destinosVigentes(P, E);
/** Perfiles de la plantilla más los que agregó la familia (estos solo viven en este navegador y en el respaldo cifrado). */
const ID_SEGURO = /^propio_[a-z0-9]{1,16}$/;
const todosPerfiles = () => [...P.perfiles, ...(E.perfilesPropios || []).filter((x) => ID_SEGURO.test(String(x?.id)) && Array.isArray(x.checklist))];
const integrantesDe = (id) => String(E.integrantes?.[id] || "").split("\n").map((x) => x.trim()).filter(Boolean);
function leer() { try { return { ...vacio(), ...JSON.parse(localStorage.getItem(CLAVE) || "{}") }; } catch { return vacio(); } }
let E = leer(), P = null;
function guardar() { try { localStorage.setItem(CLAVE, JSON.stringify(E)); $("cf-guardado").textContent = `Guardado en este navegador · ${new Date().toLocaleTimeString("es-MX")}`; } catch { $("cf-guardado").textContent = "⚠️ Este navegador no permite guardar (modo privado)."; } }

const barra = (valor) => { const pct = esc(Math.max(0, Math.min(100, Number(valor) || 0))); return `<span class="cf-barra" role="img" aria-label="${pct} %"><i style="width:${pct}%"></i></span> ${pct} %`; };
const casilla = (clave, texto) => `<label class="cf-item"><input type="checkbox" data-hecho="${esc(clave)}" ${E.hechos[clave] ? "checked" : ""}> ${esc(texto)}</label>`;

// ---------------------------------------------------------------- pestañas
function pestana(id, enfocar = false) {
  for (const b of document.querySelectorAll("[data-tab]")) {
    const a = b.dataset.tab === id;
    b.setAttribute("aria-selected", String(a)); b.tabIndex = a ? 0 : -1; $(`p-${b.dataset.tab}`).hidden = !a;
    if (a && enfocar) b.focus();
  }
  history.replaceState(null, "", `#${id}`);
}

// ---------------------------------------------------------------- tablero
function pintarTablero() {
  const n = nivelActual(E.bitacora), fase = P.fases.find((f) => f.id === E.faseActual) || P.fases[0];
  const listas = [...P.fases.map((f) => [f.nombre, f.checklist, `${f.id}.`]), ...todosPerfiles().map((p) => [p.nombre, p.checklist, `${p.id}.`]), ...P.checklists_generales.map((c) => [c.nombre, c.checklist, `${c.id}.`])];
  const est = Object.entries(E.destinos).filter(([id, d]) => d.llegada && DEST().some((x) => x.id === id)).map(([id, d]) => {
    const dest = DEST().find((x) => x.id === id), e = estancia(d.llegada, dest?.estancia_dias ?? null, hoy(), { diaDecision: P.avisos_estancia.dia_decision, antes: P.avisos_estancia.dias_antes_del_limite });
    return `<li><b>${esc(dest?.destino || id)}</b>: día ${esc(e.transcurridos)}${e.restantes != null ? ` · quedan ${esc(e.restantes)}` : ""}${e.avisos.map((a) => ` <span class="cf-aviso">⚠️ ${esc(a.texto)}</span>`).join("")}</li>`;
  });
  $("cf-tablero").innerHTML = `<div class="cf-kpis">
      <div class="cf-kpi nivel-${esc(n)}"><span>Nivel de alerta</span><b>${esc(NOMBRE[n])}</b><small>${esc(P.niveles.find((x) => x.id === n)?.plazo || "")}</small></div>
      <div class="cf-kpi"><span>Fase actual</span><b>${esc(fase.nombre)}</b><small>${esc(fase.duracion)}</small></div>
      <div class="cf-kpi"><span>Escenarios activos</span><b>${Object.values(E.escenarios).filter((e) => e.activo).length}</b><small>de ${P.escenarios.length}</small></div></div>
    <h3>Estancia</h3>${est.length ? `<ul>${est.join("")}</ul>` : `<p class="meta">Registra la fecha de llegada en «Destinos» para contar los días.</p>`}
    <h3>Avance de las listas</h3><table class="cf-tabla">${listas.map(([t, items, pref]) => `<tr><th>${esc(t)}</th><td>${barra(avance(items, E.hechos, pref).pct)}</td></tr>`).join("")}</table>`;
}

// ---------------------------------------------------------------- mapa del traslado
let geo = null;
async function pintarMapa() {
  const cont = $("cf-mapa");
  if (!cont) return;
  if (!geo) {
    try { geo = await (await fetch("data/base/countries-110m.geojson")).json(); } catch { cont.textContent = "No se pudo cargar el contorno de países."; return; }
  }
  const llegadas = {}, dias = {};
  for (const [id, d] of Object.entries(E.destinos || {})) {
    const dest = DEST().find((x) => x.id === id);
    if (!d?.llegada || !dest) continue;
    const e = estancia(d.llegada, dest?.estancia_dias ?? null, hoy(), { diaDecision: P.avisos_estancia.dia_decision, antes: P.avisos_estancia.dias_antes_del_limite });
    llegadas[id] = true; dias[id] = e.transcurridos;
  }
  const n = nivelActual(E.bitacora);
  const fases = P.fases.map((f, i) => `<li class="${f.id === E.faseActual ? "actual" : ""}"><b>${esc(i)}</b><span>${esc(f.nombre.replace(/^Fase \d+\s*·\s*/, ""))}</span><small>${esc(avance(f.checklist, E.hechos, `${f.id}.`).pct)} %</small></li>`).join("");
  const svg = svgTraslado({ ...P, destinos: DEST() }, geo, { llegadas, nivel: NOMBRE[n], dias });
  if ($("cf-fd-mapa")) $("cf-fd-mapa").innerHTML = svg;
  cont.innerHTML = svg
    + `<p class="cm-leyenda">${LEYENDA.map(([c, t]) => `<span><i style="background:${esc(c)}"></i>${esc(t)}</span>`).join("")}</p>`
    + `<ol class="cm-fases" aria-label="Fases del plan">${fases}</ol>`;
}

// ---------------------------------------------------------------- niveles
function pintarNiveles() {
  const n = nivelActual(E.bitacora);
  $("cf-niveles").innerHTML = `<table class="cf-tabla"><tr><th>Nivel</th><th>Cuándo</th><th>Acciones</th><th>Plazo</th><th>Quién lo activa</th></tr>${P.niveles.map((x) => `<tr class="nivel-${x.id}${x.id === n ? " actual" : ""}"><td><b>${esc(x.nombre)}</b>${x.id === n ? " ◀ vigente" : ""}</td><td>${esc(x.cuando)}</td><td>${x.acciones.map(esc).join("; ")}</td><td>${esc(x.plazo)}</td><td>${esc(x.quien)}</td></tr>`).join("")}</table>
    <p class="meta">Reglas: cualquier adulto sube a Amarillo o Naranja; Rojo exige dos personas que lo aprueben; solo se baja un nivel a la vez, sin escenarios activos y tras ${P.reglas_nivel.bajar_dias_sin_disparadores} días sin disparadores.</p>`;
  $("cf-nuevo").innerHTML = NIVELES.map((x) => `<option value="${x}" ${x === n ? "disabled" : ""}>${NOMBRE[x]}</option>`).join("");
  $("cf-bitacora").innerHTML = E.bitacora.length ? `<table class="cf-tabla"><tr><th>Fecha</th><th>Nivel</th><th>Motivo</th><th>Fuentes</th><th>Aprobaron</th></tr>${E.bitacora.slice().reverse().map((b) => `<tr><td>${esc(b.fecha)}</td><td>${NOMBRE[b.nivel]}</td><td>${esc(b.motivo)}</td><td>${esc(b.fuentes)}</td><td>${esc((b.aprobadores || []).join(", "))}</td></tr>`).join("")}</table>` : `<p class="meta">Sin cambios registrados: nivel Verde.</p>`;
}
function cambiarNivel(e) {
  e.preventDefault();
  const datos = { nuevo: $("cf-nuevo").value, fecha: $("cf-fecha").value || hoy(), motivo: $("cf-motivo").value, aprobadores: [$("cf-ap1").value, $("cf-ap2").value].filter((x) => x.trim()) };
  const r = validarCambio({ bitacora: E.bitacora, escenarios: E.escenarios, ...datos, diasBajar: P.reglas_nivel.bajar_dias_sin_disparadores, rojoAprobadores: P.reglas_nivel.rojo_aprobadores });
  $("cf-nivel-msg").textContent = r.ok ? "" : `⛔ ${r.motivo}`;
  if (!r.ok) return;
  E.bitacora.push({ fecha: datos.fecha, nivel: datos.nuevo, motivo: datos.motivo.trim(), fuentes: $("cf-fuentes").value.trim(), aprobadores: datos.aprobadores });
  guardar(); e.target.reset(); pintarTodo();
  $("cf-nivel-msg").textContent = `✅ Nivel ${NOMBRE[datos.nuevo]} registrado.`;
}

// ---------------------------------------------------------------- fases
function pintarFases() {
  $("cf-fases").innerHTML = P.fases.map((f) => {
    const a = avance(f.checklist, E.hechos, `${f.id}.`);
    return `<details class="cf-card" ${f.id === E.faseActual ? "open" : ""}><summary>${esc(f.nombre)} · ${esc(f.duracion)} ${E.completas[f.id] ? "✅" : ""} <span class="meta">${a.hechos}/${a.total}</span></summary>
      ${f.checklist.map((i) => casilla(`${f.id}.${i.id}`, i.texto)).join("")}
      <div class="cf-acciones"><button type="button" data-actual="${f.id}">📍 Marcar como fase actual</button><button type="button" data-completar="${f.id}">✔️ Marcar fase completa</button></div>
      <p class="meta" id="cf-fase-msg-${f.id}"></p></details>`;
  }).join("");
}

// ---------------------------------------------------------------- escenarios (con indicadores públicos de solo lectura)
const REFS = {
  tipo_cambio: ["data/vivos/monitor_mx.json", (d) => { const i = (d.indicadores || []).find((x) => x.id === "SF43718"); return i ? `Tipo de cambio FIX ${i.valor} (${i.periodo})` : null; }],
  crimen: ["data/vivos/crimen.geojson", (d) => `${(d.features || []).length} puntos de crimen y seguridad en el mapa`],
  ciclones: ["data/vivos/nhc_conos.geojson", (d) => `${(d.features || []).length} conos de pronóstico de ciclones (NHC)`],
  calor: ["data/vivos/calor_frio.geojson", (d) => `${(d.features || []).length} zonas con calor o frío extremo`],
  salud: ["data/vivos/salud_oficial.geojson", (d) => `${(d.features || []).length} alertas sanitarias oficiales`],
  avisos_viaje: ["data/vivos/protocolos.geojson", (d) => `${(d.features || []).length} protocolos y avisos oficiales`],
  dof: ["data/vivos/dof.json", (d) => `DOF descargado (${Object.keys(d.dias || d.meses || {}).length || "—"} periodos)`],
};
const refs = {};
async function cargarRef(k) {
  if (refs[k] !== undefined || !REFS[k]) return;
  refs[k] = null;
  try {
    const r = await fetch(REFS[k][0], { cache: "no-store" });
    const d = await r.json();
    refs[k] = { texto: REFS[k][1](d), fecha: String(d.generado_utc || "").slice(0, 16).replace("T", " ") };
  } catch { refs[k] = { texto: "sin datos publicados", fecha: "" }; }
  pintarEscenarios();
}
function pintarEscenarios() {
  const cat = $("cf-cat").value;
  const filas = P.escenarios.filter((x) => !cat || x.categoria === cat);
  $("cf-escenarios").innerHTML = `<table class="cf-tabla"><tr><th>Escenario</th><th>Qué vigilar</th><th>Disparador</th><th>Respuesta</th><th>Plan B</th><th>Estado</th></tr>${filas.map((x) => {
    const e = E.escenarios[x.id] || {}, ref = x.referencia ? refs[x.referencia] : null;
    if (x.referencia && refs[x.referencia] === undefined) cargarRef(x.referencia);
    return `<tr class="${e.activo ? "activo" : ""}"><td><b>${esc(x.categoria)}</b> · ${esc(x.escenario)}${ref ? `<br><span class="meta">📡 Referencia: ${esc(ref.texto)}${ref.fecha ? ` · ${esc(ref.fecha)} UTC` : ""}</span>` : ""}</td><td>${esc(x.vigilar)}</td><td>${esc(x.disparador)}</td><td>${esc(x.respuesta)}</td><td>${esc(x.plan_b)}</td>
      <td><label><input type="checkbox" data-esc="${x.id}" ${e.activo ? "checked" : ""}> activo</label>${e.fecha ? `<br><span class="meta">${esc(e.fecha)}</span>` : ""}<br><input class="cf-nota" data-esc-nota="${x.id}" value="${esc(e.nota || "")}" placeholder="nota local" maxlength="300"></td></tr>`;
  }).join("")}</table><p class="meta">Las referencias son datos públicos del sitio, de solo lectura. Ningún nivel se activa en automático: la decisión es humana.</p>`;
}

// ---------------------------------------------------------------- perfiles, destinos y PACE
function pintarPerfiles() {
  $("cf-perfiles").innerHTML = todosPerfiles().map((p) => {
    const a = avance(p.checklist, E.hechos, `${p.id}.`), propio = !P.perfiles.includes(p), gente = integrantesDe(p.id);
    return `<details class="cf-card" open><summary>${esc(p.nombre)} <span class="meta">${esc(a.hechos)}/${esc(a.total)} · ${esc(gente.length || Number(E.perfiles[p.id]) || 0)} integrante(s)${propio ? " · perfil propio" : ""}</span></summary>
      <label class="cf-num">Integrantes de este perfil: uno por renglón, con apodo o iniciales (solo en este navegador)
        <textarea data-integrantes="${esc(p.id)}" rows="2" maxlength="400" autocomplete="off" placeholder="Ej.: Abuela M.&#10;Abuelo J.">${esc(E.integrantes?.[p.id] || "")}</textarea></label>
      ${gente.length ? `<p class="cf-gente">${gente.map((g) => `<span class="cf-chip">${esc(g)}</span>`).join(" ")}</p>` : ""}
      ${p.checklist.map((i) => casilla(`${p.id}.${i.id}`, i.texto)).join("")}
      ${propio ? `<p><button type="button" data-quitar-perfil="${esc(p.id)}">Quitar este perfil propio</button></p>` : ""}</details>`;
  }).join("") + P.checklists_generales.map((c) => `<details class="cf-card"><summary>${esc(c.nombre)} <span class="meta">${avance(c.checklist, E.hechos, `${c.id}.`).pct} %</span></summary>${c.checklist.map((i) => casilla(`${c.id}.${i.id}`, i.texto)).join("")}</details>`).join("");
}
function agregarPerfil(e) {
  e.preventDefault();
  const nombre = $("cf-pp-nombre").value.trim().slice(0, 60);
  const items = $("cf-pp-lista").value.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 30);
  if (!nombre || !items.length) { $("cf-pp-estado").textContent = "Escribe el nombre del perfil y al menos un elemento de la lista."; return; }
  E.perfilesPropios = [...(E.perfilesPropios || []), { id: `propio_${Date.now().toString(36)}`, nombre, checklist: items.map((t, i) => ({ id: `i${i + 1}`, texto: t.slice(0, 200) })) }];
  $("cf-pp-nombre").value = ""; $("cf-pp-lista").value = "";
  $("cf-pp-estado").textContent = `Perfil «${nombre}» agregado.`;
  guardar(); pintarPerfiles(); pintarTablero();
}
function pintarDestinos() {
  $("cf-destinos").innerHTML = `<table class="cf-tabla"><tr><th>Destino</th><th>Rol</th><th>Cómo se llega</th><th>Estancia legal</th><th>Salud</th><th>Riesgos</th><th>Llegada y días</th><th>Acciones</th></tr>${DEST().map((d) => {
    const llegada = E.destinos[d.id]?.llegada || "", e = estancia(llegada, d.estancia_dias, hoy(), { diaDecision: P.avisos_estancia.dia_decision, antes: P.avisos_estancia.dias_antes_del_limite });
    return `<tr><td><b>${esc(d.destino)}</b></td><td>${esc(d.rol)}</td><td>${esc(d.como)}</td><td>${esc(d.estancia)}</td><td>${esc(d.salud)}</td><td>${esc(d.riesgos)}</td>
      <td><input type="date" data-llegada="${d.id}" value="${esc(llegada)}">${e ? `<br>Día ${esc(e.transcurridos)}${e.restantes != null ? ` · quedan ${esc(e.restantes)}` : ""}${e.avisos.map((a) => `<br><span class="cf-aviso">⚠️ ${esc(a.texto)}</span>`).join("")}` : ""}</td>
      <td><button type="button" data-editar-destino="${esc(d.id)}">✏️ Editar</button> <button type="button" data-quitar-destino="${esc(d.id)}">🗑️ Eliminar</button>${d.propio ? `<br><span class="meta">destino propio</span>` : E.destinosCambios[d.id] ? `<br><span class="meta">editado</span>` : ""}</td></tr>`;
  }).join("")}</table>${DEST().length ? "" : `<p class="meta">No hay destinos. Agrega uno abajo o restaura los de la plantilla.</p>`}<p class="meta">${esc(P.verificar)}</p>`;
}

// Formulario de destino: agregar uno nuevo o editar uno existente (de la plantilla o propio).
const CAMPOS_FD = ["destino", "rol", "como", "estancia_dias", "estancia", "salud", "riesgos", "lon", "lat"];
function llenarFormDestino(d = null) {
  $("cf-fd-id").value = d?.id || "";
  for (const k of CAMPOS_FD) $(`cf-fd-${k}`).value = k === "lon" ? (d?.coords?.[0] ?? "") : k === "lat" ? (d?.coords?.[1] ?? "") : (d?.[k] ?? (k === "rol" ? "Otro" : ""));
  $("cf-fd-titulo").textContent = d ? `Editar destino: ${d.destino}` : "Agregar un destino";
  $("cf-fd-cancelar").hidden = !d;
  $("cf-fd-estado").textContent = "";
}
function guardarDestino(e) {
  e.preventDefault();
  const datos = Object.fromEntries(CAMPOS_FD.map((k) => [k, $(`cf-fd-${k}`).value]));
  const v = validarDestino(datos);
  if (!v.ok) { $("cf-fd-estado").textContent = `⛔ ${v.motivo}`; return; }
  const id = $("cf-fd-id").value, nombre = v.destino.destino;
  if (!id) E.destinosPropios = [...(E.destinosPropios || []), { ...v.destino, id: `dpropio_${Date.now().toString(36)}` }];
  else if ((E.destinosPropios || []).some((x) => x.id === id)) E.destinosPropios = E.destinosPropios.map((x) => (x.id === id ? { ...v.destino, id } : x));
  else if (P.destinos.some((x) => x.id === id)) E.destinosCambios = { ...(E.destinosCambios || {}), [id]: v.destino };
  guardar(); llenarFormDestino(); pintarTodo();
  $("cf-fd-estado").textContent = `✅ Destino «${nombre}» ${id ? "actualizado" : "agregado"}. El tablero y el mapa ya lo muestran.`;
}
function quitarDestino(id) {
  const d = DEST().find((x) => x.id === id);
  if (!d || !confirm(`¿Eliminar el destino «${d.destino}»? También se borra su fecha de llegada.`)) return;
  if (d.propio) E.destinosPropios = (E.destinosPropios || []).filter((x) => x.id !== id);
  else E.destinosQuitados = [...new Set([...(E.destinosQuitados || []), id])];
  delete E.destinos[id];
  if ($("cf-fd-id").value === id) llenarFormDestino();
  guardar(); pintarTodo();
}
function pintarPace() {
  $("cf-pace").innerHTML = `<table class="cf-tabla"><tr><th>Nivel PACE</th><th>Ejemplo genérico</th><th>Valor real (solo en este navegador)</th></tr>${P.pace.map((x) => `<tr><td><b>${esc(x.nombre)}</b></td><td>${esc(x.ejemplo)}</td><td><textarea data-pace="${x.id}" maxlength="500" rows="2" autocomplete="off">${esc(E.pace[x.id] || "")}</textarea></td></tr>`).join("")}</table>`;
}

function pintarTodo() { pintarMapa(); pintarTablero(); pintarNiveles(); pintarFases(); pintarEscenarios(); pintarPerfiles(); pintarDestinos(); pintarPace(); }

// ---------------------------------------------------------------- eventos
function eventos() {
  const tabs = [...document.querySelectorAll("[data-tab]")];
  for (const b of tabs) {
    b.addEventListener("click", () => pestana(b.dataset.tab));
    b.addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      const i = tabs.indexOf(b), n = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      pestana(tabs[n].dataset.tab, true);
    });
  }
  $("cf-form-nivel").addEventListener("submit", cambiarNivel);
  $("cf-cat").innerHTML = `<option value="">Todas</option>${[...new Set(P.escenarios.map((x) => x.categoria))].map((c) => `<option>${esc(c)}</option>`).join("")}`;
  $("cf-cat").addEventListener("change", pintarEscenarios);
  $("cf-form-perfil").addEventListener("submit", agregarPerfil);
  $("cf-fd-rol").innerHTML = [...ROLES.filter((r) => r !== "Retorno"), "Retorno", "Otro"].map((r) => `<option>${esc(r)}</option>`).join("");
  $("cf-form-destino").addEventListener("submit", guardarDestino);
  $("cf-fd-cancelar").addEventListener("click", () => llenarFormDestino());
  $("cf-destinos").addEventListener("click", (e) => {
    const ed = e.target.closest("[data-editar-destino]")?.dataset.editarDestino, qu = e.target.closest("[data-quitar-destino]")?.dataset.quitarDestino;
    if (ed) { llenarFormDestino(DEST().find((x) => x.id === ed)); $("cf-form-destino").scrollIntoView({ behavior: "smooth", block: "start" }); $("cf-fd-destino").focus(); }
    if (qu) quitarDestino(qu);
  });
  $("cf-fd-restaurar").addEventListener("click", () => {
    if (!confirm("¿Restaurar los destinos de la plantilla? Se deshacen las ediciones y vuelven los que eliminaste. Tus destinos propios se conservan.")) return;
    E.destinosCambios = {}; E.destinosQuitados = []; guardar(); llenarFormDestino(); pintarTodo();
  });
  // Clic en el mini mapa de la pestaña Destinos: pone la longitud y latitud del punto (genérico, de ciudad o región).
  $("cf-fd-mapa").addEventListener("click", (e) => {
    const svg = e.target.closest("svg[data-vista]"); if (!svg) return;
    const r = svg.getBoundingClientRect(), [lonMin, lonMax, latMin, latMax] = svg.dataset.vista.split(",").map(Number);
    const [lon, lat] = desproyectar((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, { lonMin, lonMax, latMin, latMax });
    $("cf-fd-lon").value = lon; $("cf-fd-lat").value = lat;
    $("cf-fd-estado").textContent = `📍 Punto elegido: ${lat}, ${lon}. Guarda el destino para verlo en el mapa.`;
  });
  $("cf-perfiles").addEventListener("click", (e) => {
    const id = e.target.closest("[data-quitar-perfil]")?.dataset.quitarPerfil;
    if (!id || !confirm("¿Quitar este perfil propio y su avance?")) return;
    E.perfilesPropios = (E.perfilesPropios || []).filter((x) => x.id !== id);
    delete E.integrantes?.[id];
    guardar(); pintarPerfiles(); pintarTablero();
  });
  document.addEventListener("change", (e) => {
    const t = e.target, d = t.dataset || {};
    if (d.hecho) { if (t.checked) E.hechos[d.hecho] = hoy(); else { delete E.hechos[d.hecho]; delete E.completas[d.hecho.split(".")[0]]; } }
    else if (d.esc) { E.escenarios[d.esc] = { ...(E.escenarios[d.esc] || {}), activo: t.checked, fecha: t.checked ? hoy() : E.escenarios[d.esc]?.fecha }; }
    else if (d.escNota) { E.escenarios[d.escNota] = { ...(E.escenarios[d.escNota] || {}), nota: t.value.slice(0, 300) }; }
    else if (d.perfil) { E.perfiles[d.perfil] = t.value === "" ? "" : Math.max(0, Math.min(30, Number(t.value))); }
    else if (d.integrantes) { E.integrantes = { ...(E.integrantes || {}), [d.integrantes]: t.value.slice(0, 400) }; pintarPerfiles(); }
    else if (d.llegada) { E.destinos[d.llegada] = { llegada: t.value }; }
    else if (d.pace) { E.pace[d.pace] = t.value.slice(0, 500); }
    else return;
    guardar(); pintarTablero();
    if (d.llegada || d.hecho) pintarMapa();
    if (d.esc || d.llegada) { pintarEscenarios(); pintarDestinos(); }
    if (d.hecho) { pintarFases(); pintarPerfiles(); }
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.actual) { E.faseActual = b.dataset.actual; guardar(); pintarTodo(); }
    if (b.dataset.completar) {
      const f = P.fases.find((x) => x.id === b.dataset.completar), r = completarFase(f, E.hechos);
      if (r.ok) { E.completas[f.id] = hoy(); guardar(); pintarTodo(); } else $(`cf-fase-msg-${f.id}`).textContent = `⛔ ${r.motivo}`;
    }
  });
  $("cf-exportar").addEventListener("click", async () => {
    const c = $("cf-pass").value;
    try { descargar(`continuidad-familiar-${hoy()}.cifrado.json`, await exportarCifrado(E, c)); $("cf-resp-msg").textContent = "✅ Respaldo cifrado descargado. Guarda la contraseña aparte: sin ella no se puede abrir."; }
    catch (err) { $("cf-resp-msg").textContent = `⛔ ${err.message}`; }
  });
  $("cf-importar").addEventListener("change", async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { E = { ...vacio(), ...await importarCifrado(JSON.parse(await f.text()), $("cf-pass").value) }; guardar(); pintarTodo(); $("cf-resp-msg").textContent = "✅ Respaldo importado."; }
    catch (err) { $("cf-resp-msg").textContent = `⛔ ${err.message}`; }
    e.target.value = "";
  });
  $("cf-informe").addEventListener("click", () => {
    if (!confirm("El informe se descarga SIN cifrar. Solo incluye la plantilla genérica y el avance de las listas (no nombres, PACE, notas ni fechas de llegada). ¿Continuar?")) return;
    descargar(`continuidad-avance-${hoy()}.md`, new Blob([informeMarkdown(P, E.hechos, nivelActual(E.bitacora), hoy())], { type: "text/markdown" }));
  });
  $("cf-borrar").addEventListener("click", () => {
    if (!confirm("Esto borra TODOS los datos de Continuidad familiar de este navegador. Exporta antes un respaldo cifrado. ¿Borrar?")) return;
    if (prompt('Escribe BORRAR para confirmar') !== "BORRAR") return;
    try { localStorage.removeItem(CLAVE); } catch { /* */ }
    E = vacio(); pintarTodo(); $("cf-resp-msg").textContent = "Datos locales borrados.";
  });
}

async function iniciar() {
  try { P = await (await fetch("data/continuidad/plantilla.json", { cache: "no-store" })).json(); }
  catch { $("cf-error").textContent = "No se pudo cargar la plantilla."; return; }
  $("cf-app").hidden = false;
  eventos(); pintarTodo();
  const h = location.hash.slice(1);
  pestana(document.querySelector(`[data-tab="${h}"]`) ? h : "tablero");
}

if (typeof document !== "undefined" && document.getElementById("cf-app")) iniciar();
