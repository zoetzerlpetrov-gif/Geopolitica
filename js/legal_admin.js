// Datos legales (legal.html, solo admin): formulario con vista previa en vivo de las páginas reales de Privacidad y
// Términos (iframe + postMessage) y botón «Guardar y publicar» que escribe en el Worker (/admin/huella/legal, con la
// sesión de administración). Las páginas públicas leen los datos guardados al abrirse: el cambio se ve en la web en
// menos de un minuto. Debe abrirse desde 🔐 Acceso administrativo (dominio del Worker) para poder guardar.

export const CAMPOS = [
  ["tipo_persona", "Tipo de persona", "select", "Física (tú) o moral (p. ej. una S.A.S.)", [["", "(elige)"], ["fisica", "Persona física"], ["moral", "Persona moral (sociedad)"]]],
  ["razon_social", "Nombre o razón social del responsable", "text", "p. ej. DOMINUS OSINT, S.A.S. de C.V."],
  ["nombre_comercial", "Nombre comercial", "text", "Lo que ve el público"],
  ["rfc", "RFC (opcional; aparece en Términos)", "text", "12 caracteres (moral) o 13 (física)"],
  ["domicilio", "Domicilio para oír y recibir notificaciones", "textarea", "Calle, número, colonia, alcaldía o municipio, estado, C.P. Puede ser el de una oficina virtual."],
  ["correo_privacidad", "Correo de privacidad (derechos ARCO)", "email", "privacidad@dominusosint.com"],
  ["correo_contacto", "Correo de contacto (Términos y soporte)", "email", "contacto@dominusosint.com"],
  ["telefono", "Teléfono (opcional; PROFECO pide un medio de contacto)", "text", "+52 55 …"],
  ["departamento_datos", "Persona o área a cargo de los datos personales", "text", "Puede ser un área, no un nombre"],
  ["jurisdiccion", "Tribunales competentes (Términos)", "text", "la Ciudad de México"],
  ["representante_ue", "Representante en la UE / Reino Unido (solo si vendes de forma dirigida allá)", "textarea", "Déjalo vacío si no aplica"],
  ["sitio", "Sitio", "text", "https://dominusosint.com/"],
  ["actualizado_privacidad", "Fecha de última actualización del aviso de privacidad", "date", ""],
  ["actualizado_terminos", "Fecha de última actualización de los términos", "date", ""],
];

/** Revisión rápida en el navegador (el Worker vuelve a validar al guardar). */
export function revisar(d) {
  const avisos = [];
  if (!d.razon_social) avisos.push("Falta el nombre o razón social: la ley pide la identidad del responsable.");
  if (!d.domicilio) avisos.push("Falta el domicilio: la ley pide el domicilio del responsable (puede ser el de una oficina virtual).");
  if (!d.correo_privacidad) avisos.push("Falta el correo para derechos ARCO.");
  if (d.rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(d.rfc)) avisos.push("El RFC no tiene el formato esperado.");
  for (const k of ["correo_privacidad", "correo_contacto"]) if (d[k] && !/^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(d[k])) avisos.push(`El correo «${d[k]}» no parece válido.`);
  if (d.tipo_persona === "fisica" && d.razon_social && /S\.?\s?A\.?\s?S|S\.?\s?A\.? de C\.?V/i.test(d.razon_social)) avisos.push("Elegiste persona física pero el nombre parece de una sociedad.");
  return avisos;
}

export const puedeGuardar = (loc) => /\.workers\.dev$/.test(loc.hostname);

export async function iniciar(doc = document) {
  const $ = (id) => doc.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  $("lg-form").innerHTML = CAMPOS.map(([k, t, tipo, ayuda, ops]) => `<label class="campo"><span>${esc(t)}</span>${
    tipo === "select" ? `<select name="${k}">${ops.map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join("")}</select>`
      : tipo === "textarea" ? `<textarea name="${k}" placeholder="${esc(ayuda)}"></textarea>`
        : `<input name="${k}" type="${tipo === "email" ? "email" : tipo === "date" ? "date" : "text"}" placeholder="${esc(ayuda)}">`}${tipo !== "textarea" && ayuda && tipo !== "date" ? "" : ""}</label>`).join("");
  const leer = () => Object.fromEntries(CAMPOS.map(([k]) => [k, String($("lg-form").elements[k].value || "").trim()]));
  const poner = (d) => { for (const [k] of CAMPOS) $("lg-form").elements[k].value = d?.[k] ?? ""; };

  let base = {}, cfg = {};
  try { cfg = await (await fetch("config/legal.json", { cache: "no-store" })).json(); base = cfg.datos || {}; } catch { /* */ }
  let guardado = null;
  const enWorker = puedeGuardar(location);
  if (enWorker) {
    try { const r = await fetch("/admin/huella/legal", { cache: "no-store" }); if (r.ok) guardado = (await r.json()).datos; else if (r.status === 403) $("lg-estado").textContent = "Tu sesión de administración venció: vuelve a entrar en 🔐 Acceso administrativo."; } catch { /* */ }
  } else {
    $("lg-aviso").hidden = false;
    $("lg-ir").href = cfg.editar_en || "#";
  }
  poner({ ...base, ...(guardado || {}) });

  const vista = () => {
    const d = leer();
    for (const f of [$("lg-privacidad"), $("lg-terminos")]) f.contentWindow?.postMessage({ tipo: "legal-vista", datos: d }, location.origin);
    const av = revisar(d);
    $("lg-revision").innerHTML = av.length ? `<ul>${av.map((x) => `<li>⚠️ ${esc(x)}</li>`).join("")}</ul>` : `<p>✅ Contiene lo mínimo que piden la LFPDPPP (identidad, domicilio y medio ARCO) y la LFPC (contacto).</p>`;
  };
  $("lg-form").addEventListener("input", vista);
  for (const f of [$("lg-privacidad"), $("lg-terminos")]) f.addEventListener("load", vista);
  $("lg-pestanas").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-p]"); if (!b) return;
    $("lg-privacidad").hidden = b.dataset.p !== "privacidad"; $("lg-terminos").hidden = b.dataset.p !== "terminos";
    for (const x of $("lg-pestanas").querySelectorAll("button")) x.classList.toggle("activo", x === b);
  });
  $("lg-hoy").addEventListener("click", () => { const h = new Date().toISOString().slice(0, 10); $("lg-form").elements.actualizado_privacidad.value = h; $("lg-form").elements.actualizado_terminos.value = h; vista(); });
  $("lg-guardar").addEventListener("click", async () => {
    if (!enWorker) { $("lg-estado").textContent = "Para guardar, abre esta página desde 🔐 Acceso administrativo."; return; }
    $("lg-estado").textContent = "Guardando…";
    try {
      const r = await fetch("/admin/huella/legal", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(leer()) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { $("lg-estado").textContent = `❌ No se guardó: ${j.error || r.status}`; return; }
      $("lg-estado").textContent = `✅ Guardado ${new Date().toLocaleString("es-MX")}. Las páginas públicas lo muestran en menos de un minuto.`;
    } catch { $("lg-estado").textContent = "❌ No se pudo conectar con el Worker."; }
  });
  vista();
}

if (typeof document !== "undefined" && document.getElementById("lg-form")) iniciar();
