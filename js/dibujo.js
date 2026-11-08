// Pestaña «Dibujos: tests proyectivos» de conducta.html. Todo corre en el navegador; la imagen no se sube.
import { medirDibujo, preMarcar, redactarDibujo } from "./dibujo-logica.js";
import { aHTML, aTexto } from "./grafo-redaccion.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const CAT = await fetch("config/dibujo_proyectivo.json").then((r) => r.json());
const estado = { test: CAT.tests[0].id, valores: {}, partes: {}, garabatos: [], colores: [], etapa: "adultos", observaciones: "" };
let med = null, bmp = null, ultimo = null;

$("d-aviso").textContent = CAT.aviso;
$("d-materiales").innerHTML = CAT.materiales.map((m) => `<li>${esc(m)}</li>`).join("");
$("d-test").innerHTML = CAT.tests.map((t) => `<option value="${t.id}">${esc(t.nombre)}</option>`).join("");

function pintarTest() {
  const t = CAT.tests.find((x) => x.id === estado.test);
  $("d-consigna").innerHTML = `<b>Consigna:</b> ${esc(t.consigna)}`;
  $("d-garabatos-caja").hidden = !t.partes.includes("garabatos");
  pintarPartes();
}
$("d-test").onchange = () => { estado.test = $("d-test").value; pintarTest(); };

// ---------- valores gráficos ----------
function pintarValores() {
  $("d-valores").innerHTML = CAT.valores.map((g) => `<fieldset><legend>${esc(g.nombre)}</legend>${g.opciones.map((o) => {
    const k = `${g.id}/${o.id}`, e = estado.valores[k];
    return `<label class="rasgo letra-fila"><input type="checkbox" data-v="${esc(k)}" ${e ? "checked" : ""}><span><b>${esc(o.nombre)}</b>${e?.origen === "medido" ? ` <span class="medido-tag">📏 ${esc(e.valor)}</span>` : e?.origen === "estimado" ? ` <span class="estimado-tag">🔎 ${esc(e.valor)}</span>` : ""}<br><span class="det">${esc(o.lectura)}</span></span></label>`;
  }).join("")}</fieldset>`).join("");
}
$("d-valores").addEventListener("change", (e) => { const k = e.target.dataset.v; if (!k) return; if (e.target.checked) estado.valores[k] = { origen: "manual" }; else delete estado.valores[k]; });

// ---------- elementos del dibujo ----------
function pintarPartes() {
  const t = CAT.tests.find((x) => x.id === estado.test), tipos = t.partes.filter((p) => CAT.partes[p]);
  $("d-partes-caja").hidden = !tipos.length;
  const nombreTipo = { figura: "Figura humana", arbol: "Árbol", casa: "Casa" };
  $("d-partes").innerHTML = tipos.map((tipo) => `<h3>${esc(nombreTipo[tipo] || tipo)}</h3>${CAT.partes[tipo].map((g) => `<details class="tarjeta" ${g.partes.some((p) => estado.partes[`${tipo}/${p.id}`]) ? "open" : ""}><summary><b>${esc(g.grupo)}</b> <span class="meta">— ${esc(g.representa)}</span></summary>
    <div class="desliza"><table class="t"><tr><th>Parte</th><th>Representa</th><th>Cómo aparece</th><th>Observación</th></tr>${g.partes.map((p) => {
      const k = `${tipo}/${p.id}`, e = estado.partes[k] || {};
      return `<tr data-p="${esc(k)}"><td><b>${esc(p.nombre)}</b></td><td class="det">${esc(p.representa)}</td><td>${CAT.modificadores.map((m) => `<label style="display:block;font-size:12px" title="${esc(m.lectura)}"><input type="checkbox" data-m="${m.id}" ${e.mods?.includes(m.id) ? "checked" : ""}> ${esc(m.nombre)}</label>`).join("")}</td>
        <td><input data-nota value="${esc(e.nota || "")}" style="width:100%;min-width:140px" aria-label="Observación de ${esc(p.nombre)}"></td></tr>`;
    }).join("")}</table></div></details>`).join("")}`).join("");
}
const alCambiarParte = (e) => {
  const tr = e.target.closest("tr[data-p]"); if (!tr) return;
  const k = tr.dataset.p, p = (estado.partes[k] ||= { mods: [], nota: "" });
  p.mods = [...tr.querySelectorAll("[data-m]:checked")].map((x) => x.dataset.m); p.nota = tr.querySelector("[data-nota]").value;
  if (!p.mods.length && !p.nota) delete estado.partes[k];
};
$("d-partes").addEventListener("change", alCambiarParte); $("d-partes").addEventListener("input", alCambiarParte);

// ---------- garabatos y colores ----------
$("d-garabatos").innerHTML = `<fieldset><legend>Tipos de garabato</legend>${CAT.garabatos.map((g) => `<label class="rasgo letra-fila"><input type="checkbox" data-g="${g.id}"><span><b>${esc(g.nombre)}</b><br><span class="det">${esc(g.lectura)}</span></span></label>`).join("")}</fieldset>`;
$("d-garabatos").addEventListener("change", () => { estado.garabatos = [...$("d-garabatos").querySelectorAll("[data-g]:checked")].map((x) => x.dataset.g); });
function pintarColores() {
  $("d-colores").innerHTML = `<fieldset><legend>Colores que predominan</legend>${CAT.colores.map((c) => `<label class="rasgo letra-fila"><input type="checkbox" data-c="${c.id}" ${estado.colores.includes(c.id) ? "checked" : ""}><span><b>${esc(c.nombre)}</b> <span class="meta">(${esc(c.clave)})</span><br><span class="det">${esc(estado.etapa === "ninos" ? c.ninos : c.adultos)}</span></span></label>`).join("")}</fieldset>`;
}
$("d-colores").addEventListener("change", () => { estado.colores = [...$("d-colores").querySelectorAll("[data-c]:checked")].map((x) => x.dataset.c); });
$("d-etapa").onchange = () => { estado.etapa = $("d-etapa").value; pintarColores(); };
$("d-edad").addEventListener("change", () => { const v = Number($("d-edad").value); if (v) { $("d-etapa").value = v <= 16 ? "ninos" : "adultos"; estado.etapa = $("d-etapa").value; pintarColores(); } });

// ---------- foto del dibujo ----------
function dibujarLienzo() {
  const c = $("d-lienzo"), x = c.getContext("2d"); if (!bmp) return;
  c.width = bmp.width; c.height = bmp.height; x.drawImage(bmp, 0, 0); c.hidden = false;
  const lw = Math.max(2, c.width / 400); x.lineWidth = lw; x.setLineDash([lw * 4, lw * 3]); x.strokeStyle = "#1565C0AA";
  for (let i = 1; i < 3; i++) { x.beginPath(); x.moveTo((c.width * i) / 3, 0); x.lineTo((c.width * i) / 3, c.height); x.moveTo(0, (c.height * i) / 3); x.lineTo(c.width, (c.height * i) / 3); x.stroke(); }
  x.setLineDash([]);
  if (med) {
    x.strokeStyle = "#E65100"; x.strokeRect(med.caja.x0, med.caja.y0, med.caja.x1 - med.caja.x0, med.caja.y1 - med.caja.y0);
    x.fillStyle = "#C62828"; x.beginPath(); x.arc(med.cx * c.width, med.cy * c.height, lw * 4, 0, 7); x.fill();
  }
}
$("d-archivo").onchange = async (e) => {
  const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
  try {
    const img = await createImageBitmap(f), k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const cv = document.createElement("canvas"); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
    cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height); bmp = cv;
    med = medirDibujo(cv.getContext("2d").getImageData(0, 0, cv.width, cv.height));
    for (const k2 of Object.keys(estado.valores)) if (estado.valores[k2].origen !== "manual") delete estado.valores[k2];
    Object.assign(estado.valores, preMarcar(med));
    dibujarLienzo(); pintarValores();
    $("d-medidas").innerHTML = med ? `<p class="meta">Rectángulo naranja: lo que ocupa el dibujo; punto rojo: su centro; líneas azules: las 9 zonas de la hoja. Ocupa ${Math.round(med.fraccion * 100)} % de la hoja${med.bordes ? ` y toca ${med.bordes} borde(s)` : ""}. Se marcaron solos la situación, la dimensión y la presión estimada (paso 3).</p>`
      : '<p class="aviso">No encontré trazo en la imagen. Revisa que sea la hoja con el dibujo y que tenga buena luz.</p>';
  } catch (err) { $("d-medidas").innerHTML = `<p class="aviso">No se pudo leer la imagen (${esc(err.message)}). Usa JPG o PNG.</p>`; }
};

// ---------- informe ----------
$("d-redactar").onclick = () => {
  estado.observaciones = $("d-obs").value.trim();
  ultimo = redactarDibujo(CAT, estado, { persona: $("d-persona").value.trim(), edad: $("d-edad").value, fecha: $("d-fecha").value, analista: $("d-analista").value.trim() });
  $("d-informe").innerHTML = `<p class="meta">≈ ${ultimo.palabras} palabras.</p><div class="escrito">${aHTML(ultimo)}</div>`;
  $("d-informe-botones").hidden = false;
};
$("d-copiar").onclick = async () => { if (!ultimo) return; try { await navigator.clipboard.writeText(aTexto(ultimo)); $("d-copiar").textContent = "✓ Copiado"; setTimeout(() => { $("d-copiar").textContent = "📋 Copiar texto"; }, 1500); } catch (e) { /* sin portapapeles */ } };
$("d-word").onclick = () => {
  if (!ultimo) return;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(ultimo.titulo)}</title><style>body{font-family:Calibri,Arial,sans-serif;font-size:12pt;line-height:1.5}table{border-collapse:collapse}th,td{border:1px solid #999;padding:3pt 6pt;text-align:left}</style></head><body>${aHTML(ultimo)}</body></html>`;
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿", html], { type: "application/msword" })); a.download = "test-proyectivo.doc"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
$("d-imprimir").onclick = () => window.print();

pintarTest(); pintarValores(); pintarColores();
