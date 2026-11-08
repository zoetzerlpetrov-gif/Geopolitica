// Impresión de una parte de la página: copia lo que se quiere imprimir en una zona aparte y oculta el resto solo al
// imprimir. Así no se corta lo que está dentro de cajas con barra de desplazamiento y no salen botones, mapas ni menús.
// Los <details> salen abiertos, los <canvas> como imagen y los campos con su valor escrito.

const ESTILO = `
#zona-impresion { display: none; }
@media print {
  body.imprimiendo > *:not(#zona-impresion) { display: none !important; }
  body.imprimiendo { display: block !important; height: auto !important; overflow: visible !important; background: #fff !important; color: #000 !important; }
  body.imprimiendo #zona-impresion { display: block !important; font: 11pt/1.45 Calibri, Arial, sans-serif; color: #000; }
  #zona-impresion * { overflow: visible !important; max-height: none !important; box-shadow: none !important; }
  #zona-impresion [hidden], #zona-impresion .no-imprimir, #zona-impresion button, #zona-impresion input[type=file] { display: none !important; }
  #zona-impresion h1 { font-size: 16pt; margin: 0 0 8pt; }
  #zona-impresion h2 { font-size: 14pt; text-transform: none; letter-spacing: 0; color: #000; margin: 12pt 0 6pt; }
  #zona-impresion h3 { font-size: 12pt; margin: 10pt 0 4pt; }
  #zona-impresion p, #zona-impresion li { orphans: 3; widows: 3; }
  #zona-impresion table { border-collapse: collapse; width: 100%; }
  #zona-impresion th, #zona-impresion td { border: 1px solid #999; padding: 3pt 5pt; font-size: 9.5pt; vertical-align: top; color: #000; }
  #zona-impresion tr, #zona-impresion img, #zona-impresion svg, #zona-impresion .inf-item { break-inside: avoid; }
  #zona-impresion img, #zona-impresion svg { max-width: 100% !important; height: auto; }
  #zona-impresion .imp-pie { margin-top: 12pt; font-size: 8.5pt; color: #555; }
  @page { margin: 14mm; }
}`;

function asegurarEstilo(doc) {
  if (doc.getElementById("estilo-imprimir")) return;
  const s = doc.createElement("style"); s.id = "estilo-imprimir"; s.textContent = ESTILO; doc.head.appendChild(s);
}

/** Copia un elemento lista para imprimir (canvas → imagen, campos → texto, details abiertos). */
export function copiaImprimible(el) {
  const aImagen = (cv) => { const img = el.ownerDocument.createElement("img"); try { img.src = cv.toDataURL("image/png"); } catch (e) { /* lienzo con imagen de otro origen */ } img.alt = ""; img.style.maxWidth = "100%"; return img; };
  if (el.tagName === "CANVAS") return aImagen(el);
  const c = el.cloneNode(true), lienzos = el.querySelectorAll("canvas");
  c.querySelectorAll("canvas").forEach((cv, i) => cv.replaceWith(aImagen(lienzos[i])));
  for (const d of c.querySelectorAll("details")) d.open = true;
  const orig = el.querySelectorAll("input, select, textarea"), dup = c.querySelectorAll("input, select, textarea");
  dup.forEach((x, i) => {
    const o = orig[i]; if (!o) return;
    if (x.type === "checkbox" || x.type === "radio") { x.checked = o.checked; if (o.checked) x.setAttribute("checked", ""); else x.removeAttribute("checked"); return; }
    if (x.type === "file" || x.type === "hidden" || x.type === "button" || x.type === "submit") return;
    const v = x.tagName === "SELECT" ? (o.selectedOptions[0]?.textContent || "") : o.value;
    const s = c.ownerDocument.createElement("span"); s.textContent = v || "—"; s.style.whiteSpace = "pre-wrap";
    x.replaceWith(s);
  });
  // Se conservan los id para que apliquen los estilos de la página; la copia va al final, así que getElementById sigue dando el original.
  return c;
}

/**
 * Imprime solo los elementos indicados. elementos: Element o lista. titulo: encabezado opcional del impreso.
 * Devuelve la zona creada (útil para pruebas). Se limpia sola al terminar de imprimir.
 */
export function imprimirSolo(elementos, { titulo = "", pie = "" } = {}) {
  const doc = document; asegurarEstilo(doc);
  doc.getElementById("zona-impresion")?.remove();
  const zona = doc.createElement("div"); zona.id = "zona-impresion";
  if (titulo) { const h = doc.createElement("h1"); h.textContent = titulo; zona.appendChild(h); }
  for (const el of [].concat(elementos).filter(Boolean)) zona.appendChild(copiaImprimible(el));
  const p = doc.createElement("p"); p.className = "imp-pie";
  p.textContent = `${pie ? `${pie} · ` : ""}Impreso el ${new Date().toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" })}`;
  zona.appendChild(p);
  doc.body.appendChild(zona); doc.body.classList.add("imprimiendo");
  const limpiar = () => { doc.body.classList.remove("imprimiendo"); zona.remove(); window.removeEventListener("afterprint", limpiar); };
  window.addEventListener("afterprint", limpiar);
  // Deja que el navegador pinte la zona antes de abrir el diálogo
  setTimeout(() => { try { window.print(); } finally { setTimeout(() => { if (doc.body.contains(zona) && !window.matchMedia?.("print").matches) limpiar(); }, 1500); } }, 60);
  return zona;
}
