// Países del mundo para cualquier campo de país (config/paises.json): México primero y el resto de la A a la Z.
// Autocompletado propio: al escribir (con o sin tildes, nombre o código ISO-3) aparecen sugerencias para elegir.
const sinTilde = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
let cache = null;

/** Lista [[iso3, nombre], …] y grupos (ue, eee). */
export async function paises() {
  cache ||= fetch("config/paises.json").then((r) => r.json()).catch(() => ({ paises: [["MEX", "México"]], ue: [], eee: [] }));
  return cache;
}

/** Sugerencias para un texto: primero las que empiezan igual, luego las que lo contienen. */
export function sugerencias(lista, texto, n = 8) {
  const q = sinTilde(texto);
  if (!q) return lista.slice(0, n);
  const empieza = [], contiene = [];
  for (const [iso, nombre] of lista) {
    const k = sinTilde(nombre);
    if (k.startsWith(q) || iso.toLowerCase() === q) empieza.push([iso, nombre]);
    else if (k.includes(q)) contiene.push([iso, nombre]);
  }
  return [...empieza, ...contiene].slice(0, n);
}

/** ISO-3 de un texto (nombre exacto sin importar tildes, o el propio código). */
export function isoDe(lista, texto) {
  const q = sinTilde(texto);
  const p = lista.find(([iso, nombre]) => sinTilde(nombre) === q || iso.toLowerCase() === q);
  return p ? p[0] : "";
}

export const nombreDe = (lista, iso) => lista.find(([i]) => i === iso)?.[1] || iso || "";

/**
 * Convierte un <input> en campo de país con sugerencias. El ISO-3 elegido queda en input.dataset.iso.
 * opciones: { alElegir(iso, nombre) }.
 */
export async function campoPais(input, { alElegir = () => {} } = {}) {
  const { paises: lista } = await paises();
  if (input.dataset.iso) input.value = nombreDe(lista, input.dataset.iso);
  input.setAttribute("autocomplete", "off");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  const caja = document.createElement("ul");
  caja.className = "pais-sugerencias"; caja.hidden = true; caja.setAttribute("role", "listbox");
  input.insertAdjacentElement("afterend", caja);
  input.parentElement.style.position ||= "relative";
  let marcada = -1, actuales = [];
  const pintar = () => {
    actuales = sugerencias(lista, input.value);
    caja.innerHTML = actuales.map(([iso, n], i) => `<li role="option" data-iso="${iso}" aria-selected="${i === marcada}">${n.replace(/&/g, "&amp;").replace(/</g, "&lt;")} <small>${iso}</small></li>`).join("");
    caja.hidden = !actuales.length;
  };
  const elegir = (iso) => {
    const n = nombreDe(lista, iso);
    input.value = n; input.dataset.iso = iso; caja.hidden = true; marcada = -1;
    input.setCustomValidity("");
    alElegir(iso, n);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  input.addEventListener("focus", pintar);
  input.addEventListener("input", () => { input.dataset.iso = isoDe(lista, input.value); marcada = -1; pintar(); });
  input.addEventListener("keydown", (e) => {
    if (caja.hidden) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); marcada = (marcada + (e.key === "ArrowDown" ? 1 : -1) + actuales.length) % actuales.length; pintar(); }
    else if (e.key === "Enter" && actuales.length) { e.preventDefault(); elegir(actuales[Math.max(0, marcada)][0]); }
    else if (e.key === "Escape") caja.hidden = true;
  });
  caja.addEventListener("mousedown", (e) => { const li = e.target.closest("li[data-iso]"); if (li) { e.preventDefault(); elegir(li.dataset.iso); } });
  input.addEventListener("blur", () => setTimeout(() => { caja.hidden = true; if (input.value && !input.dataset.iso) input.setCustomValidity("Elige un país de la lista."); }, 150));
  return { lista };
}

export const CSS_PAISES = `.pais-sugerencias { position: absolute; z-index: 50; left: 0; right: 0; max-height: 260px; overflow: auto; margin: 2px 0 0; padding: 4px 0; list-style: none;
  background: var(--surface, #fff); color: var(--text, #111); border: 1px solid var(--line, #ccc); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.18); }
  .pais-sugerencias li { padding: 6px 10px; cursor: pointer; } .pais-sugerencias li small { color: var(--text-2, #666); }
  .pais-sugerencias li:hover, .pais-sugerencias li[aria-selected="true"] { background: var(--surface-2, #eee); }`;
