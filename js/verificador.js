// Verificador de mensajes sospechosos (SMS, WhatsApp, correo): busca señales de fraude, phishing, extorsión
// telefónica y «secuestro virtual», y revisa los enlaces que trae el texto. Todo ocurre en el navegador: el
// mensaje no se envía ni se guarda. Es una ayuda para decidir, no un dictamen: un mensaje sin señales también
// puede ser fraude.

const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// [id, nombre, peso, expresión (sin acentos), explicación]. Patrones tomados de las alertas públicas de CONDUSEF, la
// Policía Cibernética (SSPC), Profeco, la FTC y el FBI (IC3); se prueban con tests/datos/mensajes_verificador.json.
export const SENALES = [
  ["urgencia", "Urgencia, plazo o amenaza de bloqueo", 2, /urgente|inmediat|ultimo aviso|en (las proximas )?\d+ ?(h|hrs|horas|minutos)\b|hoy mismo|antes de las|(cuenta|tarjeta|linea|servicio|suscripcion|perfil) (sera|ha sido|fue|esta|quedara) (bloquead|suspendid|cancelad|cerrad|desactivad|cortad|restringid)|sera (cortad|suspendid|desactivad|bloquead)|evite? (el )?(embargo|corte|bloqueo|cancelacion)|para no perder|act now|immediately|within 24 hours|(cuenta|pagina|perfil|correo) (sera|va a ser|fue) (eliminad|borrad|dad[ao] de baja)|infring\w* (los )?derechos|apel(a|e) en|final notice|expire[sd]?|call now|(account|card) (has been |will be |is )?(suspended|locked|blocked|disabled)/,
    "Presionar con prisa es la táctica más común: busca que actúes sin verificar."],
  ["datos", "Pide NIP, contraseña, token, códigos o datos personales", 3, /\bnip\b|\bpin\b|contrasena|clave (de acceso|dinamica|bancaria|interbancaria)|\btoken\b|\bcvv\b|codigo (de (verificacion|seguridad|\d+ digitos)|que (te |le )?(llego|llegara|recibio|recibiste)|por sms)|(confirm|verific|valid|actualic|proporcion|ingres|envi|compart|reenvi|mand)\w* (sus|tus|el|los|su|tu) (datos|informacion|codigo|token|nip|curp|rfc|ine|identificacion)|responda con su (curp|rfc|nip)|password|verification code|one.time code|verify your (identity|account)|actualic\w* (su|tu) (tarjeta|metodo de pago|forma de pago|domicilio)|(confirm|proporcion)\w* (su|tu) (domicilio|direccion)[\s\S]{0,60}(datos|respond)|(datos|numero) (bancarios|de (su|tu) tarjeta)|update (your )?(payment|billing)|bank details/,
    "Ningún banco, tienda ni autoridad pide NIP, códigos o datos completos por mensaje o llamada."],
  ["pago", "Pide depósito, transferencia, anticipo, comisión, tarjetas de regalo o criptomonedas", 3, /deposit|transferencia|\bspei\b|\boxxo\b|tarjeta de regalo|gift card|criptomoneda|\bcripto\b|bitcoin|\busdt\b|western union|(pago|cobro|cuota) (de|por) (liberacion|envio|reenvio|aduana|comision|apertura|seguro|capacitacion|curso|tramite)|(solo|unicamente) (cubre|paga|deposita)|anticipo|apartarlo|fianza|realiza el pago|pague \$|cubre el envio|pagar el curso|pago unico|mandame a esta cuenta|me (puedes|podrias) (prestar|depositar|transferir)|bail money|wire (money|transfer)/,
    "Pedir dinero por adelantado para «liberar» un premio, un paquete, un préstamo, un empleo o a una persona es señal típica de estafa o extorsión."],
  ["premio", "Premio, sorteo, bono, reembolso o regalo inesperado", 2, /ganaste|ganador|felicidades|seleccionad[oa] para (recibir|ganar)|premio|sorteo|regalo (gratis|para ti|especial)|tienes un regalo|recibir (un|tu) regalo|\bbono\b|acreedor a|reembolso|reclama tu|you (have )?won|winner|prize|refund|claim (your|now)|congratulations/,
    "Si no participaste en nada, no puedes haber ganado."],
  ["suplantacion", "Se presenta como banco, tienda, paquetería o servicio y pide actuar", 2, /(bbva|banamex|citibanamex|santander|banorte|hsbc|scotiabank|azteca|coppel|inbursa|banco|tu banco|su banco|departamento de seguridad|area de (seguridad|fraudes)|telcel|movistar|at&t|cfe|dhl|fedex|estafeta|correos de mexico|usps|ups\b|mercado libre|mercado pago|amazon|netflix|spotify|paypal|apple|whatsapp|facebook|instagram|walmart|liverpool|buro de credito)\b[\s\S]{0,140}(verifi|ingres|confirm|actualic|reactiv|clic|click|link|liga|enlace|llam|responda|comparta|proporcion|pague|cancel|reconoce|valid)/,
    "Las empresas reales no te piden verificar ni pagar por enlaces o números que llegan en un mensaje; entra tú mismo a su app o llama al número de tu tarjeta."],
  ["movimiento_falso", "Cargo, compra o acceso «no reconocido» para asustarte", 3, /(cargo|compra|movimiento|transaccion|retiro|acceso|intento de acceso|actividad)s? (no reconocid|inusual|sospechos|irregular)|no reconoce[s]? (este|esta|la|el)|si (usted )?no (la |lo )?reconoce|si (usted )?no (realizo|hizo|autorizo)|(clonad|hackead)[ao]|suspicious activity|unusual activity|did(n'?t| not) (make|authorize)/,
    "El «cargo no reconocido» busca que llames a un número falso o des tus datos para «cancelarlo»."],
  ["enlace_accion", "Pide entrar a un enlace o llamar a un número que trae el mismo mensaje", 1, /(ingrese|ingresa|entra|entre|da clic|de clic|haz clic|click|pulse|accede|visita|siguiente (enlace|link|liga)|en el (enlace|link)|llame? al|llama al|marca al|comunicate al)/,
    "Usa solo los canales oficiales que tú ya conoces, no los que vienen en el mensaje."],
  ["secuestro_virtual", "Guion de extorsión telefónica o «secuestro virtual»", 4, /tenemos a tu (hij|famil|espos|mama|papa|herman)|no cuelgues|no (avises|le digas|les digas|diga) a (la policia|nadie)|somos (del|de la|de los) (cartel|mana|organizacion|zetas|cjng|chapitos)|(llamamos|hablamos|habla|somos) (del|de la) (cartel|mana)|cobro de piso|derecho de piso|(pagar|pague|paga) la cuota|si no (pagas|paga|depositas|deposita)|sabemos donde (vives|vive|trabajas)|conocemos a tu familia|ya sabemos (donde|quien)|estas? siendo vigilad|atente a las consecuencias|(pagar|pagara|pagaran|pague|paguen) las consecuencias|te va a ir mal|te estamos vigilando|los estamos vigilando|sabemos (en que|cual es tu|donde (estudian|esta))|paga o (ya sabes|atente)|ya sabes lo que (pasa|sigue)|vamos a (quemar|matar|levantar)|si quieres volver a verl/,
    "Guion típico de extorsión: cuelga, no des datos, comunícate directamente con tu familiar y denuncia al 089."],
  ["autoridad", "Dice ser autoridad (SAT, IMSS, Fiscalía, policía) o cobra adeudos, multas o fianzas", 2, /\bsat\b|hacienda|\bimss\b|infonavit|policia cibernetica|fiscalia|ministerio publico|orden de (aprehension|arresto)|multa|infraccion|remolque|corralon|embargo|adeudo|citatorio|licenciado del buro|retén|reten\b|\birs\b|\bfbi\b|got arrested|bienestar/,
    "Las autoridades no cobran adeudos ni multas por WhatsApp o SMS; verifica en su sitio oficial."],
  ["paqueteria", "Paquete retenido, dirección incompleta o pago de envío", 2, /(paquete|envio|pedido|entrega)[\s\S]{0,60}(retenid|pendiente de pago|no pudo|no se pudo|incorrect|incomplet|actualic|confirm|pague|pago|aduana)|paquete (retenido|pendiente)|envio (esta |)retenido|no pudo ser entregado|guia de (envio|rastreo)|entrega (pendiente|fallida)|aduana|reenvio|pago de envio|package (is )?(on hold|could not)|incomplete address|delivery (failed|attempt)/,
    "Estafa frecuente con nombres de DHL, Estafeta, FedEx, USPS o Correos de México."],
  ["empleo_inversion", "Empleo fácil, préstamo sin buró o inversión con ganancias garantizadas", 3, /gana desde casa|trabajo desde casa|gana dinero extra|dinero facil|dando likes|dar likes|calific\w* (productos|hoteles|videos|resenas|apps)|te pagamos al instante|pago diario|vacante[\s\S]{0,80}(pagar|curso|capacitacion)|sin buro|prestamo (aprobado|preaprobado|inmediato)|borrar tus deudas|inversion garantizada|rendimientos? (del|de) \d+ ?%|\d+ ?% (mensual|semanal|diario)|garantizad[oa]s|duplica tu dinero|ganancias? (diarias|garantizadas)|cupo limitado|oportunidad unica|sin riesgo|invierte \$?[\d,.]+[\s\S]{0,40}(recibe|gana|obten)|(recibe|gana|obten)\w* \$?[\d,.]+ en (una|1|dos|2|tres|3) (semana|dia|hora)|guaranteed returns|risk.free/,
    "Nadie paga por dar «likes», presta sin revisar o garantiza rendimientos altos; casi siempre piden un depósito antes."],
  ["familiar", "Alguien conocido «cambió de número» o está en apuros y pide dinero", 3, /cambie de (numero|cel|telefono)|(este es|es) mi (nuevo numero|numero nuevo|nuevo cel)|(numero|cel|telefono) (nuevo|nueva)|se me (cayo|perdio|rompio) el (cel|telefono)|me (robaron|asaltaron)[\s\S]{0,40}(cel|telefono)|ocupo que me (mandes|deposites|prestes|transfieras)|(tu|su) (hij[oa]|espos[oa]|familiar|mama|papa|herman[oa]|niet[oa]) (esta|fue|quedo) (detenid|arrestad|accidentad|en el hospital|internad|retenid)|para que no (lo|la) (pasen|consignen|lleven|metan)|guardalo|hola (mama|mami|papa|papi|ma|pa|abuel|ti[oa])\b|soy yo[,.!]|estoy en (un reten|problemas|apuros)|necesito (tu ayuda|que me (hagas|mandes|prestes|deposites))|te deposite[\s\S]{0,40}por error|me (los|lo) puedes regresar|hi (grandma|grandpa|mom|dad)|new number|please don'?t tell/,
    "Antes de mandar dinero, llama al número que ya tenías de esa persona o pregúntale algo que solo ella sepa."],
  ["renta_compra", "Renta o venta con anticipo y sin poder ver el bien", 2, /(renta|departamento|casa|auto|coche)[\s\S]{0,120}(anticipo|apartar|apartarlo|deposit)|fuera del pais|no puedo mostrarlo/,
    "Nunca des anticipos sin ver el inmueble o el auto y sin contrato."],
  ["romance_chantaje", "Chantaje con fotos o videos íntimos (sextorsión)", 4, /fotos? (intimas|desnud)|video (intimo|tuyo)|lo (publicare|subire|mandare a tus contactos)|las publico|se las mando a (todos )?tus contactos|sextorsi|tengo tus (fotos|videos)/,
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
  // Alto: una señal grave (extorsión, chantaje), 5 puntos o más, o pedir dinero/datos junto con otra señal.
  // Medio: cualquier señal de peso 2 o más, o un enlace con señales. Bajo: nada de lo anterior.
  const grave = senales.some((s) => s.peso >= 4);
  const pideAlgo = senales.some((s) => s.id === "pago" || s.id === "datos");
  const nivel = !String(texto || "").trim() ? "vacio"
    : grave || puntos >= 5 || (pideAlgo && senales.length + (puntosEnlaces ? 1 : 0) >= 2) ? "alto"
    : senales.some((s) => s.peso >= 2) || puntosEnlaces >= 1.5 ? "medio" : "bajo";
  return { nivel, puntos, senales, enlaces };
}

const escH = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const NIVELES = { alto: ["Riesgo alto", "#C62828"], medio: ["Sospechoso: verifica antes de actuar", "#E2711D"], bajo: ["Sin señales fuertes", "#2E9E6E"] };

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
