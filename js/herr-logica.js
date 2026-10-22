// Lógica de la caja de herramientas del analista (herramientas.html). Todo corre en el navegador: ningún archivo ni
// texto se sube. Funciones puras para poder probarlas sin red (tests/js/herramientas.test.mjs).

// ------------------------------------------------------------------ auditoría de archivos

/** Firmas («números mágicos») de los formatos más comunes: los primeros bytes dicen qué es el archivo de verdad. */
export const FIRMAS = [
  { tipo: "pdf", nombre: "PDF", hex: "25504446" },
  { tipo: "zip", nombre: "ZIP (también DOCX, XLSX, PPTX, ODT, EPUB, JAR, APK)", hex: "504b0304" },
  { tipo: "ole", nombre: "Office antiguo (DOC, XLS, PPT, MSG)", hex: "d0cf11e0a1b11ae1" },
  { tipo: "png", nombre: "PNG", hex: "89504e470d0a1a0a" },
  { tipo: "jpg", nombre: "JPEG", hex: "ffd8ff" },
  { tipo: "gif", nombre: "GIF", hex: "47494638" },
  { tipo: "webp", nombre: "WebP", hex: "52494646", y: [8, "57454250"] },
  { tipo: "wav", nombre: "WAV", hex: "52494646", y: [8, "57415645"] },
  { tipo: "avi", nombre: "AVI", hex: "52494646", y: [8, "41564920"] },
  { tipo: "tiff", nombre: "TIFF", hex: "49492a00" },
  { tipo: "tiff", nombre: "TIFF", hex: "4d4d002a" },
  { tipo: "mp4", nombre: "MP4 / MOV / HEIC (ISO BMFF)", hex: "66747970", desde: 4 },
  { tipo: "mp3", nombre: "MP3", hex: "494433" },
  { tipo: "ogg", nombre: "OGG", hex: "4f676753" },
  { tipo: "rar", nombre: "RAR", hex: "526172211a07" },
  { tipo: "7z", nombre: "7-Zip", hex: "377abcaf271c" },
  { tipo: "gz", nombre: "GZIP", hex: "1f8b" },
  { tipo: "exe", nombre: "Ejecutable de Windows (EXE, DLL)", hex: "4d5a" },
  { tipo: "elf", nombre: "Ejecutable de Linux (ELF)", hex: "7f454c46" },
  { tipo: "macho", nombre: "Ejecutable de macOS (Mach-O)", hex: "cffaedfe" },
  { tipo: "rtf", nombre: "RTF", hex: "7b5c727466" },
  { tipo: "sqlite", nombre: "Base de datos SQLite", hex: "53514c69746520666f726d6174" },
];

/** Extensiones que se esperan para cada tipo detectado (para avisar si el nombre no coincide con el contenido). */
export const EXTENSIONES = {
  pdf: ["pdf"], zip: ["zip", "docx", "xlsx", "pptx", "docm", "xlsm", "pptm", "odt", "ods", "odp", "epub", "jar", "apk", "kmz"],
  ole: ["doc", "xls", "ppt", "msg", "dot", "xlt"], png: ["png"], jpg: ["jpg", "jpeg", "jfif"], gif: ["gif"], webp: ["webp"],
  wav: ["wav"], avi: ["avi"], tiff: ["tif", "tiff", "dng", "nef", "cr2"], mp4: ["mp4", "mov", "m4a", "m4v", "heic", "heif", "avif", "3gp"],
  mp3: ["mp3"], ogg: ["ogg", "oga", "opus"], rar: ["rar"], "7z": ["7z"], gz: ["gz", "tgz"], exe: ["exe", "dll", "scr", "sys", "com"],
  elf: ["", "so", "bin"], macho: ["", "dylib"], rtf: ["rtf", "doc"], sqlite: ["sqlite", "db", "sqlite3"],
};

const hex = (bytes, desde, n) => Array.from(bytes.slice(desde, desde + n), (b) => b.toString(16).padStart(2, "0")).join("");

export function tipoPorFirma(bytes) {
  for (const f of FIRMAS) {
    const d = f.desde || 0;
    if (hex(bytes, d, f.hex.length / 2) !== f.hex) continue;
    if (f.y && hex(bytes, f.y[0], f.y[1].length / 2) !== f.y[1]) continue;
    return f;
  }
  // Texto: sin bytes nulos en el primer bloque.
  const muestra = bytes.slice(0, 4096);
  if (muestra.length && !muestra.includes(0)) return { tipo: "texto", nombre: "Texto (TXT, CSV, HTML, JSON, XML, código…)" };
  return { tipo: "desconocido", nombre: "Formato no reconocido por su firma" };
}

/** ¿La extensión del nombre corresponde a lo que el archivo es? Una foto «.jpg» que en realidad es un .exe es la señal clásica. */
export function extensionCoincide(nombre, tipo) {
  const ext = (String(nombre).toLowerCase().match(/\.([a-z0-9]{1,6})$/) || [, ""])[1];
  if (tipo === "texto" || tipo === "desconocido") return { ext, coincide: true };
  return { ext, coincide: (EXTENSIONES[tipo] || []).includes(ext) };
}

/** Entropía de Shannon en bits por byte (0 a 8). Más de ~7.5 en un archivo que no es comprimido ni imagen sugiere cifrado o empaquetado. */
export function entropia(bytes) {
  if (!bytes.length) return 0;
  const c = new Array(256).fill(0);
  for (const b of bytes) c[b]++;
  let h = 0;
  for (const n of c) if (n) { const p = n / bytes.length; h -= p * Math.log2(p); }
  return Math.round(h * 100) / 100;
}

/** Directorio central de un ZIP → [{nombre, metodo, comprimido, tamano, desde}]. */
export function leerZip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let fin = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { fin = i; break; }
  if (fin < 0) throw new Error("ZIP sin directorio central (dañado o incompleto)");
  const n = dv.getUint16(fin + 10, true);
  let p = dv.getUint32(fin + 16, true);
  const out = [];
  const td = new TextDecoder();
  for (let k = 0; k < n && p + 46 <= bytes.length; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const metodo = dv.getUint16(p + 10, true), comprimido = dv.getUint32(p + 20, true), tamano = dv.getUint32(p + 24, true);
    const ln = dv.getUint16(p + 28, true), lx = dv.getUint16(p + 30, true), lc = dv.getUint16(p + 32, true), local = dv.getUint32(p + 42, true);
    const cifrado = Boolean(dv.getUint16(p + 8, true) & 1);
    const nombre = td.decode(bytes.slice(p + 46, p + 46 + ln));
    const dl = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    out.push({ nombre, metodo, comprimido, tamano, desde: dl, cifrado });
    p += 46 + ln + lx + lc;
  }
  return out;
}

/** Texto de una entrada del ZIP (sin compresión o «deflate»). */
export async function textoZip(bytes, e) {
  const datos = bytes.slice(e.desde, e.desde + e.comprimido);
  if (e.metodo === 0) return new TextDecoder().decode(datos);
  if (e.metodo !== 8) throw new Error(`compresión ${e.metodo} no soportada`);
  const s = new Blob([datos]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new TextDecoder().decode(await new Response(s).arrayBuffer());
}

const etiqueta = (xml, tag) => { const m = xml.match(new RegExp(`<(?:\\w+:)?${tag}[^>]*>([^<]*)</(?:\\w+:)?${tag}>`)); return m ? m[1].trim() : ""; };

/** DOCX/XLSX/PPTX (Office Open XML) u ODF: metadatos, macros, vínculos externos, objetos incrustados y hojas ocultas. */
export function analizarOffice(entradas, textos) {
  const nombres = entradas.map((e) => e.nombre);
  const core = textos["docProps/core.xml"] || textos["meta.xml"] || "";
  const app = textos["docProps/app.xml"] || "";
  const meta = {
    "Título": etiqueta(core, "title"), "Autor": etiqueta(core, "creator") || etiqueta(core, "initial-creator"),
    "Modificado por última vez por": etiqueta(core, "lastModifiedBy"), "Creado": etiqueta(core, "created") || etiqueta(core, "creation-date"),
    "Modificado": etiqueta(core, "modified") || etiqueta(core, "date"), "Revisión": etiqueta(core, "revision") || etiqueta(core, "editing-cycles"),
    "Empresa": etiqueta(app, "Company"), "Aplicación": etiqueta(app, "Application") || etiqueta(core, "generator"),
    "Plantilla": etiqueta(app, "Template"), "Tiempo total de edición (min)": etiqueta(app, "TotalTime") || etiqueta(core, "editing-duration"),
    "Palabras clave": etiqueta(core, "keywords"), "Descripción": etiqueta(core, "description"),
  };
  const rels = Object.entries(textos).filter(([n]) => n.endsWith(".rels")).map(([, t]) => t).join("\n");
  const externos = [...new Set([...rels.matchAll(/Target="(https?:\/\/[^"]+|file:[^"]+|\\\\[^"]+)"[^>]*TargetMode="External"/g)].map((m) => m[1]))];
  const alertas = [];
  const macros = nombres.filter((n) => /vbaProject\.bin|vbaData\.xml|\/macros\//i.test(n));
  if (macros.length) alertas.push({ nivel: "alto", texto: `Contiene macros (${macros.join(", ")}): pueden ejecutar código al abrirse. No las habilites si no confías en el origen.` });
  const ole = nombres.filter((n) => /embeddings\/|oleObject|\.bin$/i.test(n) && !/vbaProject/i.test(n));
  if (ole.length) alertas.push({ nivel: "medio", texto: `Objetos incrustados (${ole.length}): otros archivos metidos dentro del documento.` });
  if (externos.length) alertas.push({ nivel: "medio", texto: `Vínculos externos (${externos.length}): el documento puede pedir recursos a internet al abrirse (rastreo o descarga de plantillas).` });
  if (/attachedTemplate[^>]+TargetMode="External"/.test(rels)) alertas.push({ nivel: "alto", texto: "Plantilla remota: técnica usada para descargar macros al abrir el documento (inyección de plantilla)." });
  const libro = textos["xl/workbook.xml"] || "";
  const ocultas = [...libro.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*state="(hidden|veryHidden)"/g)].map((m) => `${m[1]} (${m[2] === "veryHidden" ? "muy oculta" : "oculta"})`);
  if (ocultas.length) alertas.push({ nivel: "medio", texto: `Hojas ocultas: ${ocultas.join(", ")}.` });
  if (/<w:ins |<w:del /.test(textos["word/document.xml"] || "")) alertas.push({ nivel: "bajo", texto: "Tiene control de cambios: el texto borrado o insertado sigue dentro del archivo." });
  if (nombres.some((n) => /comments\d*\.xml|comments\.xml/.test(n))) alertas.push({ nivel: "bajo", texto: "Tiene comentarios: revisa que no contengan información interna antes de compartirlo." });
  if (entradas.some((e) => e.cifrado)) alertas.push({ nivel: "medio", texto: "Partes cifradas dentro del ZIP." });
  return { meta: Object.fromEntries(Object.entries(meta).filter(([, v]) => v)), externos, alertas, partes: nombres.length };
}

/** PDF: diccionario /Info y XMP, acciones automáticas, JavaScript, archivos incrustados, cifrado y revisiones. */
export function analizarPdf(texto) {
  const info = {};
  for (const k of ["Title", "Author", "Subject", "Keywords", "Creator", "Producer", "CreationDate", "ModDate"]) {
    const m = texto.match(new RegExp(`/${k}\\s*\\(((?:\\\\.|[^\\\\)])*)\\)`)) || texto.match(new RegExp(`<(?:pdf|xmp|dc):${k}[^>]*>([\\s\\S]*?)</`, "i"));
    if (m) info[k] = m[1].replace(/<[^>]+>/g, "").replace(/\\([()\\])/g, "$1").trim().slice(0, 200);
  }
  const ES = { Title: "Título", Author: "Autor", Subject: "Asunto", Keywords: "Palabras clave", Creator: "Programa que lo creó", Producer: "Programa que generó el PDF", CreationDate: "Creado", ModDate: "Modificado" };
  const cuenta = (re) => (texto.match(re) || []).length;
  const version = (texto.match(/^%PDF-(\d\.\d)/) || [, "?"])[1];
  const revisiones = cuenta(/%%EOF/g);
  const alertas = [];
  const js = cuenta(/\/JavaScript|\/JS\b/g);
  if (js) alertas.push({ nivel: "alto", texto: `Contiene JavaScript (${js} referencias): un PDF normal casi nunca lo necesita.` });
  if (cuenta(/\/OpenAction|\/AA\b/g)) alertas.push({ nivel: "medio", texto: "Tiene acciones automáticas al abrirse (/OpenAction o /AA)." });
  if (cuenta(/\/Launch/g)) alertas.push({ nivel: "alto", texto: "Tiene /Launch: puede intentar abrir programas o archivos del equipo." });
  if (cuenta(/\/EmbeddedFile/g)) alertas.push({ nivel: "medio", texto: "Lleva archivos incrustados dentro del PDF." });
  if (cuenta(/\/SubmitForm|\/ImportData/g)) alertas.push({ nivel: "medio", texto: "Formularios que envían datos a un servidor." });
  if (cuenta(/\/RichMedia|\/XFA/g)) alertas.push({ nivel: "medio", texto: "Contenido multimedia o formularios XFA (superficie de ataque mayor)." });
  if (cuenta(/\/Encrypt/g)) alertas.push({ nivel: "bajo", texto: "Está cifrado o con permisos restringidos: parte del contenido no se puede revisar aquí." });
  if (revisiones > 1) alertas.push({ nivel: "bajo", texto: `Se guardó ${revisiones} veces con actualizaciones incrementales: versiones anteriores del contenido pueden seguir dentro del archivo.` });
  const urls = [...new Set([...texto.matchAll(/\/URI\s*\(([^)]+)\)/g)].map((m) => m[1]))].slice(0, 50);
  return { version, revisiones, paginas: cuenta(/\/Type\s*\/Page\b/g),
    meta: Object.fromEntries(Object.entries(info).map(([k, v]) => [ES[k], v])), urls, alertas };
}

/** Fecha de PDF «D:20240131120000-06'00'» → «2024-01-31 12:00:00 -06:00». */
export function fechaPdf(s) {
  const m = String(s || "").match(/D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Zz]|[+-]\d{2}'?\d{2}'?)?/);
  if (!m) return s || "";
  const tz = m[7] ? (m[7].toUpperCase() === "Z" ? " UTC" : ` ${m[7].replace(/'/g, "").replace(/(\d{2})(\d{2})$/, "$1:$2")}`) : "";
  return `${m[1]}-${m[2] || "01"}-${m[3] || "01"} ${m[4] || "00"}:${m[5] || "00"}:${m[6] || "00"}${tz}`;
}

// ------------------------------------------------------------------ informática

/** Indicadores de compromiso (IOC) en un texto: URL, dominios, IP, correos, hashes, CVE y carteras de Bitcoin. Acepta texto «desactivado» (hxxp, [.]). */
export function extraerIOC(texto) {
  const t = refang(String(texto || ""));
  const uniq = (a) => [...new Set(a)];
  const urls = uniq(t.match(/\bhttps?:\/\/[^\s"'<>()\]]+/gi) || []);
  const correos = uniq(t.match(/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g) || []);
  const ipv4 = uniq((t.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || []).filter((ip) => ip.split(".").every((n) => Number(n) <= 255)));
  const dominios = uniq((t.match(/\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,24})\b/gi) || [])
    .map((d) => d.toLowerCase()).filter((d) => !correos.some((c) => c.toLowerCase().endsWith("@" + d)) && !/\.(png|jpe?g|gif|exe|dll|pdf|docx?|xlsx?|zip|txt|js|css|html?)$/i.test(d)));
  const sha256 = uniq(t.match(/\b[a-f0-9]{64}\b/gi) || []);
  const sha1 = uniq((t.match(/\b[a-f0-9]{40}\b/gi) || []).filter((h) => !sha256.some((x) => x.includes(h))));
  const md5 = uniq((t.match(/\b[a-f0-9]{32}\b/gi) || []).filter((h) => !sha256.some((x) => x.includes(h)) && !sha1.some((x) => x.includes(h))));
  const cve = uniq((t.match(/\bCVE-\d{4}-\d{4,7}\b/gi) || []).map((c) => c.toUpperCase()));
  const btc = uniq(t.match(/\b(?:bc1[a-z0-9]{25,59}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/g) || []);
  return { urls, dominios, ipv4, correos, sha256, sha1, md5, cve, btc };
}

/** «Desactiva» indicadores para compartirlos sin que se vuelvan enlaces clicables (convención de los equipos de respuesta). */
export const defang = (s) => String(s).replace(/https?:\/\//gi, (m) => m.replace(/t/gi, "x").replace("://", "[://]")).replace(/\.(?=[a-z0-9-]+(\b|\/))/gi, "[.]").replace(/@/g, "[@]");
export const refang = (s) => String(s).replace(/hxxp/gi, "http").replace(/\[:\/\/\]/g, "://").replace(/\[\.\]|\(\.\)|\{\.\}/g, ".").replace(/\[@\]|\[at\]/gi, "@");

/** Encabezados de un correo: cadena de servidores (Received), resultados SPF/DKIM/DMARC y discrepancias típicas de suplantación. */
export function analizarEncabezados(raw) {
  const desplegado = String(raw || "").replace(/\r?\n[ \t]+/g, " ");
  const lineas = desplegado.split(/\r?\n/);
  const todos = (n) => lineas.filter((l) => l.toLowerCase().startsWith(n.toLowerCase() + ":")).map((l) => l.slice(n.length + 1).trim());
  const uno = (n) => todos(n)[0] || "";
  const dominio = (s) => (String(s).match(/@([\w.-]+)/) || [, ""])[1].toLowerCase();
  const auth = todos("Authentication-Results").join(" ; ");
  const res = (k) => (auth.match(new RegExp(`\\b${k}=(\\w+)`, "i")) || [, "sin dato"])[1].toLowerCase();
  const recibidos = todos("Received").map((r) => ({
    de: (r.match(/from\s+([^\s(;]+)/i) || [, ""])[1], por: (r.match(/by\s+([^\s(;]+)/i) || [, ""])[1],
    ip: (r.match(/\[(\d{1,3}(?:\.\d{1,3}){3}|[0-9a-f:]+)\]/i) || [, ""])[1], fecha: (r.split(";").pop() || "").trim() })).reverse();
  const de = uno("From"), ret = uno("Return-Path"), resp = uno("Reply-To");
  const alertas = [];
  for (const [k, n] of [["spf", "SPF"], ["dkim", "DKIM"], ["dmarc", "DMARC"]]) {
    const v = res(k);
    if (["fail", "softfail", "permerror", "none"].includes(v)) alertas.push(`${n}: ${v}. El servidor que lo envió no está autorizado o la firma no es válida.`);
  }
  if (ret && dominio(ret) && dominio(de) && dominio(ret) !== dominio(de)) alertas.push(`El remitente visible (${dominio(de)}) no coincide con la dirección de rebote (${dominio(ret)}).`);
  if (resp && dominio(resp) && dominio(resp) !== dominio(de)) alertas.push(`Las respuestas irían a otro dominio (${dominio(resp)}), no al del remitente.`);
  if (/^"?[^"<]*@[^"<]*"?\s*</.test(de) && dominio(de) !== ((de.match(/^"?[^"<]*@([\w.-]+)/) || [, ""])[1] || "").toLowerCase()) alertas.push("El nombre visible contiene una dirección distinta a la real: técnica común de suplantación.");
  return { de, para: uno("To"), asunto: uno("Subject"), fecha: uno("Date"), idMensaje: uno("Message-ID"), returnPath: ret, replyTo: resp,
    spf: res("spf"), dkim: res("dkim"), dmarc: res("dmarc"), recibidos, alertas };
}

/** JWT → encabezado y contenido decodificados (sin verificar la firma: eso requiere la llave). */
export function decodificarJWT(token) {
  const partes = String(token || "").trim().split(".");
  if (partes.length < 2) throw new Error("un JWT tiene 3 partes separadas por puntos");
  const b64 = (s) => { const t = s.replace(/-/g, "+").replace(/_/g, "/"); return decodeURIComponent(escape(atob(t + "=".repeat((4 - t.length % 4) % 4)))); };
  const cab = JSON.parse(b64(partes[0])), carga = JSON.parse(b64(partes[1]));
  const avisos = [];
  if (String(cab.alg).toLowerCase() === "none") avisos.push("alg «none»: el token no está firmado; cualquiera puede fabricarlo.");
  if (carga.exp && carga.exp * 1000 < Date.now()) avisos.push(`Expiró el ${new Date(carga.exp * 1000).toISOString()}.`);
  return { cab, carga, avisos };
}

export const base64 = { codificar: (s) => btoa(unescape(encodeURIComponent(s))), decodificar: (s) => decodeURIComponent(escape(atob(String(s).trim()))) };

/** Huella criptográfica (SHA-1, SHA-256, SHA-384, SHA-512) de texto o bytes con WebCrypto. */
export async function huella(datos, alg = "SHA-256") {
  const b = typeof datos === "string" ? new TextEncoder().encode(datos) : datos;
  return Array.from(new Uint8Array(await crypto.subtle.digest(alg, b)), (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Respuesta JSON de DNS sobre HTTPS (dns.google) → lista legible. */
export function leerDoH(d) {
  const TIPOS = { 1: "A", 2: "NS", 5: "CNAME", 6: "SOA", 15: "MX", 16: "TXT", 28: "AAAA", 257: "CAA" };
  return (d?.Answer || []).map((a) => ({ tipo: TIPOS[a.type] || String(a.type), valor: String(a.data || "").replace(/^"|"$/g, ""), ttl: a.TTL }));
}

/** Revisión de la política de correo de un dominio a partir de sus registros TXT (SPF) y de _dmarc. */
export function revisarCorreoDominio(txt, dmarc) {
  const spf = txt.find((t) => /^v=spf1/i.test(t)) || "";
  const dm = dmarc.find((t) => /^v=DMARC1/i.test(t)) || "";
  const p = (dm.match(/;\s*p=(\w+)/i) || [, ""])[1].toLowerCase();
  const hallazgos = [];
  if (!spf) hallazgos.push("Sin SPF: cualquiera puede enviar correo «desde» este dominio con menos obstáculos.");
  else if (/\+all\b/.test(spf)) hallazgos.push("SPF con «+all»: autoriza a cualquier servidor; equivale a no tener SPF.");
  else if (/~all\b/.test(spf)) hallazgos.push("SPF con «~all» (falla suave): los correos no autorizados se marcan, no se rechazan.");
  if (!dm) hallazgos.push("Sin DMARC: el dominio no indica qué hacer con correos que fallan SPF/DKIM.");
  else if (p === "none") hallazgos.push("DMARC en «p=none»: solo monitorea; no bloquea la suplantación.");
  return { spf, dmarc: dm, politica: p || "sin política", hallazgos };
}

// ------------------------------------------------------------------ análisis de inteligencia

/** Lenguaje de probabilidad de la directiva ICD 203 de la comunidad de inteligencia de EUA (rangos en %). */
export const ICD203 = [
  { min: 1, max: 5, es: "Casi nula / remota", en: "almost no chance / remote" },
  { min: 5, max: 20, es: "Muy improbable", en: "very unlikely / highly improbable" },
  { min: 20, max: 45, es: "Improbable", en: "unlikely / improbable" },
  { min: 45, max: 55, es: "Aproximadamente igual de probable", en: "roughly even chance / roughly even odds" },
  { min: 55, max: 80, es: "Probable", en: "likely / probable" },
  { min: 80, max: 95, es: "Muy probable", en: "very likely / highly probable" },
  { min: 95, max: 99, es: "Casi seguro", en: "almost certain / nearly certain" },
];
export const terminoICD = (pct) => ICD203.find((r) => pct >= r.min && pct <= r.max) || (pct < 1 ? ICD203[0] : ICD203.at(-1));

/**
 * Análisis de hipótesis en competencia (ACH, Richards Heuer). Cada celda: «CC» muy consistente, «C» consistente, «N» neutral,
 * «I» inconsistente, «II» muy inconsistente. Se gana por tener MENOS evidencia en contra (no más a favor), ponderada por peso.
 */
export function puntuarACH(hipotesis, evidencias) {
  const V = { CC: 0, C: 0, N: 0, NA: 0, I: 1, II: 2 };
  return hipotesis.map((h, j) => {
    const inconsistencia = evidencias.reduce((s, e) => s + (V[e.celdas?.[j]] ?? 0) * (Number(e.peso) || 1), 0);
    return { hipotesis: h, inconsistencia };
  }).sort((a, b) => a.inconsistencia - b.inconsistencia);
}

/** Evidencia diagnóstica: la que no califica igual a todas las hipótesis (la que de verdad ayuda a distinguir). */
export const diagnostica = (e, n) => new Set((e.celdas || []).slice(0, n).map((c) => (c === "CC" ? "C" : c === "II" ? "I" : c || "N"))).size > 1;

/** CARVER (uso defensivo: qué activos propios proteger primero). Cada criterio 1–10; mayor total = mayor prioridad de protección. */
export const CRITERIOS_CARVER = [
  ["C", "Criticidad", "¿Cuánto afecta a la misión si se pierde?"],
  ["A", "Accesibilidad", "¿Qué tan fácil es llegar a él (físico o digital)?"],
  ["R", "Recuperabilidad", "¿Cuánto tarda en reponerse? (más tardanza = más puntos)"],
  ["V", "Vulnerabilidad", "¿Qué tan fácil es dañarlo con medios disponibles?"],
  ["E", "Efecto", "¿Cuánto daño colateral a la población, clientes o reputación?"],
  ["R2", "Reconocibilidad", "¿Qué tan fácil es identificarlo desde fuera?"],
];
export function puntuarCARVER(activos) {
  return activos.map((a) => ({ ...a, total: CRITERIOS_CARVER.reduce((s, [k]) => s + Math.max(1, Math.min(10, Number(a[k]) || 1)), 0) }))
    .sort((x, y) => y.total - x.total);
}

/** Cuadrante poder-interés (Mendelow) de un actor: dónde enfocar la gestión. */
export function cuadranteActor(poder, interes) {
  const p = Number(poder) >= 3, i = Number(interes) >= 3;
  return p && i ? "Gestionar de cerca" : p ? "Mantener satisfecho" : i ? "Mantener informado" : "Monitorear";
}

/** Plantillas de marcos de análisis (militar, político, corporativo). Cada una es una lista de campos con su pregunta guía. */
export const MARCOS = {
  pmesii: { nombre: "PMESII-PT (entorno operacional)", uso: "Militar y político: describir un país o región antes de actuar.", campos: [
    ["Político", "¿Quién gobierna, con qué legitimidad, qué facciones y alianzas hay?"], ["Militar", "Fuerzas propias, rivales y no estatales; capacidades y despliegue."],
    ["Económico", "Producción, comercio, empleo, deuda, economía ilegal."], ["Social", "Etnias, religiones, idiomas, migración, tensiones."],
    ["Información", "Medios, redes, censura, narrativas y desinformación."], ["Infraestructura", "Energía, agua, transporte, telecomunicaciones, salud."],
    ["Entorno físico", "Terreno, clima, recursos naturales, riesgos."], ["Tiempo", "Calendario electoral, estaciones, plazos, ventanas de oportunidad."]] },
  ascope: { nombre: "ASCOPE (consideraciones civiles)", uso: "Mapear una zona concreta: qué hay y qué importa a la población.", campos: [
    ["Áreas", "Zonas clave: barrios, mercados, zonas agrícolas, fronteras."], ["Estructuras", "Puentes, hospitales, presas, templos, torres."],
    ["Capacidades", "Servicios: agua, luz, salud, seguridad, justicia."], ["Organizaciones", "Gobierno, ONG, iglesias, sindicatos, crimen organizado, empresas."],
    ["Personas", "Grupos e influencias (sin perfilar individuos)."], ["Eventos", "Fiestas, elecciones, cosechas, aniversarios, marchas."]] },
  mettc: { nombre: "METT-TC (planeación de una misión)", uso: "Ordenar los factores antes de decidir una acción.", campos: [
    ["Misión", "¿Qué hay que lograr y para qué?"], ["Enemigo / amenaza", "¿Quién o qué puede impedirlo? Capacidades e intenciones."],
    ["Terreno y clima", "Obstáculos, rutas, observación, clima esperado."], ["Tropas / recursos", "Personas, equipo, presupuesto y apoyos disponibles."],
    ["Tiempo", "Plazo, horas de luz, tiempo de reacción."], ["Consideraciones civiles", "Impacto en población, ley, reputación."]] },
  dafo: { nombre: "FODA / DAFO", uso: "Corporativo y político: posición propia frente al entorno.", campos: [
    ["Fortalezas", "Ventajas internas propias."], ["Debilidades", "Carencias internas."], ["Oportunidades", "Factores externos a favor."], ["Amenazas", "Factores externos en contra."]] },
  pestel: { nombre: "PESTEL", uso: "Corporativo: entorno macro de un mercado o país.", campos: [
    ["Político", "Estabilidad, políticas públicas, sanciones."], ["Económico", "Crecimiento, inflación, tipo de cambio, tasas."], ["Social", "Demografía, consumo, cultura."],
    ["Tecnológico", "Adopción, infraestructura digital, innovación."], ["Ecológico", "Clima, agua, regulación ambiental, riesgo físico."], ["Legal", "Leyes laborales, fiscales, de datos, de competencia."]] },
  premortem: { nombre: "Pre-mortem", uso: "Imagina que el plan ya fracasó: ¿por qué? Reduce el exceso de confianza.", campos: [
    ["Plan o decisión", "¿Qué se va a hacer?"], ["Fracasó porque…", "Escribe todas las causas posibles, sin filtrar."], ["Señales tempranas", "¿Qué indicaría que vamos hacia ese fracaso?"],
    ["Medidas", "¿Qué cambiamos hoy para evitarlo?"]] },
  supuestos: { nombre: "Revisión de supuestos clave (KAC)", uso: "Separar lo que sabemos de lo que suponemos.", campos: [
    ["Conclusión actual", "¿Qué creemos hoy?"], ["Supuestos", "¿Qué tiene que ser cierto para que la conclusión se sostenga?"],
    ["¿Qué tan sólido es cada uno?", "Sólido / con reservas / débil, y por qué."], ["Qué lo invalidaría", "Evidencia que, si aparece, nos obliga a cambiar."]] },
  indicadores: { nombre: "Indicadores y alertas (I&W)", uso: "Vigilar un escenario: qué señales observar y dónde.", campos: [
    ["Escenario", "¿Qué podría pasar?"], ["Indicadores", "Hechos observables que lo anticipan (movimientos, compras, discursos, precios)."],
    ["Fuentes", "Dónde se observaría cada indicador (capas de este mapa, medios, registros)."], ["Umbral", "¿A partir de cuándo se avisa?"]] },
  mision: { nombre: "Mission Brief (DOMINUS OPS)", uso: "Resumen de una página para quien decide.", campos: [
    ["Situación (BLUF)", "Lo más importante en una o dos frases."], ["Antecedentes", "Contexto mínimo necesario."], ["Evaluación", "Qué creemos y con qué probabilidad (lenguaje ICD 203)."],
    ["Escenarios", "Más probable, más peligroso, mejor caso."], ["Implicaciones", "Qué significa para la organización."], ["Recomendaciones", "Opciones con costo y riesgo."],
    ["Brechas", "Lo que no sabemos y cómo cubrirlo."], ["Fuentes", "Con su confiabilidad (escala A–F / 1–6)."]] },
};

/** Escala del Almirantazgo / OTAN para calificar fuente (A–F) e información (1–6). */
export const ESCALA_FUENTE = { A: "Completamente confiable", B: "Normalmente confiable", C: "Bastante confiable", D: "Normalmente no confiable", E: "No confiable", F: "No se puede juzgar" };
export const ESCALA_INFO = { 1: "Confirmada por otras fuentes", 2: "Probablemente cierta", 3: "Posiblemente cierta", 4: "Dudosa", 5: "Improbable", 6: "No se puede juzgar" };

/** Texto Markdown de una plantilla llena (para copiar o descargar). */
export function marcoAMarkdown(id, valores, titulo = "") {
  const m = MARCOS[id];
  return `# ${titulo || m.nombre}\n\n_${m.uso}_\n\n` + m.campos.map(([c, q], i) => `## ${c}\n\n${(valores[i] || "").trim() || `_(pendiente: ${q})_`}\n`).join("\n");
}

// ------------------------------------------------------------------ plantillas de auditoría (config/auditorias.json)

/** % de cumplimiento de una lista de estados: cumple = 1, parcial = 0.5, no = 0; «no aplica» y vacíos no cuentan. */
export function cumplimiento(estados) {
  const v = estados.filter((e) => ["cumple", "parcial", "no"].includes(e));
  if (!v.length) return null;
  return Math.round((v.reduce((s, e) => s + (e === "cumple" ? 1 : e === "parcial" ? 0.5 : 0), 0) / v.length) * 100);
}

export const semaforo = (pct) => (pct == null ? "sin evaluar" : pct >= 85 ? "verde" : pct >= 60 ? "amarillo" : "rojo");

/** Áreas a auditar de un sector: módulos comunes + los del sector, con un id estable por control («c-0-1», «s-2-0»). */
export function areasDe(cfg, sector) {
  const s = cfg.sectores[sector];
  const marca = (pref) => (a, i) => ({ ...a, controles: a.controles.map((c, j) => ({ ...c, id: `${pref}-${i}-${j}` })) });
  return [...cfg.comunes.map(marca("c")), ...(s ? s.areas.map(marca("s")) : [])];
}

/** Informe en Markdown: datos generales, resultado por área, hallazgos (primero los «no cumple») y lista completa. */
export function informeAuditoria(cfg, sector, d) {
  const s = cfg.sectores[sector], areas = areasDe(cfg, sector), r = d.respuestas || {};
  const est = cfg.metodo.estados;
  const filas = areas.map((a) => { const p = cumplimiento(a.controles.map((c) => r[c.id]?.estado)); return `| ${a.area} | ${p == null ? "—" : p + " %"} | ${semaforo(p)} |`; });
  const total = cumplimiento(areas.flatMap((a) => a.controles.map((c) => r[c.id]?.estado)));
  const hallazgos = areas.flatMap((a) => a.controles.filter((c) => ["no", "parcial"].includes(r[c.id]?.estado)).map((c) => ({ a, c, x: r[c.id] })))
    .sort((p, q) => (p.x.estado === "no" ? 0 : 1) - (q.x.estado === "no" ? 0 : 1));
  return `# Informe de auditoría: ${d.empresa || "(empresa)"}\n\n`
    + `- Sector: ${s?.nombre || sector}\n- Alcance: ${d.alcance || "(definir)"}\n- Auditor(es): ${d.auditor || "(nombre)"}\n- Fecha: ${d.fecha || new Date().toISOString().slice(0, 10)}\n`
    + `- Método: ${cfg.metodo.norma}\n- Cumplimiento global: ${total == null ? "sin evaluar" : total + " %"} (${semaforo(total)})\n\n`
    + `## Resultado por área\n\n| Área | Cumplimiento | Semáforo |\n|---|---|---|\n${filas.join("\n")}\n\n`
    + `## Hallazgos\n\n${hallazgos.length ? hallazgos.map(({ a, c, x }, i) => `${i + 1}. **[${est[x.estado]}] ${a.area}.** ${c.c}\n   - Criterio: ${c.r}\n   - Condición encontrada: ${x.nota || "(describir)"}\n   - Evidencia revisada: ${x.evidencia || c.e}`).join("\n") : "Sin hallazgos registrados."}\n\n`
    + `## Normas y reguladores de referencia\n\n${(s?.normas || []).map((n) => `- ${n}`).join("\n")}\n\nReguladores en México: ${(s?.reguladores_mx || []).join(", ")}. Internacionales: ${(s?.reguladores_int || []).join(", ")}.\n\n`
    + `> ${cfg.descripcion}\n`;
}
