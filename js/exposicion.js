// ¿Mi contraseña aparece en filtraciones? Usa «Pwned Passwords» de Have I Been Pwned (HIBP) con anonimato k:
// 1. El navegador calcula el SHA-1 de la contraseña (nunca se envía la contraseña).
// 2. Solo se envían los primeros 5 caracteres del hash; HIBP responde ~800 terminaciones que empiezan igual.
// 3. La comparación del resto del hash se hace aquí. HIBP no puede saber qué contraseña se revisó.
// Se pide con «Add-Padding: true» para que el tamaño de la respuesta tampoco dé pistas. Nada se guarda.
// Datos: Have I Been Pwned (Troy Hunt), licencia CC BY 4.0.

export const API = "https://api.pwnedpasswords.com/range/";

export async function sha1Hex(texto) {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** Respuesta de /range (líneas «SUFIJO:conteo») → veces que aparece el sufijo (0 si no está; el relleno trae conteo 0). */
export function vecesEnRango(respuesta, sufijo) {
  for (const linea of String(respuesta).split(/\r?\n/)) {
    const [suf, n] = linea.trim().split(":");
    if (suf === sufijo) return Number(n) || 0;
  }
  return 0;
}

export async function revisar(contrasena, fetcher = fetch) {
  const h = await sha1Hex(contrasena);
  const r = await fetcher(API + h.slice(0, 5), { headers: { "Add-Padding": "true" } });
  if (!r.ok) throw new Error(`HIBP respondió ${r.status}`);
  return { veces: vecesEnRango(await r.text(), h.slice(5)), prefijo: h.slice(0, 5) };
}

export function htmlResultado({ veces, prefijo }) {
  const enviado = `<p class="meta">Se envió solo el inicio del hash SHA-1 (<code>${prefijo}</code>), no tu contraseña.</p>`;
  if (!veces) {
    return `<div class="efectos" style="--c:#2E9E6E"><b>No aparece en las filtraciones conocidas por Have I Been Pwned.</b>
      <p>Eso no la hace segura: si es corta, una palabra común o la usas en varios sitios, cámbiala igual.</p>${enviado}</div>`;
  }
  return `<div class="efectos" style="--c:#C62828"><b>Esta contraseña aparece ${veces.toLocaleString("es-MX")} veces en filtraciones públicas.</b>
    <ul><li>Cámbiala en todos los sitios donde la uses, empezando por correo y banca.</li>
    <li>Usa una contraseña distinta por sitio (un gestor de contraseñas ayuda) y activa la verificación en dos pasos.</li>
    <li>Quien tenga listas filtradas la prueba primero en ataques de «relleno de credenciales».</li></ul>${enviado}</div>`;
}
