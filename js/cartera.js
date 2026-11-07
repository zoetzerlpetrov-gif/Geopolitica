// Página «Cartera de proyectos» (cartera.html): conexión al Supabase del dueño, acceso por código, lista de planes,
// vista ejecutiva para directivos que se refresca sola, actualización y permisos por correo.
import { conectarCartera, enlaceDirectivo, leerEnlace, cloudConfig } from "./cartera-nube.js";
import { vistaEjecutiva, filaCartera, porSector, corteDe, planParaNube } from "./cartera-logica.js";
import { htmlTarjeta, htmlSectores, htmlEjecutivo, CSS_CARTERA } from "./cartera-vista.js";
import { importarArchivo, resumenPlan, cambiosQueTocan } from "./plan-importar.js";
import { widgetsPlan, leerPlanes, CSS_PLAN } from "./plan-tablero.js";
import { CSS_TABLEROS } from "./tableros-logica.js";
import { conNotas } from "./herr-logica.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const CFG = "gp_cartera_cfg", REFRESCO_MS = 60000;
const st = document.createElement("style"); st.textContent = CSS_TABLEROS + CSS_PLAN + CSS_CARTERA; document.head.appendChild(st);

let nube = null, yo = null, cfg = null, registros = [], versiones = {}, actual = null, archivoNuevo = null, ocupado = false;
const leerCfg = () => { try { return JSON.parse(localStorage.getItem(CFG)) || null; } catch (e) { return null; } };
const estado = (t, error = false) => { $("c-estado").textContent = t; $("c-estado").dataset.error = String(error); };
async function correr(fn) {
  if (ocupado) return;
  ocupado = true;
  try { await fn(); } catch (e) { estado(e.message, true); } finally { ocupado = false; }
}

// Bitácora normativa pública del sitio (para «cambios que tocan el plan»).
const bitacora = Promise.all([fetch("data/normativa/bitacora.json").then((r) => (r.ok ? r.json() : { entradas: [] })).catch(() => ({ entradas: [] })),
  fetch("config/normativa/bitacora_notas.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}))]).then(([b, n]) => conNotas(b.entradas || [], n));

function mostrar(fase) {
  $("c-conexion").hidden = fase !== "conectar";
  $("c-acceso").hidden = fase !== "acceso";
  $("c-sesion").hidden = fase !== "sesion";
  $("c-cartera").hidden = fase !== "sesion" || !!actual;
  $("c-detalle").hidden = fase !== "sesion" || !actual;
}

async function conectar(url, key) {
  cfg = cloudConfig(url, key);
  nube = await conectarCartera(cfg.url, cfg.key);
  try { localStorage.setItem(CFG, JSON.stringify(cfg)); } catch (e) { /* modo privado */ }
  yo = await nube.usuario();
  if (yo) { await entrar(); return; }
  mostrar("acceso"); estado("Proyecto conectado. Entra con tu correo.");
}

async function entrar() {
  $("c-usuario").textContent = `Sesión: ${yo.email}`;
  mostrar("sesion");
  await cargarLista();
  const { plan } = leerEnlace(location.hash);
  if (plan && registros.some((r) => r.id === plan)) await abrir(plan);
}

async function cargarLista() {
  registros = await nube.todos();
  versiones = Object.fromEntries(registros.map((r) => [r.id, r.version]));
  pintarLista();
  estado(`${registros.length} plan(es) visibles con tu acceso · actualizado ${new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })} · se revisa cada minuto`);
}

function opciones(sel, valores, todos) {
  const v = sel.value;
  sel.innerHTML = `<option value="">${todos}</option>` + valores.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join("");
  if (valores.includes(v)) sel.value = v;
}

function pintarLista() {
  const filas = registros.map((r) => filaCartera(r));
  opciones($("c-f-empresa"), [...new Set(filas.map((f) => f.empresa))].sort((a, b) => a.localeCompare(b, "es")), "Todas las empresas");
  opciones($("c-f-sector"), [...new Set(filas.map((f) => f.sector).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")), "Todos los sectores");
  const fe = $("c-f-empresa").value, fs = $("c-f-sector").value, fx = $("c-f-estado").value;
  const vis = filas.filter((f) => (!fe || f.empresa === fe) && (!fs || f.sector === fs) && (!fx || f.estado.color === fx));
  const orden = { rojo: 0, amarillo: 1, verde: 2 };
  vis.sort((a, b) => orden[a.estado.color] - orden[b.estado.color] || a.empresa.localeCompare(b.empresa, "es"));
  $("c-sectores").innerHTML = htmlSectores(porSector(vis));
  $("c-lista").innerHTML = vis.map(htmlTarjeta).join("") || `<p class="meta">${registros.length ? "Ningún plan con estos filtros." : "Aún no hay planes. Agrega uno abajo, o pide al dueño que te comparta el suyo."}</p>`;
  const locales = leerPlanes().planes;
  $("c-local").innerHTML = `<option value="">Planes de este navegador…</option>` + locales.map((p) => `<option value="${esc(p.id)}">${esc(p.titulo)}</option>`).join("");
}

async function abrir(id) {
  const reg = await nube.obtener(id);
  const cortes = await nube.cortes(id).catch(() => []);
  const rol = reg.owner === yo.id ? "dueno" : (await nube.miembros(id).catch(() => [])).find((m) => m.correo === String(yo.email).toLowerCase())?.rol || "lector";
  actual = { ...reg, rol };
  versiones[id] = reg.version;
  const cambios = cambiosQueTocan(reg.datos, await bitacora);
  const v = vistaEjecutiva(reg.datos, { lineaBase: reg.linea_base, cortes, cambios });
  $("c-titulo").textContent = `${reg.titulo}`;
  $("c-ejecutivo").innerHTML = htmlEjecutivo(v, reg);
  $("c-tablero").innerHTML = widgetsPlan(reg.datos, resumenPlan(reg.datos), { cambios });
  $("c-admin").hidden = rol === "lector";
  $("c-dueno").hidden = rol !== "dueno";
  $("c-rol").textContent = `(tu rol: ${rol === "dueno" ? "dueño" : rol})`;
  if (rol === "dueno") await pintarMiembros();
  try { history.replaceState(null, "", enlaceDirectivo(location.href, cfg, id)); } catch (e) { /* nada */ }
  mostrar("sesion");
  window.scrollTo({ top: 0 });
}

async function pintarMiembros() {
  const ms = await nube.miembros(actual.id);
  $("c-miembros").innerHTML = ms.length ? `<table class="t"><tr><th>Correo</th><th>Rol</th><th></th></tr>${ms.map((m) => `<tr><td>${esc(m.correo)}</td><td>${esc(m.rol)}</td><td><button type="button" data-quitar="${esc(m.correo)}">Quitar</button></td></tr>`).join("")}</table>`
    : `<p class="meta">Aún no lo compartes con nadie.</p>`;
}

async function revisarCambios() {
  if (!nube || !yo || document.hidden || ocupado) return;
  try {
    const vs = await nube.versiones();
    const cambio = vs.length !== Object.keys(versiones).length || vs.some((x) => versiones[x.id] !== x.version);
    if (!cambio) return;
    const abierto = actual?.id;
    await cargarLista();
    if (abierto && registros.some((r) => r.id === abierto)) await abrir(abierto);
    else if (abierto) { actual = null; mostrar("sesion"); }
  } catch (e) { estado(`No se pudo revisar si hay cambios: ${e.message}`, true); }
}

async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); estado("Enlace copiado. Quien lo abra debe entrar con un correo autorizado."); }
  catch (e) { prompt("Copia el enlace:", texto); }
}

// ------------------------------------------------------------------ eventos
$("c-conectar").onclick = () => correr(() => conectar($("c-url").value.trim(), $("c-key").value.trim()));
$("c-pedir").onclick = () => correr(async () => { await nube.pedirCodigo($("c-correo").value); estado("Código enviado. Revisa tu correo (y la carpeta de spam)."); });
$("c-verificar").onclick = () => correr(async () => { yo = await nube.verificar($("c-correo").value, $("c-codigo").value.trim()); $("c-codigo").value = ""; await entrar(); });
$("c-salir").onclick = () => correr(async () => { await nube.salir(); yo = null; actual = null; mostrar("acceso"); estado("Sesión cerrada en este navegador."); });
for (const id of ["c-f-empresa", "c-f-sector", "c-f-estado"]) $(id).onchange = pintarLista;
$("c-lista").addEventListener("click", (e) => { const b = e.target.closest("[data-plan]"); if (b) correr(() => abrir(b.dataset.plan)); });
$("c-volver").onclick = () => { actual = null; try { history.replaceState(null, "", enlaceDirectivo(location.href, cfg)); } catch (e) { /* nada */ } mostrar("sesion"); };
$("c-imprimir").onclick = () => { for (const d of document.querySelectorAll("#c-detalle details")) d.open = d.id !== "c-admin"; window.print(); };
$("c-imprimir-cartera").onclick = () => window.print();
$("c-enlace").onclick = () => copiar(enlaceDirectivo(location.href, cfg, actual.id));
$("c-enlace-cartera").onclick = () => copiar(enlaceDirectivo(location.href, cfg));
$("c-archivo-nuevo").onchange = (e) => { archivoNuevo = e.target.files?.[0] || null; if (archivoNuevo) estado(`Archivo listo: ${archivoNuevo.name}. Escribe la empresa y pulsa «Subir a la cartera».`); };
$("c-subir").onclick = () => correr(async () => {
  let plan = null;
  if (archivoNuevo) plan = await importarArchivo(archivoNuevo.name, new Uint8Array(await archivoNuevo.arrayBuffer()));
  else if ($("c-local").value) plan = leerPlanes().planes.find((p) => p.id === $("c-local").value);
  if (!plan) throw new Error("Elige un plan de este navegador o un archivo.");
  const reg = await nube.subir({ empresa: $("c-empresa").value, sector: $("c-sector").value || plan.sector || "", titulo: plan.titulo, paises: plan.paises || [], datos: planParaNube(plan) });
  await nube.guardarCorte(reg.id, corteDe(plan));
  archivoNuevo = null; $("c-archivo-nuevo").value = ""; $("c-subir-caja").open = false;
  await cargarLista(); await abrir(reg.id);
  estado("Plan subido. Ábrelo en «Actualizar y compartir» para compartirlo con tus directivos.");
});
$("c-archivo").onchange = (e) => correr(async () => {
  const f = e.target.files?.[0];
  e.target.value = "";
  if (!f) return;
  const plan = await importarArchivo(f.name, new Uint8Array(await f.arrayBuffer()));
  await nube.subir({ id: actual.id, empresa: actual.empresa, sector: actual.sector, titulo: actual.titulo, paises: plan.paises || actual.paises, datos: planParaNube(plan) });
  await nube.guardarCorte(actual.id, corteDe(plan));
  await cargarLista(); await abrir(actual.id);
  estado(`Plan actualizado con ${f.name}. Quien lo esté viendo lo verá en menos de un minuto.`);
});
$("c-corte").onclick = () => correr(async () => { await nube.guardarCorte(actual.id, corteDe(actual.datos)); await abrir(actual.id); estado("Corte guardado."); });
$("c-base").onclick = () => correr(async () => {
  const fin = resumenPlan(actual.datos).finEstimado;
  if (!fin || !confirm(`¿Fijar la línea base en ${fin}? Desde hoy los retrasos se medirán contra esa fecha.`)) return;
  await nube.fijarLineaBase(actual.id, fin); await cargarLista(); await abrir(actual.id); estado(`Línea base fijada: ${fin}.`);
});
$("c-m-agregar").onclick = () => correr(async () => { await nube.compartir(actual.id, $("c-m-correo").value, $("c-m-rol").value); $("c-m-correo").value = ""; await pintarMiembros(); estado("Compartido. Recuerda que ese correo debe existir en Authentication → Users de tu proyecto."); });
$("c-miembros").addEventListener("click", (e) => {
  const b = e.target.closest("[data-quitar]");
  if (b && confirm(`¿Quitar el acceso de ${b.dataset.quitar}?`)) correr(async () => { await nube.quitar(actual.id, b.dataset.quitar); await pintarMiembros(); estado("Acceso retirado."); });
});
$("c-borrar").onclick = () => {
  if (!confirm(`¿Borrar «${actual.titulo}» de la nube? Se borran también sus cortes y permisos. Tu Excel no se toca.`)) return;
  correr(async () => { await nube.borrar(actual.id); actual = null; await cargarLista(); mostrar("sesion"); estado("Plan borrado de la nube."); });
};
const verSQL = async () => { const t = await (await fetch("config/cartera.sql", { cache: "no-store" })).text(); $("c-sql").textContent = t; $("c-sql").hidden = false; return t; };
$("c-ver-sql").onclick = () => correr(verSQL);
$("c-copiar-sql").onclick = () => correr(async () => { await navigator.clipboard.writeText(await verSQL()); estado("SQL copiado. Pégalo en SQL Editor de tu proyecto y pulsa Run."); });

setInterval(revisarCambios, REFRESCO_MS);
document.addEventListener("visibilitychange", () => { if (!document.hidden) revisarCambios(); });

// Inicio: enlace compartido (#u=…&k=…&p=…) o configuración guardada.
{
  const e = leerEnlace(location.hash), g = leerCfg();
  const url = e.url || g?.url || "", key = e.key || g?.key || "";
  $("c-url").value = url; $("c-key").value = key;
  if (url && key) correr(() => conectar(url, key)); else { mostrar("conectar"); estado("Conecta tu proyecto de Supabase para empezar (guía al final de la página)."); }
}
