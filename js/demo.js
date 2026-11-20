// Demostración para directivos (demo.html): arma la página desde config/demo.json, amplía las capturas al hacer clic
// y exporta a PowerPoint (PptxGenJS, se descarga solo al pedirlo) y a PDF (impresión del navegador con estilo propio).
export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const $ = (id) => document.getElementById(id);
const PPTX = "https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js";

/** Precios de los planes, siempre en dólares (regla del proyecto: también en el PDF y el PowerPoint). */
export const precioUsd = (usd) => (Number(usd) === 0 ? "Gratis" : `USD ${Number(usd).toFixed(2)} al mes`);
export const preciosPlanes = (cat) => (cat?.planes || []).map((p) => `${p.nombre}: ${precioUsd(p.usd)}`);

/** HTML de un módulo: captura (ampliable), qué hace, para quién y ejemplo resuelto. */
export function htmlModulo(m) {
  return `<article class="modulo" id="m-${esc(m.id)}">
    <figure><img src="assets/demo/${esc(m.captura)}" alt="${esc(m.titulo)}" loading="lazy" data-ampliar><figcaption>${esc(m.titulo)} · clic para ampliar</figcaption></figure>
    <div><h3>${esc(m.titulo)}</h3>
      <span class="etq">Qué hace</span><p>${esc(m.que_hace)}</p>
      <span class="etq">Para quién</span><p>${esc(m.para_quien)}</p>
      ${(m.precios || []).length ? `<span class="etq">Precios (USD)</span><ul>${m.precios.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
      <span class="etq">Ejemplo resuelto</span><ol>${(m.ejemplo || []).map((p) => `<li>${esc(p)}</li>`).join("")}</ol>
      ${m.pagina ? `<p><a href="${esc(m.pagina)}">Abrir el módulo →</a></p>` : ""}</div>
  </article>`;
}

export function htmlCapitulo(c) {
  return `<section class="capitulo" id="c-${esc(c.id)}"><div class="ancho"><h2>${esc(c.titulo)}</h2>${c.modulos.map(htmlModulo).join("")}</div></section>`;
}

function cargarScript(src) {
  return new Promise((ok, mal) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => mal(new Error("no se pudo cargar")); document.head.append(s); });
}

/** Presentación de PowerPoint con una diapositiva por módulo. */
async function exportarPptx(d) {
  $("estado").textContent = "Preparando PowerPoint…";
  try {
    if (!globalThis.PptxGenJS) await cargarScript(PPTX);
    const p = new globalThis.PptxGenJS();
    p.layout = "LAYOUT_WIDE"; p.title = `${d.titulo} · Demostración`;
    const FONDO = "0A0F17", ACENTO = "C9A227", TEXTO = "E3E7EE", GRIS = "9AA7BD";
    const portada = p.addSlide(); portada.background = { color: FONDO };
    portada.addText("DEMOSTRACIÓN PARA DIRECTIVOS", { x: 0.6, y: 1.2, w: 12, h: 0.5, color: ACENTO, fontSize: 16, bold: true });
    portada.addText(d.titulo, { x: 0.6, y: 1.8, w: 12, h: 1.2, color: TEXTO, fontSize: 48, bold: true });
    portada.addText(d.subtitulo, { x: 0.6, y: 3.2, w: 11.5, h: 1.5, color: GRIS, fontSize: 20 });
    const prob = p.addSlide(); prob.background = { color: FONDO };
    prob.addText("QUÉ PROBLEMA RESUELVE", { x: 0.6, y: 0.4, w: 12, h: 0.6, color: ACENTO, fontSize: 26, bold: true });
    prob.addText(d.problema.map((t) => ({ text: t, options: { bullet: true, breakLine: true } })), { x: 0.6, y: 1.2, w: 12, h: 5, color: TEXTO, fontSize: 18, paraSpaceAfter: 10 });
    for (const c of d.capitulos) {
      const s = p.addSlide(); s.background = { color: FONDO };
      s.addText(c.titulo.toUpperCase(), { x: 0.6, y: 2.6, w: 12, h: 1, color: ACENTO, fontSize: 40, bold: true });
      s.addText(c.modulos.map((m) => m.titulo).join(" · "), { x: 0.6, y: 3.7, w: 12, h: 1.4, color: GRIS, fontSize: 16 });
      for (const m of c.modulos) {
        const sl = p.addSlide(); sl.background = { color: FONDO };
        sl.addText(m.titulo.toUpperCase(), { x: 0.4, y: 0.25, w: 12.5, h: 0.6, color: TEXTO, fontSize: 26, bold: true });
        sl.addImage({ path: new URL(`assets/demo/${m.captura}`, location.href).href, x: 0.4, y: 1.0, w: 7.2, h: 4.5 });
        sl.addText([
          { text: "QUÉ HACE\n", options: { color: ACENTO, bold: true, fontSize: 12 } }, { text: m.que_hace + "\n\n", options: { color: TEXTO, fontSize: 12 } },
          { text: "PARA QUIÉN\n", options: { color: ACENTO, bold: true, fontSize: 12 } }, { text: m.para_quien + "\n\n", options: { color: TEXTO, fontSize: 12 } },
          ...((m.precios || []).length ? [{ text: "PRECIOS (USD)\n", options: { color: ACENTO, bold: true, fontSize: 12 } },
            { text: m.precios.join("\n") + "\n\n", options: { color: TEXTO, fontSize: 12 } }] : []),
          { text: "EJEMPLO\n", options: { color: ACENTO, bold: true, fontSize: 12 } },
          ...m.ejemplo.map((t, i) => ({ text: `${i + 1}. ${t}\n`, options: { color: TEXTO, fontSize: 11 } })),
        ], { x: 7.8, y: 1.0, w: 5.1, h: 6.1, valign: "top" });
      }
    }
    const fin = p.addSlide(); fin.background = { color: FONDO };
    fin.addText("FUENTES, ÉTICA Y CUMPLIMIENTO", { x: 0.6, y: 0.4, w: 12, h: 0.6, color: ACENTO, fontSize: 26, bold: true });
    fin.addText(d.cumplimiento.map((t) => ({ text: t, options: { bullet: true, breakLine: true } })), { x: 0.6, y: 1.2, w: 12, h: 5, color: TEXTO, fontSize: 18, paraSpaceAfter: 10 });
    await p.writeFile({ fileName: "DOMINUS_OSINT_demostracion.pptx" });
    $("estado").textContent = "✅ PowerPoint descargado.";
  } catch (e) {
    $("estado").textContent = `❌ No se pudo generar el PowerPoint (${e.message}). Revisa tu conexión e inténtalo de nuevo.`;
  }
}

function iniciarVisor() {
  const visor = $("visor"), img = visor.querySelector("img"), pie = visor.querySelector("p");
  const cerrar = () => visor.classList.remove("abierto");
  document.addEventListener("click", (e) => {
    const t = e.target.closest?.("[data-ampliar]");
    if (t) { img.src = t.src; img.alt = t.alt; pie.textContent = t.alt; visor.classList.add("abierto"); return; }
    if (visor.classList.contains("abierto") && visor.contains(e.target)) cerrar();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrar(); });
}

async function iniciar() {
  const d = await (await fetch("config/demo.json", { cache: "no-cache" })).json();
  // Precios desde la fuente única (config/planes.json), en dólares.
  const cat = await fetch("config/planes.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => null);
  for (const c of d.capitulos) for (const m of c.modulos) if (m.id === "planes" && cat) m.precios = preciosPlanes(cat);
  $("d-titulo").textContent = d.titulo;
  $("d-subtitulo").textContent = d.subtitulo;
  $("d-problema").innerHTML = d.problema.map((t) => `<li>${esc(t)}</li>`).join("");
  $("d-cumplimiento").innerHTML = d.cumplimiento.map((t) => `<li>${esc(t)}</li>`).join("");
  $("d-indice").innerHTML = d.capitulos.map((c) => `<a href="#c-${esc(c.id)}">${esc(c.titulo)}<small>${esc(c.modulos.map((m) => m.titulo).join(" · "))}</small></a>`).join("");
  $("d-capitulos").innerHTML = d.capitulos.map(htmlCapitulo).join("");
  $("d-pptx").addEventListener("click", () => exportarPptx(d));
  $("d-pdf").addEventListener("click", async () => {
    // Las imágenes diferidas se cargan antes de imprimir para que todas salgan en el PDF.
    for (const im of document.querySelectorAll("img[loading=lazy]")) im.loading = "eager";
    await Promise.all([...document.images].map((im) => (im.complete ? 0 : new Promise((ok) => { im.onload = im.onerror = ok; }))));
    $("estado").textContent = "En el cuadro de impresión elige «Guardar como PDF».";
    window.print();
  });
  iniciarVisor();
}

if (typeof document !== "undefined" && document.getElementById("d-capitulos")) iniciar();
