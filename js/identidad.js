import { validarCurp, filtrar, progreso, proximaRevision, RUTA, REVISIONES, PREVENCION, PLANTILLAS, bitacora } from "./identidad-logica.js";

const $ = (id) => document.getElementById(id);
const CLAVE = "gp_identidad_v1", CLAVE_CURP = "gp_identidad_curp";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hoy = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

function leer() { try { return JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch (e) { return {}; } }
let S = Object.assign({ estados: {}, ruta: {}, prev: {}, rev: {}, inicio: "" }, leer());
function guardar() { try { localStorage.setItem(CLAVE, JSON.stringify(S)); } catch (e) { /* sin almacenamiento: funciona igual en esta visita */ } }

// Pestañas
const tabs = [...document.querySelectorAll(".pestanas button")];
function abrir(p) {
  tabs.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.p === p)));
  document.querySelectorAll(".vista").forEach((s) => { s.hidden = s.id !== `p-${p}`; });
  if (p === "ruta") pintarRuta();
}
tabs.forEach((b) => b.addEventListener("click", () => { abrir(b.dataset.p); history.replaceState(null, "", `#${b.dataset.p}`); }));

// CURP (solo en memoria salvo que se pida recordarla)
const curp = $("i-curp");
try { const c = localStorage.getItem(CLAVE_CURP); if (c) { curp.value = c; $("i-recordar").checked = true; } } catch (e) {}
function revisarCurp() {
  const v = validarCurp(curp.value), r = $("i-curp-res");
  if (!curp.value) { r.textContent = ""; r.className = "meta"; return v; }
  r.textContent = v.ok ? "✓ El formato y el dígito verificador son correctos." : `⚠️ ${v.motivo}`;
  r.className = v.ok ? "ok" : "aviso";
  return v;
}
function recordarCurp() {
  try { if ($("i-recordar").checked && curp.value) localStorage.setItem(CLAVE_CURP, curp.value.toUpperCase().trim()); else localStorage.removeItem(CLAVE_CURP); } catch (e) {}
}
curp.addEventListener("input", () => { revisarCurp(); recordarCurp(); if (!$("t-curp").value || $("t-curp").dataset.auto) { $("t-curp").value = curp.value.toUpperCase(); $("t-curp").dataset.auto = "1"; } });
$("i-recordar").addEventListener("change", recordarCurp);
async function copiarCurp(silencio) {
  const v = curp.value.toUpperCase().trim();
  if (!v) { if (!silencio) { $("i-curp-res").textContent = "Escribe primero tu CURP."; $("i-curp-res").className = "aviso"; } return false; }
  try { await navigator.clipboard.writeText(v); if (!silencio) { $("i-curp-res").textContent = "📋 CURP copiada. Pégala en la página de la compañía."; $("i-curp-res").className = "ok"; } return true; } catch (e) { return false; }
}
$("i-copiar").addEventListener("click", () => copiarCurp(false));
revisarCurp();

// Lista de plataformas
let PLAT = [];
const ETIQ = { sin: "✅ Sin líneas a mi nombre", mia: "📱 Solo líneas mías", ajena: "🚨 Hay una que no reconozco" };
const DESTACADAS = ["CFE", "Netwey", "Bnext", "Inxel/Internet para el Bienestar", "Mi móvil/Altán", "OUI/Altán"];
function nombre(p) {
  if (p.grupo) { const d = DESTACADAS.filter((m) => p.marcas.includes(m)).slice(0, 3); return `${p.grupo}: ${p.marcas.length} marcas${d.length ? ` (entre ellas ${d.join(", ")})` : ""}`; }
  return p.marcas.length === 1 ? p.marcas[0] : `${p.marcas.slice(0, 3).join(", ")}${p.marcas.length > 3 ? ` y ${p.marcas.length - 3} más` : ""}`; }
function pintarLista() {
  const q = $("i-buscar").value, solo = $("i-pendientes").checked;
  const lista = filtrar(PLAT, q).filter((p) => !solo || !S.estados[p.id]?.e);
  $("i-lista").innerHTML = lista.length ? lista.map((p) => {
    const s = S.estados[p.id] || {};
    const host = p.url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
    const cuenta = /login|micuenta|facturacion/.test(p.url) ? " · <span class=\"meta\">entra con tu cuenta de cliente</span>" : "";
    return `<div class="plat" data-id="${esc(p.id)}" data-e="${esc(s.e || "")}">
      <div class="marcas">${esc(nombre(p))}${p.principal ? '<span class="principal">empieza aquí</span>' : ""}
        ${p.marcas.length > 3 ? `<details><summary>Ver las ${p.marcas.length} marcas que se consultan en esta página</summary>${esc(p.marcas.join(", "))}</details>` : ""}
        <div class="meta">${esc(host)}${cuenta}${s.fecha ? ` · revisada el ${esc(s.fecha)}` : ""}</div></div>
      <a class="btn prim" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" data-abrir>Abrir consulta ↗</a>
      <div class="opciones" role="radiogroup" aria-label="Resultado de ${esc(nombre(p))}">
        ${Object.entries(ETIQ).map(([k, t]) => `<label><input type="radio" name="e-${esc(p.id)}" value="${k}" ${s.e === k ? "checked" : ""}> ${t}</label>`).join("")}
        ${s.e ? '<button type="button" class="btn" data-quitar>Desmarcar</button>' : ""}
      </div>
      <div class="extra" ${s.e === "ajena" ? "" : "hidden"}>
        <input data-campo="linea" placeholder="Número o terminación" value="${esc(s.linea || "")}" aria-label="Número o terminación de la línea">
        <input data-campo="folio" placeholder="Folio de la baja" value="${esc(s.folio || "")}" aria-label="Folio de la baja">
        <input data-campo="nota" placeholder="Nota" value="${esc(s.nota || "")}" aria-label="Nota" style="min-width:200px">
        <button type="button" class="btn" data-ruta>🚨 Ver qué hacer</button>
      </div></div>`;
  }).join("") : '<p class="meta">No hay páginas que coincidan.</p>';
  pintarAvance();
}
function pintarAvance() {
  const p = progreso(PLAT, S.estados);
  $("i-barra").style.width = `${p.pct}%`;
  $("i-avance").innerHTML = `<b>${p.revisadas} de ${p.total}</b> páginas revisadas (cubren ${p.marcas} de ${p.totalMarcas} marcas).` +
    (p.ajenas.length ? ` <span class="aviso" style="display:inline-block">🚨 ${p.ajenas.length} con líneas que no reconoces: <a href="#ruta" data-ir-ruta>ver qué hacer</a></span>` : "") +
    (p.revisadas === p.total && p.total ? " 🎉 Revisión completa." : "");
  const ult = Object.values(S.estados).map((s) => s.fecha).filter(Boolean).sort().pop();
  $("i-proxima").textContent = ult ? `Última consulta: ${ult}. Te sugerimos repetir la revisión a partir del ${proximaRevision(ult, 3)}.` : "";
}
$("i-lista").addEventListener("change", (ev) => {
  const fila = ev.target.closest(".plat"); if (!fila) return;
  const id = fila.dataset.id; S.estados[id] = S.estados[id] || {};
  if (ev.target.type === "radio") { S.estados[id].e = ev.target.value; S.estados[id].fecha = hoy(); guardar(); pintarLista(); return; }
  if (ev.target.dataset.campo) { S.estados[id][ev.target.dataset.campo] = ev.target.value.trim(); guardar(); }
});
$("i-lista").addEventListener("click", (ev) => {
  const fila = ev.target.closest(".plat"); if (!fila) return;
  if (ev.target.closest("[data-abrir]")) copiarCurp(true);
  if (ev.target.closest("[data-quitar]")) { delete S.estados[fila.dataset.id]; guardar(); pintarLista(); }
  if (ev.target.closest("[data-ruta]")) { abrir("ruta"); history.replaceState(null, "", "#ruta"); }
});
$("i-avance").addEventListener("click", (ev) => { if (ev.target.closest("[data-ir-ruta]")) { ev.preventDefault(); abrir("ruta"); } });
$("i-buscar").addEventListener("input", pintarLista);
$("i-pendientes").addEventListener("change", pintarLista);
$("i-bitacora").addEventListener("click", () => descargar(`revision-lineas-${hoy()}.txt`, bitacora(PLAT, S.estados, hoy()), "text/plain"));
$("i-reiniciar").addEventListener("click", () => {
  if (!confirm("¿Borrar las marcas de esta revisión para empezar otra? Descarga antes la bitácora si quieres conservarla.")) return;
  S.estados = {}; guardar(); pintarLista();
});

// Ruta de acción
function pintarRuta() {
  const aj = progreso(PLAT, S.estados).ajenas;
  $("r-ajenas").innerHTML = aj.length ? `<p class="aviso">Marcaste ${aj.length === 1 ? "una página" : `${aj.length} páginas`} con líneas que no reconoces: ${aj.map((p) => `<b>${esc(nombre(p))}</b>${S.estados[p.id].linea ? ` (${esc(S.estados[p.id].linea)})` : ""}`).join(", ")}. Los escritos de abajo ya traen la primera.</p>` : "";
  if (aj[0]) {
    const s = S.estados[aj[0].id];
    if (!$("t-compania").value) $("t-compania").value = aj[0].marcas.length > 3 ? "" : aj[0].marcas[0];
    if (!$("t-linea").value && s.linea) $("t-linea").value = s.linea;
    if (!$("t-folio").value && s.folio) $("t-folio").value = s.folio;
    escrito();
  }
}
$("r-pasos").innerHTML = RUTA.map((r) => `<li data-id="${r.id}" class="${S.ruta[r.id] ? "hecho" : ""}"><label><input type="checkbox" ${S.ruta[r.id] ? "checked" : ""}> ${esc(r.t)}</label><p>${esc(r.d)}</p></li>`).join("");
$("r-pasos").addEventListener("change", (ev) => { const li = ev.target.closest("li"); S.ruta[li.dataset.id] = ev.target.checked; li.classList.toggle("hecho", ev.target.checked); guardar(); });

// Escritos
let tipo = "compania";
$("t-fecha").value = hoy();
$("t-tipos").innerHTML = Object.entries(PLANTILLAS).map(([k, p]) => `<button type="button" data-t="${k}" aria-pressed="${k === tipo}">${esc(p.t)}</button>`).join("");
$("t-tipos").addEventListener("click", (ev) => { const b = ev.target.closest("[data-t]"); if (!b) return; tipo = b.dataset.t; $("t-tipos").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); escrito(); });
const CAMPOS = ["nombre", "curp", "correo", "telefono", "compania", "linea", "folio", "ciudad", "fecha", "detalle"];
function escrito() {
  const d = Object.fromEntries(CAMPOS.map((c) => [c, $(`t-${c}`).value.trim()]));
  d.curp = d.curp.toUpperCase();
  $("t-texto").value = PLANTILLAS[tipo].f(d);
}
CAMPOS.forEach((c) => $(`t-${c}`).addEventListener("input", (ev) => { if (c === "curp") delete ev.target.dataset.auto; escrito(); }));
$("t-copiar").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("t-texto").value); $("t-copiar").textContent = "✓ Copiado"; setTimeout(() => { $("t-copiar").textContent = "📋 Copiar texto"; }, 1500); } catch (e) { $("t-texto").select(); } });
$("t-word").addEventListener("click", () => {
  const html = `<html><head><meta charset="utf-8"></head><body style="font-family:Calibri,Arial;font-size:12pt">${esc($("t-texto").value).replace(/\n/g, "<br>")}</body></html>`;
  descargar(`${tipo}-${hoy()}.doc`, html, "application/msword");
});

// Otras revisiones
$("o-lista").innerHTML = REVISIONES.map((r) => `<li data-id="${r.id}" class="${S.rev[r.id] ? "hecho" : ""}"><label><input type="checkbox" ${S.rev[r.id] ? "checked" : ""}> <a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.t)} ↗</a></label><p>${esc(r.d)}</p><p class="meta" data-fecha>${S.rev[r.id] ? `Revisado el ${esc(S.rev[r.id])} · repetir a partir del ${proximaRevision(S.rev[r.id], 6)}` : ""}</p></li>`).join("");
$("o-lista").addEventListener("change", (ev) => {
  const li = ev.target.closest("li"), id = li.dataset.id;
  if (ev.target.checked) S.rev[id] = hoy(); else delete S.rev[id];
  li.classList.toggle("hecho", ev.target.checked);
  li.querySelector("[data-fecha]").textContent = S.rev[id] ? `Revisado el ${S.rev[id]} · repetir a partir del ${proximaRevision(S.rev[id], 6)}` : "";
  guardar();
});

// Prevención
function avancePrev() { const n = PREVENCION.filter((p) => S.prev[p.id]).length; $("v-avance").textContent = `Aplicas ${n} de ${PREVENCION.length} medidas.`; }
$("v-lista").innerHTML = PREVENCION.map((p) => `<li data-id="${p.id}" class="${S.prev[p.id] ? "hecho" : ""}"><label><input type="checkbox" ${S.prev[p.id] ? "checked" : ""}> ${esc(p.t)}</label><p>${esc(p.d)}</p></li>`).join("");
$("v-lista").addEventListener("change", (ev) => { const li = ev.target.closest("li"); S.prev[li.dataset.id] = ev.target.checked; li.classList.toggle("hecho", ev.target.checked); guardar(); avancePrev(); });
avancePrev();

function descargar(nombreArchivo, contenido, tipoMime) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([contenido], { type: `${tipoMime};charset=utf-8` }));
  a.download = nombreArchivo; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

// Carga de la lista oficial
fetch("config/lineas_mx.json").then((r) => r.json()).then((j) => {
  PLAT = j.plataformas || [];
  $("i-fuente").innerHTML = `Lista oficial de la CRT (<a href="${esc(j.fuente)}" target="_blank" rel="noopener noreferrer">ver original</a>, consultada el ${esc(j.consultado)}): ${PLAT.reduce((s, p) => s + p.marcas.length, 0)} marcas en ${PLAT.length} páginas de consulta. Empieza por las marcadas «empieza aquí»: Telcel, AT&amp;T, Movistar, la red Altán (una sola página para 89 marcas), Bait y Virgin.`;
  $("t-companias").innerHTML = PLAT.flatMap((p) => p.marcas).map((m) => `<option value="${esc(m)}">`).join("");
  pintarLista(); escrito();
  const h = location.hash.slice(1); if (["lineas", "ruta", "otras", "prevencion"].includes(h)) abrir(h);
}).catch(() => { $("i-lista").innerHTML = '<p class="aviso">No se pudo cargar la lista. Consulta la lista oficial en <a href="https://portal.crt.gob.mx/plataformas-de-consulta-de-las-companias-telefonicas" target="_blank" rel="noopener noreferrer">portal.crt.gob.mx</a>.</p>'; });
