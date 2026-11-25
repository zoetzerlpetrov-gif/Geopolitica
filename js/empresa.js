// Página «Mi empresa» (empresa.html): espacio de cada empresa con cumplimiento normativo, equipo, configuración y
// bitácora. Habla con la API del Worker (cloudflare/planes/empresas.js) con la sesión de Google de la cuenta.
// Todo texto que viene de la API o de las fichas se escapa antes de dibujarse.
import * as C from "./cumplimiento-logica.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const $ = (id) => document.getElementById(id);
const ADMIN = "https://admin.dominusosint.com";
export const baseApi = (host = location.hostname) => (host === "admin.dominusosint.com" ? "/cuenta/empresa/" : `${ADMIN}/cuenta/empresa/`);
export const PAISES = { MEX: "México", USA: "Estados Unidos", CAN: "Canadá", EUR: "Unión Europea", BRA: "Brasil", ARG: "Argentina", CHL: "Chile", CHN: "China", JPN: "Japón",
  RUS: "Rusia", SAU: "Arabia Saudita", ARE: "Emiratos Árabes Unidos", QAT: "Catar", KWT: "Kuwait", BHR: "Baréin", OMN: "Omán", ISR: "Israel", TUR: "Turquía", EGY: "Egipto", JOR: "Jordania" };
const ROLES = { dueno: "Dueño", admin: "Administrador", editor: "Editor", lector: "Lector" };
const fecha = (s) => (s ? new Date(Number(s) * 1000).toISOString().slice(0, 10) : "");

async function api(ruta, cuerpo) {
  const init = { credentials: "include", cache: "no-store" };
  // text/plain evita la consulta previa de CORS; el Worker valida el origen.
  if (cuerpo !== undefined) Object.assign(init, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(cuerpo) });
  const r = await fetch(baseApi() + ruta, init);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.error || `HTTP ${r.status}`); e.status = r.status; throw e; }
  return d;
}

const normas = {};
async function normaDe(pais) {
  if (!normas[pais]) {
    const n = await fetch(`config/normativa/${encodeURIComponent(pais)}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const extra = pais === "MEX" ? await fetch("config/normativa/MEX_sectores.json").then((r) => r.json()).then((x) => x.sectores || {}).catch(() => ({})) : {};
    normas[pais] = { norma: n, extra };
  }
  return normas[pais];
}

function formOrg(o = { nombre: "", pais: "MEX", sectores: [] }, sectores = [], boton = "Crear empresa (prueba de 14 días)") {
  return `<label>Nombre de la empresa <input id="og-nombre" maxlength="120" value="${esc(o.nombre)}" required></label>
    <label>País <select id="og-pais">${Object.entries(PAISES).map(([k, v]) => `<option value="${k}" ${k === o.pais ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
    <p class="meta">Sectores en los que opera (agregan sus leyes al cumplimiento):</p>
    <div class="sectores" id="og-sectores">${sectores.map((s) => `<label><input type="checkbox" value="${esc(s.id)}" ${o.sectores?.includes(s.id) ? "checked" : ""}> ${esc(s.nombre)}</label>`).join("") || '<span class="meta">Este país solo tiene leyes generales en el catálogo.</span>'}</div>
    <div class="barra"><button type="button" class="si" id="og-guardar">${esc(boton)}</button><span id="og-msg" role="status"></span></div>`;
}
const leerForm = () => ({ nombre: $("og-nombre").value, pais: $("og-pais").value, sectores: [...document.querySelectorAll("#og-sectores input:checked")].map((x) => x.value) });

async function pintarForm(cont, org, boton, alGuardar) {
  const { norma, extra } = await normaDe(org.pais);
  cont.innerHTML = formOrg(org, C.sectoresDe(norma, extra), boton);
  $("og-pais").addEventListener("change", async () => pintarForm(cont, { ...leerForm(), sectores: [] }, boton, alGuardar));
  $("og-guardar").addEventListener("click", async () => {
    try { $("og-msg").textContent = "Guardando…"; await alGuardar(leerForm()); } catch (e) { $("og-msg").innerHTML = `<span class="error">${esc(e.message)}</span>`; }
  });
}

let estado = { yo: null, org: null, info: null, items: [], resp: {} };

async function cargarOrg(id) {
  const info = await api(`${id}/info`);
  const { norma, extra } = await normaDe(info.org.pais);
  const items = C.preguntas(C.leyesAplicables(norma, extra, info.org.sectores));
  const resp = Object.fromEntries((await api(`${id}/cumplimiento`)).respuestas.map((r) => [r.clave, r]));
  estado = { ...estado, org: id, info, items, resp };
  const o = info.org;
  $("em-plan").innerHTML = `${o.plan === "prueba" ? "Prueba" : `Plan ${esc(o.plan)}`} · ${o.vigente ? `vigente hasta ${fecha(o.vence)}` : `<span class="error">venció el ${fecha(o.vence)} (solo lectura)</span>`} · ${info.miembros.length}/${o.asientos} usuarios · tu rol: ${esc(ROLES[info.rol])}`;
  const areas = [...new Set(items.map((i) => i.ley.area))].sort((a, b) => a.localeCompare(b, "es"));
  $("cu-area").innerHTML = `<option value="">Todas</option>${areas.map((a) => `<option>${esc(a)}</option>`).join("")}`;
  pintarCumplimiento(); pintarEquipo();
  const cf = $("cf-form");
  if (C.ESTADOS && ["admin", "dueno"].includes(info.rol)) {
    await pintarForm(cf, o, "Guardar configuración", async (d) => { await api(`${id}/config`, d); await iniciar(id); });
  } else cf.innerHTML = `<p class="meta">Solo los administradores cambian la configuración. País: ${esc(PAISES[o.pais] || o.pais)} · Sectores: ${esc(o.sectores.join(", ") || "ninguno")}</p>`;
}

function pintarCumplimiento() {
  const { items, resp, info } = estado;
  const s = C.resumen(items, resp);
  $("cu-resumen").innerHTML = `<div class="kpis"><div class="kpi"><b>${s.pct} %</b>cumple (sin contar «no aplica»)<div class="progreso" aria-hidden="true"><i style="width:${s.pct}%"></i></div></div>
    <div class="kpi"><b>${s.cumple}</b>Cumple</div><div class="kpi"><b>${s.en_proceso}</b>En proceso</div><div class="kpi"><b>${s.no_cumple}</b>No cumple</div>
    <div class="kpi"><b>${s.pendiente}</b>Pendientes</div><div class="kpi"><b>${s.alertas}</b>Con aviso (ley cambió o plazo vencido)</div></div>
    <p class="meta">${s.total} preguntas de ${new Set(items.map((i) => i.ley.id)).size} leyes que aplican a ${esc(PAISES[info.org.pais] || info.org.pais)}${info.org.sectores.length ? ` y a tus sectores` : ""}. El catálogo se revisa cada día contra el DOF y fuentes oficiales.</p>`;
  const f = { estado: $("cu-estado").value, area: $("cu-area").value, alertas: $("cu-alertas").checked, q: $("cu-q").value.trim().toLowerCase() };
  const puedeEditar = ["editor", "admin", "dueno"].includes(info.rol) && info.org.vigente;
  const miembros = info.miembros.map((m) => m.email);
  const porLey = new Map();
  for (const it of items) {
    const r = resp[it.clave];
    const av = C.avisos(it, r);
    if (f.estado && (r?.estado || "pendiente") !== f.estado) continue;
    if (f.area && it.ley.area !== f.area) continue;
    if (f.alertas && !av.length) continue;
    if (f.q && !`${it.ley.nombre} ${it.ley.sigla} ${it.texto}`.toLowerCase().includes(f.q)) continue;
    if (!porLey.has(it.ley.id)) porLey.set(it.ley.id, []);
    porLey.get(it.ley.id).push({ it, r, av });
  }
  const dis = puedeEditar ? "" : "disabled";
  $("cu-lista").innerHTML = [...porLey.values()].map((filas) => { const ley = filas[0].it.ley; return `<div class="tarjeta ley"><h3>${esc(ley.sigla || "")} · ${esc(ley.nombre)}</h3>
    <div class="meta">${esc(ley.area)} · Última reforma: ${esc(ley.ultima_reforma || "sin dato")} · ${ley.url ? `<a href="${esc(ley.url)}" target="_blank" rel="noopener noreferrer">texto oficial</a>` : ""}</div>
    ${filas.map(({ it, r, av }) => `<div class="preg estado-${esc(r?.estado || "pendiente")}" data-clave="${esc(it.clave)}">
      <div class="texto">${esc(it.texto)}${r?.actualizado ? `<div class="meta">Actualizado ${fecha(r.actualizado)} por ${esc(r.actualizado_por)}</div>` : ""}</div>
      <select data-c="estado" aria-label="Estado" ${dis}>${Object.entries(C.ESTADOS).map(([k, v]) => `<option value="${k}" ${k === (r?.estado || "pendiente") ? "selected" : ""}>${v}</option>`).join("")}</select>
      <select data-c="responsable" aria-label="Responsable" ${dis}><option value="">Sin responsable</option>${miembros.map((m) => `<option ${m === r?.responsable ? "selected" : ""}>${esc(m)}</option>`).join("")}</select>
      <input type="date" data-c="fecha_limite" aria-label="Fecha límite" value="${esc(r?.fecha_limite || "")}" ${dis}>
      <input data-c="evidencia" maxlength="1000" placeholder="Evidencia (enlace o nota)" aria-label="Evidencia" value="${esc(r?.evidencia || "")}" ${dis}>
      ${av.map((a) => `<div class="aviso-c">⚠️ ${esc(a.texto)}</div>`).join("")}</div>`).join("")}</div>`; }).join("")
    || `<p class="meta">Nada con estos filtros.</p>`;
}

async function guardarFila(fila) {
  const clave = fila.dataset.clave, val = (c) => fila.querySelector(`[data-c="${c}"]`).value;
  const d = { clave, estado: val("estado"), responsable: val("responsable"), fecha_limite: val("fecha_limite"), evidencia: val("evidencia") };
  $("cu-guardado").textContent = "Guardando…";
  try {
    const r = await api(`${estado.org}/cumplimiento`, d);
    estado.resp[clave] = { ...d, actualizado: r.actualizado, actualizado_por: estado.yo.email };
    $("cu-guardado").textContent = `Guardado ${new Date().toLocaleTimeString("es-MX")}.`;
    pintarCumplimiento();
  } catch (e) { $("cu-guardado").innerHTML = `<span class="error">${esc(e.message)}</span>`; }
}

function pintarEquipo() {
  const { info } = estado, admin = ["admin", "dueno"].includes(info.rol);
  $("eq-invitar").disabled = !admin || !info.org.vigente;
  $("eq-miembros").innerHTML = `<table class="t"><tr><th>Correo</th><th>Rol</th><th>Desde</th><th></th></tr>${info.miembros.map((m) => `<tr><td>${esc(m.email)}</td>
    <td>${admin && m.rol !== "dueno" ? `<select data-rol="${esc(m.email)}">${["lector", "editor", "admin"].map((r) => `<option value="${r}" ${r === m.rol ? "selected" : ""}>${ROLES[r]}</option>`).join("")}</select>` : esc(ROLES[m.rol])}</td>
    <td>${fecha(m.alta)}</td><td>${m.rol !== "dueno" && (admin || m.email === estado.yo.email) ? `<button type="button" data-quitar="${esc(m.email)}">${m.email === estado.yo.email ? "Salir" : "Quitar"}</button>` : ""}</td></tr>`).join("")}</table>
    ${info.invitaciones.length ? `<p class="meta">Invitaciones pendientes: ${info.invitaciones.map((i) => `${esc(i.email)} (${esc(ROLES[i.rol])}, vence ${fecha(i.vence)})`).join(" · ")}</p>` : ""}`;
}

async function iniciar(elegida) {
  try {
    // Invitación en el enlace (#inv=…): se acepta al entrar con el correo invitado.
    const inv = new URLSearchParams(location.hash.slice(1)).get("inv");
    if (inv) {
      try { const r = await api("aceptar", { token: inv }); elegida = r.org; history.replaceState(null, "", location.pathname); }
      catch (e) { if (e.status !== 401) $("em-estado").innerHTML = `<p class="error">${esc(e.message)}</p>`; if (e.status === 401) throw e; }
    }
    estado.yo = await api("yo");
    if (!estado.yo.orgs.length) {
      $("em-app").hidden = true;
      $("em-estado").innerHTML = `<h2>Crea el espacio de tu empresa</h2><p>Incluye 14 días de prueba con hasta 3 usuarios: cumplimiento normativo por país y sector, responsables, plazos, evidencias y avisos cuando cambia una ley.</p><div id="og-form"></div>`;
      await pintarForm($("og-form"), { nombre: "", pais: "MEX", sectores: [] }, "Crear empresa (prueba de 14 días)", async (d) => { const r = await api("crear", d); await iniciar(r.id); });
      return;
    }
    $("em-estado").hidden = true; $("em-app").hidden = false;
    $("em-org").innerHTML = estado.yo.orgs.map((o) => `<option value="${esc(o.id)}">${esc(o.nombre)}</option>`).join("");
    const id = estado.yo.orgs.some((o) => o.id === elegida) ? elegida : estado.yo.orgs[0].id;
    $("em-org").value = id;
    await cargarOrg(id);
  } catch (e) {
    $("em-app").hidden = true; $("em-estado").hidden = false;
    if (e.status === 401) {
      $("em-estado").innerHTML = `<h2>Inicia sesión para entrar a tu empresa</h2><p>Usa tu cuenta de Google (el mismo correo con el que te invitaron, si es el caso). Después vuelve a esta página.</p>
        <p><a class="boton si" href="${ADMIN}/cuenta/google">Continuar con Google</a></p><p class="meta">Si abriste un enlace de invitación, guárdalo: al volver con la sesión iniciada se acepta solo.</p>`;
      try { const inv = new URLSearchParams(location.hash.slice(1)).get("inv"); if (inv) sessionStorage.setItem("gp_inv", inv); } catch { /* */ }
    } else $("em-estado").innerHTML = `<p class="error">No se pudo cargar tu espacio de empresa: ${esc(e.message)}.</p><p class="meta">Si estás en una copia de prueba o en local, la API solo responde en dominusosint.com.</p>`;
  }
}

if (typeof document !== "undefined" && $("em-app")) {
  try { const inv = sessionStorage.getItem("gp_inv"); if (inv && !location.hash) { location.hash = `inv=${inv}`; sessionStorage.removeItem("gp_inv"); } } catch { /* */ }
  for (const k of Object.keys(C.ESTADOS)) $("cu-estado").insertAdjacentHTML("beforeend", `<option value="${k}">${C.ESTADOS[k]}</option>`);
  for (const id of ["cu-estado", "cu-area", "cu-alertas", "cu-q"]) $(id).addEventListener("input", () => estado.info && pintarCumplimiento());
  $("cu-lista").addEventListener("change", (e) => { const fila = e.target.closest(".preg"); if (fila) guardarFila(fila); });
  $("cu-csv").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([C.csv(estado.items, estado.resp)], { type: "text/csv;charset=utf-8" }));
    a.download = `cumplimiento-${(estado.info?.org.nombre || "empresa").replace(/[^\w-]+/g, "_")}.csv`; a.click();
  });
  document.querySelector(".pestanas").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-p]"); if (!b) return;
    for (const x of document.querySelectorAll(".pestanas button")) x.setAttribute("aria-selected", String(x === b));
    for (const p of document.querySelectorAll("section[role=tabpanel]")) p.hidden = p.id !== `p-${b.dataset.p}`;
    if (b.dataset.p === "bitacora") {
      try { const r = await api(`${estado.org}/bitacora`); $("bi-lista").innerHTML = `<table class="t"><tr><th>Fecha</th><th>Quién</th><th>Acción</th><th>Detalle</th></tr>${r.bitacora.map((x) => `<tr><td>${new Date(x.fecha * 1000).toLocaleString("es-MX")}</td><td>${esc(x.email)}</td><td>${esc(x.accion)}</td><td>${esc(x.detalle)}</td></tr>`).join("")}</table>`; }
      catch (err) { $("bi-lista").innerHTML = `<p class="meta">${esc(err.message)}</p>`; }
    }
  });
  $("em-org").addEventListener("change", (e) => cargarOrg(e.target.value).catch((err) => { $("cu-guardado").textContent = err.message; }));
  $("em-nueva").addEventListener("click", async () => {
    $("em-app").hidden = true; $("em-estado").hidden = false;
    $("em-estado").innerHTML = `<h2>Nueva empresa</h2><div id="og-form"></div><p><button type="button" id="og-cancelar">Cancelar</button></p>`;
    $("og-cancelar").addEventListener("click", () => iniciar(estado.org));
    await pintarForm($("og-form"), { nombre: "", pais: "MEX", sectores: [] }, "Crear empresa (prueba de 14 días)", async (d) => { const r = await api("crear", d); await iniciar(r.id); });
  });
  $("eq-invitar").addEventListener("click", async () => {
    try {
      const r = await api(`${estado.org}/invitar`, { email: $("eq-email").value, rol: $("eq-rol").value });
      const enlace = `${location.origin}${location.pathname}#inv=${r.token}`;
      $("eq-enlace").innerHTML = `Enlace para ${esc($("eq-email").value)} (vence en ${r.vence_dias} días): <input readonly value="${esc(enlace)}" style="width:100%" aria-label="Enlace de invitación"> <button type="button" id="eq-copiar">📋 Copiar</button>`;
      $("eq-copiar").addEventListener("click", async () => { try { await navigator.clipboard.writeText(enlace); $("eq-copiar").textContent = "✔️ Copiado"; } catch { /* */ } });
      await cargarOrg(estado.org);
    } catch (e) { $("eq-enlace").innerHTML = `<span class="error">${esc(e.message)}</span>`; }
  });
  $("eq-miembros").addEventListener("change", async (e) => {
    const email = e.target.dataset.rol; if (!email) return;
    try { await api(`${estado.org}/rol`, { email, rol: e.target.value }); await cargarOrg(estado.org); } catch (err) { $("eq-enlace").innerHTML = `<span class="error">${esc(err.message)}</span>`; }
  });
  $("eq-miembros").addEventListener("click", async (e) => {
    const email = e.target.dataset.quitar; if (!email || !confirm(`¿Quitar a ${email} de la empresa?`)) return;
    try { await api(`${estado.org}/quitar`, { email }); await iniciar(email === estado.yo.email ? undefined : estado.org); } catch (err) { $("eq-enlace").innerHTML = `<span class="error">${esc(err.message)}</span>`; }
  });
  iniciar();
}
