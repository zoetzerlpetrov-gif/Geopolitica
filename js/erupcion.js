// Escenarios de erupción de un volcán: hasta dónde podrían llegar la lava, los flujos piroclásticos, los proyectiles,
// la ceniza y los lahares según la magnitud (Índice de Explosividad Volcánica, IEV / VEI de Newhall y Self, 1982).
//
// Es una REFERENCIA EDUCATIVA, no un mapa oficial de peligros:
//   · Flujos piroclásticos: «cono de energía» (Malin y Sheridan, 1982) sobre el relieve real. Desde una altura de
//     colapso sobre el cráter se traza una línea que baja con pendiente μ (H/L); donde el terreno queda por encima de
//     esa línea, el flujo se detiene.
//   · Lava y lahares: trayectorias de máxima pendiente con un poco de ruido aleatorio (idea del modelo DOWNFLOW,
//     Favalli et al., 2005): cada recorrido baja por el relieve hasta su largo típico o hasta quedar atrapado.
//   · Ceniza: elipses de espesor (1 mm, 1 cm, 10 cm) orientadas con el viento en altura del modelo GFS, con largos
//     de orden de magnitud por IEV. Proyectiles: círculos con alcances típicos.
// Relieve: mosaicos «Terrarium» de Mapzen/AWS Terrain Tiles (SRTM, GMTED y otras fuentes públicas), leídos en el navegador.
import { esc } from "./util.js";
import { destino, nombreRumbo, haciaDonde } from "./amenazas.js";

const DEM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/";
const SRC = "erupcion";
const R_TIERRA_M = 6378137;

/** Valores típicos por IEV (0 a 6). balistica en km; pdc = {hc: altura de colapso en m, mu: H/L}; ceniza = largos a favor
 *  del viento (km) donde caerían ≥ 1 mm, ≥ 1 cm y ≥ 10 cm; lahar = largo típico por barrancas (km); nivel = hPa del viento. */
export const ESCENARIOS = [
  { vei: 0, nombre: "No explosiva (efusiva)", columna: "menos de 0.1 km", volumen: "menos de 10,000 m³", frecuencia: "casi continua en el mundo",
    ejemplo: "Mauna Loa (Hawái), 1984", balistica: 0.2, pdc: null, ceniza: null, lahar: 10, nivel: 500 },
  { vei: 1, nombre: "Suave", columna: "0.1 a 1 km", volumen: "10,000 a 1 millón de m³", frecuencia: "diaria en el mundo",
    ejemplo: "Stromboli (Italia), actividad típica", balistica: 0.5, pdc: { hc: 50, mu: 0.35 }, ceniza: [5, 1, 0.2], lahar: 20, nivel: 500 },
  { vei: 2, nombre: "Explosiva", columna: "1 a 5 km", volumen: "1 a 10 millones de m³", frecuencia: "cada ~2 semanas en el mundo",
    ejemplo: "", balistica: 1.5, pdc: { hc: 150, mu: 0.3 }, ceniza: [20, 5, 1], lahar: 30, nivel: 500 },
  { vei: 3, nombre: "Severa", columna: "3 a 15 km", volumen: "10 a 100 millones de m³", frecuencia: "cada ~3 meses en el mundo",
    ejemplo: "Nevado del Ruiz (Colombia), 1985", balistica: 3, pdc: { hc: 400, mu: 0.27 }, ceniza: [60, 15, 4], lahar: 60, nivel: 300 },
  { vei: 4, nombre: "Cataclísmica", columna: "10 a 25 km", volumen: "0.1 a 1 km³", frecuencia: "cada ~18 meses en el mundo",
    ejemplo: "Paricutín (México), 1943–1952; Eyjafjallajökull (Islandia), 2010", balistica: 5, pdc: { hc: 800, mu: 0.24 }, ceniza: [150, 50, 12], lahar: 80, nivel: 200 },
  { vei: 5, nombre: "Paroxísmica", columna: "más de 25 km", volumen: "1 a 10 km³", frecuencia: "cada ~12 años en el mundo",
    ejemplo: "El Chichón (México), 1982; Monte Santa Helena (EUA), 1980", balistica: 8, pdc: { hc: 1500, mu: 0.2 }, ceniza: [600, 250, 50], lahar: 100, nivel: 200 },
  { vei: 6, nombre: "Colosal", columna: "más de 25 km", volumen: "10 a 100 km³", frecuencia: "cada ~50 a 100 años en el mundo",
    ejemplo: "Pinatubo (Filipinas), 1991; Krakatoa (Indonesia), 1883", balistica: 10, pdc: { hc: 2500, mu: 0.15 }, ceniza: [1500, 600, 150], lahar: 100, nivel: 200 },
];

/** Largo típico de las coladas de lava (km) por tipo de magma y por IEV del escenario. */
export const LAVA_KM = { fluido: [5, 10, 15, 25, 35, 45, 50], intermedio: [1, 2, 4, 6, 8, 10, 12], viscoso: [0.5, 1, 1.5, 2, 3, 4, 5] };
export const MAGMA = { fluido: "Fluido (basáltico: Hawái, Paricutín, Islandia)", intermedio: "Intermedio (andesítico: Popocatépetl, Colima, Fuego)",
  viscoso: "Viscoso (dacítico o riolítico: domos y calderas)" };

export const COLORES = { lava: "#FF3B1F", pdc: "#8E44AD", balistica: "#2C3E50", ceniza1mm: "#BDB76B", ceniza1cm: "#A0855B", ceniza10cm: "#6B4F2A", lahar: "#1F78B4" };

/** Tipo de magma probable según el tipo de volcán (texto de Smithsonian o Natural Earth). */
export function tipoMagma(texto) {
  const t = String(texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // El tipo de roca principal (Smithsonian, «roca: Andesite / Basaltic Andesite»: cuenta la primera) manda sobre la forma.
  const roca = (t.match(/(?:roca|rock)[^:]*:\s*([^·/]+)/) || [])[1] || "";
  if (/andesit/.test(roca) && !/basaltic andesit|andesita basalt/.test(roca)) return "intermedio";
  if (/basalt|basanit|picro|tephrit|tefrit|foidit/.test(roca)) return "fluido";
  if (/dacit|rhyol|riolit|trachy|traqui|phonol|fonolit/.test(roca)) return "viscoso";
  if (/shield|escudo|fissure|fisura|cinder|scoria|escoria|pyroclastic cone|lava field|campo volc|lava cone|maar|tuya|submarine/.test(t)) return "fluido";
  if (/caldera|dome|domo|rhyol|dacit|lava dome/.test(t)) return "viscoso";
  return "intermedio";
}

/** IEV sugerido para empezar: el típico de su tipo (no es un pronóstico). */
export function veiSugerido(magma) {
  return { fluido: 1, intermedio: 3, viscoso: 4 }[magma] ?? 3;
}

// ---------- Relieve (rejilla de alturas en coordenadas de mosaico Web Mercator) ----------

const aRad = (g) => (g * Math.PI) / 180;

/** Coordenada de píxel global (zoom z, mosaicos de 256 px) de un [lon, lat]. */
export function aPixelGlobal(lon, lat, z) {
  const n = 256 * 2 ** z;
  const s = Math.sin(aRad(Math.max(-85, Math.min(85, lat))));
  return [((lon + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
}

export function aLonLatGlobal(x, y, z) {
  const n = 256 * 2 ** z;
  const lon = (x / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return [+lon.toFixed(5), +lat.toFixed(5)];
}

/** Zoom de mosaicos para cubrir un radio (km) con ~5×5 mosaicos como máximo. */
export function zoomPara(radioKm, lat) {
  const z = Math.floor(Math.log2((40075 * Math.cos(aRad(lat))) / (0.45 * Math.max(0.5, radioKm))));
  return Math.max(7, Math.min(12, z));
}

/** Altura (m) de un píxel Terrarium: (R × 256 + G + B / 256) − 32768. */
export const alturaTerrarium = (r, g, b) => r * 256 + g + b / 256 - 32768;

/** Rejilla de alturas: alt[j * w + i]; ox, oy = píxel global de la esquina; mpp = metros por píxel en el centro. */
export class Rejilla {
  constructor({ z, ox, oy, w, h, alt, lat }) {
    Object.assign(this, { z, ox, oy, w, h, alt });
    this.mpp = (2 * Math.PI * R_TIERRA_M * Math.cos(aRad(lat))) / (256 * 2 ** z);
  }

  elev(i, j) {
    i = Math.round(i); j = Math.round(j);
    return i < 0 || j < 0 || i >= this.w || j >= this.h ? NaN : this.alt[j * this.w + i];
  }

  aPix(lon, lat) {
    const [x, y] = aPixelGlobal(lon, lat, this.z);
    return [x - this.ox, y - this.oy];
  }

  aLonLat(i, j) {
    return aLonLatGlobal(i + this.ox, j + this.oy, this.z);
  }

  /** Celda más alta a menos de `radioM` metros (las coordenadas publicadas a veces no caen justo en la cima). */
  cima(lon, lat, radioM = 1500) {
    const [i0, j0] = this.aPix(lon, lat);
    const r = Math.max(1, Math.round(radioM / this.mpp));
    let mejor = [Math.round(i0), Math.round(j0)], hMax = this.elev(i0, j0);
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (di * di + dj * dj > r * r) continue;
      const v = this.elev(i0 + di, j0 + dj);
      if (v > hMax || !(hMax === hMax)) { hMax = v; mejor = [Math.round(i0 + di), Math.round(j0 + dj)]; }
    }
    return { i: mejor[0], j: mejor[1], alt: hMax };
  }
}

const cacheMosaicos = new Map();

async function mosaico(z, x, y) {
  const k = `${z}/${x}/${y}`;
  if (!cacheMosaicos.has(k)) {
    cacheMosaicos.set(k, (async () => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = `${DEM}${k}.png`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = 256; c.height = 256;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      return g.getImageData(0, 0, 256, 256).data;
    })().catch((e) => { cacheMosaicos.delete(k); throw e; }));
  }
  return cacheMosaicos.get(k);
}

/** Descarga el relieve alrededor de [lon, lat] con el radio pedido (km). */
export async function cargarRejilla(lon, lat, radioKm) {
  const z = zoomPara(radioKm, lat), n = 2 ** z;
  const [X, Y] = aPixelGlobal(lon, lat, z).map((v) => v / 256);
  const kmMosaico = (40075 * Math.cos(aRad(lat))) / n;
  const r = Math.max(1, Math.ceil(radioKm / kmMosaico));
  const tx0 = Math.floor(X) - r, ty0 = Math.max(0, Math.floor(Y) - r), ty1 = Math.min(n - 1, Math.floor(Y) + r);
  const cols = 2 * r + 1, filas = ty1 - ty0 + 1;
  const w = cols * 256, h = filas * 256, alt = new Float32Array(w * h).fill(NaN);
  await Promise.all(Array.from({ length: cols * filas }, async (_, k) => {
    const cx = k % cols, cy = Math.floor(k / cols);
    const px = await mosaico(z, (((tx0 + cx) % n) + n) % n, ty0 + cy).catch(() => null);
    if (!px) return;
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const o = (y * 256 + x) * 4;
      alt[(cy * 256 + y) * w + cx * 256 + x] = alturaTerrarium(px[o], px[o + 1], px[o + 2]);
    }
  }));
  return new Rejilla({ z, ox: tx0 * 256, oy: ty0 * 256, w, h, alt, lat });
}

// ---------- Modelos ----------

/** Generador pseudoaleatorio con semilla (mulberry32): el mismo volcán da el mismo dibujo. */
export function azar(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cono de energía: polígono hasta donde llegaría un flujo piroclástico. {anillo, maxKm, medioKm, recortado}. */
export function conoEnergia(rej, ventI, ventJ, hc, mu, maxKm = 60) {
  const h0 = rej.elev(ventI, ventJ) + hc;
  const anillo = [], dist = [];
  let recortado = false;
  for (let az = 0; az < 360; az += 3) {
    const dx = Math.sin(aRad(az)), dy = -Math.cos(aRad(az));
    let k = 1, ultimo = 0;
    for (; k * rej.mpp <= maxKm * 1000; k++) {
      const v = rej.elev(ventI + k * dx, ventJ + k * dy);
      if (!(v === v)) { recortado = true; break; }
      if (v > h0 - mu * k * rej.mpp) break;
      ultimo = k;
    }
    dist.push((ultimo * rej.mpp) / 1000);
    anillo.push(rej.aLonLat(ventI + ultimo * dx, ventJ + ultimo * dy));
  }
  anillo.push(anillo[0]);
  return { anillo, maxKm: Math.max(...dist), medioKm: dist.reduce((a, b) => a + b, 0) / dist.length, recortado };
}

const VECINOS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * Recorridos por máxima pendiente con ruido (lava o lahar). Cada recorrido sale de un punto al azar en un anillo de
 * `salidaM` metros alrededor del cráter (las coladas suelen salir por el borde o por los flancos) y baja hasta `largoKm`
 * o hasta quedar atrapado en una hondonada. dh = ruido en metros (deja «saltar» obstáculos pequeños del relieve).
 * Devuelve {lineas: [[lon, lat]…], alcanceKm (en línea recta), atrapados}.
 */
export function recorridos(rej, ventI, ventJ, { n = 100, largoKm = 10, dh = 3, salidaM = 400, semilla = 1 } = {}) {
  const rnd = azar(semilla);
  const lineas = [];
  let alcance = 0, atrapados = 0;
  const pasosMax = Math.ceil((largoKm * 1000) / rej.mpp) + 2;
  for (let p = 0; p < n; p++) {
    const ang = rnd() * 2 * Math.PI, r0 = Math.max(1.5, salidaM / rej.mpp) * (0.6 + 0.4 * rnd());
    let i = Math.round(ventI + Math.cos(ang) * r0), j = Math.round(ventJ + Math.sin(ang) * r0);
    if (!(rej.elev(i, j) === rej.elev(i, j))) continue;
    const vistos = new Set([j * rej.w + i]);
    const pts = [rej.aLonLat(i, j)];
    let recorrido = 0, paso = 0;
    while (recorrido < largoKm * 1000 && paso++ < pasosMax * 2) {
      const hAqui = rej.elev(i, j);
      let mejor = null, mejorPend = 0;
      for (const [di, dj] of VECINOS) {
        const ni = i + di, nj = j + dj, idx = nj * rej.w + ni;
        if (vistos.has(idx)) continue;
        const v = rej.elev(ni, nj);
        if (!(v === v)) continue;
        const d = (di && dj ? Math.SQRT2 : 1) * rej.mpp;
        const pend = (hAqui - (v + (rnd() * 2 - 1) * dh)) / d;
        if (pend > mejorPend) { mejorPend = pend; mejor = [ni, nj, d]; }
      }
      if (!mejor) { atrapados++; break; }
      [i, j] = mejor;
      recorrido += mejor[2];
      vistos.add(j * rej.w + i);
      if (paso % 2 === 0) pts.push(rej.aLonLat(i, j));
    }
    pts.push(rej.aLonLat(i, j));
    if (pts.length > 1) lineas.push(pts);
    alcance = Math.max(alcance, (Math.hypot(i - ventI, j - ventJ) * rej.mpp) / 1000);
  }
  return { lineas, alcanceKm: alcance, atrapados };
}

/** Elipse de caída de ceniza: de `atrasKm` contra el viento hasta `largoKm` a favor, con media anchura `anchoKm`. */
export function elipse(origen, rumbo, largoKm, anchoKm, atrasKm = 0) {
  const a = (largoKm + atrasKm) / 2;
  const centro = destino(origen, rumbo, (largoKm - atrasKm) / 2);
  const anillo = [];
  for (let t = 0; t <= 360; t += 10) {
    const x = a * Math.cos(aRad(t)), y = anchoKm * Math.sin(aRad(t));
    anillo.push(destino(centro, rumbo + (Math.atan2(y, x) * 180) / Math.PI, Math.hypot(x, y)));
  }
  return anillo;
}

export function circulo(origen, km) {
  const anillo = [];
  for (let t = 0; t <= 360; t += 10) anillo.push(destino(origen, t, km));
  return anillo;
}

/** Polígonos de ceniza por umbral de espesor. Sin viento: círculos de la mitad del largo (no se sabe hacia dónde). */
export function zonasCeniza(origen, esc_, viento) {
  if (!esc_.ceniza) return [];
  const [mm1, cm1, cm10] = esc_.ceniza;
  const nombres = [["ceniza1mm", "≥ 1 mm", mm1], ["ceniza1cm", "≥ 1 cm", cm1], ["ceniza10cm", "≥ 10 cm", cm10]];
  return nombres.filter(([, , km]) => km > 0).map(([id, t, km]) => ({
    id, t, km,
    anillo: viento ? elipse(origen, haciaDonde(viento.desde), km, Math.max(0.5, km * 0.22), km * 0.08) : circulo(origen, km / 2),
  }));
}

// ---------- Interfaz en la ficha ----------

export const ELEMENTOS = [
  ["🔥 Lava", "Roca fundida a 700–1,200 °C. La basáltica (fluida) corre kilómetros; la andesítica o dacítica avanza poco y forma domos. Rara vez mata porque suele ir lenta, pero destruye todo lo que toca."],
  ["🌫️ Flujos piroclásticos", "Nube de gas, ceniza y rocas a 200–700 °C que baja a más de 100 km/h. Es la causa principal de muertes en erupciones (Monte Pelée, Martinica, 1902)."],
  ["🪨 Proyectiles balísticos", "Bloques y «bombas» lanzados desde el cráter. Casi siempre caen a menos de 5 km, pero en erupciones grandes pasan de 10 km."],
  ["🌋 Ceniza (tefra)", "Fragmentos de roca y vidrio volcánico de menos de 2 mm. Daña motores de avión, contamina agua y cultivos, irrita ojos y pulmones; 10 cm de ceniza húmeda pueden hundir techos ligeros."],
  ["🌊 Lahares", "Lodo de ceniza con agua de lluvia, nieve o glaciar que baja por barrancas y ríos. Viaja decenas de kilómetros: en Armero (Colombia, 1985) un lahar del Nevado del Ruiz llegó a ~70 km y causó más de 20,000 muertes."],
  ["☁️ Gases", "Vapor de agua, dióxido de carbono (CO₂: sin olor, se acumula en partes bajas y asfixia), dióxido de azufre (SO₂: irrita, causa lluvia ácida y «vog»), ácido sulfhídrico (H₂S: olor a huevo podrido), cloruro y fluoruro de hidrógeno (HCl, HF: el flúor envenena pastos y agua, como en Laki, Islandia, 1783)."],
  ["⛰️ Colapso del cono", "Una parte del volcán se derrumba y forma una avalancha de escombros (Monte Santa Helena, 1980)."],
  ["🌊 Tsunami", "En volcanes de isla o de costa, una explosión o un derrumbe al mar puede levantar olas (Krakatoa, 1883; Hunga Tonga, 2022)."],
  ["⚡ Otros", "Sismos volcánicos, rayos dentro de la nube de ceniza, onda de presión en el aire y, en volcanes con glaciar, inundaciones por deshielo (Islandia)."],
];

/** HTML del bloque en la ficha (los cálculos empiezan al pulsar el botón: descargan relieve). */
export function htmlBloque({ lon, lat, nombre, tipo = "", pais = "", gvp = "" }) {
  const magma = tipoMagma(tipo), vei = veiSugerido(magma);
  return `<div class="erupcion" data-lon="${lon}" data-lat="${lat}" data-nombre="${esc(nombre)}" data-pais="${esc(pais)}" data-gvp="${esc(gvp)}">
    <h4>🌋 ¿Y si hace erupción? Escenarios de referencia</h4>
    <p class="meta">Elige una magnitud y el mapa dibuja hasta dónde podrían llegar la lava, los flujos piroclásticos, los proyectiles, la ceniza y los lahares.
      Sirve también para volcanes dormidos o que se consideran apagados, «suponiendo que despertaran». No es un pronóstico ni el mapa oficial de peligros.</p>
    <div class="erup-vei" role="radiogroup" aria-label="Magnitud (IEV)">${ESCENARIOS.map((e) => `<button type="button" class="mini${e.vei === vei ? " activo" : ""}" data-vei="${e.vei}" role="radio" aria-checked="${e.vei === vei}" title="${esc(e.nombre)}">IEV ${e.vei}</button>`).join("")}</div>
    <p class="meta erup-desc"></p>
    <label class="fila-mini">Tipo de magma <select class="erup-magma">${Object.entries(MAGMA).map(([k, t]) => `<option value="${k}"${k === magma ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>
    <div class="erup-que">${[["lava", "Lava"], ["pdc", "Flujos piroclásticos"], ["balistica", "Proyectiles"], ["ceniza", "Ceniza"], ["lahar", "Lahares"]]
      .map(([k, t]) => `<label><input type="checkbox" data-peligro="${k}" checked> <span class="ley-c" style="background:${COLORES[k === "ceniza" ? "ceniza1cm" : k]};width:10px;height:10px"></span>${t}</label>`).join(" ")}</div>
    <button type="button" class="link-btn erup-calcular">Dibujar escenario en el mapa</button>
    <div class="erup-res" aria-live="polite"></div>
    <details><summary>Qué puede salir de un volcán</summary><ul class="erup-elementos">${ELEMENTOS.map(([t, d]) => `<li><b>${t}:</b> ${esc(d)}</li>`).join("")}</ul></details>
    <details><summary>Cómo se calcula (y sus límites)</summary><p class="meta">
      Flujos piroclásticos: «cono de energía» (Malin y Sheridan, 1982) sobre el relieve real; el flujo se frena donde el terreno sube por encima de una línea
      que baja desde una altura de colapso sobre el cráter con pendiente H/L. Lava y lahares: recorridos de máxima pendiente con ruido (idea del modelo DOWNFLOW,
      Favalli y otros, 2005), con largos típicos por tipo de magma y magnitud. Ceniza: elipses de orden de magnitud orientadas con el viento en altura del modelo GFS.
      Relieve: AWS Terrain Tiles (SRTM y otras fuentes públicas, ~40 a 150 m por píxel). No considera la duración de la erupción, la lluvia, la nieve del volcán
      ni obras de protección. Para decisiones usa el mapa de peligros oficial y las indicaciones de Protección Civil.</p></details>
  </div>`;
}

export function limpiarErupcion(map) {
  for (const id of [`${SRC}-relleno`, `${SRC}-borde`, `${SRC}-lineas`]) if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(SRC)) map.removeSource(SRC);
}

function dibujar(map, feats) {
  limpiarErupcion(map);
  map.addSource(SRC, { type: "geojson", data: { type: "FeatureCollection", features: feats } });
  map.addLayer({ id: `${SRC}-relleno`, type: "fill", source: SRC, filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": ["get", "color"], "fill-opacity": ["get", "op"] } });
  map.addLayer({ id: `${SRC}-borde`, type: "line", source: SRC, filter: ["==", ["geometry-type"], "Polygon"], paint: { "line-color": ["get", "color"], "line-width": 1.5, "line-dasharray": [2, 1.5] } });
  map.addLayer({ id: `${SRC}-lineas`, type: "line", source: SRC, filter: ["==", ["geometry-type"], "LineString"],
    paint: { "line-color": ["get", "color"], "line-width": 2, "line-opacity": ["get", "op"] }, layout: { "line-cap": "round", "line-join": "round" } });
}

const poligono = (anillo, color, op, kind) => ({ type: "Feature", geometry: { type: "Polygon", coordinates: [anillo] }, properties: { color, op, kind } });
const linea = (pts, color, op, kind) => ({ type: "Feature", geometry: { type: "LineString", coordinates: pts }, properties: { color, op, kind } });
const km = (v) => (v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString("es-MX"));

/** Conecta los controles del bloque y calcula al pulsar el botón. */
export function prepararErupcion(map, div) {
  const lon = Number(div.dataset.lon), lat = Number(div.dataset.lat), nombre = div.dataset.nombre;
  let vei = Number(div.querySelector(".erup-vei .activo")?.dataset.vei ?? 3);
  const desc = () => {
    const e = ESCENARIOS[vei];
    div.querySelector(".erup-desc").textContent = `IEV ${e.vei} · ${e.nombre}: columna de ${e.columna}, ${e.volumen} de material; ocurre ${e.frecuencia}.${e.ejemplo ? ` Ejemplo: ${e.ejemplo}.` : ""}`;
  };
  desc();
  div.querySelector(".erup-vei").onclick = (ev) => {
    const b = ev.target.closest("[data-vei]");
    if (!b) return;
    vei = Number(b.dataset.vei);
    for (const x of div.querySelectorAll("[data-vei]")) { x.classList.toggle("activo", x === b); x.setAttribute("aria-checked", x === b); }
    desc();
  };
  div.querySelector(".erup-calcular").onclick = async () => {
    const res = div.querySelector(".erup-res");
    const quiere = (k) => div.querySelector(`[data-peligro="${k}"]`)?.checked;
    const magma = div.querySelector(".erup-magma").value;
    const e = ESCENARIOS[vei];
    res.innerHTML = `<p class="meta">Descargando el relieve y calculando… (IEV ${vei})</p>`;
    try {
      const lavaKm = LAVA_KM[magma][vei];
      const radio = Math.min(70, Math.max(lavaKm, e.pdc ? 25 : 5, e.balistica) + 3);
      const rej = await cargarRejilla(lon, lat, radio);
      const v = rej.cima(lon, lat);
      if (!(v.alt === v.alt)) throw new Error("no hay relieve para este punto");
      const cima = rej.aLonLat(v.i, v.j);
      const semilla = Math.round(Math.abs(lon * 1000 + lat * 7919));
      const feats = [], filas = [];
      // Ceniza primero (abajo), luego flujos, lava y lahares encima.
      if (quiere("ceniza") && e.ceniza) {
        const C = await import("./ceniza.js");
        const viento = await C.vientoEn(lon, lat, e.nivel).catch(() => null);
        for (const z of zonasCeniza(cima, e, viento)) feats.push(poligono(z.anillo, COLORES[z.id], 0.16, z.id));
        filas.push(["Ceniza", `≥ 1 mm hasta ~${km(e.ceniza[0])} km; ≥ 1 cm hasta ~${km(e.ceniza[1])} km; ≥ 10 cm hasta ~${km(e.ceniza[2])} km`,
          viento ? `Orientada con el viento a ~${viento.km} km de altura (GFS): va hacia el ${nombreRumbo(haciaDonde(viento.desde))} a ${Math.round(viento.kmh)} km/h. Con otro viento cambia de dirección.`
            : "Sin dato de viento: se dibuja como círculo de la mitad del largo, porque no se sabe hacia dónde iría."]);
      } else if (quiere("ceniza")) filas.push(["Ceniza", "Casi nada", "Una erupción efusiva (IEV 0) apenas produce ceniza."]);
      if (quiere("pdc") && e.pdc) {
        const c = conoEnergia(rej, v.i, v.j, e.pdc.hc, e.pdc.mu, radio - 1);
        feats.push(poligono(c.anillo, COLORES.pdc, 0.22, "pdc"));
        filas.push(["Flujos piroclásticos", `hasta ~${km(c.maxKm)} km (promedio ${km(c.medioKm)} km)`,
          `Colapso de ${e.pdc.hc} m sobre el cráter, H/L = ${e.pdc.mu}. Se frenan contra cerros y avanzan más por valles.${c.recortado ? " El área llega al borde del relieve descargado." : ""}`]);
      }
      if (quiere("balistica")) {
        feats.push(poligono(circulo(cima, e.balistica), COLORES.balistica, 0.08, "balistica"));
        filas.push(["Proyectiles", `hasta ~${km(e.balistica)} km`, "Alcance típico de bloques y bombas para esta magnitud."]);
      }
      if (quiere("lava")) {
        const r = recorridos(rej, v.i, v.j, { n: 120, largoKm: lavaKm, dh: 3, salidaM: 400, semilla });
        for (const l of r.lineas) feats.push(linea(l, COLORES.lava, 0.35, "lava"));
        filas.push(["Lava", `coladas de ~${km(lavaKm)} km; la más lejana a ~${km(r.alcanceKm)} km en línea recta`,
          `${MAGMA[magma]}. Cada línea es un recorrido posible; donde se juntan muchas, es más probable que pase la lava.`]);
      }
      if (quiere("lahar")) {
        const largo = e.lahar;
        const rl = largo > radio - 2 ? await cargarRejilla(lon, lat, Math.min(100, largo + 3)) : rej;
        const vl = rl.cima(lon, lat);
        const r = recorridos(rl, vl.i, vl.j, { n: 40, largoKm: largo, dh: 1, salidaM: 1200, semilla: semilla + 1 });
        for (const l of r.lineas) feats.push(linea(l, COLORES.lahar, 0.5, "lahar"));
        filas.push(["Lahares", `por barrancas hasta ~${km(largo)} km; el más lejano a ~${km(r.alcanceKm)} km en línea recta`,
          "Solo si hay agua: lluvias fuertes, nieve o glaciar en la cima. Siguen el cauce de ríos y barrancas."]);
      }
      dibujar(map, feats);
      res.innerHTML = `<table class="tabla-ceniza"><thead><tr><th>Peligro</th><th>Alcance (referencia)</th><th>Nota</th></tr></thead><tbody>
        ${filas.map(([a, b, c]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td><td>${esc(c)}</td></tr>`).join("")}</tbody></table>
        <p class="meta">Cima tomada del relieve: ${Math.round(v.alt).toLocaleString("es-MX")} m (punto más alto a menos de 1.5 km de la ubicación de ${esc(nombre)}).
          Relieve a ~${Math.round(rej.mpp)} m por píxel.
          ${div.dataset.gvp ? `Ficha del volcán: <a href="https://volcano.si.edu/volcano.cfm?vn=${esc(div.dataset.gvp)}" target="_blank" rel="noopener noreferrer">Smithsonian GVP</a>. ` : ""}
          ${/m[eé]xico|MEX/i.test(div.dataset.pais) ? `Mapa oficial de peligros: <a href="http://www.atlasnacionalderiesgos.gob.mx" target="_blank" rel="noopener noreferrer">Atlas Nacional de Riesgos (CENAPRED)</a>.` : ""}</p>
        <button type="button" class="txt-btn erup-quitar">Quitar escenario del mapa</button>`;
      res.querySelector(".erup-quitar").onclick = () => limpiarErupcion(map);
      map.fitBounds(limites(feats), { padding: 60, maxZoom: 11, duration: 600 });
    } catch (err) {
      res.innerHTML = `<p class="meta">No se pudo calcular: ${esc(err.message)}</p>`;
    }
  };
}

function limites(feats) {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  for (const f of feats) for (const c of f.geometry.type === "Polygon" ? f.geometry.coordinates[0] : f.geometry.coordinates) {
    x0 = Math.min(x0, c[0]); y0 = Math.min(y0, c[1]); x1 = Math.max(x1, c[0]); y1 = Math.max(y1, c[1]);
  }
  return [[x0, y0], [x1, y1]];
}
