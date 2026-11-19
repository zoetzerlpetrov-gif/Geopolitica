// Patrocinios de Brújula Diaria (patrocinios.html, solo admin). Lee config/patrocinios.json, valida cada campaña con
// las mismas reglas que el generador del video (tools/noticiero_video/patrocinio.py), muestra la escena tal como
// saldría, el calendario de los próximos 30 días y arma el archivo nuevo. Guardar NO escribe en el repositorio desde
// el navegador (no hay llaves aquí): copia el JSON y abre el editor de GitHub para proponer el cambio con una PR.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const REPO = "zoetzerlpetrov-gif/Geopolitica";
export const POSICIONES = { apertura: "Apertura (después de la portada)", pausa: "Pausa (antes de Indicadores o a la mitad)", cierre: "Cierre (antes de la despedida)" };
export const DIAS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"];
export const MAX_VOZ = 320, MAX_PANTALLA = 140, MAX_LOGO = 512 * 1024;
const TEXTO_PROHIBIDO = /[úu]ltima hora|noticia|breaking|garantizad|rendimiento seguro|sin riesgo|gana dinero f[aá]cil/i;
const CLAVE_BORRADOR = "gp_patrocinios_borrador";

/** Igual que problemas() de patrocinio.py: lista de motivos por los que la campaña no saldría. */
export function problemas(c, reglas = {}) {
  const out = [];
  if (!String(c.marca || "").trim()) out.push("falta la marca");
  if (!POSICIONES[c.posicion]) out.push("posición inválida (usa apertura, pausa o cierre)");
  const voz = String(c.voz || ""), pantalla = String(c.pantalla || "");
  if (!voz.trim() || voz.length > MAX_VOZ) out.push(`la voz debe tener entre 1 y ${MAX_VOZ} caracteres`);
  if (pantalla.length > MAX_PANTALLA) out.push(`el texto en pantalla pasa de ${MAX_PANTALLA} caracteres`);
  if (TEXTO_PROHIBIDO.test(`${voz} ${pantalla}`)) out.push("el texto se presenta como noticia o promete rendimientos");
  if (c.enlace && !String(c.enlace).startsWith("https://")) out.push("el enlace debe ser https://");
  const prohibidas = new Set((reglas.categorias_prohibidas || []).map((x) => x.toLowerCase()));
  if (prohibidas.has(String(c.categoria || "").toLowerCase())) out.push(`categoría no permitida: ${c.categoria}`);
  if (!c.contrato) out.push("falta la referencia del contrato u orden de inserción");
  if (c.desde && c.hasta && c.desde > c.hasta) out.push("la fecha de fin es anterior a la de inicio");
  return out;
}

const diaSemana = (fecha) => DIAS[(new Date(`${fecha}T12:00:00Z`).getUTCDay() + 6) % 7];

/** Igual que vigentes() de patrocinio.py: campañas que salen en el video de `fecha` (AAAA-MM-DD). */
export function vigentes(cfg, fecha) {
  const reglas = cfg?.reglas || {};
  const out = (cfg?.campanias || []).filter((c) => c.activo && !problemas(c, reglas).length
    && !(c.desde && fecha < c.desde) && !(c.hasta && fecha > c.hasta)
    && !(c.dias?.length && !c.dias.includes(diaSemana(fecha))));
  return out.slice(0, Number(reglas.max_por_video ?? 2));
}

/** Estado de una campaña hoy: con errores, inactiva, programada, al aire, terminada. */
export function estado(c, cfg, hoy) {
  if (problemas(c, cfg?.reglas).length) return { t: "⛔ Con errores (no sale)", cls: "mal" };
  if (!c.activo) return { t: "⏸️ Inactiva", cls: "gris" };
  if (c.hasta && hoy > c.hasta) return { t: "✔️ Terminada", cls: "gris" };
  if (c.desde && hoy < c.desde) return { t: `🗓️ Programada desde ${c.desde}`, cls: "prox" };
  if (vigentes(cfg, hoy).includes(c)) return { t: "🟢 Al aire hoy", cls: "bien" };
  return { t: "🟡 Vigente, hoy no sale (día o tope por video)", cls: "prox" };
}

export function calendario(cfg, desde, dias = 30) {
  const out = [];
  const d0 = new Date(`${desde}T12:00:00Z`);
  for (let i = 0; i < dias; i++) {
    const f = new Date(d0.getTime() + i * 86400000).toISOString().slice(0, 10);
    out.push({ fecha: f, dia: diaSemana(f), marcas: vigentes(cfg, f).map((c) => c.marca) });
  }
  return out;
}

export const vozCompleta = (c) => `Mensaje patrocinado por ${c.marca || "…"}. ${String(c.voz || "").trim()}${c.posicion === "cierre" ? "" : " Fin del mensaje patrocinado. Seguimos con las noticias."}`;
/** Segundos aproximados de voz (unos 15 caracteres por segundo en la voz de Brújula Diaria). */
export const segundosVoz = (texto) => Math.round(String(texto || "").length / 15);
export const slug = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

export function revisarLogo(archivo) {
  if (!archivo) return null;
  const ext = (archivo.name.split(".").pop() || "").toLowerCase();
  if (!["png", "jpg", "jpeg", "svg", "webp"].includes(ext)) return "El logo debe ser PNG, JPG, WEBP o SVG.";
  if (archivo.size > MAX_LOGO) return `El logo pesa ${Math.round(archivo.size / 1024)} KB; el máximo es 512 KB.`;
  return "";
}

export function htmlEscena(c, logoUrl) {
  return `<div class="escena">
    <span class="etq">PUBLICIDAD</span>
    ${logoUrl ? `<img src="${esc(logoUrl)}" alt="">` : `<div class="sin-logo">logo</div>`}
    <div class="marca">${esc(c.marca || "Marca")}</div>
    <div class="texto">${esc(c.pantalla || "")}</div>
    ${c.enlace ? `<div class="url">${esc(String(c.enlace).replace(/^https:\/\//, "").split("?")[0])}</div>` : ""}
  </div>`;
}

/** Archivo final: conserva _instrucciones y reglas, ordena las campañas y limpia campos vacíos. */
export function armarArchivo(cfg) {
  const limpia = (c) => Object.fromEntries(Object.entries(c).filter(([, v]) => v !== "" && v !== null && !(Array.isArray(v) && !v.length)));
  return JSON.stringify({ _instrucciones: cfg._instrucciones, reglas: cfg.reglas, campanias: (cfg.campanias || []).map(limpia) }, null, 2) + "\n";
}

export const urlEditar = (rama = "main") => `https://github.com/${REPO}/edit/${rama}/config/patrocinios.json`;
export const urlSubirLogo = (rama = "main") => `https://github.com/${REPO}/upload/${rama}/assets/patrocinios`;

export async function iniciar(doc = document) {
  const $ = (id) => doc.getElementById(id);
  let original;
  try { original = await (await fetch("config/patrocinios.json", { cache: "no-store" })).json(); } catch { original = { reglas: {}, campanias: [] }; }
  let cfg = structuredClone(original);
  try { const b = localStorage.getItem(CLAVE_BORRADOR); if (b) { cfg = JSON.parse(b); $("pt-borrador").hidden = false; } } catch { /* sin almacenamiento */ }
  const hoy = new Date().toISOString().slice(0, 10);
  let editando = -1, logoUrl = "";

  $("pt-cat").innerHTML = `<option value="">(elige)</option>${["servicios", "tecnologia", "educacion", "seguridad", "consultoria", "medios", "finanzas", "salud", "alimentos", "turismo", "otra"].map((x) => `<option>${x}</option>`).join("")}
    <optgroup label="No permitidas">${(cfg.reglas?.categorias_prohibidas || []).map((x) => `<option disabled>${esc(x)}</option>`).join("")}</optgroup>`;
  $("pt-pos").innerHTML = Object.entries(POSICIONES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
  $("pt-dias").innerHTML = DIAS.map((d) => `<label><input type="checkbox" value="${d}"> ${d}</label>`).join(" ");

  const guardarBorrador = () => { try { localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(cfg)); $("pt-borrador").hidden = false; } catch { /* */ } };
  const leerForm = () => ({
    id: $("pt-id").value.trim() || slug($("pt-marca").value), activo: $("pt-activo").checked, marca: $("pt-marca").value.trim(),
    alias: $("pt-alias").value.split(",").map((x) => x.trim()).filter(Boolean), categoria: $("pt-cat").value, posicion: $("pt-pos").value,
    desde: $("pt-desde").value, hasta: $("pt-hasta").value, dias: [...$("pt-dias").querySelectorAll("input:checked")].map((x) => x.value),
    pantalla: $("pt-pantalla").value.trim(), voz: $("pt-voz").value.trim(), enlace: $("pt-enlace").value.trim(), logo: $("pt-logo-ruta").value.trim(),
    contrato: $("pt-contrato").value.trim(),
  });
  const llenarForm = (c = {}) => {
    $("pt-id").value = c.id || ""; $("pt-activo").checked = !!c.activo; $("pt-marca").value = c.marca || ""; $("pt-alias").value = (c.alias || []).join(", ");
    $("pt-cat").value = c.categoria || ""; $("pt-pos").value = c.posicion || "pausa"; $("pt-desde").value = c.desde || ""; $("pt-hasta").value = c.hasta || "";
    $("pt-dias").querySelectorAll("input").forEach((x) => { x.checked = (c.dias || []).includes(x.value); });
    $("pt-pantalla").value = c.pantalla || ""; $("pt-voz").value = c.voz || ""; $("pt-enlace").value = c.enlace || "";
    $("pt-logo-ruta").value = c.logo || ""; $("pt-contrato").value = c.contrato || "";
    logoUrl = c.logo ? c.logo : ""; vista();
  };
  const vista = () => {
    const c = leerForm(), p = problemas(c, cfg.reglas);
    $("pt-escena").innerHTML = htmlEscena(c, logoUrl);
    const voz = vozCompleta(c);
    $("pt-voz-completa").innerHTML = `<b>La voz dirá (≈ ${segundosVoz(voz)} s):</b> ${esc(voz)}`;
    $("pt-cuenta").textContent = `Voz: ${c.voz.length}/${MAX_VOZ} · Pantalla: ${c.pantalla.length}/${MAX_PANTALLA}`;
    $("pt-problemas").innerHTML = p.length ? `<ul class="mal">${p.map((x) => `<li>⛔ ${esc(x)}</li>`).join("")}</ul>` : `<p class="bien">✅ Cumple las reglas del video.</p>`;
  };
  const pintar = () => {
    $("pt-lista").innerHTML = (cfg.campanias || []).map((c, i) => {
      const e = estado(c, cfg, hoy), p = problemas(c, cfg.reglas);
      return `<div class="tarjeta camp ${e.cls}"><b>${esc(c.marca || "(sin marca)")}</b> <span class="chip">${esc(e.t)}</span>
        <span class="meta">${esc(POSICIONES[c.posicion] || c.posicion || "")} · ${esc(c.desde || "…")} a ${esc(c.hasta || "…")}${c.dias?.length ? ` · ${esc(c.dias.join(", "))}` : ""}${c.contrato ? ` · contrato ${esc(c.contrato)}` : ""}</span>
        ${p.length ? `<div class="meta mal">${p.map(esc).join(" · ")}</div>` : ""}
        <div class="barra"><button data-ed="${i}">✏️ Editar</button><button data-dup="${i}">📄 Duplicar</button><button data-on="${i}">${c.activo ? "⏸️ Pausar" : "▶️ Activar"}</button><button data-del="${i}">🗑️ Quitar</button></div></div>`;
    }).join("") || `<p class="meta">No hay campañas.</p>`;
    const cal = calendario(cfg, hoy, 30);
    $("pt-cal").innerHTML = `<table class="tabla-ficha"><tr><th>Fecha</th><th>Día</th><th>Patrocinios en el video</th></tr>${cal.map((d) => `<tr><td>${d.fecha}</td><td>${d.dia}</td><td>${d.marcas.length ? esc(d.marcas.join(" + ")) : `<span class="meta">sin patrocinio</span>`}</td></tr>`).join("")}</table>`;
    const dias = cal.filter((d) => d.marcas.length).length;
    $("pt-resumen").textContent = `${(cfg.campanias || []).filter((c) => c.activo).length} campañas activas · ${dias} de los próximos 30 videos llevan patrocinio · máximo ${cfg.reglas?.max_por_video ?? 2} por video.`;
  };
  $("pt-lista").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const camps = cfg.campanias;
    if (b.dataset.ed) { editando = Number(b.dataset.ed); llenarForm(camps[editando]); $("pt-form").open = true; $("pt-form").scrollIntoView({ behavior: "smooth" }); return; }
    if (b.dataset.dup) camps.push({ ...structuredClone(camps[b.dataset.dup]), id: `${camps[b.dataset.dup].id || "camp"}-copia`, activo: false });
    if (b.dataset.on) camps[b.dataset.on].activo = !camps[b.dataset.on].activo;
    if (b.dataset.del && confirm(`¿Quitar la campaña «${camps[b.dataset.del].marca}» de la lista? (Se aplica cuando propongas el cambio en GitHub.)`)) camps.splice(Number(b.dataset.del), 1);
    guardarBorrador(); pintar();
  });
  $("pt-nueva").addEventListener("click", () => { editando = -1; llenarForm({ posicion: "pausa", desde: hoy, enlace: "https://?utm_source=youtube&utm_medium=video&utm_campaign=brujula_diaria" }); $("pt-form").open = true; });
  $("pt-form").addEventListener("input", vista);
  $("pt-logo").addEventListener("change", (e) => {
    const f = e.target.files?.[0], err = revisarLogo(f);
    $("pt-logo-msg").textContent = err || (f ? `Listo. Súbelo a GitHub con el nombre ${slug($("pt-marca").value) || "marca"}.${f.name.split(".").pop().toLowerCase()} (botón «Subir logo»).` : "");
    if (f && !err) { logoUrl = URL.createObjectURL(f); $("pt-logo-ruta").value = `assets/patrocinios/${slug($("pt-marca").value) || "marca"}.${f.name.split(".").pop().toLowerCase()}`; }
    vista();
  });
  $("pt-aplicar").addEventListener("click", () => {
    const c = leerForm();
    if (editando >= 0) cfg.campanias[editando] = c; else cfg.campanias.push(c);
    editando = -1; guardarBorrador(); pintar(); $("pt-form").open = false;
    $("pt-msg").textContent = "Campaña aplicada a la lista. Cuando termines, usa «Proponer el cambio en GitHub».";
  });
  $("pt-proponer").addEventListener("click", async () => {
    const txt = armarArchivo(cfg);
    try { await navigator.clipboard.writeText(txt); $("pt-msg").textContent = "✅ Copiado. En GitHub: selecciona todo el contenido (Ctrl+A), pega (Ctrl+V), «Commit changes…» → «Create a new branch… and start a pull request» → «Propose changes»."; }
    catch { $("pt-msg").textContent = "No se pudo copiar: usa «Descargar JSON» y pega el contenido en GitHub."; }
    window.open(urlEditar(), "_blank", "noopener");
  });
  $("pt-descargar").addEventListener("click", () => {
    const a = doc.createElement("a"); a.href = URL.createObjectURL(new Blob([armarArchivo(cfg)], { type: "application/json" })); a.download = "patrocinios.json"; a.click();
  });
  $("pt-subir-logo").href = urlSubirLogo();
  $("pt-descartar").addEventListener("click", () => { try { localStorage.removeItem(CLAVE_BORRADOR); } catch { /* */ } cfg = structuredClone(original); $("pt-borrador").hidden = true; pintar(); });
  // Contrato: borrador desde el formulario y análisis de un archivo (todo en el navegador).
  let datosContrato = null;
  $("pt-borrador-contrato").addEventListener("click", async () => {
    const { borradorContrato } = await import("./contrato_patrocinio.js");
    const html = borradorContrato(leerForm());
    const a = doc.createElement("a"); a.href = URL.createObjectURL(new Blob([html], { type: "application/msword" })); a.download = `contrato-${slug($("pt-marca").value) || "patrocinio"}.doc`; a.click();
    const w = window.open("", "_blank"); if (w) { w.document.write(html); w.document.close(); }
    $("pt-contrato-estado").textContent = "Borrador descargado (.doc, se abre en Word) y abierto en otra pestaña (Ctrl+P → Guardar como PDF).";
  });
  $("pt-contrato-archivo").addEventListener("change", async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const est = (t) => { $("pt-contrato-estado").textContent = t; };
    est("Leyendo el contrato en este navegador…"); $("pt-contrato-resultado").innerHTML = "";
    try {
      const C = await import("./contrato_patrocinio.js");
      const { texto, via } = await C.textoArchivo(f, est);
      if (texto.replace(/\s/g, "").length < 200) { est("Casi no se pudo leer texto. Si es un escaneo de baja calidad, prueba con una foto más nítida o un PDF con texto."); return; }
      const a = C.analizar(texto);
      $("pt-contrato-resultado").innerHTML = C.htmlAnalisis(a, via);
      datosContrato = a.datos; $("pt-contrato-usar").hidden = !(a.datos.desde || a.datos.contrato);
      est(`Análisis listo: ${f.name}.`);
    } catch (err) { est(`⛔ ${err.message}`); }
    e.target.value = "";
  });
  $("pt-contrato-usar").addEventListener("click", () => {
    if (!datosContrato) return;
    if (datosContrato.desde) $("pt-desde").value = datosContrato.desde;
    if (datosContrato.hasta) $("pt-hasta").value = datosContrato.hasta;
    if (datosContrato.contrato) $("pt-contrato").value = datosContrato.contrato;
    $("pt-form").open = true; vista();
  });
  pintar(); llenarForm({ posicion: "pausa" });
}

if (typeof document !== "undefined" && document.getElementById("pt-lista")) iniciar();
