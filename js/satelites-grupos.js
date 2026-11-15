// Grupos derivados exclusivamente de los elementos de SatNOGS. El nombre solo se usa
// para familias explícitas; la altura y la excentricidad salen de los propios elementos.
export const GRUPOS_SATNOGS = [
  ["satnogs-stations", "Estaciones espaciales · SatNOGS", "#5B4A9E", true],
  ["satnogs-weather", "Meteorológicos · SatNOGS", "#1F8A8A", true],
  ["satnogs-gnss", "Navegación GNSS · SatNOGS", "#2E6F8E", true],
  ["satnogs-starlink", "Starlink · cobertura disponible en SatNOGS", "#8a8f94", false],
  ["satnogs-comms", "OneWeb, Iridium y Globalstar · SatNOGS", "#8a7fb8", false],
  ["satnogs-earth", "Observación terrestre · SatNOGS", "#2F7A4A", false],
  ["satnogs-leo", "Órbita baja (LEO) · SatNOGS", "#4F8A3A", false],
  ["satnogs-meo", "Órbita media (MEO) · SatNOGS", "#1F6FB2", false],
  ["satnogs-geo", "Órbita geosíncrona · SatNOGS", "#4A6B8A", false],
  ["satnogs-heo", "Órbita muy elíptica (HEO) · SatNOGS", "#C27C1E", false],
];
export function tleVigente(tle, ahora = Date.now()) {
  if (!Array.isArray(tle) || tle.length < 3 || !/^1 /.test(tle[1]) || !/^2 /.test(tle[2]) || tle[1].length < 63 || tle[2].length < 63) return false;
  const aa = Number(tle?.[1]?.slice(18, 20)), dia = Number(tle?.[1]?.slice(20, 32));
  if (!Number.isFinite(aa) || !Number.isFinite(dia) || dia < 1 || dia >= 367) return false;
  const epoca = Date.UTC(aa < 57 ? 2000 + aa : 1900 + aa, 0, 1) + (dia - 1) * 86400000;
  const edad = (ahora - epoca) / 86400000;
  return edad >= -1 && edad <= 30;
}

export function gruposSatelites(grupos, ahora = Date.now()) {
  const vigentes = Object.fromEntries(Object.entries(grupos).map(([g, lista]) => {
    const unicos = new Map();
    for (const t of lista.filter((t) => tleVigente(t, ahora))) {
      const id = idSatelite(t), previo = unicos.get(id);
      if (!previo || t[1].slice(18, 32) > previo[1].slice(18, 32)) unicos.set(id, t);
    }
    return [g, [...unicos.values()]];
  }));
  if (!grupos.satnogs) return vigentes;
  const lista = vigentes.satnogs || [];
  const derivados = Object.fromEntries(GRUPOS_SATNOGS.map(([id]) => [id, []]));
  for (const t of lista) {
    const nombre = t[0].toUpperCase(), norad = t[2].slice(2, 7).trim();
    const agregar = (id, aplica) => { if (aplica) derivados[id].push(t); };
    agregar("satnogs-stations", ["25544", "48274", "49044", "53239", "54216"].includes(norad) || /^(?:ISS \(|CSS \(|TIANHE\b|WENTIAN\b|MENGTIAN\b)/.test(nombre));
    agregar("satnogs-weather", /^(?:NOAA\b|METEOR\b|FENGYUN\b|GOES\b|METOP\b|METEOSAT\b|ELEKTRO\b|ARCTIC WEATHER)/.test(nombre));
    agregar("satnogs-gnss", /^(?:GPS\b|NAVSTAR\b|GALILEO\b|GSAT0\d|BEIDOU\b|BD[- ]|GLONASS\b|QZS\b|IRNSS\b)/.test(nombre));
    agregar("satnogs-starlink", /^STARLINK[- ]/.test(nombre));
    agregar("satnogs-comms", /^(?:ONEWEB[- ]|IRIDIUM\b|GLOBALSTAR\b)/.test(nombre));
    agregar("satnogs-earth", /^(?:LANDSAT\b|SENTINEL[- ]|CARTOSAT\b|RESOURCESAT\b|OCEANSAT\b|SCATSAT\b|AQUA\b|TERRA\b|SUOMI\b|DOVE\b|FLOCK\b|SKYSAT\b|SAOCOM\b|NORSAT\b|AISSAT\b)/.test(nombre));
    const movimiento = Number(t[2].slice(52, 63)), ecc = Number("0." + t[2].slice(26, 33).trim());
    if (!(movimiento > 0) || !(ecc >= 0 && ecc < 1)) continue;
    const periodo = 1440 / movimiento;
    const a = Math.cbrt(398600.4418 / (movimiento * 2 * Math.PI / 86400) ** 2);
    const id = ecc > 0.25 ? "heo" : Math.abs(periodo - 1436.1) < 30 && ecc < 0.05 ? "geo" : a * (1 + ecc) - 6378.137 < 2000 ? "leo" : "meo";
    derivados["satnogs-" + id].push(t);
  }
  return { ...vigentes, satnogs: lista, ...derivados };
}

export const idSatelite = (t) => t[2].slice(2, 7).trim().replace(/^0+/, "");

export function totalSatelites(grupos) {
  return new Set(Object.values(grupos).flat().map(idSatelite)).size;
}
