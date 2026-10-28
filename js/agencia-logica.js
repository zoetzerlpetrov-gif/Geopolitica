// Fase 4: herramientas para equipos de seguridad, TI y administración pública (herramientas.html, pestaña «Agencias»).
// Funciones puras, sin red. Nada aquí localiza ni sigue a personas: se analizan dominios, redes y expedientes propios.
//  1. Certificados emitidos para un dominio (registros públicos de Certificate Transparency, vía Cert Spotter).
//  2. IP, sistema autónomo (ASN) y prefijos de red (RIPEstat, datos públicos de los registros regionales).
//  3. Calculadora de subredes IPv4 (CIDR).
//  4. Cronología de un caso (se guarda en el navegador).
//  5. Control de oficios y plazos en días hábiles de México.

// ---------------------------------------------------------------- 1. certificados (Certificate Transparency)

export const urlCertSpotter = (dominio) =>
  `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(dominio.trim().toLowerCase())}&include_subdomains=true&expand=dns_names&expand=issuer`;

/** Valida un nombre de dominio (sin esquema ni ruta). */
export const esDominio = (d) => /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(String(d || "").trim());

/**
 * Emisiones de Cert Spotter → resumen: subdominios vistos, emisores, certificados vigentes y los que vencen pronto.
 * Sirve para el inventario de lo que una organización expone en internet (y para detectar certificados que no reconoce).
 */
export function resumenCertificados(emisiones, ahora = new Date(), diasAviso = 30) {
  const subdominios = new Map(), emisores = {};
  let vigentes = 0;
  const vencen = [];
  for (const e of emisiones || []) {
    const fin = new Date(e.not_after), ini = new Date(e.not_before);
    const vigente = fin > ahora && ini <= ahora;
    if (vigente) vigentes++;
    const emisor = e.issuer?.friendly_name || e.issuer?.name?.match(/O=([^,]+)/)?.[1] || "Desconocido";
    emisores[emisor] = (emisores[emisor] || 0) + 1;
    for (const n of e.dns_names || []) {
      const s = subdominios.get(n) || { nombre: n, certs: 0, ultimo: "" };
      s.certs++; if (e.not_before > s.ultimo) s.ultimo = e.not_before;
      subdominios.set(n, s);
    }
    const dias = Math.floor((fin - ahora) / 86400000);
    if (vigente && dias <= diasAviso) vencen.push({ nombres: (e.dns_names || []).slice(0, 3), vence: e.not_after.slice(0, 10), dias, emisor });
  }
  return {
    total: (emisiones || []).length, vigentes,
    subdominios: [...subdominios.values()].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    comodines: [...subdominios.keys()].filter((n) => n.startsWith("*.")),
    emisores: Object.entries(emisores).sort((a, b) => b[1] - a[1]),
    vencen: vencen.sort((a, b) => a.dias - b.dias),
  };
}

// ---------------------------------------------------------------- 2. IP, ASN y prefijos (RIPEstat)

const RIPE = "https://stat.ripe.net/data";
export const esIPv4 = (s) => /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(String(s || "").trim());
export const esIPv6 = (s) => /^[0-9a-f:]+$/i.test(String(s || "").trim()) && String(s).includes(":");
export const esASN = (s) => /^(as)?\d{1,10}$/i.test(String(s || "").trim());

/** Consulta → URLs de RIPEstat a pedir (IP: red que la anuncia y país; ASN: titular y prefijos anunciados). */
export function urlsRipe(q) {
  q = String(q || "").trim();
  if (esIPv4(q) || esIPv6(q)) {
    const r = encodeURIComponent(q);
    return { tipo: "ip", urls: { prefijo: `${RIPE}/prefix-overview/data.json?resource=${r}`, pais: `${RIPE}/rir-geo/data.json?resource=${r}` } };
  }
  if (esASN(q)) {
    const as = `AS${q.replace(/^as/i, "")}`;
    return { tipo: "asn", urls: { as: `${RIPE}/as-overview/data.json?resource=${as}`, prefijos: `${RIPE}/announced-prefixes/data.json?resource=${as}` } };
  }
  return null;
}

/** Respuestas de RIPEstat → resumen legible. */
export function resumenRipe(tipo, r) {
  if (tipo === "ip") {
    const d = r.prefijo?.data || {};
    return { tipo, prefijo: d.resource || "—", anunciado: Boolean(d.announced),
      asns: (d.asns || []).map((a) => ({ asn: a.asn, titular: a.holder })),
      pais: r.pais?.data?.located_resources?.[0]?.location || "—" };
  }
  const d = r.as?.data || {}, p = r.prefijos?.data?.prefixes || [];
  const v4 = p.filter((x) => !x.prefix.includes(":")), v6 = p.filter((x) => x.prefix.includes(":"));
  return { tipo, asn: d.resource, titular: d.holder || "—", anunciado: Boolean(d.announced),
    prefijos_v4: v4.map((x) => x.prefix), prefijos_v6: v6.map((x) => x.prefix),
    direcciones_v4: v4.reduce((s, x) => s + 2 ** (32 - Number(x.prefix.split("/")[1] || 32)), 0) };
}

// ---------------------------------------------------------------- 3. subredes IPv4

const aNum = (ip) => ip.split(".").reduce((n, o) => n * 256 + Number(o), 0);
const aIp = (n) => [24, 16, 8, 0].map((s) => Math.floor(n / 2 ** s) % 256).join(".");

/** «192.168.10.37/27» → red, máscara, primera y última dirección utilizable, difusión y número de equipos. */
export function cidr(texto) {
  const m = String(texto || "").trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
  if (!m || !esIPv4(m[1]) || Number(m[2]) > 32) return null;
  const bits = Number(m[2]), tam = 2 ** (32 - bits), ip = aNum(m[1]);
  const red = Math.floor(ip / tam) * tam, difusion = red + tam - 1;
  const priv = [["10.0.0.0", 8], ["172.16.0.0", 12], ["192.168.0.0", 16], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16]]
    .find(([b, l]) => Math.floor(ip / 2 ** (32 - l)) === Math.floor(aNum(b) / 2 ** (32 - l)));
  return {
    red: aIp(red), mascara: aIp(2 ** 32 - tam), comodin: aIp(tam - 1), bits,
    primera: bits >= 31 ? aIp(red) : aIp(red + 1), ultima: bits >= 31 ? aIp(difusion) : aIp(difusion - 1),
    difusion: bits >= 31 ? "—" : aIp(difusion), equipos: bits >= 31 ? tam : tam - 2,
    privada: priv ? `${priv[0]}/${priv[1]}` : null,
  };
}

// ---------------------------------------------------------------- 4. cronología del caso

export function agregarHecho(c, { fecha, hora = "", hecho, fuente = "", confianza = "media" }) {
  if (!fecha || !String(hecho || "").trim()) return c;
  const id = `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return { ...c, hechos: [...(c.hechos || []), { id, fecha, hora, hecho: String(hecho).trim().slice(0, 500), fuente: String(fuente).trim().slice(0, 300), confianza }]
    .sort((a, b) => `${a.fecha}T${a.hora || "00:00"}`.localeCompare(`${b.fecha}T${b.hora || "00:00"}`)) };
}
export const quitarHecho = (c, id) => ({ ...c, hechos: (c.hechos || []).filter((h) => h.id !== id) });

const celdaCsv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
export const csvCronologia = (c) => ["fecha,hora,hecho,fuente,confianza", ...(c.hechos || []).map((h) => [h.fecha, h.hora, h.hecho, h.fuente, h.confianza].map(celdaCsv).join(","))].join("\n");

/** Días entre hechos consecutivos: huecos largos señalan dónde falta información. */
export function huecos(c, minDias = 7) {
  const hs = c.hechos || [], out = [];
  for (let i = 1; i < hs.length; i++) {
    const d = Math.round((Date.parse(hs[i].fecha) - Date.parse(hs[i - 1].fecha)) / 86400000);
    if (d >= minDias) out.push({ desde: hs[i - 1].fecha, hasta: hs[i].fecha, dias: d });
  }
  return out;
}

// ---------------------------------------------------------------- 5. oficios y plazos en días hábiles (México)

const iso = (d) => d.toISOString().slice(0, 10);
const nLunes = (anio, mes, n) => { const d = new Date(Date.UTC(anio, mes, 1)); while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1); d.setUTCDate(d.getUTCDate() + 7 * (n - 1)); return iso(d); };

/**
 * Días de descanso obligatorio de la Ley Federal del Trabajo (art. 74): 1 ene, primer lunes de febrero, tercer lunes de
 * marzo, 1 may, 16 sep, tercer lunes de noviembre, 1 oct cada seis años (cambio de Poder Ejecutivo: 2024, 2030…) y 25 dic.
 * Cada dependencia publica además sus días inhábiles en el DOF (p. ej. Semana Santa): agrégalos en «días inhábiles extra».
 */
export function feriadosMX(anio) {
  const f = [`${anio}-01-01`, nLunes(anio, 1, 1), nLunes(anio, 2, 3), `${anio}-05-01`, `${anio}-09-16`, nLunes(anio, 10, 3), `${anio}-12-25`];
  if ((anio - 2024) % 6 === 0 && anio >= 2024) f.push(`${anio}-10-01`);
  return f;
}

/** Fecha límite contando `dias` hábiles a partir del día siguiente a `inicio` (sin sábados, domingos ni inhábiles). */
export function venceHabiles(inicio, dias, extra = []) {
  const d = new Date(`${inicio}T12:00:00Z`);
  const inhabiles = new Set(extra);
  let n = 0;
  while (n < dias) {
    d.setUTCDate(d.getUTCDate() + 1);
    const a = d.getUTCFullYear();
    if (!inhabiles.has(`feriados-${a}`)) { feriadosMX(a).forEach((x) => inhabiles.add(x)); inhabiles.add(`feriados-${a}`); }
    if (d.getUTCDay() % 6 !== 0 && !inhabiles.has(iso(d))) n++;
  }
  return iso(d);
}

/** Días hábiles que faltan (negativo si ya venció). */
export function habilesRestantes(hoy, limite, extra = []) {
  if (hoy === limite) return 0;
  const signo = hoy < limite ? 1 : -1, [a, b] = signo > 0 ? [hoy, limite] : [limite, hoy];
  let n = 0;
  while (venceHabiles(a, n + 1, extra) <= b) n++;
  return signo * n;
}

export const ESTADOS_OFICIO = { recibido: "Recibido", turnado: "Turnado", en_atencion: "En atención", respondido: "Respondido", archivado: "Archivado" };

export function semaforo(o, hoy, extra = []) {
  if (["respondido", "archivado"].includes(o.estado)) return { color: "#2E9E6E", texto: "Concluido" };
  const r = habilesRestantes(hoy, o.limite, extra);
  if (r < 0) return { color: "#C62828", texto: `Vencido hace ${-r} día(s) hábil(es)` };
  if (r <= 2) return { color: "#E2711D", texto: r === 0 ? "Vence hoy" : `Vence en ${r} día(s) hábil(es)` };
  return { color: "#1F6FB2", texto: `Faltan ${r} días hábiles` };
}

export const csvOficios = (lista) => ["folio,recibido,remitente,asunto,area,dias_habiles,limite,estado",
  ...lista.map((o) => [o.folio, o.recibido, o.remitente, o.asunto, o.area, o.dias, o.limite, ESTADOS_OFICIO[o.estado] || o.estado].map(celdaCsv).join(","))].join("\n");
