// Bitácora local para soporte: guarda en este navegador (localStorage, máx. 100 entradas, 14 días) los errores de la
// página y los datos que no cargaron. No se envía a ningún servidor: la persona la ve en soporte.html y decide si
// copia el informe. No guarda búsquedas, coordenadas, ubicación ni parámetros de URL (solo la ruta del archivo).
const CLAVE = "dominus_bitacora";
const MAX = 100, DIAS = 14;

/** Ruta sin parámetros ni «#» (la consulta puede llevar coordenadas o búsquedas). Fuera del sitio, solo el dominio. */
export function rutaSegura(url, origen = globalThis.location?.origin || "") {
  try {
    const u = new URL(String(url), origen || "https://x.invalid");
    return u.origin === origen || !origen ? u.pathname : u.host;
  } catch { return String(url || "").split(/[?#]/)[0].slice(0, 120); }
}

export function leerBitacora(store = globalThis.localStorage) {
  try { return JSON.parse(store?.getItem(CLAVE) || "[]"); } catch { return []; }
}

/** Agrega una entrada; descarta las de más de 14 días y repetidas seguidas (cuenta «veces»). */
export function registrar(tipo, mensaje, store = globalThis.localStorage, ahora = new Date()) {
  const lista = leerBitacora(store).filter((e) => ahora - new Date(e.t) < DIAS * 864e5);
  const pagina = rutaSegura(globalThis.location?.href || "").split("/").pop() || "index.html";
  const msg = String(mensaje || "").replace(/\s+/g, " ").slice(0, 300);
  const ult = lista[lista.length - 1];
  if (ult && ult.tipo === tipo && ult.msg === msg && ult.pagina === pagina) { ult.veces = (ult.veces || 1) + 1; ult.t = ahora.toISOString(); }
  else lista.push({ t: ahora.toISOString(), pagina, tipo, msg });
  try { store?.setItem(CLAVE, JSON.stringify(lista.slice(-MAX))); } catch { /* almacenamiento lleno o bloqueado */ }
}

export function borrarBitacora(store = globalThis.localStorage) { try { store?.removeItem(CLAVE); } catch { /* nada */ } }

/** Texto del informe para soporte: datos técnicos del equipo y las entradas. */
export function informe(entradas, entorno = {}) {
  const e = { fecha: new Date().toISOString(), navegador: globalThis.navigator?.userAgent || "", pantalla: globalThis.screen ? `${screen.width}×${screen.height}` : "",
    idioma: globalThis.navigator?.language || "", enLinea: globalThis.navigator?.onLine, ...entorno };
  const cab = [`Informe de soporte DOMINUS OSINT`, `Fecha (UTC): ${e.fecha}`, `Vista: ${e.vista || "completa"}${e.plan ? ` · plan ${e.plan}` : ""}`,
    `Navegador: ${e.navegador}`, `Pantalla: ${e.pantalla} · idioma ${e.idioma} · ${e.enLinea === false ? "sin conexión" : "con conexión"}`, `Entradas: ${entradas.length}`, ""];
  return cab.concat(entradas.map((x) => `${x.t.slice(0, 19).replace("T", " ")} · ${x.pagina} · ${x.tipo}${x.veces > 1 ? ` (×${x.veces})` : ""} · ${x.msg}`)).join("\n");
}

/** Lee un informe pegado (de una persona usuaria) y lo convierte en filas para la tabla de soporte. */
export function leerInforme(texto) {
  const lineas = String(texto || "").split(/\r?\n/);
  const cab = {}, filas = [];
  for (const l of lineas) {
    const m = l.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) · ([^·]+) · ([^·]+?) · (.*)$/);
    if (m) filas.push({ t: m[1], pagina: m[2].trim(), tipo: m[3].trim(), msg: m[4] });
    else { const k = l.match(/^([^:]{2,30}):\s*(.*)$/); if (k) cab[k[1].trim()] = k[2]; }
  }
  return { cab, filas };
}

function instalar() {
  if (globalThis.__bitacora) return;
  globalThis.__bitacora = true;
  addEventListener("error", (ev) => {
    if (ev.target && ev.target !== window && (ev.target.src || ev.target.href)) registrar("recurso", `No cargó ${rutaSegura(ev.target.src || ev.target.href)}`);
    else registrar("error", `${ev.message || "Error"}${ev.filename ? ` (${rutaSegura(ev.filename).split("/").pop()}:${ev.lineno})` : ""}`);
  }, true);
  addEventListener("unhandledrejection", (ev) => registrar("error", `Promesa rechazada: ${ev.reason?.message || ev.reason || ""}`));
  // Datos del propio sitio que respondieron con error o no llegaron (no se registran servicios externos uno por uno).
  const orig = globalThis.fetch?.bind(globalThis);
  if (!orig) return;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    const propio = !/^[a-z]+:/i.test(url) || url.startsWith(location.origin);
    try {
      const r = await orig(input, init);
      if (propio && !r.ok && r.status !== 304) registrar("datos", `HTTP ${r.status} en ${rutaSegura(url)}`);
      return r;
    } catch (e) {
      if (e?.name !== "AbortError") registrar("red", `${propio ? "Sin respuesta de" : "Falló servicio externo"} ${rutaSegura(url)}`);
      throw e;
    }
  };
}

if (typeof window !== "undefined" && typeof document !== "undefined") instalar();
