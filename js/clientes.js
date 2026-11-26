// Admin → Clientes y proyectos (clientes.html): alta de empresas, planes, cortesías y accesos. Habla con la API del
// Worker (/cuenta/empresa/admin/...) con la sesión de administración; todo queda en la base del servidor.
import * as C from "./cumplimiento-logica.js";
import { PAISES } from "./empresa.js";
import { montarProyectos, CSS_PROYECTOS } from "./proyectos-ui.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const $ = (id) => document.getElementById(id);
const fecha = (s) => (Number(s) > 0 ? new Date(Number(s) * 1000).toISOString().slice(0, 10) : "—");
const SITIO = "https://dominusosint.com";
export const enlaceActivar = (token) => `${SITIO}/acceso.html#activar=${token}`;
const API = "/cuenta/empresa/admin/";

async function api(ruta, cuerpo) {
  const init = { credentials: "include", cache: "no-store" };
  if (cuerpo !== undefined) Object.assign(init, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(cuerpo) });
  const r = await fetch(API + ruta, init);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 403 ? "Tu sesión de administración terminó: vuelve a ingresar." : d.error || `HTTP ${r.status}`);
  return d;
}

function cajaEnlace(cont, token, quien, texto) {
  if (!token) { cont.innerHTML = `<p class="meta">${esc(quien)} ya tiene cuenta DOMINUS: puede entrar con su correo y contraseña en ${SITIO}/acceso.html.</p>`; return; }
  const url = enlaceActivar(token);
  cont.innerHTML = `<div class="enlace"><b>${esc(texto)}</b> (vence en 7 días, un solo uso). Envíaselo a ${esc(quien)} por correo o mensaje:
    <input readonly value="${esc(url)}" aria-label="Enlace de acceso"><button type="button" class="b" data-copiar="${esc(url)}">📋 Copiar</button>
    <p class="meta">Mensaje sugerido: «Hola, te damos acceso a DOMINUS. Abre este enlace, crea tu contraseña (mínimo 10 caracteres) y entra a Mi empresa: ${esc(url)}»</p></div>`;
}

async function sectores(pais) {
  const n = await fetch(`config/normativa/${pais}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const extra = pais === "MEX" ? await fetch("config/normativa/MEX_sectores.json").then((r) => r.json()).then((x) => x.sectores || {}).catch(() => ({})) : {};
  $("al-sectores").innerHTML = C.sectoresDe(n, extra).map((s) => `<label><input type="checkbox" value="${esc(s.id)}"> ${esc(s.nombre)}</label>`).join("") || '<span class="meta">Solo leyes generales para este país.</span>';
}

let ORGS = [];
async function pintarClientes() {
  try {
    const { orgs } = await api("orgs"); ORGS = orgs;
    $("cl-total").textContent = `${orgs.length} empresa(s).`;
    const hoy = Date.now() / 1000;
    $("cl-tabla").innerHTML = `<table class="t"><tr><th>Empresa</th><th>Plan</th><th>Usuarios</th><th>Vence</th><th>Renovar o ampliar <span class="meta">(plan · usuarios · días desde hoy)</span></th></tr>${orgs.map((o) => `<tr>
      <td><b>${esc(o.nombre)}</b><div class="meta">${esc(PAISES[o.pais] || o.pais)}${o.rfc ? ` · RFC ${esc(o.rfc)}` : ""} · alta ${fecha(o.creada)}</div><div class="meta">Dueño: ${esc(o.duenos || "—")}</div></td>
      <td>${esc(o.plan)}</td><td>${esc(o.miembros)} / ${esc(o.asientos)}</td>
      <td>${o.vence > hoy ? fecha(o.vence) : `<span class="error">venció ${fecha(o.vence)}</span>`}</td>
      <td><div class="renovar" data-org="${esc(o.id)}" data-nombre="${esc(o.nombre)}"><select data-c="plan" aria-label="Plan">${["prueba", "individual", "equipo", "medida"].map((p) => `<option ${p === o.plan ? "selected" : ""}>${p}</option>`).join("")}</select>
        <input data-c="asientos" type="number" min="1" max="500" value="${esc(o.asientos)}" aria-label="Usuarios"><input data-c="dias" type="number" min="1" max="400" value="30" aria-label="Días desde hoy">
        <button type="button" class="b" data-guardar>Guardar</button></div>
        <p class="acciones"><button type="button" class="b" data-editar-org="${esc(o.id)}">✏️ Editar datos</button> <button type="button" class="b peligro" data-borrar-org="${esc(o.id)}">🗑️ Eliminar</button></p>
        <div class="editar-org" id="ed-${esc(o.id)}" hidden></div></td></tr>`).join("")}</table>
      <p class="meta">«Días» cuenta desde hoy (p. ej. 30 para un mes pagado).</p>`;
  } catch (e) { $("cl-tabla").innerHTML = `<p class="error">${esc(e.message)}</p>`; }
}

async function pintarCuentas() {
  try {
    const { cuentas, cortesias } = await api("cuentas");
    const hoy = Date.now() / 1000;
    $("cu-lista").innerHTML = `<table class="t"><tr><th>Correo</th><th>Estado</th><th>Alta</th><th>Último ingreso</th><th>Acciones</th></tr>${cuentas.map((c) => `<tr><td>${esc(c.email)}${c.nombre ? `<div class="meta">${esc(c.nombre)}</div>` : ""}</td>
      <td>${c.bloqueo > hoy ? "🔒 bloqueada" : c.activa ? "✅ activa" : "⏳ pendiente de activar"}</td><td>${fecha(c.creada)}</td><td>${fecha(c.ultimo_ingreso)}</td>
      <td class="acciones" data-cuenta="${esc(c.email)}" data-nombre="${esc(c.nombre || "")}"><button type="button" class="b" data-acc="nombre">✏️ Nombre</button>${c.bloqueo > hoy ? ' <button type="button" class="b" data-acc="desbloquear">🔓 Desbloquear</button>' : ""} <button type="button" class="b" data-acc="enlace">🔑 Enlace nuevo</button> <button type="button" class="b peligro" data-acc="borrar">🗑️ Eliminar</button></td></tr>`).join("") || '<tr><td colspan="5" class="meta">Sin cuentas todavía.</td></tr>'}</table>`;
    $("co-lista").innerHTML = `<h3>Cortesías dadas</h3><table class="t"><tr><th>Correo</th><th>Producto</th><th>Plan</th><th>Vence</th><th>Nota</th><th>Acciones</th></tr>${cortesias.map((c) => `<tr><td>${esc(c.email)}</td><td>${esc(c.producto)}</td><td>${esc(c.plan)}</td>
      <td>${c.vence > hoy ? fecha(c.vence) : `<span class="error">venció ${fecha(c.vence)}</span>`}</td><td>${esc(c.nota)}</td>
      <td class="acciones" data-cortesia="${esc(c.id)}" data-nota="${esc(c.nota || "")}"><button type="button" class="b" data-acc="dias">📅 Cambiar días</button> <button type="button" class="b peligro" data-acc="quitar">🗑️ Quitar</button></td></tr>`).join("") || '<tr><td colspan="6" class="meta">Ninguna.</td></tr>'}</table>`;
  } catch (e) { $("cu-lista").innerHTML = `<p class="error">${esc(e.message)}</p>`; }
}

async function pintarOrgsProyectos() {
  if (!document.getElementById("css-proyectos")) document.head.insertAdjacentHTML("beforeend", `<style id="css-proyectos">${CSS_PROYECTOS}</style>`);
  try {
    const { orgs } = await api("orgs"), sel = $("pr-org"), previo = sel.value;
    sel.innerHTML = `<option value="">Elige una empresa…</option>${orgs.map((o) => `<option value="${esc(o.id)}">${esc(o.nombre)}</option>`).join("")}`;
    sel.value = previo;
  } catch (e) { $("pr-msg").innerHTML = `<span class="error">${esc(e.message)}</span>`; }
}

const PLANES = { mapa: [["recon", "Recon"], ["analyst", "Analyst"], ["command", "Command"]], creadores: [["inicial", "Inicial"], ["creador", "Creador"]] };

if (typeof document !== "undefined" && $("al-guardar")) {
  $("al-pais").innerHTML = Object.entries(PAISES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
  $("al-pais").addEventListener("change", () => sectores($("al-pais").value));
  sectores("MEX");
  $("al-guardar").addEventListener("click", async () => {
    const d = { nombre: $("al-nombre").value, rfc: $("al-rfc").value, pais: $("al-pais").value, dueno: $("al-dueno").value, plan: $("al-plan").value,
      asientos: Number($("al-asientos").value), dias: Number($("al-dias").value), sectores: [...document.querySelectorAll("#al-sectores input:checked")].map((x) => x.value) };
    $("al-msg").textContent = "Guardando…"; $("al-enlace").innerHTML = "";
    try {
      const r = await api("alta", d);
      $("al-msg").textContent = `✔ «${d.nombre}» dada de alta.`;
      cajaEnlace($("al-enlace"), r.token, d.dueno, "Enlace de activación");
    } catch (e) { $("al-msg").innerHTML = `<span class="error">${esc(e.message)}</span>`; }
  });
  const pintarPlanes = () => { $("co-plan").innerHTML = PLANES[$("co-producto").value].map(([k, v]) => `<option value="${k}">${v}</option>`).join(""); };
  $("co-producto").addEventListener("change", pintarPlanes); pintarPlanes();
  $("co-guardar").addEventListener("click", async () => {
    $("co-msg").textContent = "Guardando…";
    try {
      const r = await api("cortesia", { email: $("co-email").value, producto: $("co-producto").value, plan: $("co-plan").value, dias: Number($("co-dias").value), nota: $("co-nota").value });
      $("co-msg").textContent = `✔ Cortesía hasta ${fecha(r.vence)}.`;
      cajaEnlace($("co-enlace"), r.token, $("co-email").value, "Enlace para crear su contraseña");
      pintarCuentas();
    } catch (e) { $("co-msg").innerHTML = `<span class="error">${esc(e.message)}</span>`; }
  });
  $("cu-enlace").addEventListener("click", async () => {
    $("cu-msg").textContent = "";
    try { const r = await api("acceso", { email: $("cu-email").value }); cajaEnlace($("cu-salida"), r.token, $("cu-email").value, "Enlace de acceso"); pintarCuentas(); }
    catch (e) { $("cu-msg").innerHTML = `<span class="error">${esc(e.message)}</span>`; }
  });
  $("cl-recargar").addEventListener("click", pintarClientes);
  // Cuentas: nombre, desbloquear, enlace nuevo, eliminar · Cortesías: cambiar días, quitar
  for (const lista of ["cu-lista", "co-lista"]) $(lista).addEventListener("click", async (e) => {
    const acc = e.target.dataset.acc, celda = e.target.closest("[data-cuenta],[data-cortesia]"); if (!acc || !celda) return;
    const salida = lista === "cu-lista" ? $("cu-msg") : $("co-msg");
    try {
      if (celda.dataset.cuenta) {
        const email = celda.dataset.cuenta;
        if (acc === "nombre") { const n = window.prompt("Nombre visible de la cuenta:", celda.dataset.nombre); if (n === null) return; await api("cuenta/editar", { email, nombre: n }); }
        if (acc === "desbloquear") await api("cuenta/editar", { email, nombre: celda.dataset.nombre, desbloquear: true });
        if (acc === "enlace") { const r = await api("acceso", { email }); cajaEnlace($("cu-salida"), r.token, email, "Enlace de acceso"); }
        if (acc === "borrar") { if (!window.confirm(`¿Eliminar la cuenta ${email}? Ya no podrá entrar y se quitará de sus empresas. No se puede deshacer.`)) return; await api("cuenta/borrar", { email }); }
      } else {
        const id = Number(celda.dataset.cortesia);
        if (acc === "dias") { const d = window.prompt("¿Cuántos días de cortesía desde hoy? (1-400)", "30"); if (d === null) return; await api("cortesia/editar", { id, dias: Number(d), nota: celda.dataset.nota }); }
        if (acc === "quitar") { if (!window.confirm("¿Quitar esta cortesía? Si era del mapa, su plan se desactiva ahora.")) return; await api("cortesia/borrar", { id }); }
      }
      salida.textContent = "✔ Listo."; await pintarCuentas();
    } catch (err) { salida.innerHTML = `<span class="error">${esc(err.message)}</span>`; }
  });
  $("pr-org").addEventListener("change", (e) => {
    const org = e.target.value, cont = $("pr-cont").cloneNode(false); $("pr-cont").replaceWith(cont);
    if (org) montarProyectos(cont, { editar: true, api: (ruta, cuerpo) => api(`proyectos/${org}${ruta ? "/" + ruta : ""}`, cuerpo), alMensaje: (h) => { $("pr-msg").innerHTML = h; } }).lista();
  });
  $("cl-tabla").addEventListener("click", async (e) => {
    const ed = e.target.dataset.editarOrg, bo = e.target.dataset.borrarOrg;
    if (ed) {
      const o = ORGS.find((x) => x.id === ed), caja = $(`ed-${ed}`);
      caja.hidden = !caja.hidden; if (caja.hidden) return;
      caja.innerHTML = `<div class="rejilla"><label>Nombre <input data-e="nombre" maxlength="120" value="${esc(o.nombre)}"></label><label>RFC <input data-e="rfc" maxlength="13" value="${esc(o.rfc || "")}"></label>
        <label>País <select data-e="pais">${Object.entries(PAISES).map(([k, v]) => `<option value="${k}" ${k === o.pais ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
        <label>Sectores (ids separados por coma) <input data-e="sectores" value="${esc(o.sectores.join(", "))}"></label></div>
        <button type="button" class="si" data-guardar-org="${esc(ed)}">Guardar cambios</button>`;
      return;
    }
    if (e.target.dataset.guardarOrg) {
      const id = e.target.dataset.guardarOrg, caja = $(`ed-${id}`), v = (k) => caja.querySelector(`[data-e="${k}"]`).value;
      try { await api("org/editar", { org: id, nombre: v("nombre"), rfc: v("rfc"), pais: v("pais"), sectores: v("sectores").split(",").map((x) => x.trim()).filter(Boolean) }); await pintarClientes(); $("cl-total").textContent += " ✔ Datos guardados."; }
      catch (err) { caja.insertAdjacentHTML("beforeend", `<p class="error">${esc(err.message)}</p>`); }
      return;
    }
    if (bo) {
      const o = ORGS.find((x) => x.id === bo);
      const escrito = window.prompt(`Se eliminará «${o.nombre}» con sus usuarios, invitaciones, cumplimiento y proyectos. No se puede deshacer.\n\nPara confirmar, escribe el nombre exacto de la empresa:`);
      if (escrito === null) return;
      try { await api("org/borrar", { org: bo, confirmar: escrito }); await pintarClientes(); $("cl-total").textContent += " ✔ Empresa eliminada."; }
      catch (err) { $("cl-total").innerHTML = `<span class="error">${esc(err.message)}</span>`; }
      return;
    }
    const fila = e.target.closest("[data-org]"); if (!fila || !e.target.matches("[data-guardar]")) return;
    const v = (c) => fila.querySelector(`[data-c="${c}"]`).value;
    try { await api("plan", { org: fila.dataset.org, plan: v("plan"), asientos: Number(v("asientos")), dias: Number(v("dias")) }); await pintarClientes(); }
    catch (err) { $("cl-total").innerHTML = `<span class="error">${esc(err.message)}</span>`; }
  });
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-copiar]"); if (!b) return;
    try { await navigator.clipboard.writeText(b.dataset.copiar); b.textContent = "✔️ Copiado"; } catch { /* */ }
  });
  document.querySelector(".pasos").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-p]"); if (!b) return;
    for (const x of document.querySelectorAll(".pasos button")) x.setAttribute("aria-selected", String(x === b));
    for (const p of document.querySelectorAll("section[role=tabpanel]")) p.hidden = p.id !== `p-${b.dataset.p}`;
    if (b.dataset.p === "clientes") pintarClientes();
    if (b.dataset.p === "cuentas" || b.dataset.p === "cortesias") pintarCuentas();
    if (b.dataset.p === "proyectos") pintarOrgsProyectos();
  });
}
