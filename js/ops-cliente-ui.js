// DOMINUS OPS → Cliente: país principal y otros países con autocompletado (cualquier país del mundo, con o sin tildes).
// Los códigos ISO-3 se guardan en los campos ocultos #cl-pais y #cl-paises, que ops.js ya lee y guarda.
import { campoPais, paises, nombreDe, CSS_PAISES } from "./paises.js";

const $ = (id) => document.getElementById(id);

if ($("cl-pais-ui")) {
  document.head.insertAdjacentHTML("beforeend", `<style>${CSS_PAISES}</style>`);
  const { paises: lista } = await paises();
  const avisar = (el) => el.dispatchEvent(new Event("input", { bubbles: true }));
  const otros = () => String($("cl-paises").value || "").split(/[,\s]+/).map((x) => x.toUpperCase()).filter((x) => /^[A-Z]{3}$/.test(x));
  const chips = () => {
    const caja = $("cl-paises-chips");
    caja.replaceChildren(...otros().map((i) => {
      const span = document.createElement("span"), b = document.createElement("button");
      span.textContent = `${nombreDe(lista, i)} `;
      Object.assign(b, { type: "button", textContent: "×" }); b.dataset.quitar = i; b.setAttribute("aria-label", `Quitar ${nombreDe(lista, i)}`);
      span.append(b); return span;
    }));
  };
  // ops.js llena los campos después de cargar su catálogo: espera a que el sector tenga opciones.
  for (let i = 0; i < 50 && $("cl-sector").options.length < 2; i++) await new Promise((r) => setTimeout(r, 100));
  const pais = $("cl-pais").value;
  if (pais) { $("cl-pais-ui").dataset.iso = pais; $("cl-pais-ui").value = nombreDe(lista, pais); }
  chips();
  campoPais($("cl-pais-ui"), { alElegir: (iso) => { $("cl-pais").value = iso; avisar($("cl-pais")); } });
  campoPais($("cl-paises-ui"), { alElegir: (iso) => {
    const xs = otros(); if (!xs.includes(iso)) xs.push(iso);
    $("cl-paises").value = xs.join(", "); $("cl-paises-ui").value = ""; $("cl-paises-ui").dataset.iso = ""; chips(); avisar($("cl-paises"));
  } });
  $("cl-paises-chips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-quitar]"); if (!b) return;
    $("cl-paises").value = otros().filter((x) => x !== b.dataset.quitar).join(", "); chips(); avisar($("cl-paises"));
  });
  // Evita que el texto del buscador de país dispare guardados vacíos: ops.js guarda desde los campos ocultos.
  for (const id of ["cl-pais-ui", "cl-paises-ui"]) $(id).addEventListener("input", (e) => e.stopPropagation());
}
