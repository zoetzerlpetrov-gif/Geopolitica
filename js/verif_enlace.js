// Verificador de enlaces (Herramientas): pegas un link y dice si tiene señales de fraude, phishing o descarga peligrosa.
// El enlace NUNCA se abre ni se visita. Todo se analiza en el navegador; lo único que sale es el NOMBRE del dominio hacia
// RDAP (registro público de dominios, rdap.org) para saber hace cuánto se creó: un dominio de días es la señal más
// fuerte de fraude. Los botones de VirusTotal, Google y urlscan comparten el enlace con ese servicio solo si los abres.
import { revisarEnlaces } from "./verificador.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Sufijos de dos niveles más comunes (para saber cuál es el dominio que alguien registró).
const SUFIJOS_2 = new Set(["com.mx", "gob.mx", "org.mx", "edu.mx", "net.mx", "mx.com", "co.uk", "org.uk", "gov.uk", "ac.uk", "com.br", "gov.br", "com.ar",
  "gob.ar", "com.co", "gov.co", "com.pe", "gob.pe", "cl.cl", "gob.cl", "com.es", "com.au", "co.jp", "co.in", "com.cn", "com.tr", "co.za", "com.ve", "gob.ve"]);
// Servicios gratuitos de alojamiento, formularios y túneles que se usan mucho para montar páginas falsas.
const GRATUITOS = ["000webhostapp.com", "weebly.com", "wixsite.com", "firebaseapp.com", "web.app", "pages.dev", "workers.dev", "netlify.app", "vercel.app",
  "github.io", "glitch.me", "repl.co", "ngrok-free.app", "ngrok.io", "trycloudflare.com", "duckdns.org", "blogspot.com", "sites.google.com", "forms.gle",
  "typeform.com", "jotform.com", "webflow.io", "square.site", "carrd.co", "ipfs.io", "r2.dev", "surge.sh", "onrender.com", "herokuapp.com"];
const EJECUTABLES = /\.(exe|msi|scr|bat|cmd|com|pif|vbs|js|jar|apk|xapk|ipa|dmg|pkg|ps1|hta|lnk|iso|img)$/i;
const SENSIBLES = /(log-?in|sign-?in|verif|secur|seguridad|account|cuenta|update|actualiz|desbloq|unlock|suspend|banca|bank|wallet|billetera|password|contrase|pago|payment|factura|reembolso|refund|premio|prize)/i;
const OFICIALES_GOB = /\.(gob\.mx|gov|gob\.[a-z]{2}|gov\.[a-z]{2}|mil)$/i;

export function dominioRegistrable(host) {
  const p = String(host || "").toLowerCase().replace(/\.$/, "").split(".");
  if (p.length <= 2 || /^\d+$/.test(p[p.length - 1])) return p.join(".");
  return SUFIJOS_2.has(p.slice(-2).join(".")) ? p.slice(-3).join(".") : p.slice(-2).join(".");
}

/** Señales del enlace sin consultar nada: [{t, peso}]. */
export function analizarEnlace(texto) {
  const crudo = String(texto || "").trim();
  if (!crudo) return { vacio: true };
  if (/^(javascript|data|vbscript|file):/i.test(crudo)) {
    return { url: crudo, host: "", dominio: "", senales: [{ t: "No es una página web: es código o un archivo incrustado en el enlace (puede ejecutar acciones al abrirlo)", peso: 5 }], buenas: [] };
  }
  let u;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(crudo) ? crudo : `http://${crudo}`); } catch { return { invalido: true, url: crudo }; }
  const host = u.hostname.toLowerCase(), dominio = dominioRegistrable(host);
  const base = revisarEnlaces(u.href)[0] || { senales: [] };
  const senales = base.senales.map((t) => ({ t, peso: /^Imita|no es su dominio oficial|punycode|IP en vez/.test(t) ? 4 : /acortado|«@»/.test(t) ? 2 : 1 }));
  const s = (t, peso) => senales.push({ t, peso });
  if (/^\d+(\.\d+){3}$/.test(host) || host.startsWith("[")) s("Usa una dirección IP en vez de un nombre de dominio (los sitios legítimos casi nunca lo hacen)", 4);
  if (u.port && !["80", "443"].includes(u.port)) s(`Usa un puerto poco común (:${u.port})`, 1);
  if (host.split(".").length >= 5) s("Tiene muchos subdominios (truco para que el principio parezca de una marca conocida)", 1);
  const gratis = GRATUITOS.find((g) => host === g || host.endsWith(`.${g}`));
  if (gratis) s(`Está alojado en un servicio gratuito (${gratis}) que también se usa para montar páginas falsas`, 2);
  const archivo = decodeURIComponent(u.pathname.split("/").pop() || "");
  if (EJECUTABLES.test(archivo)) s(`Descarga un archivo que se instala o ejecuta (${archivo.split(".").pop()}): no lo abras si no lo esperabas`, 3);
  if (/\.(pdf|docx?|xlsx?|jpg|png|mp4|txt)\.[a-z0-9]{2,4}$/i.test(archivo)) s("Archivo con doble extensión (p. ej. factura.pdf.exe): se disfraza de documento", 4);
  if (SENSIBLES.test(u.hostname + u.pathname) && !OFICIALES_GOB.test(host) && senales.length) s("Pide iniciar sesión, verificar, pagar o desbloquear algo en un sitio con otras señales", 2);
  if ([...u.searchParams.values()].some((v) => /^(https?:)?\/\//i.test(v) || /^https?%3A/i.test(v))) s("Lleva otra dirección dentro: puede redirigirte a un sitio distinto", 2);
  if (crudo.length > 150) s("Enlace muy largo (puede esconder el destino real)", 1);
  if ((crudo.match(/%[0-9a-f]{2}/gi) || []).length >= 8) s("Muchos caracteres codificados (%xx) que ocultan el texto real", 1);
  const buenas = [];
  if (u.protocol === "https:") buenas.push("Usa conexión cifrada (https). Ojo: los sitios falsos también pueden tenerla.");
  if (OFICIALES_GOB.test(host)) buenas.push(`Termina en un dominio de gobierno (${host.split(".").slice(-2).join(".")}).`);
  return { url: u.href, host, dominio, senales, buenas };
}

/** RDAP: fecha de creación del dominio. {dias, creado} | {noRegistrado} | {noDisponible}. */
export async function edadDominio(dominio, pedir = fetch, hoy = new Date()) {
  if (!dominio || /\.mx$/.test(dominio) || /^\d+(\.\d+){3}$/.test(dominio)) return { noDisponible: true };
  try {
    const r = await pedir(`https://rdap.org/domain/${encodeURIComponent(dominio)}`, { headers: { Accept: "application/rdap+json" } });
    if (r.status === 404) return { noRegistrado: true };
    if (!r.ok) return { noDisponible: true };
    const d = await r.json();
    const ev = (d.events || []).find((e) => /registration/i.test(e.eventAction || ""));
    if (!ev?.eventDate) return { noDisponible: true };
    const dias = Math.floor((hoy - new Date(ev.eventDate)) / 86400000);
    return { dias, creado: ev.eventDate.slice(0, 10) };
  } catch { return { noDisponible: true }; }
}

export function conEdad(r, edad) {
  const senales = [...r.senales], buenas = [...r.buenas];
  if (edad?.noRegistrado) senales.push({ t: "El dominio no aparece registrado (no existe o se dio de baja): no confíes en el enlace", peso: 3 });
  else if (edad?.dias != null) {
    if (edad.dias < 30) senales.push({ t: `El dominio se creó hace ${edad.dias} días (${edad.creado}): los fraudes usan dominios recién creados`, peso: 4 });
    else if (edad.dias < 180) senales.push({ t: `El dominio es reciente: se creó hace ${edad.dias} días (${edad.creado})`, peso: 2 });
    else buenas.push(`El dominio existe desde ${edad.creado} (${Math.floor(edad.dias / 365)} años).`);
  }
  const puntos = senales.reduce((a, x) => a + x.peso, 0);
  const nivel = senales.some((x) => x.peso >= 4) || puntos >= 5 ? "alto" : puntos >= 2 ? "medio" : "bajo";
  return { ...r, senales, buenas, puntos, nivel, edad };
}

const NIVEL = { alto: ["🔴 Riesgo alto: no lo abras", "#C62828"], medio: ["🟠 Sospechoso: verifica antes de abrirlo", "#E2711D"], bajo: ["🟢 Sin señales fuertes", "#2E9E6E"] };

export function htmlEnlace(r) {
  if (r.vacio) return `<p class="meta">Pega primero el enlace.</p>`;
  if (r.invalido) return `<p class="meta">Eso no parece un enlace válido.</p>`;
  const [t, c] = NIVEL[r.nivel] || NIVEL.bajo;
  const q = encodeURIComponent(r.url);
  const edadTxt = r.edad?.noDisponible ? `<p class="meta">Fecha de registro del dominio: no disponible${/\.mx$/.test(r.dominio) ? " (los dominios .mx no publican esta información en RDAP; consúltala en whois.mx)" : ""}.</p>` : "";
  return `<p><span class="chip" style="background:${c};color:#fff;border-color:${c}">${t}</span></p>
    <p>Dominio: <code>${esc(r.dominio || r.host)}</code>${r.host && r.host !== r.dominio ? ` <span class="meta">(dirección completa: ${esc(r.host)})</span>` : ""}</p>
    ${r.senales.length ? `<ul class="verif-lista">${r.senales.sort((a, b) => b.peso - a.peso).map((x) => `<li>${x.peso >= 4 ? "⛔" : x.peso >= 2 ? "⚠️" : "•"} ${esc(x.t)}</li>`).join("")}</ul>` : `<p class="meta">No se encontraron señales de riesgo en la dirección. Eso no garantiza que el sitio sea seguro.</p>`}
    ${r.buenas.length ? `<ul class="verif-lista">${r.buenas.map((x) => `<li>✅ ${esc(x)}</li>`).join("")}</ul>` : ""}${edadTxt}
    <p><b>Revisar en servicios de reputación</b> <span class="meta">(al abrirlos, el enlace se comparte con ese servicio):</span><br>
      <a href="https://www.virustotal.com/gui/search/${q}" target="_blank" rel="noopener noreferrer">VirusTotal</a> ·
      <a href="https://transparencyreport.google.com/safe-browsing/search?url=${q}" target="_blank" rel="noopener noreferrer">Google Safe Browsing</a> ·
      <a href="https://urlscan.io/search/#${encodeURIComponent(r.dominio || r.host)}" target="_blank" rel="noopener noreferrer">urlscan.io</a> ·
      <a href="https://www.urlvoid.com/scan/${encodeURIComponent(r.dominio || r.host)}/" target="_blank" rel="noopener noreferrer">URLVoid</a></p>
    <p class="meta">El enlace no se abrió: se analizó la dirección en tu navegador y solo el nombre del dominio se consultó en el registro público RDAP. Si ya lo abriste y diste datos: cambia tus contraseñas, llama a tu banco por el número de tu tarjeta y denuncia en el 088 (Guardia Nacional) o en CONDUSEF.</p>`;
}

export function iniciarVerifEnlace(form, salida) {
  if (!form || !salida) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const r = analizarEnlace(form.querySelector("input").value);
    if (r.vacio || r.invalido) { salida.innerHTML = htmlEnlace(r); return; }
    salida.innerHTML = htmlEnlace(conEdad(r, null)) + `<p class="meta">Consultando la fecha de registro del dominio…</p>`;
    salida.innerHTML = htmlEnlace(conEdad(r, await edadDominio(r.dominio)));
  });
}
