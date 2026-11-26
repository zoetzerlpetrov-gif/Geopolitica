// Admin → Clientes y proyectos (clientes.html): alta de empresas, planes, cortesías y accesos. Habla con la API del
// Worker (/cuenta/empresa/admin/...) con la sesión de administración; todo queda en la base del servidor.
import * as C from "./cumplimiento-logica.js";
import { PAISES } from "./empresa.js";

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

async function pintarClientes() {
  try {
    const { orgs } = await api("orgs");
    $("cl-total").textContent = `${orgs.length} empresa(s).`;
    const hoy = Date.now() / 1000;
    $("cl-tabla").innerHTML = `<table class="t"><tr><th>Empresa</th><th>Plan</th><th>Usuarios</th><th>Vence</th><th>Renovar o ampliar <span class="meta">(plan · usuarios · días desde hoy)</span></th></tr>${orgs.map((o) => `<tr>
      <td><b>${esc(o.nombre)}</b><div class="meta">${esc(PAISES[o.pais] || o.pais)} · alta ${fecha(o.creada)}</div></td>
      <td>${esc(o.plan)}</td><td>${esc(o.miembros)} / ${esc(o.asientos)}</td>
      <td>${o.vence > hoy ? fecha(o.vence) : `<span class="error">venció ${fecha(o.vence)}</span>`}</td>
      <td><div class="renovar" data-org="${esc(o.id)}"><select data-c="plan" aria-label="Plan">${["prueba", "individual", "equipo", "medida"].map((p) => `<option ${p === o.plan ? "selected" : ""}>${p}</option>`).join("")}</select>
        <input data-c="asientos" type="number" min="1" max="500" value="${esc(o.asientos)}" aria-label="Usuarios"><input data-c="dias" type="number" min="1" max="400" value="30" aria-label="Días desde hoy">
        <button type="button" class="b" data-guardar>Guardar</button></div></td></tr>`).join("")}</table>
      <p class="meta">«Días» cuenta desde hoy (p. ej. 30 para un mes pagado).</p>`;
  } catch (e) { $("cl-tabla").innerHTML = `<p class="error">${esc(e.message)}</p>`; }
}

async function pintarCuentas() {
  try {
    const { cuentas, cortesias } = await api("cuentas");
    const hoy = Date.now() / 1000;
    $("cu-lista").innerHTML = `<table class="t"><tr><th>Correo</th><th>Estado</th><th>Alta</th><th>Último ingreso</th></tr>${cuentas.map((c) => `<tr><td>${esc(c.email)}${c.nombre ? `<div class="meta">${esc(c.nombre)}</div>` : ""}</td>
      <td>${c.bloqueo > hoy ? "🔒 bloqueada" : c.activa ? "✅ activa" : "⏳ pendiente de activar"}</td><td>${fecha(c.creada)}</td><td>${fecha(c.ultimo_ingreso)}</td></tr>`).join("") || '<tr><td colspan="4" class="meta">Sin cuentas todavía.</td></tr>'}</table>`;
    $("co-lista").innerHTML = `<h3>Cortesías dadas</h3><table class="t"><tr><th>Correo</th><th>Producto</th><th>Plan</th><th>Vence</th><th>Nota</th></tr>${cortesias.map((c) => `<tr><td>${esc(c.email)}</td><td>${esc(c.producto)}</td><td>${esc(c.plan)}</td>
      <td>${c.vence > hoy ? fecha(c.vence) : `<span class="error">venció ${fecha(c.vence)}</span>`}</td><td>${esc(c.nota)}</td></tr>`).join("") || '<tr><td colspan="5" class="meta">Ninguna.</td></tr>'}</table>`;
  } catch (e) { $("cu-lista").innerHTML = `<p class="error">${esc(e.message)}</p>`; }
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
  $("cl-tabla").addEventListener("click", async (e) => {
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
  });
}
