import { analizarEncabezados, huella } from "./herr-logica.js";
import { consultarIncidentesDominio, consultarInfraestructura, consultarRdap, proveedorCorreo, registrosDNS } from "./contactos-fuentes.js";
import { analizarArchivoCorreo, consultarFirmas, dominiosEnlaces, señalesEncabezados } from "./contactos-eml.js";

const TIPOS_LINEA = {
  FIXED_LINE: "Fija", MOBILE: "Móvil", FIXED_LINE_OR_MOBILE: "Fija o móvil",
  TOLL_FREE: "Gratuita", PREMIUM_RATE: "Tarifa especial", SHARED_COST: "Costo compartido",
  VOIP: "VoIP", PERSONAL_NUMBER: "Número personal", PAGER: "Buscapersonas",
  UAN: "Número de acceso universal", VOICEMAIL: "Buzón de voz",
};

export function interpretarDireccion(entrada) {
  const partes = entrada.trim().replace(/\.$/, "").split("@");
  const dominioEntrada = partes.at(-1);
  const correo = partes.length === 2 ? partes.join("@") : "";
  if (partes.length > 2 || (correo && (
    !/^[\p{L}\p{N}!#$%&'*+\-/=?^_`{|}~.]+$/u.test(partes[0]) ||
    partes[0].length > 64 || /^\.|\.\.|\.$/.test(partes[0])
  )) || !/^[\p{L}\p{N}\p{M}.-]+$/u.test(dominioEntrada)) {
    throw new Error("Escribe un correo o dominio válido.");
  }

  let dominio;
  try {
    dominio = new URL(`https://${dominioEntrada}`).hostname;
  } catch {
    throw new Error("Escribe un correo o dominio válido.");
  }
  if (dominio.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(dominio)) {
    throw new Error("Escribe un dominio público, por ejemplo example.org.");
  }
  return { dominio, correo };
}

export async function consultarDNS(dominio, fetcher = fetch) {
  return Promise.all([
    ["MX", dominio, "MX", () => true],
    ["SPF", dominio, "TXT", (valor) => /^v=spf1(?:\s|$)/i.test(valor)],
    ["DMARC", `_dmarc.${dominio}`, "TXT", (valor) => /^v=DMARC1(?:\s*;|$)/i.test(valor)],
  ].map(async ([etiqueta, nombre, tipo, aplica]) => {
    try {
      const registros = await registrosDNS(nombre, tipo, fetcher);
      if (!registros) return [etiqueta, "Sin registro. DNS no reconoce este nombre."];
      const valores = registros.filter(aplica);
      if (tipo === "MX" && valores.length === 1 && /^0\s+\.$/.test(valores[0])) {
        return [etiqueta, "0 . · Null MX. El dominio declara que no recibe correo."];
      }
      return [etiqueta, valores.join(" · ") || "Sin registro publicado."];
    } catch {
      return [etiqueta, "Consulta no disponible. Inténtalo de nuevo."];
    }
  }));
}

function enlaceHttps(valor) {
  try {
    const url = new URL(valor);
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch {
    // La fuente puede omitir el enlace.
  }
  return "";
}

function enlaceGravatar(valor, avatar = false) {
  try {
    const url = new URL(valor);
    const hostValido = avatar ? /^(?:[0-9]+\.|www\.|secure\.)?gravatar\.com$/.test(url.hostname)
      : url.hostname === "gravatar.com" || url.hostname === "www.gravatar.com";
    if (url.protocol === "https:" && hostValido && !url.username && !url.password && !url.port) return url.href;
  } catch {
    // La fuente puede omitir el enlace.
  }
  return "";
}

export async function consultarGravatar(correo, fetcher = fetch) {
  if (!correo) return { estado: "Escribe una dirección de correo para buscar el perfil." };
  try {
    const hash = await huella(correo.toLowerCase());
    const respuesta = await fetcher(`https://api.gravatar.com/v3/profiles/${hash}`, {
      referrerPolicy: "no-referrer", signal: AbortSignal.timeout(8000),
    });
    if (respuesta.status === 404) return { estado: "Sin perfil público para este correo en Gravatar." };
    if (!respuesta.ok) throw new Error();
    const perfil = await respuesta.json();
    if (perfil.hash !== hash) throw new Error();
    return {
      nombre: typeof perfil.display_name === "string" ? perfil.display_name : "",
      ubicacion: typeof perfil.location === "string" ? perfil.location : "",
      biografia: typeof perfil.description === "string" ? perfil.description : "",
      cargo: typeof perfil.job_title === "string" ? perfil.job_title : "",
      empresa: typeof perfil.company === "string" ? perfil.company : "",
      cuentas: (Array.isArray(perfil.verified_accounts) ? perfil.verified_accounts : []).filter((cuenta) => cuenta?.is_hidden !== true).slice(0, 12).flatMap((cuenta) => {
        const url = enlaceHttps(cuenta?.url);
        return url ? [{ url, nombre: String(cuenta.service_label || cuenta.service_type || new URL(url).hostname) }] : [];
      }),
      enlace: enlaceGravatar(perfil.profile_url),
      avatar: enlaceGravatar(perfil.avatar_url, true),
    };
  } catch {
    return { estado: "Consulta a Gravatar no disponible. Inténtalo de nuevo." };
  }
}

export function interpretarEncabezados(entrada) {
  const cabeceras = entrada.trimStart().split(/\r?\n[\t ]*\r?\n/, 1)[0];
  if (!/^(?:from|to|reply-to|return-path|received|authentication-results|date|subject|message-id):/im.test(cabeceras)) {
    throw new Error("Pega los encabezados del mensaje original.");
  }
  return analizarEncabezados(cabeceras);
}

export function interpretarTelefono(entrada, parsear) {
  const numero = parsear(entrada.trim(), { defaultCountry: "MX", extract: false });
  if (!numero?.isPossible()) throw new Error("El número tiene un formato o longitud inválidos. Revisa el prefijo y los dígitos.");
  const valido = numero.isValid();
  const territorio = numero.country
    ? new Intl.DisplayNames(["es-MX"], { type: "region" }).of(numero.country)
    : "Sin país o territorio determinado";
  return [
    ["Formato internacional", numero.formatInternational()],
    ["Formato E.164", numero.number],
    ["Formato nacional", numero.formatNational?.()],
    ["Dígitos nacionales", numero.nationalNumber],
    ["Extensión", numero.ext],
    ["País o territorio de numeración", territorio],
    ["Prefijo internacional", `+${numero.countryCallingCode}`],
    ["Tipo de línea según numeración", (valido && TIPOS_LINEA[numero.getType()]) || "Sin clasificar"],
    ["Plan de numeración", valido ? "Coincide con el plan de numeración." : "Longitud posible, sin coincidencia con el plan de numeración."],
  ];
}

let cargarTelefono;
function obtenerAnalizadorTelefonico() {
  if (!cargarTelefono) {
    cargarTelefono = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/libphonenumber-js@1.13.15/bundle/libphonenumber-max.js";
      script.integrity = "sha384-KFpFw4Q7EIpeK/WJ3azDRjpDeYmDLF9DdzBb3LMPtHHFi/99I94irctbZUeBVBQv";
      script.crossOrigin = "anonymous";
      script.referrerPolicy = "no-referrer";
      const fallo = () => {
        clearTimeout(plazo);
        script.remove();
        reject(new Error("No se pudo cargar el plan de numeración. Inténtalo de nuevo."));
      };
      const plazo = setTimeout(fallo, 8000);
      script.onload = () => {
        clearTimeout(plazo);
        const parsear = globalThis.libphonenumber?.parsePhoneNumberFromString;
        if (parsear) resolve(parsear);
        else fallo();
      };
      script.onerror = fallo;
      document.head.append(script);
    }).catch((error) => {
      cargarTelefono = null;
      throw error;
    });
  }
  return cargarTelefono;
}

function mensaje(texto) {
  const elemento = document.createElement("p");
  elemento.className = "nota-capas";
  elemento.textContent = texto;
  return elemento;
}

function enlaceExterno(url, texto) {
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.target = "_blank";
  enlace.rel = "noopener noreferrer";
  enlace.textContent = texto;
  return enlace;
}

function lista(filas) {
  const elemento = document.createElement("ul");
  elemento.className = "lista-inv";
  for (const [etiqueta, valor] of filas) {
    if (!valor) continue;
    const item = document.createElement("li");
    const titulo = document.createElement("strong");
    titulo.textContent = etiqueta;
    item.append(titulo, ` · ${valor}`);
    elemento.append(item);
  }
  return elemento;
}

function vincular(id, ejecutar) {
  const formulario = document.getElementById(id);
  const salida = document.getElementById(`${id}-res`);
  const boton = formulario.querySelector('button[type="submit"]');
  let consulta = 0;
  formulario.addEventListener("reset", () => {
    consulta++;
    boton.disabled = false;
    salida.replaceChildren();
  });
  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const actual = ++consulta;
    boton.disabled = true;
    salida.replaceChildren(mensaje("Analizando…"));
    try {
      const resultado = await ejecutar(formulario);
      if (consulta === actual) salida.replaceChildren(...resultado);
    } catch (error) {
      if (consulta === actual) salida.replaceChildren(mensaje(error.message));
    } finally {
      if (consulta === actual) boton.disabled = false;
    }
  });
}

if (typeof document !== "undefined" && document.getElementById("b-herr-contactos")) {
  vincular("contacto-correo", async (formulario) => {
    const { dominio, correo } = interpretarDireccion(document.getElementById("contacto-direccion").value);
    const ampliar = formulario.elements.infraestructura.checked;
    const [registros, perfil, infra, rdap, incidentes] = await Promise.all([
      consultarDNS(dominio),
      formulario.elements.perfil.checked ? consultarGravatar(correo) : null,
      ampliar ? consultarInfraestructura(dominio) : null,
      ampliar ? consultarRdap(dominio) : null,
      ampliar ? consultarIncidentesDominio(dominio) : null,
    ]);
    const mx = registros.find(([etiqueta]) => etiqueta === "MX")[1];
    const resultados = [
      mensaje(`Registros de ${dominio} · Google Public DNS · ${new Date().toLocaleString("es-MX")}`),
      lista([...registros, ["Proveedor probable según MX", proveedorCorreo(mx.split(" · "))], ...(infra || [])]),
    ];
    if (rdap) {
      resultados.push(mensaje("Registro del dominio · RDAP"), rdap.filas ? lista(rdap.filas) : mensaje(rdap.estado));
      if (rdap.estado) resultados.push(enlaceExterno("https://lookup.icann.org/", "Abrir ICANN Lookup"));
    }
    if (incidentes) {
      resultados.push(mensaje("Incidentes del sitio o dominio · Have I Been Pwned. Esta consulta usa el dominio del incidente."));
      if (incidentes.estado) resultados.push(mensaje(incidentes.estado));
      else if (!incidentes.cantidad) resultados.push(mensaje("El catálogo no devolvió incidentes para este dominio exacto."));
      else resultados.push(mensaje(`Mostrando ${incidentes.filas.length} de ${incidentes.cantidad} incidentes.`), lista(incidentes.filas));
    }
    if (correo) {
      const buscador = new URL("https://www.google.com/search");
      buscador.searchParams.set("q", `"${correo}"`);
      resultados.push(mensaje("Menciones públicas. Si abres esta búsqueda, Google recibe el correo completo."),
        enlaceExterno(buscador.href, "Buscar la dirección exacta en la web ↗"));
    }
    if (!perfil) return resultados;
    if (perfil.estado) return [...resultados, mensaje(perfil.estado)];
    resultados.push(mensaje("Perfil público de Gravatar · Datos publicados por el perfil."), lista([
      ["Nombre publicado", perfil.nombre], ["Ubicación declarada", perfil.ubicacion], ["Biografía", perfil.biografia],
      ["Cargo publicado", perfil.cargo], ["Empresa publicada", perfil.empresa],
    ]));
    if (perfil.enlace) resultados.push(enlaceExterno(perfil.enlace, "Abrir perfil público en Gravatar"));
    if (perfil.cuentas.length) {
      const cuentas = document.createElement("ul");
      cuentas.className = "lista-inv";
      for (const cuenta of perfil.cuentas) {
        const item = document.createElement("li");
        item.append(enlaceExterno(cuenta.url, `${cuenta.nombre} · ${new URL(cuenta.url).hostname}`));
        cuentas.append(item);
      }
      resultados.push(mensaje("Cuentas vinculadas y marcadas como verificadas por Gravatar"), cuentas);
    }
    if (perfil.avatar) {
      const imagen = document.createElement("img");
      imagen.src = perfil.avatar;
      imagen.className = "foto-prev";
      imagen.alt = "Avatar público de Gravatar";
      imagen.width = 80;
      imagen.height = 80;
      imagen.loading = "lazy";
      imagen.referrerPolicy = "no-referrer";
      resultados.push(imagen);
    }
    return resultados;
  });
  vincular("contacto-cabeceras", async (formulario) => {
    const archivo = document.getElementById("contacto-eml").files[0];
    const consultarClaves = formulario.elements.claves.checked;
    const eml = archivo ? await analizarArchivoCorreo(archivo) : null;
    const entrada = eml?.bruto ?? formulario.elements["contacto-original"].value;
    const r = interpretarEncabezados(entrada);
    const resultados = [lista([
      ["Remitente declarado", r.de], ["Responder a", r.replyTo], ["Dirección de rebote", r.returnPath],
      ["Asunto", eml?.correo.subject || r.asunto], ["Fecha declarada", r.fecha], ["ID del mensaje", r.idMensaje],
      ["SPF reportado", r.spf], ["DKIM reportado", r.dkim], ["DMARC reportado", r.dmarc],
      ...señalesEncabezados(entrada),
    ]), mensaje("Los resultados de autenticación y los saltos provienen del mensaje analizado. Para atribuirlos, verifica qué servidor añadió cada encabezado.")];
    if (r.recibidos.length) resultados.push(mensaje("Saltos reportados, del más antiguo al más reciente"), lista(
      r.recibidos.map(({ de, por, ip, fecha }, i) => [`Salto ${i + 1}`, [de, por && `recibido por ${por}`, ip, fecha].filter(Boolean).join(" · ")]),
    ));
    if (eml) {
      // El contenido de un template es inerte: no se adjunta al DOM ni se cargan recursos del mensaje.
      const plantilla = document.createElement("template");
      plantilla.innerHTML = eml.correo.html || "";
      const enlaces = [...plantilla.content.querySelectorAll("a[href], area[href], form[action]")]
        .map((elemento) => elemento.getAttribute("href") ?? elemento.getAttribute("action"));
      const dominios = dominiosEnlaces(eml.correo.text, enlaces);
      resultados.push(mensaje("Dominios en enlaces y formularios · Se muestran como texto"),
        dominios.length ? lista(dominios.map((dominio, i) => [String(i + 1), dominio])) : mensaje("Sin enlaces HTTP o HTTPS detectados."),
        mensaje(`Adjuntos · ${eml.adjuntos.length} de ${eml.totalAdjuntos} analizados`));
      if (eml.adjuntos.length) resultados.push(lista(eml.adjuntos));
    }
    if (consultarClaves) {
      const firmas = await consultarFirmas(entrada, Boolean(eml));
      resultados.push(mensaje("DKIM · Claves publicadas al momento de la consulta"),
        firmas.length ? lista(firmas) : mensaje("El mensaje no contiene una cabecera DKIM-Signature."));
    }
    return resultados;
  });
  vincular("contacto-telefono", async () => {
    const entrada = document.getElementById("contacto-numero").value;
    return [
      lista(interpretarTelefono(entrada, await obtenerAnalizadorTelefonico())),
      mensaje("Este resultado describe la numeración. La identidad, el operador actual y la ubicación física quedan sin verificar."),
    ];
  });
}
