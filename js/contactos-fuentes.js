// Consultas de infraestructura. Cada proveedor recibe exclusivamente un dominio o un nombre DNS.
const opciones = () => ({ referrerPolicy: "no-referrer", signal: AbortSignal.timeout(6500) });

export async function registrosDNS(nombre, tipo, fetcher = fetch) {
  const url = new URL("https://dns.google/resolve");
  url.search = new URLSearchParams({ name: nombre, type: tipo, edns_client_subnet: "0.0.0.0/0" });
  const respuesta = await fetcher(url, opciones());
  if (!respuesta.ok) throw new Error("DNS no disponible");
  const datos = await respuesta.json();
  if (datos.Status === 3) return null;
  if (datos.Status !== 0 || datos.TC) throw new Error("DNS no disponible");
  const tipos = { A: 1, NS: 2, MX: 15, TXT: 16, AAAA: 28, CAA: 257 };
  return (datos.Answer || []).filter(({ type }) => type === tipos[tipo])
    .map(({ data }) => tipo === "TXT" ? data.replace(/^"|"$/g, "").replace(/"\s+"/g, "") : data);
}

export function proveedorCorreo(mx) {
  const conocidos = [
    [/^(?:aspmx(?:[0-9]+)?(?:\.l)?\.google\.com|smtp\.google\.com|alt[0-9]+\.aspmx\.l\.google\.com|[^.]+\.googlemail\.com)$/, "Google"],
    [/(?:^|\.)mail\.protection\.outlook\.com$/, "Microsoft 365"],
    [/(?:^|\.)protonmail\.ch$/, "Proton Mail"],
    [/(?:^|\.)zoho\.(?:com|eu|in)$/, "Zoho Mail"],
    [/(?:^|\.)icloud\.com$/, "iCloud Mail"],
    [/(?:^|\.)mimecast\.com$/, "Mimecast"],
    [/(?:^|\.)pphosted\.com$/, "Proofpoint"],
    [/(?:^|\.)mx\.cloudflare\.net$/, "Cloudflare Email Routing"],
  ];
  const proveedores = new Set();
  for (const registro of mx) {
    const host = registro.trim().split(/\s+/)[1]?.replace(/\.$/, "").toLowerCase();
    const encontrado = conocidos.find(([patron]) => patron.test(host || ""));
    if (encontrado) proveedores.add(encontrado[1]);
  }
  return [...proveedores].join(", ");
}

export async function consultarInfraestructura(dominio, fetcher = fetch) {
  return Promise.all([
    ["NS · servidores DNS", dominio, "NS"],
    ["A · IPv4", dominio, "A"],
    ["AAAA · IPv6", dominio, "AAAA"],
    ["CAA · autoridades certificadoras", dominio, "CAA"],
    ["MTA-STS · anuncio DNS", `_mta-sts.${dominio}`, "TXT", /^v=STSv1\s*;/i],
    ["TLS-RPT · anuncio DNS", `_smtp._tls.${dominio}`, "TXT", /^v=TLSRPTv1\s*;/i],
  ].map(async ([etiqueta, nombre, tipo, patron]) => {
    try {
      const registros = await registrosDNS(nombre, tipo, fetcher) || [];
      return [etiqueta, registros.filter((valor) => !patron || patron.test(valor)).join(" · ") || "Sin registro publicado."];
    } catch {
      return [etiqueta, "Consulta no disponible."];
    }
  }));
}

let serviciosIana;
async function bootstrapRdap(fetcher) {
  if (fetcher === globalThis.fetch && serviciosIana) return serviciosIana;
  const respuesta = await fetcher("https://data.iana.org/rdap/dns.json", opciones());
  if (!respuesta.ok) throw new Error("IANA no disponible");
  const { services } = await respuesta.json();
  if (!Array.isArray(services)) throw new Error("Respuesta IANA inesperada");
  if (fetcher === globalThis.fetch) serviciosIana = services;
  return services;
}

export async function consultarRdap(dominio, fetcher = fetch) {
  try {
    const services = await bootstrapRdap(fetcher);
    const partes = dominio.split(".");
    const base = services.find(([zonas]) => zonas.includes(partes.at(-1)))?.[1].find((url) => url.startsWith("https://"));
    if (!base) return { estado: "IANA no publica un servicio RDAP HTTPS para esta extensión." };
    // RDAP indexa dominios registrados. Un subdominio normalmente devuelve 404.
    for (let i = 0; i < Math.min(partes.length - 1, 4); i++) {
      const buscado = partes.slice(i).join(".");
      const url = new URL(`domain/${buscado}`, base.endsWith("/") ? base : `${base}/`);
      const respuesta = await fetcher(url, opciones());
      if (respuesta.status === 404) continue;
      if (!respuesta.ok) throw new Error();
      const datos = await respuesta.json();
      if (datos.objectClassName !== "domain" || datos.ldhName?.toLowerCase() !== buscado) throw new Error();
      const evento = (accion) => (datos.events || []).find(({ eventAction }) => eventAction === accion)?.eventDate;
      const registrador = (datos.entities || []).find(({ roles }) => roles?.includes("registrar"));
      const nombre = registrador?.vcardArray?.[1]?.find(([campo]) => campo === "fn")?.[3];
      return { filas: [
        ["Dominio registrado", buscado], ["Alta en el registro", evento("registration")],
        ["Último cambio", evento("last changed")], ["Vencimiento publicado", evento("expiration")],
        ["Registrador", nombre || registrador?.handle], ["Estados", datos.status?.join(", ")],
        ["Servidor RDAP", url.hostname],
      ] };
    }
    return { estado: "El registro RDAP no devolvió un dominio para la búsqueda." };
  } catch {
    return { estado: "RDAP no disponible en este navegador o registro. Usa el enlace de consulta externa." };
  }
}

export async function consultarIncidentesDominio(dominio, fetcher = fetch) {
  try {
    const url = new URL("https://haveibeenpwned.com/api/v3/breaches");
    url.searchParams.set("Domain", dominio);
    const respuesta = await fetcher(url, opciones());
    if (!respuesta.ok) throw new Error();
    const datos = await respuesta.json();
    const coincidencias = datos.filter(({ Domain }) => Domain?.toLowerCase() === dominio);
    return {
      cantidad: coincidencias.length,
      filas: coincidencias.slice(0, 10).map((incidente) => [
        incidente.Title || incidente.Name,
        [incidente.BreachDate, incidente.IsVerified ? "Verificado por HIBP" : "Sin verificar por HIBP",
          incidente.DataClasses?.join(", ")].filter(Boolean).join(" · "),
      ]),
    };
  } catch {
    return { estado: "Catálogo de incidentes no disponible." };
  }
}
