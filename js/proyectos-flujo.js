// Admin → 🧭 Proyectos de principio a fin (proyectos.html). Une en una sola página, en orden, lo que antes estaba en
// Clientes, Cartera de proyectos, DOMINUS OPS, Caja del analista e Inteligencia corporativa. Cada paso dice qué hacer y
// muestra sus herramientas dentro de la página (las mismas páginas en «modo incrustado», js/embebido.js).
import { montarProyectos, CSS_PROYECTOS } from "./proyectos-ui.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const $ = (id) => document.getElementById(id);
const API = "/cuenta/empresa/admin/";

/** Los pasos en orden. «paneles»: [título, página, pestaña]; «proyecto»: muestra los proyectos de la empresa activa. */
export const PASOS = [
  { id: "empresa", ops: "0", num: "0", icono: "🏢", titulo: "Empresa", sub: "Alta, datos y acceso del cliente",
    que: ["Si la empresa es nueva, llena «Alta de empresa»: se crea su espacio y el enlace para que su responsable entre a Mi empresa.",
      "Si ya existe, elígela arriba en «Empresa activa». En «Empresas existentes» editas sus datos, renuevas el plan o la eliminas.",
      "Con la empresa elegida, sigue con el paso 1."],
    paneles: [["Alta de empresa", "clientes.html", "alta"], ["Empresas existentes (editar, renovar, eliminar)", "clientes.html", "clientes"], ["Cuentas y accesos", "clientes.html", "cuentas"]] },
  { id: "proyecto", ops: "I", num: "1", icono: "📁", titulo: "Proyecto: alta y arranque", sub: "Datos, contrato y alcance", proyecto: true, fase: "alta",
    que: ["Crea el proyecto con «➕ Nuevo proyecto» (los campos con * son obligatorios) o elige uno en «Proyecto activo».",
      "Llena la fase «Alta» (contrato y contacto del cliente) y la fase «Arranque» (junta, alcance y riesgos prioritarios).",
      "Cada fase es una pestaña: puedes volver a cualquiera para corregir. El botón verde la completa cuando no falta nada."] },
  { id: "diagnostico", ops: "I", num: "2", icono: "🩺", titulo: "Diagnóstico inicial", sub: "Madurez (DMI) y gobernanza",
    que: ["Llena la ficha del cliente y el Readiness Assessment: te da el índice de madurez (DMI) por dimensión.",
      "Revisa gobernanza (quién decide y bajo qué control). Lo débil se vuelve actividad o hallazgo del proyecto."],
    paneles: [["Ficha del cliente", "ops.html", "cliente"], ["Readiness y DMI", "ops.html", "dmi"], ["Gobernanza", "ops.html", "gob"]] },
  { id: "plan", ops: "II", num: "3", icono: "🧩", titulo: "Plan: plantilla y normativa", sub: "Sector y países → plan completo", proyecto: true, fase: "plan",
    que: ["En la fase «Plan» del proyecto: 1) genera la plantilla, 2) descarga el Excel si lo necesitas, 3) guárdala en el proyecto.",
      "Se guardan las actividades, la lista de auditoría y los riesgos; no hace falta ir a otra página.",
      "Para consultar una ley a fondo o sus cambios recientes, usa las pestañas de consulta de abajo."],
    paneles: [["Normativa por país (consulta)", "herramientas.html", "normativa"], ["Cambios en leyes (bitácora)", "herramientas.html", "bitacora"], ["Plantillas por fase (OPS)", "ops.html", "plantillas"]] },
  { id: "riesgos", ops: "II", num: "4", icono: "🏭", titulo: "Riesgos e instalaciones", sub: "Sedes, matriz por país y por sede",
    que: ["Registra las instalaciones del cliente (sedes, plantas, proveedores): DOMINUS calcula su riesgo con los eventos cercanos de hoy y del último año.",
      "Revisa la matriz 5×5 por país y por sede, y simula escenarios. Los riesgos altos se vuelven hallazgos o actividades del proyecto."],
    paneles: [["Instalaciones y matriz por sede", "corporativo.html", ""], ["Risk management y escenarios", "ops.html", "riesgos"], ["Simulación de escenarios", "herramientas.html", "escenarios"], ["Nube y seguridad", "herramientas.html", "nube"]] },
  { id: "auditoria", ops: "III", num: "5", icono: "🔍", titulo: "Auditorías", sub: "Lista de auditoría y hallazgos", proyecto: true, fase: "auditorias",
    que: ["En la fase «Auditorías» del proyecto responde la lista: «❌ No cumple» registra el hallazgo solo.",
      "Para revisar a fondo usa las plantillas por sector, el diagnóstico de ciberseguridad y la auditoría de archivos (abajo).",
      "Cada hallazgo lleva responsable, fecha límite y evidencia."],
    paneles: [["Plantillas de auditoría por sector", "herramientas.html", "auditorias"], ["Diagnóstico de ciberseguridad", "ops.html", "ciber"], ["Auditoría de archivos", "herramientas.html", "archivos"], ["Informática y ciberseguridad", "herramientas.html", "informatica"]] },
  { id: "seguimiento", ops: "IV", num: "6", icono: "📈", titulo: "Seguimiento y War Room", sub: "Avance, riesgos, tableros y SITREP", proyecto: true, fase: "seguimiento",
    que: ["En la fase «Seguimiento» del proyecto: actualiza actividades, atiende riesgos y hallazgos y deja una nota por revisión.",
      "Para directivos: «🔗 Compartir vista» crea un enlace de solo lectura del avance.",
      "War Room: tableros, Battle Rhythm y SITREP (abajo)."],
    paneles: [["Tableros y War Room", "ops.html", "tableros"], ["Battle Rhythm y SITREP", "ops.html", "ritmo"], ["Seguimiento del plan (Excel)", "herramientas.html", "seguimiento"]] },
  { id: "cierre", ops: "V", num: "7", icono: "📄", titulo: "Informe, entrega y cierre", sub: "Informe integral y lecciones", proyecto: true, fase: "entrega",
    que: ["Arma el informe integral (abajo) y regístralo en la fase «Entrega» del proyecto con su fecha y aprobación.",
      "En la fase «Cierre» registra la satisfacción y las lecciones aprendidas; al completarla el proyecto queda cerrado."],
    paneles: [["Informe integral", "ops.html", "informe"]] },
  { id: "consulta", ops: "VI", num: "8", icono: "📚", titulo: "Mejora continua y consulta", sub: "Autoauditoría, métodos y doctrina",
    que: ["Autoauditoría DOMINUS: revisa nuestros propios controles con evidencias.", "Material de apoyo: fases del método, metodologías, marcos de análisis, agencias y doctrina."],
    paneles: [["Autoauditoría DOMINUS", "ops.html", "autoaud"], ["Mapa maestro y fases", "ops.html", "mapa"], ["Biblioteca de metodologías", "ops.html", "biblioteca"], ["Análisis de inteligencia", "herramientas.html", "analisis"],
      ["Marcos de análisis", "herramientas.html", "marcos"], ["Agencias", "herramientas.html", "agencias"], ["Doctrina y salas", "ops.html", "doctrina"]] },
];

/** Fases del marco DOMINUS OPS que agrupan los pasos. */
export const FASES_OPS = { "0": "Antes de empezar", I: "Fase I · Estrategia y planeación", II: "Fase II · Diseño operativo", III: "Fase III · Ejecución y operaciones",
  IV: "Fase IV · Monitoreo y War Room", V: "Fase V · Evaluación y cierre", VI: "Fase VI · Escalamiento y continuidad" };

/** Dirección del panel incrustado. */
export const urlPanel = (pagina, panel, org = "") => `${pagina}?embebido=1${panel ? `&panel=${encodeURIComponent(panel)}` : ""}${org ? `&org=${encodeURIComponent(org)}` : ""}`;

// Mi empresa usa el mismo flujo, salvo el alta de la empresa (solo DOMINUS) y la autoauditoría de DOMINUS. Sus
// herramientas se abren en las copias públicas de las páginas («empresa-*.html», ver tools/pages/paginas_empresa.py),
// que guardan los datos en el espacio de la empresa con la sesión de sus miembros.
export const PAGINA_EMPRESA = { "ops.html": "empresa-ops.html", "herramientas.html": "empresa-caja.html", "corporativo.html": "empresa-corporativo.html" };
const SOLO_DOMINUS = new Set(["clientes.html", "ops.html#autoaud"]);

/** Pasos para Admin («admin») o para una empresa cliente («empresa»), numerados en orden. */
export function pasosPara(modo = "admin") {
  if (modo !== "empresa") return PASOS;
  return PASOS.filter((p) => p.id !== "empresa").map((p, k) => ({
    ...p, num: String(k + 1),
    que: p.que.map((x) => x.replace(/ o dala de alta en el paso 1/g, "")),
    paneles: p.paneles?.filter(([, pag, pan]) => !SOLO_DOMINUS.has(pag) && !SOLO_DOMINUS.has(`${pag}#${pan}`)).map(([t, pag, pan]) => [t, PAGINA_EMPRESA[pag] || pag, pan]),
  })).map((p) => (p.paneles && !p.paneles.length ? { ...p, paneles: undefined } : p));
}

/** Estilos del flujo (los usa Mi empresa; proyectos.html los trae en su página). */
export const CSS_FLUJO = `.flujo { display: grid; grid-template-columns: 270px 1fr; gap: 16px; align-items: start; }
  .indice { position: sticky; top: 8px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); padding: 8px; }
  .indice ol { list-style: none; margin: 0; padding: 0; }
  .indice button { display: grid; grid-template-columns: 34px 1fr; gap: 6px; align-items: center; width: 100%; text-align: left; font: inherit; padding: 8px; margin: 2px 0;
    border: 1px solid transparent; border-radius: var(--radius); background: transparent; color: var(--text); cursor: pointer; }
  .indice button:hover { background: var(--surface-2); } .indice button[aria-current="step"] { border-color: var(--accent); background: var(--surface-2); font-weight: 700; }
  .indice .num { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; border: 2px solid var(--line); font-weight: 800; font-size: 13px; }
  .indice button[aria-current="step"] .num { background: var(--accent); color: var(--on-accent, #fff); border-color: var(--accent); }
  .indice .grupo-ops { margin: 10px 4px 2px; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; color: var(--accent); }
  .indice .sub { display: block; font-weight: 400; color: var(--text-2); font-size: 12px; }
  .grupo-ops-actual { margin: 0; font-weight: 700; color: var(--accent); }
  .paso h2 { border-left: 6px solid var(--accent); padding-left: 10px; font-size: 20px; text-transform: none; letter-spacing: 0; color: var(--text); margin: 0 0 6px; }
  .que { border-left: 5px solid var(--accent); padding: 8px 12px; background: var(--surface-2); border-radius: var(--radius); margin: 8px 0 12px; }
  .que ol { margin: 6px 0 0 18px; padding: 0; } .que li { margin: 3px 0; }
  .subtabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
  .subtabs button { font: inherit; padding: 6px 12px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface-2); color: var(--text); cursor: pointer; }
  .subtabs button[aria-selected="true"] { background: var(--accent); color: var(--on-accent, #fff); border-color: transparent; font-weight: 700; }
  iframe.panel { width: 100%; min-height: 600px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
  .nav-pasos { display: flex; justify-content: space-between; gap: 8px; margin-top: 14px; }
  .nav-pasos .si { font: inherit; min-height: 38px; padding: 6px 16px; border: 0; border-radius: var(--radius); background: var(--accent); color: var(--on-accent, #fff); font-weight: 700; cursor: pointer; }
  @media (max-width: 900px) { .flujo { grid-template-columns: 1fr; } .indice { position: static; } }`;

async function api(ruta, cuerpo) {
  const init = { credentials: "include", cache: "no-store" };
  if (cuerpo !== undefined) Object.assign(init, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(cuerpo) });
  const r = await fetch(API + ruta, init);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 403 ? "Tu sesión de administración terminó: vuelve a ingresar." : d.error || `HTTP ${r.status}`);
  return d;
}

/**
 * Monta el flujo dentro de `raiz` (debe contener #fl-indice, #fl-paso, #fl-org, #fl-proy y #fl-msg).
 * op.modo: «admin» (elige entre todas las empresas) o «empresa» (una sola, la de Mi empresa).
 * op.orgs(): lista [{id, nombre}]; op.proyectos(org): lista de proyectos; op.apiProyecto(org): (ruta, cuerpo) → respuesta;
 * op.evidencias(org): base de la API de evidencias; op.editar: si puede editar.
 */
export async function montarFlujo(raiz, op) {
  const $f = (id) => raiz.querySelector(`#${id}`);
  const pasos = pasosPara(op.modo);
  const leer = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
  const pref = op.modo === "empresa" ? "dominus_flujo_emp_" : "dominus_flujo_";
  let org = op.org || leer(`${pref}org`), actual = (location.hash.match(/paso=([a-z]+)/) || [])[1] || leer(`${pref}paso`) || pasos[0].id;
  if (!pasos.some((p) => p.id === actual)) actual = pasos[0].id;
  let orgs = [], proyActivo = leer(`${pref}proyecto`);

  async function cargarOrgs() {
    try {
      orgs = await op.orgs();
      $f("fl-org").innerHTML = `${op.modo === "empresa" ? "" : '<option value="">Elige una empresa…</option>'}${orgs.map((o) => `<option value="${esc(o.id)}">${esc(o.nombre)}</option>`).join("")}`;
      if (!orgs.some((o) => o.id === org)) org = op.modo === "empresa" ? orgs[0]?.id || "" : "";
      $f("fl-org").value = org;
      await cargarProyectos();
    } catch (e) { $f("fl-msg").innerHTML = `<span class="error">${esc(e.message)}</span>`; }
  }

  async function cargarProyectos() {
    const sel = $f("fl-proy");
    if (!org) { sel.innerHTML = '<option value="">—</option>'; sel.disabled = true; proyActivo = ""; return; }
    try {
      const proyectos = await op.proyectos(org);
      if (!proyectos.some((x) => x.id === proyActivo)) proyActivo = "";
      sel.innerHTML = `<option value="">Elige o crea uno en el paso 1…</option>${proyectos.map((x) => `<option value="${esc(x.id)}">${esc(x.nombre)}</option>`).join("")}`;
      sel.value = proyActivo; sel.disabled = false;
    } catch { sel.innerHTML = '<option value="">—</option>'; }
  }

  function indice() {
    let grupo = "";
    $f("fl-indice").innerHTML = pasos.map((p) => `${p.ops !== grupo ? `<li class="grupo-ops">${esc(FASES_OPS[(grupo = p.ops)])}</li>` : ""}<li><button type="button" data-paso="${p.id}" ${p.id === actual ? 'aria-current="step"' : ""}>
      <span class="num">${esc(p.num)}</span><span>${esc(p.icono)} ${esc(p.titulo)}<span class="sub">${esc(p.sub)}</span></span></button></li>`).join("");
  }

  function pintar() {
    const i = pasos.findIndex((p) => p.id === actual), p = pasos[i];
    indice();
    const o = orgs.find((x) => x.id === org);
    $f("fl-paso").innerHTML = `<p class="meta grupo-ops-actual">${esc(FASES_OPS[p.ops])}</p><h2>${esc(p.num)}. ${esc(p.icono)} ${esc(p.titulo)}</h2>
      <div class="que"><b>Qué haces en este paso</b><ol>${p.que.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></div>
      ${p.proyecto ? (o ? `<div class="tarjeta"><b>Proyectos de ${esc(o.nombre)}</b><p id="pr-msg" class="meta" role="status"></p><div id="pr-cont"></div></div>`
        : `<div class="tarjeta">Primero elige la empresa en «Empresa activa» (arriba)${op.modo === "empresa" ? "" : " o dala de alta en el paso 0"}.</div>`) : ""}
      ${p.paneles ? `<div class="subtabs" role="tablist">${p.paneles.map(([t], k) => `<button type="button" role="tab" data-panel="${k}" aria-selected="${k === 0}">${esc(t)}</button>`).join("")}</div>
        <iframe class="panel" id="fl-iframe" title="${esc(p.paneles[0][0])}" src="${esc(urlPanel(p.paneles[0][1], p.paneles[0][2], org))}" loading="lazy"></iframe>` : ""}
      <div class="nav-pasos">${i > 0 ? `<button type="button" class="b" data-paso="${pasos[i - 1].id}">← ${esc(pasos[i - 1].titulo)}</button>` : "<span></span>"}
        ${i < pasos.length - 1 ? `<button type="button" class="si" data-paso="${pasos[i + 1].id}">Siguiente paso: ${esc(pasos[i + 1].titulo)} →</button>` : ""}</div>`;
    if (p.proyecto && o) {
      const m = montarProyectos($f("pr-cont"), { editar: op.editar !== false, evidencias: op.evidencias(org), api: op.apiProyecto(org), alMensaje: (h) => { $f("pr-msg").innerHTML = h; },
        alAbrir: (pid) => { if (pid !== proyActivo) { proyActivo = pid; guardar(`${pref}proyecto`, pid); cargarProyectos(); } } });
      if (proyActivo) m.abrir(proyActivo, p.fase); else m.lista();
    }
  }

  const irA = (id) => { actual = id; guardar(`${pref}paso`, id); history.replaceState(null, "", `#paso=${id}`); pintar(); raiz.scrollIntoView({ behavior: "smooth", block: "start" }); };
  raiz.addEventListener("click", (e) => {
    const b = e.target.closest("[data-paso]"); if (b) return irA(b.dataset.paso);
    const t = e.target.closest("[data-panel]");
    if (t) {
      const p = pasos.find((x) => x.id === actual), [titulo, pagina, panel] = p.paneles[Number(t.dataset.panel)];
      for (const x of raiz.querySelectorAll(".subtabs button")) x.setAttribute("aria-selected", String(x === t));
      Object.assign($f("fl-iframe"), { title: titulo, src: urlPanel(pagina, panel, org) });
      $f("fl-iframe").style.height = "";
    }
  });
  $f("fl-org").addEventListener("change", async (e) => { org = e.target.value; guardar(`${pref}org`, org); proyActivo = ""; guardar(`${pref}proyecto`, ""); await cargarProyectos(); pintar(); });
  $f("fl-proy").addEventListener("change", (e) => { proyActivo = e.target.value; guardar(`${pref}proyecto`, proyActivo); pintar(); });
  // Altura de los paneles incrustados (los avisa js/embebido.js desde el mismo origen).
  window.addEventListener("message", (e) => {
    if (e.origin !== location.origin || !e.data?.dominusEmbebido) return;
    const f = $f("fl-iframe");
    if (f && e.source === f.contentWindow) f.style.height = `${Math.max(500, Math.min(20000, Number(e.data.alto) + 24))}px`;
  });
  if (op.modo !== "empresa") {
    // Al volver de dar de alta una empresa en el paso 0, refresca la lista.
    let ultimaCarga = 0;
    window.addEventListener("focus", () => { if (Date.now() - ultimaCarga > 15000) { ultimaCarga = Date.now(); cargarOrgs(); } });
  }
  await cargarOrgs();
  pintar();
}

if (typeof document !== "undefined" && document.getElementById("fl-indice") && !document.getElementById("p-flujo")) {
  document.head.insertAdjacentHTML("beforeend", `<style>${CSS_PROYECTOS}</style>`);
  montarFlujo(document.body, {
    modo: "admin",
    orgs: async () => (await api("orgs")).orgs,
    proyectos: async (org) => (await api(`proyectos/${org}`)).proyectos,
    apiProyecto: (org) => (ruta, cuerpo) => api(`proyectos/${org}${ruta ? "/" + ruta : ""}`, cuerpo),
    evidencias: (org) => `${API}evidencias/${org}`,
  });
}
