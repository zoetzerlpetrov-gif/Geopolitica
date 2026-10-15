// Verificador de mensajes sospechosos (SMS, WhatsApp, correo): busca señales de fraude, phishing, extorsión
// telefónica y «secuestro virtual», y revisa los enlaces que trae el texto. Todo ocurre en el navegador: el
// mensaje no se envía ni se guarda. Es una ayuda para decidir, no un dictamen: un mensaje sin señales también
// puede ser fraude.

const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// [id, nombre, peso, expresión (sin acentos), explicación]. Patrones tomados de las alertas públicas de CONDUSEF, la
// Policía Cibernética (SSPC), Profeco, la FTC y el FBI (IC3); se prueban con tests/datos/mensajes_verificador.json.
export const SENALES = [
  ["cuenta_bloqueada", "Dice que tu cuenta fue bloqueada o que hubo un acceso raro, y pide iniciar sesión", 3, /(hemos|ha sido|fue|se ha|han) (bloquead|suspendid|restringid|desactivad|limitad)\w* (tu|su) (cuenta|tarjeta|acceso|perfil|apple id|id de apple)|(bloqueamos|suspendimos|restringimos|desactivamos) (tu|su) (cuenta|tarjeta|acceso)|inici\w* (de )?sesion (para|y) (desbloquear|verificar|reactivar|confirmar|recuperar|validar)|(inicio de sesion|acceso|intento de acceso|ingreso) (sospechoso|inusual|no autorizado|desde un (dispositivo|equipo) nuevo)|cancel\w* la operacion|sign in to (unlock|verify|restore)|unusual sign.in/,
    "Es el anzuelo clásico del phishing: el enlace lleva a una copia de la página real para robar tu usuario y contraseña. Entra tú mismo a la app oficial."],
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
  ["empleo_inversion", "Empleo fácil, préstamo sin buró o inversión con ganancias garantizadas", 3, /gana desde casa|trabajos? (a tiempo parcial|de medio tiempo|desde casa)|gerente de (proyectos|recursos humanos) de (tiktok|amazon|mercado libre|shein|temu|youtube)|gana \$?[\d,.]+ ?(-|a) ?\$?[\d,.]+ (al|por) dia|gana dinero extra|dinero facil|dando likes|dar likes|calific\w* (productos|hoteles|videos|resenas|apps)|te pagamos al instante|pago diario|vacante[\s\S]{0,80}(pagar|curso|capacitacion)|sin buro|prestamo (aprobado|preaprobado|inmediato)|borrar tus deudas|inversion garantizada|rendimientos? (del|de) \d+ ?%|\d+ ?% (mensual|semanal|diario)|garantizad[oa]s|duplica tu dinero|ganancias? (diarias|garantizadas)|cupo limitado|oportunidad unica|sin riesgo|invierte \$?[\d,.]+[\s\S]{0,40}(recibe|gana|obten)|(recibe|gana|obten)\w* \$?[\d,.]+ en (una|1|dos|2|tres|3) (semana|dia|hora)|guaranteed returns|risk.free/,
    "Nadie paga por dar «likes», presta sin revisar o garantiza rendimientos altos; casi siempre piden un depósito antes."],
  ["familiar", "Alguien conocido «cambió de número» o está en apuros y pide dinero", 3, /cambie de (numero|cel|telefono)|(este es|es) mi (nuevo numero|numero nuevo|nuevo cel)|(numero|cel|telefono) (nuevo|nueva)|se me (cayo|perdio|rompio) el (cel|telefono)|me (robaron|asaltaron)[\s\S]{0,40}(cel|telefono)|ocupo que me (mandes|deposites|prestes|transfieras)|(tu|su) (hij[oa]|espos[oa]|familiar|mama|papa|herman[oa]|niet[oa]) (esta|fue|quedo) (detenid|arrestad|accidentad|en el hospital|internad|retenid)|para que no (lo|la) (pasen|consignen|lleven|metan)|guardalo|hola (mama|mami|papa|papi|ma|pa|abuel|ti[oa])\b|soy yo[,.!]|estoy en (un reten|problemas|apuros)|necesito (tu ayuda|que me (hagas|mandes|prestes|deposites))|te deposite[\s\S]{0,40}por error|me (los|lo) puedes regresar|hi (grandma|grandpa|mom|dad)|new number|please don'?t tell/,
    "Antes de mandar dinero, llama al número que ya tenías de esa persona o pregúntale algo que solo ella sepa."],
  ["renta_compra", "Renta o venta con anticipo y sin poder ver el bien", 2, /(renta|departamento|casa|auto|coche)[\s\S]{0,120}(anticipo|apartar|apartarlo|deposit)|fuera del pais|no puedo mostrarlo/,
    "Nunca des anticipos sin ver el inmueble o el auto y sin contrato."],
  ["jefe_proveedor", "Se hace pasar por tu jefe, director o proveedor y pide pagar o cambiar una cuenta (fraude del CEO)", 3, /(soy|habla|de parte del?) (el |la |tu )?(director|directora|gerente|jefe|jefa|ceo|dueno|duena|presidente)[\s\S]{0,120}(transfer|deposit|pag|tarjetas? de regalo|compra)|estoy en (una )?(junta|reunion)[\s\S]{0,80}(necesito|compra|transfier|deposit)|transferencia (confidencial|urgente y confidencial)|(cambio|cambiamos|nuevos? datos?) (de|en) (la )?(cuenta bancaria|clabe|datos bancarios)|nueva (cuenta|clabe) para (el|los) pagos?/,
    "Confirma por teléfono o en persona con esa persona, al número que ya conoces, antes de pagar o cambiar datos bancarios."],
  ["qr_adjunto", "Pide escanear un QR, abrir un archivo o instalar una app", 2, /escane\w* (el|este|un|nuestro) (codigo )?qr (para|y) (recibir|pagar|cobrar|verificar|validar|reclamar|obtener|activar)|descarg\w* (el|la|este|esta) (archivo|factura|comprobante|documento|aplicacion|app)[\s\S]{0,40}(adjunt|para (ver|consultar|revisar)|del enlace|aqui)|archivo adjunto para (ver|consultar)|\.(apk|exe|scr|zip)\b|instal\w* (esta|la siguiente|nuestra) (app|aplicacion)/,
    "Los QR, archivos y apps que llegan por mensaje pueden instalar programas espía o llevar a páginas falsas."],
  ["soporte_falso", "Falso soporte técnico o de redes sociales", 2, /soporte (tecnico|al cliente)|centro de (ayuda|soporte) de (facebook|instagram|meta|whatsapp|tiktok|microsoft|apple)|equipo de (seguridad|soporte) de (meta|facebook|instagram|whatsapp|tiktok)|(tu|su) (computadora|equipo|pc) (esta|fue) (infectad|hackead)|llame? al soporte/,
    "Las plataformas no escriben por mensaje directo para «recuperar» tu cuenta; los soportes falsos piden tus datos o acceso remoto."],
  ["sim_cuenta", "Robo de línea o de cuenta: portabilidad, duplicado de SIM o código de WhatsApp", 3, /portabilidad|duplicado de (sim|chip)|reposicion de (sim|chip)|cambio de chip|(codigo|clave) de (verificacion de )?whatsapp|me (llego|llegó) tu codigo por error/,
    "Con tu código de WhatsApp o un duplicado de tu chip pueden apropiarse de tu cuenta y pedir dinero a tus contactos."],
  ["pago_anticipado", "Herencia, lotería o fondos «retenidos» que piden pagar gastos antes (estafa nigeriana)", 3, /herencia|loteria|lottery|inheritance|gastos (de )?(gestion|tramite|notariales|envio|liberacion)|impuestos? previos?|comision(es)? (de|por) retiro|liberar (el|tu|su|sus) (premio|dinero|fondos|ganancias)|fondos (bloqueados|retenidos|congelados)|(compartir|repartir) (una|la) (fortuna|herencia)/,
    "Si tienes que pagar para recibir dinero, es estafa: el premio o la herencia no existen."],
  ["chantaje_digital", "Dice tener acceso a tu equipo, cámara o contraseña y pide rescate", 4, /hacke\w* (tu|su) (dispositivo|computadora|celular|telefono|camara|correo)|tengo acceso a (tu|su) (camara|correo|dispositivo|computadora)|secuestr\w* (tu|su) (contrasena|informacion|cuenta|archivos)|(tus|sus) archivos (estan|fueron) cifrados|pag\w* (el )?rescate|i hacked your/,
    "Correo de extorsión masivo: casi nunca tienen nada. No pagues; cambia tu contraseña si la mencionan."],
  ["romance", "Relación a distancia que termina pidiendo dinero (estafa romántica)", 3, /(militar|soldado|ingeniero|medico|doctor)[\s\S]{0,60}(en el extranjero|en (siria|afganistan|irak)|plataforma petrolera|mision de paz)|boleto de avion|(enviarte|mandarte|te envie) un (regalo|paquete)[\s\S]{0,60}(aduana|pagar)|mi amor[\s\S]{0,80}(deposit|transfer|dinero)/,
    "Si alguien que no conoces en persona te pide dinero (boleto, aduana, hospital), es casi siempre fraude."],
  ["concurso_falso", "Concurso o regalo de una marca en redes («comenta y comparte»)", 2, /esta regalando|regala (autos|boletos|viajes|celulares|vales|despensas)|por su aniversario|comenta (gracias|si|amen)|comparte (este|la|esta) (mensaje|publicacion)|(primeras|primeros) \d+ personas/,
    "Las marcas no regalan autos ni boletos por comentar; el enlace suele robar datos o suscribirte a cobros."],
  ["tienda_falsa", "Venta por redes con precio de remate y pago solo por transferencia", 2, /liquidacion total|precio de (remate|liquidacion)|ultimas? (piezas|unidades) a|solo (aceptamos )?(transferencia|deposito)|no aceptamos tarjeta|vendo (dolares|dolares baratos|una laptop|un celular|iphone)[\s\S]{0,40}(barat|urge)|me urge (vender|el dinero)/,
    "Pagar por transferencia a un desconocido no tiene protección; compra en tiendas verificables o con pago contra entrega."],
  ["prestamo_app", "App de préstamo exprés o amenazas de «exhibirte» por una deuda (montadeudas)", 3, /prestamo (en minutos|expres|express|sin aval|al instante)|descarg\w* la app (del|de) prestamo|te vamos a exhibir|vamos a exhibirte|tus contactos (sabran|se enteraran)|enviaremos (a tus contactos|tu foto)|eres (un )?deudor|moroso[\s\S]{0,40}(contactos|exhibir)/,
    "Las apps de préstamo exprés sin registro en CONDUSEF suelen extorsionar exhibiendo a la persona ante sus contactos. Denuncia al 088."],
  ["cuenta_clonada", "Perfil de un conocido «nuevo» o «hackeado» que ofrece algo o pide dinero", 3, /me hackearon (la|mi) (cuenta|anterior|face|perfil)|abri (una )?(cuenta|perfil) nuev[oa]|esta es mi (nueva )?cuenta nueva/,
    "Llama a tu conocido por su número de siempre para confirmar que es él."],
  ["accidente_patrulla", "Familiar «detenido» o «chocado» y un supuesto policía que pide dinero", 4, /me subieron a una patrulla|me (chocaron|detuvieron|arrestaron)[\s\S]{0,60}(dinero|deposit|pagar|oficial)|el (oficial|policia|agente) (quiere|pide) dinero|me quieren llevar a la carcel/,
    "Guion de extorsión telefónica (a veces con voz clonada por IA): cuelga y llama directamente a tu familiar."],
  ["trading", "Inversión en trading o bot de criptomonedas con ganancias rápidas", 3, /bot de trading|trading automatico|robot de inversion|invierte \$?[\d,.]+ ?(usd|dolares|pesos)?[\s\S]{0,30}(hoy|y recibe|recibe)|ganancias (diarias|seguras) (en|con) (cripto|trading)/,
    "Nadie garantiza multiplicar el dinero en días; al querer retirar piden «comisiones»."],
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

// Dígitos o letras que se usan para imitar otras (icl0ud, paypa1, rnercadolibre).
const PARECIDOS = [[/0/g, "o"], [/1/g, "l"], [/3/g, "e"], [/4/g, "a"], [/5/g, "s"], [/7/g, "t"], [/rn/g, "m"], [/vv/g, "w"], [/ii/g, "u"]];
const MARCAS_EXTRA = { icloud: ["icloud.com", "apple.com"], gmail: ["gmail.com", "google.com"], outlook: ["outlook.com", "live.com", "microsoft.com"],
  hotmail: ["hotmail.com", "live.com"], instagram: ["instagram.com"], facebook: ["facebook.com", "fb.com"], tiktok: ["tiktok.com"], telegram: ["telegram.org"],
  binance: ["binance.com"], bitso: ["bitso.com"], banamex: ["banamex.com"], citibanamex: ["banamex.com"], santander: ["santander.com.mx"], spotify: ["spotify.com"],
  disney: ["disneyplus.com"], shein: ["shein.com", "shein.com.mx"], temu: ["temu.com"], aliexpress: ["aliexpress.com"], liverpool: ["liverpool.com.mx"],
  walmart: ["walmart.com.mx", "walmart.com"], elektra: ["elektra.mx"], telmex: ["telmex.com"], izzi: ["izzi.mx"], totalplay: ["totalplay.com.mx"],
  aeromexico: ["aeromexico.com"], volaris: ["volaris.com"], issste: ["issste.gob.mx"], infonavit: ["infonavit.org.mx"], condusef: ["condusef.gob.mx"],
  ups: ["ups.com"], usps: ["usps.com"], uber: ["uber.com"], rappi: ["rappi.com", "rappi.com.mx"] };
const TODAS_MARCAS = () => ({ ...MARCAS, ...MARCAS_EXTRA });
/** Distancia de edición (para «amazom», «paypai», «netflx»). */
function distancia(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** Dominio que imita una marca: con dígitos o letras cambiadas, o a una letra de distancia. Devuelve la marca o null. */
export function marcaImitada(host) {
  const base = host.replace(/^www\./, "");
  const partes = base.split(".").slice(0, -1).join(".").split(/[.-]/).filter(Boolean);
  for (const [marca, oficiales] of Object.entries(TODAS_MARCAS())) {
    if (oficiales.some((d) => base === d || base.endsWith(`.${d}`))) return null;
    for (const p of partes) {
      if (p === marca) continue; // la marca escrita bien en un dominio ajeno ya se marca aparte
      let norm = p;
      for (const [rx, r] of PARECIDOS) norm = norm.replace(rx, r);
      if (norm.includes(marca) && !p.includes(marca)) return marca;
      if (marca.length >= 5 && p.length >= 5 && Math.abs(p.length - marca.length) <= 1 && distancia(p, marca) === 1) return marca;
    }
  }
  return null;
}

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
    for (const [marca, oficiales] of Object.entries(TODAS_MARCAS())) {
      if (marca.length >= 4 && host.includes(marca) && !oficiales.some((d) => host === d || host.endsWith(`.${d}`))) s.push(`Menciona «${marca}» pero no es su dominio oficial (${oficiales[0]})`);
    }
    const imitada = marcaImitada(host);
    if (imitada) s.push(`Imita el nombre de «${imitada}» con letras o números cambiados (dominio falso)`);
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
  // Un enlace que imita una marca (icl0ud.com, bbva-seguridad.xyz) basta para riesgo alto.
  const dominioFalso = enlaces.some((e) => e.senales.some((x) => /^Imita|no es su dominio oficial|punycode/.test(x)));
  const nivel = !String(texto || "").trim() ? "vacio"
    : grave || dominioFalso || puntos >= 5 || (pideAlgo && senales.length + (puntosEnlaces ? 1 : 0) >= 2) ? "alto"
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
