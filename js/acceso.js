// Página «Entrar a DOMINUS» (acceso.html): entrar con correo y contraseña, o activar la cuenta con el enlace
// (#activar=TOKEN, que también acepta invitaciones de empresa). Habla con /cuenta/acceso/ del Worker.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const API = location.hostname === "admin.dominusosint.com" ? "/cuenta/acceso/" : "https://admin.dominusosint.com/cuenta/acceso/";

/** Página a la que se vuelve después de entrar: solo páginas propias (nunca otro sitio). */
export function destino(param) {
  const p = String(param || "");
  return /^[a-z0-9-]+\.html$/.test(p) ? p : "empresa.html";
}

async function post(ruta, cuerpo) {
  const r = await fetch(API + ruta, { method: "POST", credentials: "include", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(cuerpo) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

if (typeof document !== "undefined" && $("f-entrar")) {
  const h = new URLSearchParams(location.hash.slice(1)), q = new URLSearchParams(location.search);
  const token = h.get("activar") || h.get("inv");
  const volver = destino(q.get("volver") || h.get("volver"));
  if (token) {
    $("f-activar").hidden = false;
    $("f-activar").addEventListener("submit", async (e) => {
      e.preventDefault();
      if ($("ac-pw").value !== $("ac-pw2").value) { $("ac-msg").innerHTML = '<span class="error">Las contraseñas no coinciden.</span>'; return; }
      $("ac-msg").textContent = "Guardando…";
      try {
        await post("activar", { token, contrasena: $("ac-pw").value, nombre: $("ac-nombre").value });
        history.replaceState(null, "", location.pathname);
        $("ac-msg").innerHTML = '<span class="ok">✔ Listo. Entrando…</span>';
        location.href = volver;
      } catch (err) { $("ac-msg").innerHTML = `<span class="error">${esc(err.message)}</span>`; }
    });
  } else {
    $("f-entrar").hidden = false;
    $("f-entrar").addEventListener("submit", async (e) => {
      e.preventDefault();
      $("en-msg").textContent = "Entrando…";
      try { await post("entrar", { email: $("en-email").value, contrasena: $("en-pw").value }); location.href = volver; }
      catch (err) { $("en-msg").innerHTML = `<span class="error">${esc(err.message)}</span>`; }
    });
  }
}
