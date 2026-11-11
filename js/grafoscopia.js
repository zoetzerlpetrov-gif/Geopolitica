// Pestaña «Grafoscopía: peritaje» de conducta.html. Todo corre en el navegador; las imágenes no se suben.
import { medir, mascara } from "./grafo-medir.js";
import { ELEMENTOS, VALORES_COTEJO, SENALES, ESCALA, MEDIDAS, compararMedidas, normalizar, analizarSuperposicion, analisisAutomatico, trazo, SOLO_A_MANO, sugerirConclusion, redactarDictamen, dictamenHTML, dictamenTexto } from "./grafoscopia-logica.js";
import { imprimirSolo } from "./imprimir.js";
import { descargarBlob, documentoAPDF } from "./exportar.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MAX_LADO = 1400, MAX_INDUB = 12;

// Cada muestra: { id, rol: "dub" | "indub", lienzo, img: ImageData, recorte, med, norm, descripcion, fecha, tipo, copia }
const estado = { dub: null, indubs: [], cotejo: {}, senales: [], senalesManual: new Set(), nivel: null, medidas: [], superposicion: null, auto: null };
let ultimo = null, sigId = 1;

// ---------- catálogos fijos ----------
$("p-cotejo").innerHTML = ELEMENTOS.map((g) => `<h3>${esc(g.grupo)}</h3><div class="desliza"><table class="t"><tr><th>Elemento</th><th>Resultado</th><th>Observación</th></tr>${g.items.map((it) => `<tr data-el="${it.id}">
  <td><b>${esc(it.nombre)}</b><br><span class="meta">${esc(it.que)}</span><span class="p-pista meta" data-pista="${it.id}"></span></td>
  <td><select data-valor aria-label="Resultado de ${esc(it.nombre)}"><option value="">—</option>${Object.entries(VALORES_COTEJO).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></td>
  <td><input data-nota style="width:100%;min-width:160px" aria-label="Observación de ${esc(it.nombre)}"></td></tr>`).join("")}</table></div>`).join("");
$("p-senales").innerHTML = SENALES.map((s) => `<label class="rasgo letra-fila"><input type="checkbox" data-sen="${s.id}"><span><b>${esc(s.nombre)}</b> <span class="p-pista" data-pista-sen="${s.id}"></span><br><span class="det">${esc(s.que)}</span></span></label>`).join("");
$("p-nivel").innerHTML = ESCALA.map((e) => `<option value="${e.n}">${e.n}. ${esc(e.texto)}</option>`).join("");

$("p-cotejo").addEventListener("change", (e) => {
  const tr = e.target.closest("tr[data-el]"); if (!tr) return;
  const c = (estado.cotejo[tr.dataset.el] ||= {});
  c.valor = tr.querySelector("[data-valor]").value; c.nota = tr.querySelector("[data-nota]").value; c.origen = "manual";
  tr.querySelector("[data-pista]").textContent = " · ✍️ editado por ti";
  pintarConclusion();
});
$("p-cotejo").addEventListener("input", (e) => { const tr = e.target.closest("tr[data-el]"); if (tr && e.target.matches("[data-nota]")) { const c = (estado.cotejo[tr.dataset.el] ||= {}); c.nota = e.target.value; c.origen = "manual"; tr.querySelector("[data-pista]").textContent = " · ✍️ editado por ti"; } });
$("p-senales").addEventListener("change", (e) => {
  if (e.target.dataset.sen) { estado.senalesManual.add(e.target.dataset.sen); e.target.closest("label").querySelector("[data-pista-sen]").classList.remove("auto"); }
  estado.senales = [...$("p-senales").querySelectorAll("[data-sen]:checked")].map((x) => x.dataset.sen); pintarConclusion();
});
$("p-nivel").addEventListener("change", () => { estado.nivel = Number($("p-nivel").value); });
$("p-contemporaneas").addEventListener("change", pintarConclusion);

// ---------- carga y recorte de imágenes ----------
async function leerImagen(f) {
  const bmp = await createImageBitmap(f), k = Math.min(1, MAX_LADO / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const x = c.getContext("2d", { willReadFrequently: true }); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height);
  return x.getImageData(0, 0, c.width, c.height);
}

function medirMuestra(s) {
  try {
    const M = mascara(s.img, s.recorte);
    s.med = medir(s.img, s.recorte);
    if (!s.med.vacio) s.med.trazo = trazo(M);
    s.norm = normalizar(M);
  } catch (e) { s.med = { vacio: true }; s.norm = null; }
}

function dibujarMuestra(s) {
  const c = s.lienzo, x = c.getContext("2d");
  c.width = s.img.width; c.height = s.img.height; x.putImageData(s.img, 0, 0);
  if (s.recorte) { const r = s.recorte, lw = Math.max(2, c.width / 300); x.lineWidth = lw; x.strokeStyle = "#E65100"; x.setLineDash([lw * 3, lw * 2]); x.strokeRect(r.x, r.y, r.w, r.h); x.setLineDash([]); }
}

/** Arrastrar sobre la imagen marca el recorte (solo la firma o el texto a comparar). */
function activarRecorte(s) {
  const c = s.lienzo; let ini = null;
  const punto = (e) => { const b = c.getBoundingClientRect(); return { x: ((e.clientX - b.left) * c.width) / b.width, y: ((e.clientY - b.top) * c.height) / b.height }; };
  c.addEventListener("pointerdown", (e) => { ini = punto(e); c.setPointerCapture(e.pointerId); });
  c.addEventListener("pointermove", (e) => { if (!ini) return; const p = punto(e); s.recorte = { x: Math.min(ini.x, p.x), y: Math.min(ini.y, p.y), w: Math.abs(p.x - ini.x), h: Math.abs(p.y - ini.y) }; dibujarMuestra(s); });
  c.addEventListener("pointerup", () => { if (!ini) return; ini = null; if (s.recorte && (s.recorte.w < 12 || s.recorte.h < 8)) s.recorte = null; dibujarMuestra(s); medirMuestra(s); actualizar(); });
}

function tarjetaMuestra(s, n) {
  const d = document.createElement("div"); d.className = "tarjeta p-muestra"; d.dataset.id = s.id;
  d.innerHTML = `<div class="barra"><b>${s.rol === "dub" ? "Dubitada" : `Indubitada ${n}`}</b>
    <input data-campo="descripcion" placeholder="${s.rol === "dub" ? "Documento y lugar donde aparece" : "Documento de origen"}" value="${esc(s.descripcion)}" style="flex:1;min-width:180px" aria-label="Descripción">
    <input data-campo="fecha" type="date" value="${esc(s.fecha)}" aria-label="Fecha de la muestra" title="Fecha de la muestra">
    ${s.rol === "indub" ? `<select data-campo="tipo" aria-label="Tipo"><option value="espontanea">Espontánea</option><option value="recabada" ${s.tipo === "recabada" ? "selected" : ""}>Recabada (hecha a petición)</option></select>` : ""}
    <label><input type="checkbox" data-campo="copia" ${s.copia ? "checked" : ""}> Es copia o foto</label>
    <button type="button" data-accion="sin-recorte" class="no-imprimir">Quitar recorte</button>${s.rol === "indub" ? '<button type="button" data-accion="quitar" class="no-imprimir">✕ Quitar</button>' : ""}</div>
    <div class="p-medidas meta"></div>`;
  d.insertBefore(s.lienzo, d.querySelector(".p-medidas"));
  d.addEventListener("input", (e) => { const k = e.target.dataset.campo; if (!k) return; s[k] = e.target.type === "checkbox" ? e.target.checked : e.target.value; if (k === "copia") pintarConclusion(); });
  d.addEventListener("change", (e) => { const k = e.target.dataset.campo; if (k) { s[k] = e.target.type === "checkbox" ? e.target.checked : e.target.value; pintarConclusion(); } });
  d.addEventListener("click", (e) => {
    const a = e.target.dataset.accion;
    if (a === "sin-recorte") { s.recorte = null; dibujarMuestra(s); medirMuestra(s); actualizar(); }
    if (a === "quitar") { estado.indubs = estado.indubs.filter((x) => x !== s); pintarMuestras(); actualizar(); }
  });
  return d;
}

function pintarMuestras() {
  const cd = $("p-dub-caja"); cd.innerHTML = ""; if (estado.dub) cd.appendChild(tarjetaMuestra(estado.dub, 0));
  const ci = $("p-indub-caja"); ci.innerHTML = ""; estado.indubs.forEach((s, i) => ci.appendChild(tarjetaMuestra(s, i + 1)));
  $("p-indub-n").textContent = estado.indubs.length ? `${estado.indubs.length} indubitada(s)` : "";
}

async function nuevaMuestra(f, rol) {
  const img = await leerImagen(f);
  const s = { id: sigId++, rol, img, lienzo: document.createElement("canvas"), recorte: null, med: null, norm: null, descripcion: "", fecha: "", tipo: "espontanea", copia: true };
  s.lienzo.className = "p-lienzo"; s.lienzo.title = "Arrastra para recortar solo la firma o el texto que se compara";
  dibujarMuestra(s); activarRecorte(s); medirMuestra(s);
  return s;
}

$("p-dub-archivo").onchange = async (e) => {
  const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
  try { estado.dub = await nuevaMuestra(f, "dub"); pintarMuestras(); actualizar(); } catch (err) { $("p-dub-caja").innerHTML = `<p class="aviso">No se pudo leer la imagen (${esc(err.message)}). Usa JPG o PNG.</p>`; }
};
$("p-indub-archivo").onchange = async (e) => {
  const fs = [...(e.target.files || [])]; e.target.value = "";
  for (const f of fs) { if (estado.indubs.length >= MAX_INDUB) break; try { estado.indubs.push(await nuevaMuestra(f, "indub")); } catch (err) { /* se omite la imagen ilegible */ } }
  pintarMuestras(); actualizar();
};

// ---------- medidas, superposición y pistas ----------
const fmt = (v, u) => (v == null ? "—" : `${v}${u}`);
function actualizar() {
  for (const s of [estado.dub, ...estado.indubs].filter(Boolean)) {
    const caja = document.querySelector(`.p-muestra[data-id="${s.id}"] .p-medidas`); if (!caja) continue;
    const t = s.med?.trazo;
    caja.textContent = !s.med || s.med.vacio ? "No encontré trazo en esta zona: recorta solo la firma o el texto, con buena luz." : `${s.recorte ? "Recortada. " : "Imagen completa (arrastra sobre ella para recortar solo la firma). "}🤖 Inclinación ${s.med.inclinacion?.toFixed?.(1) ?? "—"}°, ${s.med.renglones} renglón(es)${t ? `, ${t.piezas} pieza(s), ${t.puntas} puntas, temblor ${t.temblor ?? "—"}, extremos ${t.extremos ?? "—"}` : ""}.`;
  }
  const listos = estado.indubs.filter((s) => s.med && !s.med.vacio);
  estado.medidas = estado.dub?.med && !estado.dub.med.vacio && listos.length ? compararMedidas(estado.dub.med, listos.map((s) => s.med)) : [];
  $("p-medidas").innerHTML = estado.medidas.length ? `<div class="desliza"><table class="t"><tr><th>Medida</th><th>Dubitada</th><th>Indubitadas (mín.–máx.)</th><th>Media ± desv.</th><th>Resultado</th></tr>${estado.medidas.map((m) => `<tr><td>${esc(m.nombre)}</td><td>${fmt(m.dubitada, m.unidad)}</td><td>${m.estado === "sin_dato" ? "—" : `${m.min}–${m.max}${m.unidad}`}</td><td>${m.estado === "sin_dato" ? "—" : `${m.media} ± ${m.desv}`}</td><td>${m.estado === "dentro" ? "✅ Dentro del rango" : m.estado === "fuera" ? "⚠️ Fuera del rango" : "Sin dato"}</td></tr>`).join("")}</table></div>
    <p class="meta">${listos.length < 3 ? "Con menos de 3 indubitadas el rango es muy estrecho: casi cualquier diferencia sale «fuera». " : ""}El rango aceptado se amplía con una tolerancia que crece con la dispersión de las indubitadas.</p>`
    : '<p class="meta">Carga la dubitada y al menos una indubitada para comparar las medidas.</p>';
  const nd = estado.dub?.norm, ni = estado.indubs.map((s) => s.norm);
  estado.superposicion = nd && ni.some(Boolean) ? analizarSuperposicion(nd, ni.map((x) => x || { vacio: true })) : null;
  $("p-sup-sel").innerHTML = estado.indubs.map((s, i) => `<option value="${i}">Indubitada ${i + 1}${estado.superposicion?.conDub?.[i] != null ? ` · ${Math.round(estado.superposicion.conDub[i] * 100)} %` : ""}</option>`).join("");
  pintarSuperposicion();
  pintarPistas();
  pintarConclusion();
}

function pintarSuperposicion() {
  const c = $("p-sup"), sp = estado.superposicion, i = Number($("p-sup-sel").value || 0);
  const a = estado.dub?.norm, b = estado.indubs[i]?.norm;
  c.hidden = !(a && b && !a.vacio && !b.vacio);
  if (c.hidden) { $("p-sup-txt").textContent = "Aparece cuando hay dubitada e indubitadas con trazo."; return; }
  const E = 2; c.width = a.W * E; c.height = a.H * E;
  const x = c.getContext("2d"), op = Number($("p-sup-op").value) / 100, im = x.createImageData(c.width, c.height);
  for (let y = 0; y < c.height; y++) for (let X = 0; X < c.width; X++) {
    const k = ((y / E) | 0) * a.W + ((X / E) | 0), da = a.m[k], db = b.m[k], p = (y * c.width + X) * 4;
    const [r, g, bl] = da && db ? [60, 20, 90] : da ? [200, 30, 40] : db ? [30, 100, 200] : [255, 255, 255];
    im.data[p] = r; im.data[p + 1] = g; im.data[p + 2] = bl; im.data[p + 3] = da && !db ? Math.round(255 * op) : 255;
  }
  x.putImageData(im, 0, 0);
  $("p-sup-txt").innerHTML = sp ? `Coincidencia con esta indubitada: <b>${Math.round((sp.conDub[i] ?? 0) * 100)} %</b>. Las indubitadas coinciden entre sí ${Number.isFinite(sp.maxEntre) ? `hasta ${Math.round(sp.maxEntre * 100)} % (media ${Math.round(sp.mediaEntre * 100)} %)` : "— (hace falta más de una)"}.
    ${sp.calco ? '<br><b style="color:#C62828">⚠️ Coincidencia excesiva: dos firmas auténticas nunca son idénticas. Posible calco o reproducción; revisa el original.</b>' : ""}` : "";
}
$("p-sup-sel").onchange = pintarSuperposicion; $("p-sup-op").oninput = pintarSuperposicion;

/** Aplica el análisis automático al cotejo y a las señales, sin tocar lo que la persona ya cambió a mano. */
function pintarPistas() {
  const listos = estado.medidas.length > 0;
  estado.auto = listos ? analisisAutomatico(estado.medidas, estado.superposicion, { copia: material().copia }) : { cotejo: {}, senales: {} };
  for (const g of ELEMENTOS) for (const it of g.items) {
    const tr = document.querySelector(`tr[data-el="${it.id}"]`); if (!tr) continue;
    const pista = tr.querySelector("[data-pista]"), c = estado.cotejo[it.id], a = estado.auto.cotejo[it.id];
    if (c?.origen === "manual") continue;
    if (a) {
      estado.cotejo[it.id] = { valor: a.valor, nota: a.nota, origen: "auto" };
      tr.querySelector("[data-valor]").value = a.valor; tr.querySelector("[data-nota]").value = a.nota;
      pista.textContent = " · 🤖 propuesto por el análisis automático";
    } else {
      if (c?.origen === "auto") { delete estado.cotejo[it.id]; tr.querySelector("[data-valor]").value = ""; tr.querySelector("[data-nota]").value = ""; }
      pista.textContent = listos && SOLO_A_MANO.includes(it.id) ? " · 🔎 se valora a mano (lupa o documento completo)" : "";
    }
  }
  for (const sen of SENALES) {
    const cb = document.querySelector(`[data-sen="${sen.id}"]`), pista = document.querySelector(`[data-pista-sen="${sen.id}"]`), motivo = estado.auto.senales[sen.id];
    if (!cb) continue;
    if (!estado.senalesManual.has(sen.id)) { cb.checked = Boolean(motivo); pista.classList.toggle("auto", Boolean(motivo)); }
    pista.textContent = motivo ? `🤖 ${motivo}` : "";
  }
  estado.senales = [...$("p-senales").querySelectorAll("[data-sen]:checked")].map((x) => x.dataset.sen);
  const n = Object.values(estado.cotejo).filter((c) => c.origen === "auto").length, ns = Object.keys(estado.auto.senales).length;
  $("p-auto-resumen").textContent = listos ? `🤖 El análisis automático propuso ${n} de ${ELEMENTOS.reduce((t, g) => t + g.items.length, 0)} elementos y ${ns} señal(es). Revisa cada uno: cambia el resultado o la observación si no coincide con lo que ves; lo que edites ya no se sobrescribe.` : "";
}

function material() {
  const todas = [estado.dub, ...estado.indubs].filter(Boolean);
  return { copia: todas.some((s) => s.copia), indubitadas: estado.indubs.length, contemporaneas: $("p-contemporaneas").checked };
}

function pintarConclusion() {
  const sug = sugerirConclusion({ ...estado, material: material() });
  $("p-sugerida").innerHTML = `<p><b>Sugerida: ${sug.nivel}. ${esc(sug.conclusion.texto)}</b></p><ul>${sug.razones.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
    <p class="meta">Coincidencias ${sug.conteo.coincidencias} · variaciones naturales ${sug.conteo.variaciones} · divergencias ${sug.conteo.divergencias} · señales ${sug.conteo.senales}. La conclusión final la eliges tú abajo.</p>`;
  if (!estado.nivel) $("p-nivel").value = String(sug.nivel);
  if (!$("p-consideraciones").dataset.editado) $("p-consideraciones").value = consideracionesAuto();
}

/** Borrador de consideraciones a partir del análisis automático (editable). */
function consideracionesAuto() {
  if (!estado.auto || !estado.medidas.length) return "";
  const fuera = estado.medidas.filter((m) => m.estado === "fuera").map((m) => m.nombre.toLowerCase());
  const sen = Object.keys(estado.auto.senales).map((id) => SENALES.find((s) => s.id === id)?.nombre.toLowerCase()).filter(Boolean);
  return [fuera.length ? `Las medidas que se apartan del rango de las indubitadas son: ${fuera.join(", ")}.` : "Todas las medidas comparables de la dubitada caen dentro del rango de variación de las indubitadas.",
    sen.length ? `El análisis del trazo señala: ${sen.join(", ")}; deben confirmarse con lupa y luz rasante sobre el original.` : "El análisis del trazo no encontró señales de falsificación (temblor, extremos romos, cortes anómalos ni coincidencia excesiva)."].join(" ");
}
$("p-consideraciones").addEventListener("input", () => { $("p-consideraciones").dataset.editado = "1"; });

// ---------- dictamen ----------
function datos() {
  return { expediente: $("p-expediente").value.trim(), solicitante: $("p-solicitante").value.trim(), perito: $("p-perito").value.trim(), cedula: $("p-cedula").value.trim(),
    lugar: $("p-lugar").value.trim(), fecha: $("p-fecha").value, planteamiento: $("p-planteamiento").value.trim(), instrumentos: $("p-instrumentos").value.trim() };
}
$("p-redactar").onclick = () => {
  const m = (s) => ({ descripcion: s.descripcion, fecha: s.fecha, tipo: s.tipo, copia: s.copia });
  ultimo = redactarDictamen({ ...estado, dubitada: estado.dub ? m(estado.dub) : {}, indubitadas: estado.indubs.map(m), material: material(),
    nivel: Number($("p-nivel").value) || null, consideraciones: $("p-consideraciones").value.trim() }, datos());
  $("p-dictamen").innerHTML = `<p class="meta">≈ ${ultimo.palabras} palabras.</p><div class="escrito">${dictamenHTML(ultimo)}</div>`;
  $("p-dictamen-botones").hidden = false;
};
const html = () => dictamenHTML(ultimo);
$("p-copiar").onclick = async () => { if (!ultimo) return; try { await navigator.clipboard.writeText(dictamenTexto(ultimo)); $("p-copiar").textContent = "✓ Copiado"; setTimeout(() => { $("p-copiar").textContent = "📋 Copiar texto"; }, 1500); } catch (e) { /* sin portapapeles */ } };
$("p-word").onclick = () => {
  if (!ultimo) return;
  const h = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(ultimo.titulo)}</title><style>body{font-family:Calibri,Arial,sans-serif;font-size:12pt;line-height:1.5}table{border-collapse:collapse}th,td{border:1px solid #999;padding:3pt 6pt;text-align:left;vertical-align:top}</style></head><body>${html()}</body></html>`;
  descargarBlob("dictamen-grafoscopia.doc", new Blob(["﻿", h], { type: "application/msword" }));
};
$("p-pdf").onclick = async () => { if (!ultimo) return; descargarBlob("dictamen-grafoscopia.pdf", await documentoAPDF(ultimo.titulo, html())); };
$("p-imprimir").onclick = () => {
  const lienzos = [estado.dub, ...estado.indubs].filter(Boolean).map((s) => s.lienzo);
  imprimirSolo([$("p-dictamen").querySelector(".escrito"), ...lienzos, $("p-sup").hidden ? null : $("p-sup")], { pie: "Anexo: muestras y superposición" });
};

pintarMuestras(); actualizar();
