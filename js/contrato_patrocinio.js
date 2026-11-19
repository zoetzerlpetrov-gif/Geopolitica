// Contratos de patrocinio (patrocinios.html, solo admin): extrae el texto de un PDF, Word (.docx) o PDF escaneado / foto
// (OCR) y lo revisa contra una lista de cláusulas necesarias y de cláusulas de riesgo. Todo pasa en el navegador: el
// contrato NO se sube a ningún servidor ni al repositorio (es confidencial). Solo se descargan, si hacen falta, las
// bibliotecas abiertas para leer PDF (pdf.js) y para OCR (Tesseract.js) desde su CDN.
// También genera un borrador de orden de inserción / contrato con las cláusulas mínimas. Orientación, no asesoría legal.

const PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
const PDFJS_WORKER = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
const TESSERACT = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";

// ------------------------------------------------------------------ lectura de archivos
/** Lee un .docx (ZIP) sin bibliotecas: busca word/document.xml y lo descomprime con DecompressionStream. */
export async function textoDocx(buffer) {
  const b = new Uint8Array(buffer), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw Error("No es un archivo Word (.docx) válido.");
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let k = 0; k < n; k++) {
    const metodo = dv.getUint16(p + 10, true), tam = dv.getUint32(p + 20, true), lnom = dv.getUint16(p + 28, true), lext = dv.getUint16(p + 30, true), lcom = dv.getUint16(p + 32, true), local = dv.getUint32(p + 42, true);
    const nombre = dec.decode(b.subarray(p + 46, p + 46 + lnom));
    if (nombre === "word/document.xml") {
      const ini = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      const datos = b.subarray(ini, ini + tam);
      const xml = metodo === 0 ? dec.decode(datos) : await new Response(new Blob([datos]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
      // Texto plano para analizar (nunca se inserta como HTML): se quitan las etiquetas, las entidades se decodifican en
      // una sola pasada y se eliminan los signos < y > que pudieran quedar.
      const ENT = { amp: "&", lt: " ", gt: " ", quot: '"', apos: "'" };
      return xml.replace(/<w:tab\/>/g, "\t").replace(/<\/w:p>/g, "\n").replace(/<[^>]*>/g, "").replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ENT[e]).replace(/[<>]/g, " ");
    }
    p += 46 + lnom + lext + lcom;
  }
  throw Error("El .docx no tiene word/document.xml.");
}

async function pdfjs() {
  const m = await import(/* webpackIgnore: true */ PDFJS);
  m.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  return m;
}

function cargarScript(src) {
  return new Promise((ok, mal) => {
    if (globalThis.Tesseract) return ok();
    const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => mal(Error("No se pudo cargar el OCR."));
    document.head.append(s);
  });
}

async function ocr(imagenes, avisar) {
  await cargarScript(TESSERACT);
  const w = await globalThis.Tesseract.createWorker("spa");
  let t = "";
  for (let i = 0; i < imagenes.length; i++) { avisar?.(`Leyendo con OCR la página ${i + 1} de ${imagenes.length}…`); t += (await w.recognize(imagenes[i])).data.text + "\n"; }
  await w.terminate();
  return t;
}

/** Texto de un archivo: .docx, .pdf (con texto o escaneado → OCR), .txt o imagen (OCR). */
export async function textoArchivo(archivo, avisar) {
  const nombre = archivo.name.toLowerCase();
  if (nombre.endsWith(".docx")) return { texto: await textoDocx(await archivo.arrayBuffer()), via: "Word" };
  if (nombre.endsWith(".doc")) throw Error("El formato .doc antiguo no se puede leer en el navegador: guárdalo como .docx o PDF.");
  if (nombre.endsWith(".txt")) return { texto: await archivo.text(), via: "texto" };
  if (/\.(png|jpe?g|webp)$/.test(nombre)) return { texto: await ocr([archivo], avisar), via: "OCR de imagen" };
  if (!nombre.endsWith(".pdf")) throw Error("Usa PDF, Word (.docx), texto o una foto (PNG/JPG).");
  avisar?.("Leyendo el PDF…");
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await archivo.arrayBuffer()), isEvalSupported: false }).promise;
  let t = "";
  for (let i = 1; i <= doc.numPages; i++) t += (await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(" ") + "\n";
  if (t.replace(/\s/g, "").length > 200 * Math.min(doc.numPages, 3) / 3) return { texto: t, via: "PDF con texto" };
  // PDF escaneado: cada página se dibuja en un canvas y se pasa por OCR.
  const imgs = [];
  for (let i = 1; i <= Math.min(doc.numPages, 30); i++) {
    const pg = await doc.getPage(i), vp = pg.getViewport({ scale: 2 }), c = document.createElement("canvas");
    c.width = vp.width; c.height = vp.height;
    await pg.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
    imgs.push(c);
  }
  return { texto: await ocr(imgs, avisar), via: `OCR de PDF escaneado (${imgs.length} páginas)` };
}

// ------------------------------------------------------------------ análisis
const N = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");

/** Cláusulas que un contrato de patrocinio debería tener. */
export const NECESARIAS = [
  { id: "partes", titulo: "Partes identificadas (razón social, RFC y representante)", re: /\b[a-zñ&]{3,4}\d{6}[a-z0-9]{3}\b|representad[oa] (legalmente )?por|registro federal de contribuyentes/, por_que: "Sin identificar a las partes no se puede facturar ni exigir el contrato." },
  { id: "objeto", titulo: "Objeto: qué se patrocina, posición y número de menciones", re: /objeto|patrocini|mencion|insercion/, por_que: "Define exactamente qué compra el patrocinador." },
  { id: "vigencia", titulo: "Vigencia con fechas de inicio y fin", re: /vigencia|plazo de|a partir del|del \d{1,2} de [a-z]+ (al|hasta)/, por_que: "Evita discusiones sobre cuándo termina la obligación." },
  { id: "precio", titulo: "Contraprestación, IVA y factura (CFDI)", re: /contraprestacion|precio|honorari|monto|cantidad de \$|iva|cfdi|factura/, por_que: "El patrocinio se factura con CFDI; hay que decir si el precio incluye IVA." },
  { id: "pago", titulo: "Forma y plazo de pago", re: /forma de pago|plazo de pago|transferencia|dentro de los \d+ dias|pago (anticipado|por adelantado)|a la firma/, por_que: "Sin plazo de pago, cobrar depende de la buena voluntad." },
  { id: "editorial", titulo: "Independencia editorial (el patrocinador no controla ni revisa las noticias)", re: /independencia editorial|control editorial|contenido (editorial|informativo)|no (podra|tendra) (revisar|aprobar|modificar)/, por_que: "Es la regla central de Brújula Diaria (docs/PATROCINIOS.md)." },
  { id: "publicidad", titulo: "El contenido se identifica como publicidad o promoción pagada", re: /publicidad|patrocinad|promocion pagada|contenido pagado/, por_que: "YouTube, PROFECO y el CONAR piden distinguir la publicidad." },
  { id: "marca", titulo: "Licencia para usar la marca y el logo", re: /licencia|uso de (la )?marca|logotipo|logo|propiedad (intelectual|industrial)/, por_que: "Sin licencia por escrito, mostrar el logo puede infringir la marca." },
  { id: "veracidad", titulo: "El anunciante responde por la veracidad de su mensaje y productos regulados", re: /veracidad|veraz|responsab\w+ (del|de su) (mensaje|publicidad|producto)|cofepris|condusef|profeco/, por_que: "Ley Federal de Protección al Consumidor (art. 32) y reglas sectoriales." },
  { id: "terminacion", titulo: "Terminación anticipada o rescisión", re: /terminacion anticipada|rescision|rescindir|dar por terminado/, por_que: "Permite salir del contrato si el patrocinador incumple o daña la reputación." },
  { id: "confidencialidad", titulo: "Confidencialidad", re: /confidencial/, por_que: "Protege precios y datos de negocio de ambas partes." },
  { id: "datos", titulo: "Datos personales: no se comparten datos de la audiencia", re: /datos personales|lfpdppp|aviso de privacidad/, por_que: "La audiencia no se vende ni se comparte." },
  { id: "jurisdiccion", titulo: "Ley aplicable y tribunales", re: /jurisdiccion|tribunales|leyes (aplicables|de los estados unidos mexicanos)|ley aplicable/, por_que: "Define dónde se resuelve un conflicto." },
  { id: "firmas", titulo: "Lugar, fecha y firmas", re: /firma|suscriben|lugar y fecha/, por_que: "Un contrato sin firmas es difícil de probar." },
];

/** Cláusulas que conviene revisar o negociar. nivel 3 = no aceptar; 2 = negociar; 1 = revisar. */
export const RIESGOS = [
  { id: "aprobacion", nivel: 3, titulo: "El patrocinador aprueba, revisa o puede vetar el contenido", re: /(aprobacion|autorizacion|visto bueno|revision) (previa )?(del|de los|de las) (guion|contenido|nota|noticia|programa)|derecho de veto|podra (solicitar|exigir) (que se )?(retire|elimine|modifique)/, que_hacer: "Rechazar: rompe la independencia editorial. Solo puede aprobar el texto de SU anuncio." },
  { id: "ocultar", nivel: 3, titulo: "Pide no revelar que es patrocinio", re: /no (se )?(revelar|divulgar|mencionar) (la|el) (relacion|patrocinio|pago)|sin (identificar|indicar) (que|como) (es )?publicidad/, que_hacer: "Rechazar: YouTube y PROFECO exigen declarar la promoción pagada." },
  { id: "prohibida", nivel: 3, titulo: "Categoría prohibida (electoral, partido, gobierno, apuestas, tabaco, armas, cripto propia, adultos)", re: /partido politico|candidat|campana electoral|propaganda (electoral|gubernamental)|apuestas|casino|tabaco|vapeador|armas de fuego|token propio|criptomoneda propia|contenido (adulto|sexual)/, que_hacer: "Rechazar: está en reglas.categorias_prohibidas de config/patrocinios.json." },
  { id: "datos_audiencia", nivel: 3, titulo: "Pide datos de suscriptores o de la audiencia", re: /(base de datos|datos|listado|correos) de (los )?(suscriptores|usuarios|audiencia|seguidores)/, que_hacer: "Rechazar: solo se entregan métricas agregadas (vistas, retención, clics con UTM)." },
  { id: "cesion", nivel: 2, titulo: "Cesión de derechos del contenido o del video al patrocinador", re: /cede (todos )?los derechos|cesion de derechos|titular(idad)? de los derechos (patrimoniales )?(del|sobre el) (contenido|video|programa)/, que_hacer: "Limitar a una licencia de uso del segmento del anuncio, no del programa." },
  { id: "exclusividad", nivel: 2, titulo: "Exclusividad o no competencia amplia", re: /exclusividad|no competencia|no podra (aceptar|contratar) (otros )?patrocin/, que_hacer: "Acotar a su categoría exacta y a la vigencia, con un precio mayor." },
  { id: "renovacion", nivel: 2, titulo: "Renovación automática", re: /renovacion automatica|se renovara automaticamente|prorroga automatica/, que_hacer: "Cambiar a renovación por acuerdo escrito." },
  { id: "pena", nivel: 2, titulo: "Penas convencionales o indemnización ilimitada a nuestro cargo", re: /pena convencional|penalizacion|indemnizar y (sacar|mantener) en paz y a salvo|responsabilidad ilimitada/, que_hacer: "Que sean recíprocas y con tope (p. ej., el monto del contrato)." },
  { id: "metricas", nivel: 2, titulo: "Garantía de vistas, clics o resultados", re: /garantiza(r|mos)? (un )?(minimo|numero) de (vistas|reproducciones|clics|impresiones)|pago (contra|por) resultados/, que_hacer: "No garantizar resultados; pactar entregables (menciones y posición) y reportar métricas." },
  { id: "pago_largo", nivel: 1, titulo: "Pago a más de 60 días", re: /(dentro de|a) (los )?(6[1-9]|[7-9]\d|1\d\d) dias/, que_hacer: "Pedir pago anticipado o a 30 días." },
  { id: "extranjero", nivel: 1, titulo: "Ley o tribunales extranjeros, o arbitraje fuera de México", re: /tribunales (de|del estado de|de la ciudad de) (nueva york|new york|miami|florida|texas|delaware|california|madrid|londres|london|espana|estados unidos de america)|laws of the state|arbitraje (internacional|en (nueva york|miami|madrid|londres))|camara de comercio internacional/, que_hacer: "Preferir leyes y tribunales de México." },
];

/** Analiza el texto → { necesarias:[{...,presente, extracto}], riesgos:[{...,extracto}], puntaje, nivel, datos }. */
export function analizar(texto) {
  const t = N(texto);
  const extracto = (re) => { const m = t.match(re); if (!m) return ""; const i = m.index; return "…" + t.slice(Math.max(0, i - 90), i + m[0].length + 110).trim() + "…"; };
  const necesarias = NECESARIAS.map((c) => ({ ...c, presente: c.re.test(t), extracto: extracto(c.re) }));
  // Una cláusula de riesgo no cuenta si viene negada («no se aceptan apuestas», «no hay renovación automática»).
  const NEGACION = /\b(no (se )?(acept|permit|podra|tendra|tiene|hay|habra|garantiz|compart|incluye)|prohib|queda(n)? excluid|sin )[^.;]{0,60}$/;
  const vigente = (re) => [...t.matchAll(new RegExp(re.source, "g"))].some((m) => !NEGACION.test(t.slice(Math.max(0, m.index - 80), m.index)));
  const riesgos = RIESGOS.filter((c) => (c.id === "ocultar" ? c.re.test(t) : vigente(c.re))).map((c) => ({ ...c, extracto: extracto(c.re) }));
  const faltan = necesarias.filter((c) => !c.presente).length, graves = riesgos.filter((r) => r.nivel === 3).length;
  const puntaje = Math.max(0, Math.round(100 * (necesarias.length - faltan) / necesarias.length) - riesgos.reduce((a, r) => a + r.nivel * 8, 0));
  const nivel = graves ? "alto" : faltan > 4 || riesgos.some((r) => r.nivel === 2) ? "medio" : "bajo";
  return { necesarias, riesgos, puntaje, nivel, datos: datosClave(texto), palabras: t.split(" ").length };
}

/** Datos que se pueden pasar al formulario de la campaña. */
export function datosClave(texto) {
  const t = String(texto || "");
  const meses = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
  const fechas = [...N(t).matchAll(/(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre) (de|del) (\d{4})/g)]
    .map((m) => `${m[4]}-${String(meses[m[2]]).padStart(2, "0")}-${m[1].padStart(2, "0")}`).sort();
  const ref = t.match(/\b(?:OI|O\.I\.|orden de inserci[oó]n|contrato)\s*(?:n[uú]m(?:ero)?\.?|no\.?|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]{2,20})/i);
  const monto = t.match(/\$\s?([\d,]+(?:\.\d{2})?)\s*(?:M\.?N\.?|MXN|pesos)?/i);
  return { desde: fechas[0] || "", hasta: fechas.length > 1 ? fechas[fechas.length - 1] : "", contrato: ref ? ref[1] : "", monto: monto ? monto[1] : "" };
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const NIVEL = { alto: ["⛔ Riesgo alto: no firmar así", "#c62828"], medio: ["⚠️ Riesgo medio: negociar antes de firmar", "#e07b00"], bajo: ["✅ Riesgo bajo", "#2e7d32"] };

export function htmlAnalisis(a, via = "") {
  const [t, c] = NIVEL[a.nivel];
  return `<p><span class="chip" style="background:${c};color:#fff;border-color:${c}">${t}</span> <b>${a.puntaje}/100</b> <span class="meta">· ${a.palabras} palabras leídas${via ? ` (${esc(via)})` : ""}</span></p>
    ${a.riesgos.length ? `<h4>Cláusulas de riesgo</h4><ul>${a.riesgos.sort((x, y) => y.nivel - x.nivel).map((r) => `<li>${r.nivel === 3 ? "⛔" : r.nivel === 2 ? "⚠️" : "🔎"} <b>${esc(r.titulo)}</b> — ${esc(r.que_hacer)}<br><span class="meta">${esc(r.extracto)}</span></li>`).join("")}</ul>` : "<p>Sin cláusulas de riesgo detectadas.</p>"}
    <h4>Cláusulas necesarias</h4><ul>${a.necesarias.map((n) => `<li>${n.presente ? "✅" : "❌"} ${esc(n.titulo)}${n.presente ? "" : ` <span class="meta">— ${esc(n.por_que)}</span>`}</li>`).join("")}</ul>
    ${a.datos.desde || a.datos.contrato ? `<p class="meta">Datos detectados: ${a.datos.contrato ? `referencia «${esc(a.datos.contrato)}» · ` : ""}${a.datos.desde ? `fechas ${esc(a.datos.desde)} a ${esc(a.datos.hasta || "—")}` : ""}${a.datos.monto ? ` · monto $${esc(a.datos.monto)}` : ""}.</p>` : ""}
    <p class="meta">Revisión automática por palabras clave: orienta, no sustituye la revisión de un abogado. El archivo no salió de este navegador.</p>`;
}

// ------------------------------------------------------------------ borrador de contrato
export function borradorContrato(c = {}, f = new Date().toISOString().slice(0, 10)) {
  const v = (x, ph) => esc(x || ph);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Orden de inserción ${v(c.contrato, "OI-____")}</title>
<style>body{font:12pt/1.5 Georgia,serif;max-width:780px;margin:24px auto;padding:0 16px}h1{font-size:16pt;text-align:center}h2{font-size:12pt;margin:16px 0 4px}.firma{display:flex;justify-content:space-between;margin-top:60px}.firma div{width:45%;border-top:1px solid #000;text-align:center;padding-top:4px}.nota{font-size:9pt;color:#555}</style></head><body>
<p class="nota">Borrador generado por DOMINUS (${f}). Revísalo con un abogado antes de firmar. Los campos entre corchetes se llenan a mano.</p>
<h1>ORDEN DE INSERCIÓN Y CONTRATO DE PATROCINIO<br>${v(c.contrato, "OI-____")}</h1>
<p>Celebran el presente contrato, por una parte, <b>[RAZÓN SOCIAL DEL TITULAR DE BRÚJULA DIARIA]</b>, RFC [___], representada por [___] («el Medio»), y por la otra <b>${v(c.marca, "[RAZÓN SOCIAL DEL PATROCINADOR]")}</b>, RFC [___], representada por [___] («el Patrocinador»), al tenor de las siguientes cláusulas:</p>
<h2>1. Objeto</h2><p>El Medio incluirá en el programa en video «Brújula Diaria» una escena de patrocinio identificada como «PUBLICIDAD», en la posición <b>${v(c.posicion, "[apertura / pausa / cierre]")}</b>${c.dias?.length ? `, los días ${esc(c.dias.join(", "))}` : ""}, con el texto en pantalla y la locución que constan en el Anexo A, sin superar 20 segundos de voz.</p>
<h2>2. Vigencia</h2><p>Del <b>${v(c.desde, "[fecha de inicio]")}</b> al <b>${v(c.hasta, "[fecha de fin]")}</b>. Cualquier prórroga requiere acuerdo por escrito; no hay renovación automática.</p>
<h2>3. Contraprestación y pago</h2><p>El Patrocinador pagará <b>$[monto] más IVA</b>, contra la entrega del CFDI correspondiente, por transferencia, [50 % a la firma y 50 % a los 30 días naturales / pago anticipado].</p>
<h2>4. Independencia editorial</h2><p>El Patrocinador no tiene control, revisión ni aprobación sobre el contenido informativo del programa. Solo aprueba el texto de su propio anuncio (Anexo A). El Medio puede informar sobre el Patrocinador como sobre cualquier otra entidad; cuando lo haga, lo señalará como conflicto de interés. El Patrocinador no podrá pedir que se retire o modifique una nota.</p>
<h2>5. Identificación como publicidad</h2><p>La escena se identifica como «PUBLICIDAD», la voz inicia con «Mensaje patrocinado por ${v(c.marca, "[marca]")}» y el video se declara en YouTube con «promoción pagada».</p>
<h2>6. Licencia de marca</h2><p>El Patrocinador otorga al Medio una licencia no exclusiva, gratuita y limitada a la vigencia para usar su marca y logotipo (Anexo B) solo en la escena de patrocinio y en la descripción del video. El Patrocinador declara ser titular o licenciatario de dichos signos.</p>
<h2>7. Veracidad y productos regulados</h2><p>El Patrocinador es responsable de que su mensaje sea veraz y comprobable (Ley Federal de Protección al Consumidor) y de contar con los permisos o leyendas que exijan COFEPRIS, CONDUSEF u otra autoridad. No se aceptan propaganda electoral o gubernamental, apuestas, tabaco o vapeadores, armas, productos milagro, criptomonedas de emisión propia ni contenido para adultos.</p>
<h2>8. Datos personales y métricas</h2><p>El Medio no comparte datos personales de su audiencia. Entregará métricas agregadas (vistas, retención del minuto del anuncio y clics del enlace con UTM ${v(c.enlace, "[enlace]")}). No se garantizan resultados mínimos.</p>
<h2>9. Terminación anticipada</h2><p>Cualquiera de las partes puede terminar el contrato con 15 días naturales de aviso por escrito. El Medio puede suspender la campaña de inmediato si el Patrocinador incumple la cláusula 7 o si su mensaje daña la credibilidad del programa; en ese caso se devuelve la parte proporcional no transmitida.</p>
<h2>10. Responsabilidad</h2><p>La responsabilidad de cada parte frente a la otra se limita al monto del contrato, salvo dolo. Cada parte responde por los reclamos de terceros derivados de su propio contenido.</p>
<h2>11. Confidencialidad</h2><p>Las condiciones económicas son confidenciales. Esto no impide declarar públicamente que el contenido es patrocinado.</p>
<h2>12. Ley aplicable y tribunales</h2><p>Leyes de los Estados Unidos Mexicanos; tribunales de [la Ciudad de México], con renuncia a cualquier otro fuero.</p>
<h2>Anexo A · Texto del anuncio</h2><p><b>Pantalla:</b> ${v(c.pantalla, "[texto en pantalla, máximo 140 caracteres]")}</p><p><b>Voz:</b> Mensaje patrocinado por ${v(c.marca, "[marca]")}. ${v(c.voz, "[texto de la voz, máximo 320 caracteres]")}</p>
<h2>Anexo B · Logotipo autorizado</h2><p>[Adjuntar archivo del logotipo autorizado]</p>
<p>Lugar y fecha: [ciudad], a [fecha].</p>
<div class="firma"><div>El Medio<br>[nombre y cargo]</div><div>El Patrocinador<br>[nombre y cargo]</div></div>
</body></html>`;
}
