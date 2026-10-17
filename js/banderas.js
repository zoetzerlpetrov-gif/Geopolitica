// Banderas de país para fichas de aviones, barcos y satélites.
// - Aviones: país de matrícula según el bloque de direcciones ICAO de 24 bits que la OACI asigna a cada Estado
//   (Anexo 10, vol. III). Es el país donde está registrado el avión, no el de la aerolínea ni el de sus pasajeros.
// - Barcos: el MID del MMSI (ya calculado en buques.js como código ISO alfa-2): es la bandera del registro del buque.
// - Satélites: país del catálogo GCAT (Jonathan McDowell).
// Imágenes de flagcdn.com (banderas de Flagpedia, dominio público); se piden en el navegador al abrir la ficha.

// [inicio, fin, ISO alfa-2] en hexadecimal. Bloques principales; los demás países quedan sin bandera.
const ICAO = [
  [0x008000, 0x00ffff, "ZA"], [0x010000, 0x017fff, "EG"], [0x06a000, 0x06afff, "QA"], [0x0ac000, 0x0acfff, "CO"], [0x0b0000, 0x0b0fff, "CU"],
  [0x0d0000, 0x0d7fff, "MX"], [0x0d8000, 0x0dffff, "VE"], [0x100000, 0x1fffff, "RU"], [0x300000, 0x33ffff, "IT"], [0x340000, 0x37ffff, "ES"],
  [0x380000, 0x3bffff, "FR"], [0x3c0000, 0x3fffff, "DE"], [0x400000, 0x43ffff, "GB"], [0x440000, 0x447fff, "AT"], [0x448000, 0x44ffff, "BE"],
  [0x458000, 0x45ffff, "DK"], [0x460000, 0x467fff, "FI"], [0x468000, 0x46ffff, "GR"], [0x470000, 0x477fff, "HU"], [0x478000, 0x47ffff, "NO"],
  [0x480000, 0x487fff, "NL"], [0x488000, 0x48ffff, "PL"], [0x490000, 0x497fff, "PT"], [0x498000, 0x49ffff, "CZ"], [0x4a0000, 0x4a7fff, "RO"],
  [0x4a8000, 0x4affff, "SE"], [0x4b0000, 0x4b7fff, "CH"], [0x4b8000, 0x4bffff, "TR"], [0x4ca000, 0x4cafff, "IE"], [0x4cc000, 0x4ccfff, "IS"],
  [0x508000, 0x50ffff, "UA"], [0x710000, 0x717fff, "SA"], [0x718000, 0x71ffff, "KR"], [0x730000, 0x737fff, "IR"], [0x738000, 0x73ffff, "IL"],
  [0x750000, 0x757fff, "MY"], [0x758000, 0x75ffff, "PH"], [0x760000, 0x767fff, "PK"], [0x768000, 0x76ffff, "SG"], [0x780000, 0x7bffff, "CN"],
  [0x7c0000, 0x7fffff, "AU"], [0x800000, 0x83ffff, "IN"], [0x840000, 0x87ffff, "JP"], [0x880000, 0x887fff, "TH"], [0x888000, 0x88ffff, "VN"],
  [0x896000, 0x896fff, "AE"], [0x899000, 0x8997ff, "TW"], [0x8a0000, 0x8a7fff, "ID"], [0xa00000, 0xafffff, "US"], [0xc00000, 0xc3ffff, "CA"],
  [0xc80000, 0xc87fff, "NZ"], [0xe00000, 0xe3ffff, "AR"], [0xe40000, 0xe7ffff, "BR"], [0xe80000, 0xe80fff, "CL"], [0xe84000, 0xe84fff, "PE"],
];

/** País de matrícula (ISO alfa-2) de una dirección ICAO de 24 bits, o null. */
export function paisDeHex(hex) {
  const n = parseInt(String(hex || "").replace(/^~/, ""), 16);
  if (!Number.isFinite(n)) return null;
  const b = ICAO.find(([a, z]) => n >= a && n <= z);
  return b ? b[2] : null;
}

// Códigos de país de GCAT que no son ISO alfa-2.
const GCAT = { UK: "GB", F: "FR", J: "JP", I: "IT", D: "DE", L: "LU", E: "ES", "I-ESA": "EU", "I-EUM": "EU", SU: null, "I-INT": null };
export function paisDeGcat(cod) {
  if (!cod) return null;
  if (cod in GCAT) return GCAT[cod];
  return /^[A-Z]{2}$/.test(cod) ? cod : null;
}

let nombres = null;
/** <img> de la bandera de un código ISO alfa-2 (o «EU»), o vacío. */
export function htmlBandera(iso2, { alto = 15 } = {}) {
  if (!iso2 || !/^[A-Z]{2}$/.test(iso2)) return "";
  let nombre = iso2;
  try { nombres ??= new Intl.DisplayNames(["es"], { type: "region" }); nombre = iso2 === "EU" ? "Unión Europea" : nombres.of(iso2) || iso2; } catch { /* sin Intl */ }
  const w = Math.round((alto * 4) / 3);
  return `<img class="bandera" src="https://flagcdn.com/${w}x${alto}/${iso2.toLowerCase()}.png" width="${w}" height="${alto}" alt="Bandera de ${nombre}" title="${nombre}" loading="lazy" referrerpolicy="no-referrer">`;
}
