// Verificador de mensajes sospechosos (SMS, WhatsApp, correo): busca señales de fraude, phishing, extorsión
// telefónica y «secuestro virtual», y revisa los enlaces que trae el texto. Todo ocurre en el navegador: el
// mensaje no se envía ni se guarda. Es una ayuda para decidir, no un dictamen: un mensaje sin señales también
// puede ser fraude.

const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// [id, nombre, peso, expresión (sin acentos), explicación]
export const SENALES = [
  ["urgencia", "Urgencia o amenaza de bloqueo", 2, /urgente|inmediat|ultimo aviso|en las proximas \d+ ?(h|horas)|hoy mismo|(cuenta|tarjeta|servicio) (sera|ha sido|fue) (bloquead|suspendid|cancelad|cerrad)|act now|immediately|account (will be )?(suspended|locked)/,
    "Presionar con prisa es la táctica más común: busca que actúes sin verificar."],
  ["datos", "Pide NIP, contraseña, token o códigos", 3, /\bnip\b|\bpin\b|contrasena|clave (de acceso|dinamica|bancaria)|\btoken\b|\bcvv\b|codigo (de verificacion|que te (llego|llegara)|por sms)|password|verification code|one.time code/,
    "Ningún banco, tienda ni autoridad pide estos datos por mensaje o llamada."],
  ["pago", "Pide depósito, transferencia, tarjetas de regalo o criptomonedas", 3, /deposit|transferencia|\bspei\b|\boxxo\b|tarjeta de regalo|gift card|criptomoneda|bitcoin|\busdt\b|western union|pago (de|por) (liberacion|envio|aduana|comision)/,
    "Pagar para «liberar» un premio, un paquete o a una persona es señal típica de estafa o extorsión."],
  ["premio", "Premio, sorteo, reembolso o regalo inesperado", 2, /ganaste|ganador|premio|sorteo|regalo|bono (de|del)|reembolso|you (have )?won|winner|prize|refund/,
    "Si no participaste en nada, no puedes haber ganado."],
  ["secuestro_virtual", "Guion de extorsión telefónica o «secuestro virtual»", 4, /tenemos a tu (hij|famil|espos|mama|papa)|no cuelgues|no (avises|le digas) a (la policia|nadie)|somos (del|de la) (cartel|mana|organizacion|empresa)|cobro de piso|si no (pagas|depositas)|sabemos donde (vives|trabajas)|estas siendo vigilad/,
    "Guion típico de extorsión: cuelga, comunícate directamente con tu familiar y llama al 089 o al 911."],
  ["autoridad", "Dice ser autoridad (SAT, IMSS, policía, fiscalía) o pide pagar una multa", 2, /\bsat\b|hacienda|\bimss\b|policia cibernetica|fiscalia|orden de (aprehension|arresto)|multa|citatorio|\birs\b|\bfbi\b/,
    "Las autoridades no cobran multas ni piden datos por WhatsApp o SMS; verifica en su sitio oficial."],
  ["paqueteria", "Paquete retenido o pago de envío", 2, /tu paquete|paquete (retenido|pendiente)|guia de (envio|rastreo)|entrega (pendiente|fallida)|aduana|pago de envio|package (on hold|delivery)|delivery (failed|attempt)/,
    "Estafa frecuente con nombres de DHL, Estafeta, FedEx o Correos de México."],
  ["empleo_inversion", "Trabajo fácil o inversión con ganancias garantizadas", 2, /gana desde casa|trabajo desde casa|dar likes|calificar (productos|hoteles)|inversion garantizada|rendimientos? (del|de) \d+ ?%|duplica tu dinero|ganancias? (diarias|garantizadas)|guaranteed returns/,
    "Nadie paga por dar «likes» ni garantiza rendimientos altos; suelen pedir un depósito inicial."],
  ["nuevo_numero", "«Cambié de número» o se hace pasar por un familiar", 2, /cambie de (numero|cel)|este es mi nuevo numero|hola (mama|papa|ma|pa)\b.*(numero|ayuda|deposit)|new number/,
    "Antes de mandar dinero, llama al número que ya tenías de esa persona."],
  ["romance_chantaje", "Chantaje con fotos o videos íntimos (sextorsión)", 4, /fotos? (intimas|desnud)|video (intimo|tuyo)|lo (publicare|subire|mandare a tus contactos)|sextorsi|tengo tus (fotos|videos)/,
    "No pagues ni respondas; guarda evidencia y denuncia (088 en México). Pagar no detiene el chantaje."],
];

// Marcas que más se suplantan en México (se compara el nombre con el dominio del enlace).
const MARCAS = { bbva: ["bbva.mx", "bbva.com"], banamex: ["banamex.com"], santander: ["santander.com.mx"], banorte: ["banorte.com"], hsbc: ["hsbc.com.mx"],
  scotiabank: ["scotiabank.com.mx"], azteca: ["bancoazteca.com.mx"], coppel: ["coppel.com", "bancoppel.com"], sat: ["sat.gob.mx"], imss: ["imss.gob.mx"],
  cfe: ["cfe.mx"], telcel: ["telcel.com"], dhl: ["dhl.com", "dhl.com.mx"], fedex: ["fedex.com"], estafeta: ["estafeta.com"], correos: ["correosdemexico.gob.mx"],
  amazon: ["amazon.com", "amazon.com.mx"], mercadolibre: ["mercadolibre.com.mx", "mercadopago.com.mx"], paypal: ["paypal.com"], netflix: ["netflix.com"],
  apple: ["apple.com", "icloud.com"], microsoft: ["microsoft.com", "live.com", "office.com"], whatsapp: ["whatsapp.com"], google: ["google.com"] };
const ACORTADORES = new Set(["bit.ly", "tinyurl.com", "t.co", "goo.gl", "cutt.ly", "is.gd", "ow.ly", "rb.gy", "shorturl.at", "acortar.link", "tiny.cc", "s.id", "rebrand.ly"]);
const TLD_RIESGO = new Set(["xyz", "top", "click", "icu", "buzz", "monster", "rest", "cyou", "cfd", "sbs", "lol", "quest", "zip", "mov", "work", "support"]);

/** Enlaces del texto (con o sin http) → [{url, host, señales:[texto]}]. */
export function revisarEnlaces(texto) {
  const out = [];
  const rx = /\b((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/[^\s<>"']*)?)/gi;
  for (const m of String(texto || "").matchAll(rx)) {
    const crudo = m[1].replace(/[),.;!?]+$/, "");
    if (/^\d+\.\d+$/.test(crudo)) continue; // números con punto («1.5»)
    let u;
    try { u = new URL(/^https?:\/\//i.test(crudo) ? crudo : `http://${crudo}`); } catch (e) { continue; }
    const host = u.hostname.toLowerCase();
    const s = [];
    if (/^https?:\/\//i.test(crudo) && u.protocol === "http:") s.push("Sin cifrado (http, no https)");
    if (ACORTADORES.has(host)) s.push("Enlace acortado: oculta el destino real");
    if (host.split(".").some((p) => p.startsWith("xn--"))) s.push("Dominio con caracteres disfrazados (punycode)");
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) s.push("Usa una dirección IP en vez de un nombre");
    if (TLD_RIESGO.has(host.split(".").pop())) s.push(`Terminación poco común y usada en fraudes (.${host.split(".").pop()})`);
    if ((host.match(/-/g) || []).length >= 2 || /\d{3,}/.test(host)) s.push("Nombre con muchos guiones o números");
    if (u.username || /@/.test(crudo.split("/")[2] || "")) s.push("Trae «@» antes del dominio (truco para engañar)");
    for (const [marca, oficiales] of Object.entries(MARCAS)) {
      if (host.includes(marca) && !oficiales.some((d) => host === d || host.endsWith(`.${d}`))) s.push(`Menciona «${marca}» pero no es su dominio oficial (${oficiales[0]})`);
    }
    out.push({ url: crudo, host, senales: s });
  }
  return out;
}

/** Texto → {nivel, puntos, señales:[{id,nombre,explicacion}], enlaces}. */
export function analizarMensaje(texto) {
  const t = norm(texto);
  const senales = SENALES.filter(([, , , rx]) => rx.test(t)).map(([id, nombre, peso, , explicacion]) => ({ id, nombre, peso, explicacion }));
  const enlaces = revisarEnlaces(texto);
  const puntosEnlaces = enlaces.reduce((a, e) => a + Math.min(3, e.senales.length * 1.5), 0);
  const puntos = senales.reduce((a, s) => a + s.peso, 0) + puntosEnlaces;
  const nivel = !String(texto || "").trim() ? "vacio" : puntos >= 6 || senales.some((s) => s.peso >= 4) ? "alto" : puntos >= 3 ? "medio" : "bajo";
  return { nivel, puntos, senales, enlaces };
}

const escH = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const NIVELES = { alto: ["Riesgo alto", "#C62828"], medio: ["Riesgo medio", "#E2711D"], bajo: ["Sin señales fuertes", "#2E9E6E"] };

export function htmlResultado(r) {
  if (r.nivel === "vacio") return `<p class="meta">Pega primero el texto del mensaje.</p>`;
  const [t, c] = NIVELES[r.nivel];
  return `<p><span class="chip" style="background:${c};color:#fff;border-color:${c}">${t}</span></p>
    ${r.senales.length ? `<ul class="verif-lista">${r.senales.map((s) => `<li><b>${escH(s.nombre)}.</b> ${escH(s.explicacion)}</li>`).join("")}</ul>` : `<p class="meta">No se encontraron frases típicas de fraude o extorsión. Aun así, verifica por un canal oficial antes de pagar o dar datos.</p>`}
    ${r.enlaces.length ? `<p><b>Enlaces (${r.enlaces.length})</b> — no los abras si tienes dudas:</p><ul class="verif-lista">${r.enlaces.map((e) => `<li><code>${escH(e.host)}</code>${e.senales.length ? `: ${e.senales.map(escH).join("; ")}` : ": sin señales obvias (eso no garantiza que sea seguro)"}</li>`).join("")}</ul>` : ""}
    <p class="meta"><b>Qué hacer:</b> no respondas ni compartas códigos; comunícate con la institución o la persona por el número que ya conoces.
      En México: 089 (denuncia anónima), 088 (Guardia Nacional, ciberdelitos) y CONDUSEF (fraudes financieros); en extorsión telefónica, cuelga y llama al 089.
      En EUA: reportfraud.ftc.gov e ic3.gov. Este análisis se hizo en tu navegador: el mensaje no se envió ni se guardó.</p>`;
}
