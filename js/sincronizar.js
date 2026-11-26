// Guarda en el servidor, por empresa, lo que se captura en DOMINUS OPS, la Caja del analista e Inteligencia corporativa
// (antes solo quedaba en este navegador). Debe cargarse antes que los módulos de la página.
// · Empresa: ?org=<id> (lo pone «Proyectos de principio a fin»), si no la empresa activa del flujo, si no «dominus-interno».
// · Al abrir: trae lo guardado en el servidor; si difiere de lo de este navegador, lo aplica y recarga una vez.
// · Al cambiar algo: lo envía al servidor (agrupado cada 1.5 s). Sin conexión o sin sesión, sigue funcionando local.
// Nunca envía llaves ni preferencias del navegador: solo las claves de esta lista (la misma que valida el servidor).
export const CLAVES = /^(gp_ops_[a-z_]{1,20}|gp_corp_instalaciones|gp_planes|gp_nube|gp_marcos|gp_carver|gp_actores|gp_ach|gp_herr_esc|gp_aud_[a-z0-9_]{1,40}|gp_norma_[A-Z]{3}|agencias)$/;
export const INTERNO = "dominus-interno";

/** ¿Es la copia para empresas cliente (empresa-ops.html, empresa-caja.html, empresa-corporativo.html)? */
export const modoEmpresa = (url = location) => /\/empresa-(ops|caja|corporativo)(\.html)?$/.test(url.pathname || "");

/** Dirección de la API de datos: la de Admin, o la de miembros de la empresa en las copias para clientes. */
export function apiDatos(org, url = location) {
  if (!modoEmpresa(url)) return `${API}${org}`;
  const base = url.hostname === "admin.dominusosint.com" ? "/cuenta/empresa/" : "https://admin.dominusosint.com/cuenta/empresa/";
  return `${base}${org}/datos`;
}

/** Empresa a la que pertenecen los datos de esta página. */
export function empresaDe(url = location, almacen = localStorage) {
  const q = new URLSearchParams(url.search).get("org");
  if (modoEmpresa(url)) return /^[0-9a-f]{16}$/.test(q || "") ? q : "";  // en las copias para clientes, solo la empresa indicada
  if (q && /^([0-9a-f]{16}|dominus-interno)$/.test(q)) return q;
  try { const o = almacen.getItem("dominus_flujo_org"); if (/^[0-9a-f]{16}$/.test(o || "")) return o; } catch { /* sin almacenamiento */ }
  return INTERNO;
}

/** Claves sincronizables presentes en un almacenamiento. */
export function locales(almacen) {
  const out = {};
  for (let i = 0; i < almacen.length; i++) { const k = almacen.key(i); if (CLAVES.test(k)) out[k] = almacen.getItem(k); }
  return out;
}

/** Diferencias entre lo local y lo del servidor: qué escribir aquí y qué subir. */
export function diferencias(local, servidor, primeraVez) {
  const aplicar = {}, subir = {};
  for (const [k, v] of Object.entries(servidor)) if (local[k] !== v) aplicar[k] = v;
  for (const [k, v] of Object.entries(local)) {
    if (k in servidor) continue;
    if (primeraVez) subir[k] = v;   // datos previos de este navegador: se suben
    else aplicar[k] = null;         // de otra empresa: se quitan de aquí para no mezclar
  }
  return { aplicar, subir };
}

const API = "/cuenta/empresa/admin/datos/";
const nativoSet = typeof Storage !== "undefined" ? Storage.prototype.setItem : null;
const nativoQuitar = typeof Storage !== "undefined" ? Storage.prototype.removeItem : null;
let activo = "", pendientes = {}, reloj = 0;

const aviso = (t) => {
  if (typeof document === "undefined") return;
  let a = document.querySelector(".sync-aviso");
  if (!a) {
    a = document.createElement("div"); a.className = "sync-aviso"; a.setAttribute("role", "status");
    a.style.cssText = "position:fixed;left:10px;bottom:10px;z-index:9999;font:12px system-ui,sans-serif;padding:4px 10px;border-radius:999px;border:1px solid #8885;background:var(--surface,#fff);color:var(--text,#111);opacity:.92";
    (document.body || document.documentElement).append(a);
  }
  a.textContent = t;
};

async function enviar(org, cambios) {
  const r = await fetch(apiDatos(org), { method: "POST", credentials: "include", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ cambios }) });
  if (!r.ok) throw new Error(String(r.status));
}

function programar(k, v) {
  pendientes[k] = v;
  clearTimeout(reloj);
  reloj = setTimeout(async () => {
    if (!activo || !Object.keys(pendientes).length) return;
    const lote = pendientes; pendientes = {};
    try { await enviar(activo, lote); aviso(`☁️ Guardado en el servidor ${new Date().toLocaleTimeString("es-MX")}`); }
    catch { pendientes = { ...lote, ...pendientes }; aviso("⚠️ No se pudo guardar en el servidor; queda en este navegador"); }
  }, 1500);
}

/** En las copias para clientes, sin acceso válido no se muestra la herramienta. */
function bloquear(texto) {
  const pintar = () => { document.body.innerHTML = `<main style="max-width:640px;margin:12vh auto;padding:0 16px;font:16px/1.5 system-ui,sans-serif"><h1>🔒 Herramienta de Mi empresa</h1><p>${texto}</p><p><a href="empresa.html">Ir a Mi empresa</a></p></main>`; };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", pintar); else pintar();
}

async function iniciar() {
  const org = empresaDe();
  const cliente = modoEmpresa();
  if (cliente && (!org || new URLSearchParams(location.search).get("embebido") !== "1")) {
    bloquear("Abre esta herramienta desde Mi empresa → 🧭 Flujo de trabajo, con la empresa elegida."); return;
  }
  let ns = null; try { ns = localStorage.getItem("dominus_sync_ns"); } catch { /* */ }
  let servidor;
  try {
    const r = await fetch(apiDatos(org), { credentials: "include", cache: "no-store" });
    if (cliente && [401, 403, 404].includes(r.status)) { bloquear("Inicia sesión en Mi empresa con una cuenta que pertenezca a esta empresa."); return; }
    if (!r.ok) throw new Error(String(r.status));
    servidor = (await r.json()).datos || {};
  } catch { aviso("💾 Solo en este navegador (sin conexión al servidor)"); return; }
  const local = locales(localStorage);
  // Lo que ya había en este navegador se sube si es la primera vez (DOMINUS interno) o si el servidor aún no tiene nada de esta empresa.
  const subirLocal = (ns === null && org === INTERNO) || (ns === org && !Object.keys(servidor).length);
  const { aplicar, subir } = diferencias(local, servidor, subirLocal);
  if (Object.keys(subir).length) await enviar(org, subir).catch(() => {});
  nativoSet.call(localStorage, "dominus_sync_ns", org);
  const marca = `dominus_sync_recarga_${org}`;
  if (Object.keys(aplicar).length && sessionStorage.getItem(marca) !== "1") {
    for (const [k, v] of Object.entries(aplicar)) (v === null ? nativoQuitar.call(localStorage, k) : nativoSet.call(localStorage, k, v));
    sessionStorage.setItem(marca, "1");
    location.reload();
    return;
  }
  sessionStorage.removeItem(marca);
  activo = org;
  aviso(`☁️ Guardado en el servidor · ${org === INTERNO ? "DOMINUS (interno)" : cliente ? "tu empresa" : "empresa del proyecto"}`);
  if (Object.keys(pendientes).length) programar(Object.keys(pendientes)[0], pendientes[Object.keys(pendientes)[0]]);
}

if (typeof window !== "undefined" && typeof localStorage !== "undefined" && nativoSet) {
  // Intercepta las escrituras de la página (sus módulos se ejecutan después de este).
  Storage.prototype.setItem = function (k, v) { nativoSet.call(this, k, v); if (this === window.localStorage && CLAVES.test(k)) programar(k, String(v)); };
  Storage.prototype.removeItem = function (k) { nativoQuitar.call(this, k); if (this === window.localStorage && CLAVES.test(k)) programar(k, null); };
  window.addEventListener("pagehide", () => {
    if (activo && Object.keys(pendientes).length) navigator.sendBeacon?.(apiDatos(activo), new Blob([JSON.stringify({ cambios: pendientes })], { type: "text/plain" }));
  });
  iniciar();
}
