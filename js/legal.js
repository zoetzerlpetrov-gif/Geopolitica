// Datos legales en privacidad.html y terminos.html: rellena cada <span data-legal="campo"> con el valor guardado en
// Admin → Datos legales (Worker /legal/datos.json). Si el Worker no responde, usa config/legal.json. Un campo vacío
// se muestra como «pendiente». La vista previa de legal.html manda valores con postMessage (mismo origen).
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const fechaLarga = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || "") ? `${Number(iso.slice(8))} de ${MESES[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}` : "");

/** Texto que se muestra para un campo (o null si falta). */
export function valor(datos, campo) {
  const v = String(datos?.[campo] ?? "").trim();
  if (!v) return null;
  if (campo.startsWith("actualizado_")) return fechaLarga(v) || null;
  return v;
}

export function aplicar(doc, datos) {
  for (const el of doc.querySelectorAll("[data-legal]")) {
    const campo = el.dataset.legal, v = valor(datos, campo);
    el.textContent = v ?? (el.dataset.pendiente || "[pendiente]");
    el.classList.toggle("pendiente", v == null);
    if (el.tagName === "A") {
      if (v && /@/.test(v)) el.href = `mailto:${v}`; else el.removeAttribute("href");
    }
  }
  for (const el of doc.querySelectorAll("[data-legal-si]")) el.hidden = !valor(datos, el.dataset.legalSi);
}

export async function cargar(pedir = fetch) {
  let base = {}, endpoint = "";
  try { const c = await (await pedir("config/legal.json", { cache: "no-store" })).json(); base = c.datos || {}; endpoint = c.endpoint || ""; } catch { /* sin config */ }
  if (!endpoint) return base;
  try {
    const r = await pedir(endpoint, { cache: "no-store" });
    const d = r.ok ? await r.json() : {};
    return d && !d.error && Object.keys(d).length ? { ...base, ...d } : base;
  } catch { return base; }
}

if (typeof document !== "undefined" && document.querySelector("[data-legal]")) {
  cargar().then((d) => aplicar(document, d));
  window.addEventListener("message", (e) => {
    if (e.origin === location.origin && e.data?.tipo === "legal-vista") aplicar(document, e.data.datos || {});
  });
}
