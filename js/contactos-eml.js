import { huella } from "./herr-logica.js";
import { registrosDNS } from "./contactos-fuentes.js";

const MAX_EML = 10 * 1024 * 1024;
const bytes = (binario) => Uint8Array.from(binario, (caracter) => caracter.charCodeAt(0));
const dominioValido = (valor) => /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(valor || "");
const selectorValido = (valor) => /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(valor || "");

export function separarMensaje(entrada) {
  const bruto = entrada.replace(/\r?\n/g, "\r\n");
  const separador = bruto.indexOf("\r\n\r\n");
  const cabecera = separador < 0 ? bruto : bruto.slice(0, separador);
  const campos = cabecera.split(/\r\n(?![ \t])/).flatMap((raw) => {
    const campo = /^([!-9;-~]+):/.exec(raw);
    return campo ? [{ raw, nombre: campo[1].toLowerCase(), valor: raw.slice(campo[0].length).replace(/\r\n/g, "").trim() }] : [];
  });
  return { campos, cuerpo: separador < 0 ? null : bruto.slice(separador + 4) };
}

function etiquetas(texto) {
  const tags = new Map();
  for (const item of texto.split(";")) {
    if (!item.trim()) continue;
    const tag = /^\s*([a-z][a-z0-9_]*)\s*=\s*(.*?)\s*$/is.exec(item);
    if (!tag || tags.has(tag[1])) return null;
    tags.set(tag[1], tag[2]);
  }
  return tags;
}

function identificarFirma(campo) {
  const tags = etiquetas(campo.valor);
  return {
    raw: campo.raw, tags, dominio: tags?.get("d") || "", selector: tags?.get("s") || "",
    algoritmo: tags?.get("a") || "", parcial: tags?.has("l"),
  };
}

const firmasDe = ({ campos }) => campos.filter(({ nombre }) => nombre === "dkim-signature").slice(0, 5).map(identificarFirma);

export function señalesEncabezados(entrada) {
  const mensaje = separarMensaje(entrada);
  const { campos } = mensaje;
  const camposDe = (nombre) => campos.filter((c) => c.nombre === nombre).map((c) => c.valor);
  const dominioDe = (campo) => (campo.match(/@([\w.-]+)>?\s*$/) || [])[1]?.toLowerCase();
  const remitente = dominioDe(camposDe("from")[0] || "");
  const respuesta = dominioDe(camposDe("reply-to")[0] || "");
  return [
    ["Dominios From y Reply-To", remitente && respuesta && remitente !== respuesta ? `${remitente} → ${respuesta} (distintos)` : ""],
    ["Authentication-Results", camposDe("authentication-results").slice(0, 5).join(" · ")],
    ["ARC", camposDe("arc-seal").length ? `${camposDe("arc-seal").length} sello(s) declarado(s)` : ""],
    ...firmasDe(mensaje).map(({ dominio, selector, algoritmo, parcial }) => [
      "DKIM declarada", [dominio, selector, algoritmo, parcial && "firma con límite de cuerpo"].filter(Boolean).join(" · ") || "Encabezado sin campos reconocibles.",
    ]),
  ];
}

function normalizarCuerpo(cuerpo, modo) {
  const lineas = cuerpo.split("\r\n");
  if (modo === "relaxed") {
    for (let i = 0; i < lineas.length; i++) lineas[i] = lineas[i].replace(/[ \t]+$/g, "").replace(/[ \t]+/g, " ");
  }
  while (lineas.at(-1) === "") lineas.pop();
  if (!lineas.length && modo === "relaxed") return "";
  return lineas.join("\r\n") + "\r\n";
}

function normalizarCampo(raw, modo) {
  if (modo === "simple") return raw;
  const colon = raw.indexOf(":");
  const valor = raw.slice(colon + 1).replace(/\r\n/g, "").replace(/[ \t]+/g, " ").replace(/^ | $/g, "");
  return raw.slice(0, colon).toLowerCase() + ":" + valor;
}

function entradaFirma(campos, raw, nombres, modo) {
  const disponibles = campos.filter((c) => c.raw !== raw);
  const seleccionados = nombres.flatMap((nombre) => {
    const posicion = disponibles.findLastIndex((c) => c.nombre === nombre);
    return posicion < 0 ? [] : [normalizarCampo(disponibles.splice(posicion, 1)[0].raw, modo) + "\r\n"];
  });
  // Se vacía el valor de b=, incluida su propia separación por plegado, preservando los demás tags.
  const sinFirma = raw.replace(/([:;][\r\n \t]*b[\r\n \t]*=)[^;]*/, "$1");
  return bytes(seleccionados.join("") + normalizarCampo(sinFirma, modo));
}

const deBase64 = (valor) => bytes(atob(valor.replace(/[\r\n \t]/g, "")));

function longitudDer(n) {
  return n < 128 ? [n] : n < 256 ? [129, n] : [130, n >> 8, n & 255];
}

function envolverPkcs1(clave) {
  const algoritmo = [48, 13, 6, 9, 42, 134, 72, 134, 247, 13, 1, 1, 1, 5, 0];
  const bits = [3, ...longitudDer(clave.length + 1), 0, ...clave];
  return Uint8Array.of(48, ...longitudDer(algoritmo.length + bits.length), ...algoritmo, ...bits);
}

async function comprobarFirma(mensaje, firma, registro) {
  const { tags, raw, algoritmo } = firma;
  const tipo = algoritmo === "rsa-sha256" ? "rsa" : algoritmo === "ed25519-sha256" ? "ed25519" : "";
  const modos = (tags.get("c") || "simple/simple").toLowerCase().split("/");
  const [modoCabecera, modoCuerpo = "simple"] = modos;
  if (!tipo || modos.length > 2 || !modos.every((modo) => ["simple", "relaxed"].includes(modo))) return "Algoritmo o normalización fuera de cobertura.";
  const cabecerasFirmadas = (tags.get("h") || "").toLowerCase().split(":").map((nombre) => nombre.trim());
  if (tags.get("v") !== "1" || !tags.get("b") || !tags.get("bh") || !cabecerasFirmadas.includes("from")
      || mensaje.campos.filter((campo) => campo.nombre === "from").length !== 1
      || (tags.has("q") && !tags.get("q").toLowerCase().split(":").map((metodo) => metodo.trim()).includes("dns/txt"))) {
    return "Firma incompleta o método fuera de cobertura.";
  }
  if ((registro.get("k") || "rsa") !== tipo || (registro.has("h") && !registro.get("h").split(":").map((h) => h.trim()).includes("sha256"))
      || (registro.has("s") && !registro.get("s").split(":").some((s) => ["*", "email"].includes(s.trim())))) return "La clave publicada no admite esta firma.";
  const identidad = (tags.get("i") || `@${firma.dominio}`).split("@").at(-1).toLowerCase();
  const dominio = firma.dominio.toLowerCase();
  if (identidad !== dominio && (!identidad.endsWith(`.${dominio}`) || (registro.get("t") || "").split(":").includes("s"))) {
    return "La identidad declarada queda fuera del dominio permitido por la firma.";
  }
  const normalizado = normalizarCuerpo(mensaje.cuerpo, modoCuerpo);
  const limite = tags.get("l") ?? String(normalizado.length);
  if (!/^\d+$/.test(limite) || Number(limite) > normalizado.length) return "Longitud de cuerpo firmada inválida.";
  const hashCuerpo = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes(normalizado.slice(0, Number(limite)))));
  const esperado = deBase64(tags.get("bh"));
  if (esperado.length !== hashCuerpo.length || esperado.some((octeto, i) => octeto !== hashCuerpo[i])) return "El hash del cuerpo no coincide.";

  const clave = deBase64(registro.get("p"));
  if (clave.length > 1024) return "Clave fuera del tamaño admitido.";
  const entrada = entradaFirma(mensaje.campos, raw, cabecerasFirmadas, modoCabecera);
  const valorFirma = deBase64(tags.get("b"));
  let valida;
  if (tipo === "rsa") {
    const opciones = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
    const publica = await crypto.subtle.importKey("spki", clave, opciones, false, ["verify"])
      .catch(() => crypto.subtle.importKey("spki", envolverPkcs1(clave), opciones, false, ["verify"]));
    if (publica.algorithm.modulusLength < 1024) return "Clave RSA por debajo de 1024 bits.";
    valida = await crypto.subtle.verify(opciones.name, publica, valorFirma, entrada);
  } else {
    const publica = await crypto.subtle.importKey("raw", clave, "Ed25519", false, ["verify"]);
    valida = await crypto.subtle.verify("Ed25519", publica, valorFirma, await crypto.subtle.digest("SHA-256", entrada));
  }
  if (!valida) return "La firma criptográfica no coincide con la clave DNS actual.";
  if (tags.has("x") && Number(tags.get("x")) < Date.now() / 1000) return "Firma criptográfica válida con la clave actual, pero expirada.";
  return firma.parcial
    ? `Firma criptográfica válida con la clave actual. Cobertura limitada a ${limite} bytes del cuerpo normalizado.`
    : "Firma criptográfica válida con la clave DNS actual.";
}

export async function consultarFirmas(entrada, verificarCuerpo, resolver = registrosDNS) {
  const mensaje = separarMensaje(entrada);
  return Promise.all(firmasDe(mensaje).map(async (firma) => {
    const { dominio, selector } = firma;
    const nombre = `${selector}._domainkey.${dominio}`.toLowerCase();
    if (!dominioValido(dominio) || !selectorValido(selector) || nombre.length > 253) return ["DKIM", "Dominio o selector inválido."];
    let txt;
    try {
      txt = await resolver(nombre, "TXT");
    } catch {
      return [nombre, "DNS no disponible."];
    }
    const claves = (txt || []).map(etiquetas).filter((clave) => clave?.has("p") && (!clave.has("v") || clave.get("v") === "DKIM1"));
    if (claves.length !== 1) return [nombre, claves.length ? "Hay varios registros de clave." : "Sin clave publicada actualmente."];
    if (!claves[0].get("p")) return [nombre, "La clave publicada está revocada."];
    if (!verificarCuerpo || mensaje.cuerpo === null) return [nombre, "Clave DNS encontrada. Usa el .eml completo para comprobar la firma."];
    try {
      return [nombre, await comprobarFirma(mensaje, firma, claves[0])];
    } catch {
      return [nombre, "El navegador no pudo comprobar la firma con la clave actual."];
    }
  }));
}

export async function analizarArchivoCorreo(archivo) {
  if (archivo.size === 0 || archivo.size > MAX_EML) throw new Error("Elige un archivo .eml de hasta 10 MB.");
  const datos = new Uint8Array(await archivo.arrayBuffer());
  const fragmentos = [];
  // Conserva cada octeto del mensaje para verificar DKIM, incluidos cuerpos en codificaciones de 8 bits.
  for (let i = 0; i < datos.length; i += 8192) fragmentos.push(String.fromCharCode(...datos.subarray(i, i + 8192)));
  const bruto = fragmentos.join("");
  if (separarMensaje(bruto).cuerpo === null) throw new Error("El archivo no contiene un mensaje .eml completo.");
  const { default: PostalMime } = await import("../vendor/postal-mime/postal-mime.js");
  const correo = await PostalMime.parse(datos, { maxNestingDepth: 30, maxHeadersSize: 65536, maxPartCount: 256 });
  const adjuntos = await Promise.all(correo.attachments.slice(0, 40).map(async (adjunto) => [
    adjunto.filename || "Adjunto sin nombre",
    `${adjunto.mimeType || "tipo desconocido"} · ${adjunto.content.byteLength} bytes · SHA-256 ${await huella(adjunto.content)}`,
  ]));
  return { bruto, correo, adjuntos, totalAdjuntos: correo.attachments.length };
}

export function dominiosEnlaces(texto, urlsHtml = []) {
  const dominios = new Set();
  const revisar = (valor) => {
    try {
      const url = new URL(valor);
      if (["https:", "http:"].includes(url.protocol) && url.hostname) dominios.add(url.hostname);
    } catch {
      // Ignora enlaces relativos y valores inválidos.
    }
  };
  for (const valor of urlsHtml) revisar(valor);
  for (const coincidencia of (texto || "").matchAll(/https?:\/\/[^\s<>"']+/gi)) revisar(coincidencia[0]);
  return [...dominios].slice(0, 40);
}
