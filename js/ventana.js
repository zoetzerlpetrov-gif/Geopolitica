// Ventana emergente reutilizable (<dialog>): título, botón ✕, contenido con scroll. Se cierra con ✕, con Esc o al tocar
// fuera. Una sola ventana a la vez; abrir otra reemplaza el contenido.
export function abrirVentana({ titulo = "", html = "", doc = document } = {}) {
  let d = doc.getElementById("ventana-emergente");
  if (!d) {
    d = doc.createElement("dialog");
    d.id = "ventana-emergente";
    d.className = "ventana";
    d.innerHTML = `<header class="ventana-cab"><h2 class="ventana-tit"></h2><button type="button" class="ventana-x" aria-label="Cerrar">✕</button></header><div class="ventana-cuerpo"></div>`;
    d.querySelector(".ventana-x").addEventListener("click", () => d.close());
    d.addEventListener("click", (e) => { if (e.target === d) d.close(); });   // clic en el fondo
    doc.body.append(d);
  }
  d.querySelector(".ventana-tit").textContent = titulo;
  const cuerpo = d.querySelector(".ventana-cuerpo");
  cuerpo.innerHTML = html;
  cuerpo.scrollTop = 0;
  if (!d.open) (d.showModal ? d.showModal() : d.setAttribute("open", ""));
  return cuerpo;
}

/** Botón de concepto para el menú: abre su ventana. */
export const botonConcepto = (id, texto, extra = "") =>
  `<button type="button" class="concepto" data-concepto="${id}"><span>${texto}</span>${extra ? `<span class="concepto-extra">${extra}</span>` : ""}<span aria-hidden="true">›</span></button>`;
