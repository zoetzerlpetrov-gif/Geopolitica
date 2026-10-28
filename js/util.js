// Utilidades sin dependencias.

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** Escapa texto de terceros antes de insertarlo como HTML. */
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

/** Solo permite enlaces http(s); cualquier otro esquema (javascript:, data:) se descarta. */
export const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "#");

/**
 * Imagen que el propio medio publica para compartir su nota (RSS o GDELT «SharingImage»). Se muestra desde el
 * servidor del medio, sin copiarla, con su crédito y enlace; si no carga, el recuadro desaparece (ver app.js).
 */
export function htmlImagenMedio(src, fuente, url) {
  if (!/^https:\/\//i.test(src || "")) return "";
  return `<figure class="img-medio"><a href="${esc(safeUrl(url || src))}" target="_blank" rel="noopener noreferrer"><img src="${esc(src)}" alt="Imagen de la nota"
      loading="lazy" decoding="async" referrerpolicy="no-referrer" data-quitar-si-falla></a>
    <figcaption>Imagen: ${esc(fuente || "medio de la nota")} (se muestra desde su sitio).</figcaption></figure>`;
}

export async function getJSON(url, { bust = false } = {}) {
  // Datos de arranque que index.html ya pidió en paralelo con MapLibre: se usan una sola vez.
  const pre = globalThis.__pre?.[url];
  if (pre) { delete globalThis.__pre[url]; return pre; }
  // El parámetro anticaché se agrega con «&» si la URL ya trae parámetros (p. ej. la API de NWS).
  const r = await fetch(bust ? `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}` : url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

const fmtFecha = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" });
const fmtFechaHora = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });
const fmtHora = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" });
export const fecha = (iso) => fmtFecha.format(new Date(iso));
export const fechaHora = (iso) => fmtFechaHora.format(new Date(iso));
export const hora = (d) => fmtHora.format(d);

export function hace(iso, now = Date.now()) {
  const min = Math.round((now - new Date(iso).getTime()) / 60000);
  if (min < 1) return "hace menos de 1 min";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `hace ${h} h ${min % 60} min`;
  return `hace ${Math.floor(h / 24)} días`;
}

export const mmss = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export const storage = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* modo privado: se ignora */ } },
};

/** Distancia en km entre dos puntos (fórmula del haversine). */
export function distanciaKm(lat1, lon1, lat2, lon2) {
  const r = (g) => (g * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

/** ¿El mapa está en tema oscuro? (data-theme manda; si no, la preferencia del sistema). */
export function temaOscuro() {
  const t = document.documentElement.dataset.theme;
  return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Etiquetas de las capas: texto SIN contorno (halo) sobre una pastilla de fondo sólido. El halo alrededor de cada
 * letra se veía como un contorno gris que ensuciaba el texto sobre rellenos de color y sobre el satélite; la
 * pastilla da contraste fijo (≥ 12:1) sobre cualquier fondo. Regla para TODA etiqueta nueva de una capa:
 *   layout: { ...tu layout, ...layoutEtiqueta(map) },  paint: pinturaEtiqueta()
 * (tests/js/etiquetas.test.mjs falla si alguna capa vuelve a usar el halo de texto).
 */
export const COLORES_ETIQUETA = {
  claro: { texto: "#101820", fondo: [255, 255, 255], borde: [176, 186, 194] },
  oscuro: { texto: "#F4F7F9", fondo: [16, 24, 32], borde: [70, 84, 96] },
};

export function pinturaEtiqueta() {
  return { "text-color": COLORES_ETIQUETA[temaOscuro() ? "oscuro" : "claro"].texto, "icon-opacity": 0.94 };
}

/** Imagen estirable (pastilla de esquinas redondeadas) para el fondo de las etiquetas; una por tema. */
export function asegurarFondoEtiqueta(map) {
  const tono = temaOscuro() ? "oscuro" : "claro";
  const id = `fondo-etiqueta-${tono}`;
  if (map.hasImage(id)) return id;
  const { fondo, borde } = COLORES_ETIQUETA[tono];
  const n = 24, r = 6, datos = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      // Distancia a la esquina redondeada más cercana (0 dentro del rectángulo recto).
      const dx = Math.max(r - x - 0.5, x + 0.5 - (n - r), 0), dy = Math.max(r - y - 0.5, y + 0.5 - (n - r), 0);
      const d = Math.hypot(dx, dy);
      if (d > r) continue;
      const c = d > r - 1.2 ? borde : fondo;  // un borde fino y tenue, solo para separar la pastilla de un fondo igual
      const i = (y * n + x) * 4;
      datos.set([...c, Math.round(255 * Math.min(1, r - d + 0.5))], i);
    }
  }
  map.addImage(id, { width: n, height: n, data: datos }, { pixelRatio: 2, stretchX: [[r, n - r]], stretchY: [[r, n - r]], content: [r - 2, r - 3, n - r + 2, n - r + 3] });
  return id;
}

/** Lo que cada capa de etiquetas agrega a su «layout» para llevar la pastilla de fondo. */
export function layoutEtiqueta(map) {
  return { "icon-image": asegurarFondoEtiqueta(map), "icon-text-fit": "both", "icon-text-fit-padding": [1, 4, 1, 4],
    // Texto y pastilla aparecen o desaparecen juntos (nunca una pastilla vacía).
    "text-optional": false, "icon-optional": false };
}

/**
 * ¿Hay en ese píxel un punto, ícono o línea de otra capa interactiva? Los rellenos por país (religiones,
 * gobiernos, índice…) ceden el clic: sin esto, la capa encendida al último se quedaba con todos los clics.
 */
export function hayObjetoEncima(map, punto) {
  return map.queryRenderedFeatures(punto).some((f) => (["circle", "symbol", "line"].includes(f.layer.type)
    && /^(rg-|mov-|cap-|evento|clusters|chokepoints)/.test(f.layer.id) && !/-(texto|pulso)$/.test(f.layer.id))
    // Polígonos de riesgos (zonas afectadas, avisos, conos): su interior también es tocable.
    || (f.layer.type === "fill" && /^rg-.*-area$/.test(f.layer.id)));
}

/** Texto sin acentos y en minúsculas, para buscar «Mexico» y encontrar «México». */
export const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export const MIN_BUSQUEDA = 3;  // la búsqueda empieza con 3 caracteres; las palabras más cortas se ignoran

/** Consulta → palabras a buscar (todas deben aparecer). Lo que va entre comillas se busca como frase. */
export function palabrasDe(q) {
  const out = [];
  if (String(q || "").trim().length < MIN_BUSQUEDA) return out;
  String(q).replace(/"([^"]+)"|(\S+)/g, (_, frase, palabra) => { const x = sinAcentos(frase || palabra).trim(); if (x.length >= MIN_BUSQUEDA) out.push(x); return ""; });
  return out;
}

/** Texto → HTML escapado con <mark> en las partes que coinciden con `palabras` (sin importar acentos ni mayúsculas). */
export function resaltar(texto, palabras) {
  const t = String(texto || "").normalize("NFC");
  if (!palabras?.length) return esc(t);
  // Texto normalizado carácter por carácter, con la posición original de cada carácter.
  let norm = ""; const pos = [];
  for (let i = 0; i < t.length; i++) { const n = sinAcentos(t[i]); for (const c of n) { norm += c; pos.push(i); } }
  const marca = new Array(t.length).fill(false);
  for (const w of palabras) {
    for (let k = norm.indexOf(w); k !== -1; k = norm.indexOf(w, k + 1)) for (let j = k; j < k + w.length; j++) marca[pos[j]] = true;
  }
  let html = "", abierto = false;
  for (let i = 0; i < t.length; i++) {
    if (marca[i] !== abierto) { html += marca[i] ? "<mark>" : "</mark>"; abierto = marca[i]; }
    html += esc(t[i]);
  }
  return abierto ? `${html}</mark>` : html;
}

/** Si alguna palabra aparece en `texto`: fragmento de ~`largo` caracteres alrededor de la primera, con <mark>. Si no, "". */
export function fragmento(texto, palabras, largo = 110) {
  const t = String(texto || "").normalize("NFC"), n = sinAcentos(t);
  const k = Math.min(...(palabras || []).map((w) => n.indexOf(w)).filter((i) => i >= 0));
  if (!Number.isFinite(k)) return "";
  const ini = Math.max(0, k - Math.floor(largo / 3)), fin = Math.min(t.length, ini + largo);
  return `${ini > 0 ? "…" : ""}${resaltar(t.slice(ini, fin), palabras)}${fin < t.length ? "…" : ""}`;
}

/**
 * Botones «Limpiar» (atributo data-limpiar con ids separados por espacios): vacían campos de texto y archivos, y el
 * contenido de los contenedores de resultados. Se avisa con «input» para que los filtros en vivo se vuelvan a pintar.
 */
export function activarLimpiar(raiz = document) {
  raiz.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-limpiar]");
    if (!b) return;
    const ids = b.dataset.limpiar.split(/\s+/).filter(Boolean);
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) continue;
      if (el.matches("input, textarea")) { el.value = ""; el.dispatchEvent(new Event("input", { bubbles: true })); }
      else el.innerHTML = "";
    }
    document.getElementById(ids[0])?.focus();
  });
}
