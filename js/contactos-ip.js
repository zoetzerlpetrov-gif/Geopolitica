import { esIPv4, resumenRipe, urlsRipe } from "./agencia-logica.js";
import { registrosDNS } from "./contactos-fuentes.js";
import { puntoGeografico } from "./coordenadas-mapa.js";

export function interpretarIpPublica(entrada) {
  const valor = entrada.trim();
  const error = () => new Error("Escribe una dirección IPv4 o IPv6 pública válida.");
  if (esIPv4(valor)) {
    const octetos = valor.split(".").map(Number);
    const [a, b, c] = octetos;
    const ip = octetos.join(".");
    if (ip !== valor || a === 0 || a === 10 || a === 127 || a >= 224 ||
        (a === 100 && b >= 64 && b < 128) || (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168) ||
        (a === 192 && b === 0 && c === 2) || (a === 198 && [18, 19].includes(b)) ||
        (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)) throw error();
    return { ip, version: 4, reverso: `${octetos.reverse().join(".")}.in-addr.arpa` };
  }
  const literal = valor.replace(/^\[([^\]]+)\]$/, "$1");
  if (!/^[0-9a-f:]+$/i.test(literal) || !literal.includes(":")) throw error();
  let ip;
  try {
    ip = new URL(`http://[${literal}]/`).hostname.slice(1, -1);
  } catch {
    throw error();
  }
  if (!/^[23][a-f0-9]{3}:/.test(ip) || /^(?:2001:db8:|3fff:[0-9a-f]{0,3}:)/.test(ip)) throw error();
  const [antes, despues] = ip.split("::");
  const grupos = antes.split(":");
  if (despues !== undefined) {
    const resto = despues ? despues.split(":") : [];
    grupos.push(...Array(8 - grupos.length - resto.length).fill("0"), ...resto);
  }
  const completo = grupos.map((grupo) => grupo.padStart(4, "0")).join("");
  return { ip, version: 6, reverso: `${[...completo].reverse().join(".")}.ip6.arpa` };
}

const texto = (valor) => typeof valor === "string" ? valor.trim().slice(0, 200) : "";
const estado = (error) => ({ estado: error });

async function json(url, fetcher) {
  const respuesta = await fetcher(url, { referrerPolicy: "no-referrer", signal: AbortSignal.timeout(8000) });
  if (!respuesta.ok) throw new Error();
  return respuesta.json();
}

export async function consultarIpPublica(entrada, fetcher = fetch) {
  const { ip, version, reverso } = interpretarIpPublica(entrada);
  const url = new URL("https://ip-info.com/json");
  url.searchParams.set("ip", ip);
  const geo = json(url, fetcher).then((d) => {
    if (interpretarIpPublica(d.ip).ip !== ip) throw new Error();
    const filas = [
      ["Ciudad estimada", texto(d.city)], ["Región estimada", texto(d.region)],
      ["País estimado", texto(d.country_name || d.country)],
      ["Zona horaria estimada", texto(d.timezone)], ["Proveedor reportado", texto(d.isp)],
      ["Anycast", d.is_anycast === true ? "Sí · la dirección puede anunciarse desde varias ubicaciones." : ""],
    ].filter(([, valor]) => valor);
    return { filas, coordenadas: puntoGeografico(d.latitude, d.longitude) };
  }).catch(() => estado("La fuente de geolocalización no respondió o no devolvió esta IP."));

  const red = Promise.allSettled(Object.entries(urlsRipe(ip).urls).map(async ([clave, enlace]) => {
    const datos = await json(enlace, fetcher);
    if (!datos.data || (datos.status && datos.status !== "ok")) throw new Error();
    return [clave, datos];
  })).then((respuestas) => {
    const datos = Object.fromEntries(respuestas.flatMap((r) => r.status === "fulfilled" ? [r.value] : []));
    if (!datos.prefijo && !datos.pais) return estado("RIPEstat no respondió para esta IP.");
    const resumen = resumenRipe("ip", datos);
    const bloque = datos.prefijo?.data?.block;
    return { filas: [
      ["Prefijo anunciado", datos.prefijo && resumen.anunciado ? resumen.prefijo : ""],
      ["ASN y organización", resumen.asns.map(({ asn, titular }) => `AS${asn}${titular ? ` · ${titular}` : ""}`).join(", ")],
      ["Bloque superior y registro regional", [texto(bloque?.resource), texto(bloque?.desc)].filter(Boolean).join(" · ")],
      ["País del registro", resumen.pais === "—" ? "" : resumen.pais],
    ].filter(([, valor]) => valor) };
  });

  const ptr = registrosDNS(reverso, "PTR", fetcher)
    .then((nombres) => ({ filas: [["Nombre inverso (PTR)", nombres?.join(", ") || "Sin registro publicado."]] }))
    .catch(() => estado("El DNS inverso no respondió."));
  const [ubicacion, registro, dns] = await Promise.all([geo, red, ptr]);
  return { ip, version, ubicacion, registro, dns };
}
