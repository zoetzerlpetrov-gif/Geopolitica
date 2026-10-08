// Ficha y trayectoria de un buque: bandera, medidas, destino declarado, estado de navegación y
// posiciones recientes.
//
// Datos (AISStream, con la clave del repositorio; el navegador no llama a ninguna API):
//   - Datos estáticos (indicativo, IMO, medidas, calado, destino, ETA): los transmite cada buque cada
//     6 min; el bot los guarda 72 h. Algunos buques aún no los tienen en la instantánea.
//   - Bandera: se deduce del MID (3 primeros dígitos del MMSI), según la tabla de la UIT.
//   - Destino y ETA: los escribe la tripulación a mano. Suelen venir como código UN/LOCODE («MX ZLO»);
//     de ahí solo se lee el país (2 letras). El AIS NO transmite puerto de origen.
//   - Trayectoria: posiciones de nuestras instantáneas (cada 20 min, hasta 6 h) en
//     data/vivos/rastros-buques/<último dígito del MMSI>.json. Nunca para embarcaciones de recreo.
// Privacidad: no se muestra propietario ni tripulación.
import { getJSON, esc } from "./util.js";
import { cardinal } from "./vuelos.js";

export const SIN_TRAYECTORIA = new Set(["vela_recreo"]);

// Estado de navegación AIS (UIT-R M.1371).
const ESTADOS = {
  0: "Navegando con motor", 1: "Fondeado", 2: "Sin gobierno", 3: "Maniobrabilidad restringida",
  4: "Restringido por su calado", 5: "Amarrado", 6: "Varado", 7: "Pescando", 8: "Navegando a vela",
  14: "Alarma de búsqueda y rescate (AIS-SART)",
};
export const estadoNav = (n) => ESTADOS[n] || null;

// Tipo AIS (2 dígitos): primer dígito = familia; algunos códigos exactos tienen nombre propio.
const TIPOS_EXACTOS = {
  30: "Pesquero", 31: "Remolcador", 32: "Remolcador (remolque grande)", 33: "Dragado o trabajos submarinos",
  34: "Operaciones de buceo", 35: "Operaciones militares", 36: "Velero", 37: "Embarcación de recreo",
  50: "Embarcación de práctico", 51: "Búsqueda y rescate", 52: "Remolcador", 53: "Embarcación de servicio portuario",
  54: "Lucha contra la contaminación", 55: "Autoridad policial", 58: "Transporte médico",
};
const TIPOS_FAMILIA = { 2: "Ala en efecto suelo (WIG)", 4: "Alta velocidad", 6: "Pasaje", 7: "Carga", 8: "Tanquero", 9: "Otro tipo" };
export function tipoAis(n) {
  if (!n) return null;
  if (TIPOS_EXACTOS[n]) return TIPOS_EXACTOS[n];
  const fam = TIPOS_FAMILIA[Math.floor(n / 10)];
  if (!fam) return null;
  // Segundo dígito 1–4 de carga y tanqueros: categoría de mercancía peligrosa del Código IMDG/MARPOL.
  const d = n % 10;
  return [7, 8].includes(Math.floor(n / 10)) && d >= 1 && d <= 4 ? `${fam} (mercancía peligrosa, categoría ${"XABCD"[d]})` : fam;
}

let nombresPais = null;
/** Nombre en español de un código ISO alfa-2 (usa Intl; si no existe, el código). */
export function paisIso2(cod) {
  if (!cod || !/^[A-Z]{2}$/.test(cod)) return null;
  try {
    nombresPais ??= new Intl.DisplayNames(["es"], { type: "region" });
    const n = nombresPais.of(cod);
    return n && n !== cod ? n : cod;
  } catch (e) {
    return cod;
  }
}

/** País del destino si el texto parece un UN/LOCODE («MXZLO», «MX ZLO», «US LAX>CN SHA» toma el último). */
export function paisDestino(destino) {
  if (!destino) return null;
  const partes = destino.toUpperCase().split(/>|=>|-\s*>/).map((p) => p.trim()).filter(Boolean);
  const m = /^([A-Z]{2})\s?[A-Z2-9]{3}$/.exec(partes[partes.length - 1] || "");
  return m ? m[1] : null;
}

// ---------------------------------------------------------------- datos bajo demanda
const shards = new Map();

/** Rastro reciente del buque ([] si es de recreo o si aún no hay posiciones). */
export async function datosBuque(b) {
  if (SIN_TRAYECTORIA.has(b.subtipo)) return { rastro: [] };
  const clave = String(b.mmsi).slice(-1);
  if (!shards.has(clave)) shards.set(clave, getJSON(`data/vivos/rastros-buques/${clave}.json`, { bust: true }).catch(() => ({ r: {} })));
  const d = await shards.get(clave);
  return { rastro: d.r[String(b.mmsi)] || [] };
}
if (typeof addEventListener === "function") addEventListener("vivos-actualizados", () => shards.clear());

/** GeoJSON para la capa «trayectoria» de vuelos.js: recorrido y rumbo de las próximas 2 h. */
export function geojsonBuque(b, { rastro }, proyectar) {
  const feats = [];
  const recorrido = [...rastro.map((p) => [p[0], p[1]]), [b.lon, b.lat]];
  if (recorrido.length > 1) {
    for (let i = 1; i < recorrido.length; i++) {
      while (recorrido[i][0] - recorrido[i - 1][0] > 180) recorrido[i][0] -= 360;
      while (recorrido[i][0] - recorrido[i - 1][0] < -180) recorrido[i][0] += 360;
    }
    feats.push({ type: "Feature", properties: { k: "recorrido" }, geometry: { type: "LineString", coordinates: recorrido } });
    for (const p of rastro) feats.push({ type: "Feature", properties: { k: "punto" }, geometry: { type: "Point", coordinates: [p[0], p[1]] } });
  }
  if (b.vel_nudos >= 1) {
    const rumbo = [];
    for (let s = 0; s <= 7200; s += 900) rumbo.push(proyectar(b.lon, b.lat, b.rumbo || 0, b.vel_nudos * 1.852, s));
    feats.push({ type: "Feature", properties: { k: "rumbo" }, geometry: { type: "LineString", coordinates: rumbo } });
  }
  return { type: "FeatureCollection", features: feats };
}

// ---------------------------------------------------------------- ficha
const num = (n) => Number(n).toLocaleString("es-MX");

/** HTML de la ficha de un buque. `extra` = resultado de datosBuque() (o null mientras carga). */
export function htmlBuque(b, extra, { subtipoNombre, edadMin }) {
  const bandera = paisIso2(b.bandera);
  const est = estadoNav(b.estado_nav);
  const tipo = tipoAis(b.tipo_ais);
  const pDest = paisDestino(b.destino);
  const rastro = extra?.rastro || [];
  const sart = b.estado_nav === 14;
  const medidas = b.eslora_m ? `${num(b.eslora_m)} m de eslora${b.manga_m ? ` × ${num(b.manga_m)} m de manga` : ""}` : null;
  const tray = SIN_TRAYECTORIA.has(b.subtipo) ? "No se muestra la trayectoria de embarcaciones de recreo (privacidad)."
    : rastro.length ? `Trayectoria aproximada: ${rastro.length} posiciones de las instantáneas (cada 20 min, hasta 6 h).`
      : extra ? "Aún sin posiciones anteriores para dibujar la trayectoria." : "";
  const destino = b.destino
    ? `<div class="ruta-vuelo"><div><span class="meta">Origen</span>El AIS no transmite el puerto de salida.</div>
        <div><span class="meta">Destino declarado</span><b>${esc(b.destino)}</b>${pDest ? ` (${esc(paisIso2(pDest))})` : ""}${b.eta ? ` · ETA ${esc(b.eta)} UTC` : ""}</div>
        <p class="meta">Lo escribe la tripulación a mano en el equipo AIS: puede estar desactualizado o abreviado.</p></div>`
    : `<p class="meta">Sin destino declarado${b.tipo_ais ? "" : " (los datos estáticos de este buque aún no llegan; se transmiten cada 6 min)"}. El AIS no transmite el puerto de salida.</p>`;
  return `<h3 id="ficha-titulo">${esc(b.nombre || "MMSI " + b.mmsi)}</h3>
    <div class="fecha">${esc(subtipoNombre)}${bandera ? ` · bandera de ${esc(bandera)}` : ""}</div>
    <div class="chips"><span class="chip estado-retrasado">Dato retrasado${edadMin != null ? ` · instantánea de hace ${edadMin} min` : ""}</span>
      ${b.subtipo === "sancionados" ? `<span class="chip alerta alerta-FLASH">IMO en lista SDN (OFAC)</span>` : ""}
      ${sart ? `<span class="chip alerta alerta-FLASH">${esc(est)}</span>` : ""}</div>
    ${destino}
    <dl>
      ${b.edad_s > 300 ? `<dt>Última señal</dt><dd>hace ${num(Math.round(b.edad_s / 60 + (edadMin || 0)))} min (no se oyó en la última ventana; en zonas con pocas antenas es normal)</dd>` : ""}
      ${est && !sart ? `<dt>Estado</dt><dd>${esc(est)}</dd>` : ""}
      <dt>Velocidad</dt><dd>${num(b.vel_nudos)} nudos · ${num(Math.round(b.vel_nudos * 1.852))} km/h</dd>
      <dt>Rumbo</dt><dd>${esc(b.rumbo)}° (${esc(cardinal(b.rumbo || 0))})</dd>
      ${tipo ? `<dt>Tipo AIS</dt><dd>${esc(tipo)} (código ${esc(b.tipo_ais)})</dd>` : ""}
      ${medidas ? `<dt>Medidas</dt><dd>${esc(medidas)}</dd>` : ""}
      ${b.calado_m ? `<dt>Calado</dt><dd>${esc(b.calado_m)} m</dd>` : ""}
      ${b.indicativo ? `<dt>Indicativo</dt><dd>${esc(b.indicativo)}</dd>` : ""}
      <dt>IMO</dt><dd>${b.imo ? esc(b.imo) : "—"}</dd>
      <dt>MMSI</dt><dd>${esc(b.mmsi)}${bandera ? ` · MID ${esc(String(b.mmsi).slice(0, 3))} = ${esc(bandera)}` : ""}</dd>
      <dt>Ver en</dt><dd><a href="https://www.marinetraffic.com/es/ais/details/ships/mmsi:${encodeURIComponent(b.mmsi)}" target="_blank" rel="noopener noreferrer">MarineTraffic</a>
        · <a href="https://www.vesselfinder.com/vessels/details/${encodeURIComponent(b.imo || b.mmsi)}" target="_blank" rel="noopener noreferrer">VesselFinder</a></dd>
    </dl>
    ${SIN_TRAYECTORIA.has(b.subtipo) ? "" : `<p class="leyenda-tray"><span class="lt-rec"></span>recorrido <span class="lt-rumbo"></span>rumbo 2 h</p>`}
    <p class="meta">${esc(tray)} La bandera es la del registro del buque, no la nacionalidad del dueño. No se muestra propietario ni tripulación.</p>`;
}
