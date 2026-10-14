// Subcategorías (subtemas) de cada área y filtro por religión mencionada en el evento.
// Funciones puras: se prueban en tests/js/temas.test.mjs.

/** Mapa subtema → área a la que pertenece en la taxonomía. */
export function areasDeSubtemas(listaAreas) {
  const m = new Map();
  for (const a of listaAreas) for (const s of a.subtemas || []) m.set(s.id, a.id);
  return m;
}

/** Clave del grupo «otros» de un área: eventos de esa área sin ningún subtema propio. */
export const claveOtros = (area) => `otros:${area}`;

/** Claves de subcategoría que cuentan para un evento (sus subtemas, o «otros» de su área principal). */
export function clavesSub(ev, areaDeSub) {
  const subs = ev.subtemas || [];
  const claves = [...subs];
  if (!subs.some((s) => areaDeSub.get(s) === ev.area_principal)) claves.push(claveOtros(ev.area_principal));
  return claves;
}

/** ¿El evento entra con la subcategoría elegida? Un subtema se busca en todo el evento, no solo en su área
 *  principal: «piratas abordan un petrolero» es de Energía, pero también de Incidentes marítimos. */
export function pasaSub(ev, sub, areaDeSub) {
  if (!sub) return true;
  return clavesSub(ev, areaDeSub).includes(sub);
}

// Religión mencionada en el título o resumen (texto ya sin acentos y en minúsculas).
// Raíces (coinciden al inicio de palabra: «musulman» → «musulmanes») y palabras exactas («church» no debe
// encontrar «Churchill»; «papa» no se usa porque también es el tubérculo).
export const RELIGIONES = {
  islam: {
    nombre: "Islam",
    raices: ["islam", "musulman", "mezquit", "yihad", "ramadan", "sharia", "muslim", "mosque", "jihad", "coran", "quran", "salafis", "chiit", "sunit", "islamofob"],
    exactas: ["imam", "suni", "sunni", "shia", "shiite", "chii", "hajj", "eid"],
  },
  cristianismo: {
    nombre: "Cristianismo y catolicismo",
    raices: ["cristian", "catolic", "iglesia", "vaticano", "obispo", "sacerdot", "parroqui", "evangelic", "protestant", "christian", "catholic", "vatican", "bishop", "diocesis", "diocese", "pentecost", "monja"],
    exactas: ["church", "churches", "priest", "priests", "pope", "papa francisco", "papa leon", "pontifice", "nun", "nuns"],
  },
  judaismo: {
    nombre: "Judaísmo",
    raices: ["judio", "judia", "judaism", "sinagog", "rabin", "antisemit", "jewish", "synagog", "rabbi", "kosher", "ultraortodox", "jasid", "hasid"],
    exactas: ["jew", "jews", "yom kipur", "yom kippur", "hanukkah", "januca", "torah", "tora"],
  },
  hinduismo: {
    nombre: "Hinduismo",
    raices: ["hindu", "hindutva", "brahman", "diwali"],
    exactas: ["templo hindu", "hindu temple", "ganesh", "ganesha", "holi", "kumbh mela"],
  },
};

const rxReligion = Object.fromEntries(Object.entries(RELIGIONES).map(([id, r]) => {
  const raices = r.raices.map((x) => `${x}\\w*`);
  const exactas = r.exactas.map((x) => x.replace(/ /g, "\\s+"));
  return [id, new RegExp(`(?:^|[^a-z0-9])(?:${[...raices, ...exactas].join("|")})(?![a-z0-9])`)];
}));

/** Religiones mencionadas en un texto normalizado (sin acentos, minúsculas). */
export function religionesEn(texto) {
  return Object.keys(RELIGIONES).filter((id) => rxReligion[id].test(texto));
}
