// Admin → 🧭 Proyectos de principio a fin (proyectos.html). Une en una sola página, en orden, lo que antes estaba en
// Clientes, Cartera de proyectos, DOMINUS OPS, Caja del analista e Inteligencia corporativa. Cada paso dice qué hacer y
// muestra sus herramientas dentro de la página (las mismas páginas en «modo incrustado», js/embebido.js).
import { montarProyectos, CSS_PROYECTOS } from "./proyectos-ui.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const $ = (id) => document.getElementById(id);
const API = "/cuenta/empresa/admin/";

/** Los pasos en orden. «paneles»: [título, página, pestaña]; «proyecto»: muestra los proyectos de la empresa activa. */
export const PASOS = [
  { id: "empresa", num: "1", icono: "🏢", titulo: "Empresa", sub: "Alta, datos y acceso del cliente",
    que: ["Si la empresa es nueva, llena «Alta de empresa»: se crea su espacio y el enlace para que su responsable entre a Mi empresa.",
      "Si ya existe, elígela arriba en «Empresa activa». En «Empresas existentes» editas sus datos, renuevas el plan o la eliminas.",
      "Con la empresa elegida, pasa al paso 2."],
    paneles: [["Alta de empresa", "clientes.html", "alta"], ["Empresas existentes (editar, renovar, eliminar)", "clientes.html", "clientes"], ["Cuentas y accesos", "clientes.html", "cuentas"]] },
  { id: "proyecto", num: "2", icono: "📁", titulo: "Proyecto", sub: "Crear, editar, eliminar y sus 7 fases", proyecto: true,
    que: ["Crea el proyecto con «➕ Nuevo proyecto» (nombre, responsable, sector, país, fechas, sedes y objetivo).",
      "Ábrelo: ves sus 7 fases (alta → arranque → plan → auditorías → seguimiento → entrega → cierre) y la fase actual.",
      "Dentro del proyecto está todo lo demás: plantilla y normativa (paso 4), hallazgos (paso 5) y notas de seguimiento (paso 7).",
      "Para eliminar: abre el proyecto y usa «🗑️ Eliminar proyecto»."] },
  { id: "diagnostico", num: "3", icono: "🩺", titulo: "Diagnóstico inicial", sub: "Madurez (DMI) y gobernanza",
    que: ["Llena la ficha del cliente y el Readiness Assessment: te da el índice de madurez (DMI) por dimensión.",
      "Revisa gobernanza (quién decide y bajo qué control). Lo que salga débil se vuelve actividad o hallazgo en el proyecto."],
    paneles: [["Ficha del cliente", "ops.html", "cliente"], ["Readiness y DMI", "ops.html", "dmi"], ["Gobernanza", "ops.html", "gob"]] },
  { id: "plan", num: "4", icono: "🧩", titulo: "Plantilla, normativa y plan", sub: "Sector y países → plan completo", proyecto: true,
    que: ["Abre el proyecto y, en «🧩 Plantilla y normativa del proyecto», elige sector y países y pulsa «Generar plantilla».",
      "«➕ Cargar las actividades al plan» las guarda en el proyecto; «⬇ Descargar Excel» te da el plan detallado (Gantt, vencimientos, base normativa, auditoría y riesgos).",
      "Si llenaste el Excel fuera, súbelo con «📥 Importar Excel/JSON al plan».",
      "Para consultar una ley a fondo o ver cambios recientes, usa las pestañas de abajo (no hace falta descargar nada)."],
    paneles: [["Normativa por país (consulta detallada)", "herramientas.html", "normativa"], ["Cambios en leyes (bitácora)", "herramientas.html", "bitacora"], ["Plantillas por fase (OPS)", "ops.html", "plantillas"]] },
  { id: "auditoria", num: "5", icono: "🔍", titulo: "Auditorías", sub: "Revisar y registrar hallazgos", proyecto: true,
    que: ["En el proyecto, abre «🔍 Lista de auditoría» y marca «❌ No cumple» donde aplique: queda como hallazgo con su gravedad.",
      "Usa las plantillas por sector y el diagnóstico de ciberseguridad para revisar a fondo; lo que no cumpla, regístralo como hallazgo en el proyecto.",
      "Cada hallazgo lleva responsable y fecha límite."],
    paneles: [["Plantillas de auditoría por sector", "herramientas.html", "auditorias"], ["Diagnóstico de ciberseguridad", "ops.html", "ciber"], ["Auditoría de archivos", "herramientas.html", "archivos"], ["Informática y ciberseguridad", "herramientas.html", "informatica"]] },
  { id: "riesgos", num: "6", icono: "🏭", titulo: "Riesgos e instalaciones", sub: "Sedes, matriz 5×5 y escenarios",
    que: ["Registra las instalaciones del cliente (sedes, plantas, proveedores) y revisa su riesgo frente a los eventos del mapa.",
      "Califica la matriz de riesgo 5×5 y simula escenarios. Los riesgos altos se vuelven hallazgos o actividades en el proyecto."],
    paneles: [["Instalaciones, matriz 5×5 y exposición", "corporativo.html", ""], ["Risk management y escenarios", "ops.html", "riesgos"], ["Simulación de escenarios", "herramientas.html", "escenarios"], ["Nube y seguridad", "herramientas.html", "nube"]] },
  { id: "seguimiento", num: "7", icono: "📈", titulo: "Seguimiento y War Room", sub: "Avance semanal, tableros y SITREP", proyecto: true,
    que: ["Cada semana: en el proyecto marca actividades hechas, cierra hallazgos y deja una «nota de seguimiento».",
      "Para el cliente y directivos: tableros, War Room, Battle Rhythm y SITREP.",
      "Si el cliente prefiere su tablero en vivo con el Excel, usa «Seguimiento del plan (Excel)»."],
    paneles: [["Tableros y War Room", "ops.html", "tableros"], ["Battle Rhythm y SITREP", "ops.html", "ritmo"], ["Seguimiento del plan (Excel)", "herramientas.html", "seguimiento"], ["Vista para directivos (Cartera)", "cartera.html", ""]] },
  { id: "cierre", num: "8", icono: "📄", titulo: "Informe y cierre", sub: "Entrega, encuesta y lecciones", proyecto: true,
    que: ["Genera el informe integral y entrégalo.", "En el proyecto pasa a «6. Entrega» y luego a «7. Cierre»; deja las lecciones aprendidas como nota y marca el estado «Cerrado»."],
    paneles: [["Informe integral", "ops.html", "informe"]] },
  { id: "consulta", num: "📚", icono: "", titulo: "Consulta y métodos", sub: "Cuando necesites un método o marco",
    que: ["Material de apoyo para cualquier paso: fases del método DOMINUS, metodologías, marcos de análisis, agencias y doctrina."],
    paneles: [["Mapa maestro y fases", "ops.html", "mapa"], ["Biblioteca de metodologías", "ops.html", "biblioteca"], ["Análisis de inteligencia", "herramientas.html", "analisis"],
      ["Marcos de análisis", "herramientas.html", "marcos"], ["Agencias", "herramientas.html", "agencias"], ["Doctrina y salas", "ops.html", "doctrina"], ["Autoauditoría DOMINUS", "ops.html", "autoaud"]] },
];

/** Dirección del panel incrustado. */
export const urlPanel = (pagina, panel) => `${pagina}?embebido=1${panel ? `&panel=${encodeURIComponent(panel)}` : ""}`;

async function api(ruta, cuerpo) {
  const init = { credentials: "include", cache: "no-store" };
  if (cuerpo !== undefined) Object.assign(init, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(cuerpo) });
  const r = await fetch(API + ruta, init);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 403 ? "Tu sesión de administración terminó: vuelve a ingresar." : d.error || `HTTP ${r.status}`);
  return d;
}

if (typeof document !== "undefined" && $("fl-indice")) {
  document.head.insertAdjacentHTML("beforeend", `<style>${CSS_PROYECTOS}</style>`);
  const leer = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
  let org = leer("dominus_flujo_org"), actual = (location.hash.match(/paso=([a-z]+)/) || [])[1] || leer("dominus_flujo_paso") || "empresa";
  if (!PASOS.some((p) => p.id === actual)) actual = "empresa";
  let orgs = [];

  async function cargarOrgs() {
    try {
      orgs = (await api("orgs")).orgs;
      $("fl-org").innerHTML = `<option value="">Elige una empresa…</option>${orgs.map((o) => `<option value="${esc(o.id)}">${esc(o.nombre)}</option>`).join("")}`;
      if (!orgs.some((o) => o.id === org)) org = "";
      $("fl-org").value = org;
    } catch (e) { $("fl-msg").innerHTML = `<span class="error">${esc(e.message)}</span>`; }
  }

  function indice() {
    $("fl-indice").innerHTML = PASOS.map((p) => `<li><button type="button" data-paso="${p.id}" ${p.id === actual ? 'aria-current="step"' : ""}>
      <span class="num">${esc(p.num)}</span><span>${esc(p.icono)} ${esc(p.titulo)}<span class="sub">${esc(p.sub)}</span></span></button></li>`).join("");
  }

  function pintar() {
    const i = PASOS.findIndex((p) => p.id === actual), p = PASOS[i];
    indice();
    const o = orgs.find((x) => x.id === org);
    $("fl-paso").innerHTML = `<h2>${esc(p.num)}${/\d/.test(p.num) ? "." : ""} ${esc(p.icono)} ${esc(p.titulo)}</h2>
      <div class="que"><b>Qué haces en este paso</b><ol>${p.que.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></div>
      ${p.proyecto ? (o ? `<div class="tarjeta"><b>Proyectos de ${esc(o.nombre)}</b><p id="pr-msg" class="meta" role="status"></p><div id="pr-cont"></div></div>`
        : `<div class="tarjeta">Primero elige la empresa en «Empresa activa» (arriba) o dala de alta en el paso 1.</div>`) : ""}
      ${p.paneles ? `<div class="subtabs" role="tablist">${p.paneles.map(([t], k) => `<button type="button" role="tab" data-panel="${k}" aria-selected="${k === 0}">${esc(t)}</button>`).join("")}</div>
        <iframe class="panel" id="fl-iframe" title="${esc(p.paneles[0][0])}" src="${esc(urlPanel(p.paneles[0][1], p.paneles[0][2]))}" loading="lazy"></iframe>` : ""}
      <div class="nav-pasos">${i > 0 ? `<button type="button" class="b" data-paso="${PASOS[i - 1].id}">← ${esc(PASOS[i - 1].titulo)}</button>` : "<span></span>"}
        ${i < PASOS.length - 1 ? `<button type="button" class="si" data-paso="${PASOS[i + 1].id}">Siguiente paso: ${esc(PASOS[i + 1].titulo)} →</button>` : ""}</div>`;
    if (p.proyecto && o) {
      montarProyectos($("pr-cont"), { editar: true, api: (ruta, cuerpo) => api(`proyectos/${org}${ruta ? "/" + ruta : ""}`, cuerpo), alMensaje: (h) => { $("pr-msg").innerHTML = h; } }).lista();
    }
  }

  const irA = (id) => { actual = id; guardar("dominus_flujo_paso", id); history.replaceState(null, "", `#paso=${id}`); pintar(); window.scrollTo({ top: 0, behavior: "smooth" }); };
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-paso]"); if (b) return irA(b.dataset.paso);
    const t = e.target.closest("[data-panel]");
    if (t) {
      const p = PASOS.find((x) => x.id === actual), [titulo, pagina, panel] = p.paneles[Number(t.dataset.panel)];
      for (const x of document.querySelectorAll(".subtabs button")) x.setAttribute("aria-selected", String(x === t));
      Object.assign($("fl-iframe"), { title: titulo, src: urlPanel(pagina, panel) });
      $("fl-iframe").style.height = "";
    }
  });
  $("fl-org").addEventListener("change", (e) => { org = e.target.value; guardar("dominus_flujo_org", org); pintar(); });
  // Altura de los paneles incrustados (los avisa js/embebido.js desde el mismo origen).
  window.addEventListener("message", (e) => {
    if (e.origin !== location.origin || !e.data?.dominusEmbebido) return;
    const f = $("fl-iframe");
    if (f && e.source === f.contentWindow) f.style.height = `${Math.max(500, Math.min(20000, Number(e.data.alto) + 24))}px`;
  });
  // Al volver de dar de alta una empresa en el paso 1, refresca la lista.
  let ultimaCarga = 0;
  window.addEventListener("focus", () => { if (Date.now() - ultimaCarga > 15000) { ultimaCarga = Date.now(); cargarOrgs(); } });
  await cargarOrgs();
  pintar();
}
