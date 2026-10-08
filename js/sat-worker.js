// Web Worker: calcula la posición de los satélites con SGP4 (satellite.js) fuera del hilo principal.
// Recibe {tipo:"tle", grupos:{id:[[nombre,l1,l2],...]}}, {tipo:"grupos", activos:[...]} y {tipo:"orbita", id}
// (traza en tierra y elementos orbitales de un satélite, para su ficha); cada `intervalo`
// ms responde con un texto GeoJSON listo para MapLibre (así el hilo principal no arma objetos).
/* global satellite */
importScripts("../vendor/satellite/satellite.min.js");

let satrecs = {};        // grupo -> [{n, id, rec}]
let activos = new Set();
let reloj = null;
let intervalo = 2000;

function calcular() {
  const ahora = new Date();
  const gmst = satellite.gstime(ahora);
  const partes = [];
  const vistos = new Set();
  for (const g of activos) {
    for (const s of satrecs[g] || []) {
      if (vistos.has(s.id)) continue; // un satélite puede estar en dos grupos
      vistos.add(s.id);
      const pv = satellite.propagate(s.rec, ahora);
      if (!pv || !pv.position || typeof pv.position === "boolean") continue;
      const geo = satellite.eciToGeodetic(pv.position, gmst);
      const lon = satellite.degreesLong(geo.longitude);
      const lat = satellite.degreesLat(geo.latitude);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      partes.push(`{"type":"Feature","geometry":{"type":"Point","coordinates":[${lon.toFixed(3)},${lat.toFixed(3)}]},"properties":{"id":"sat:${s.id}","n":${JSON.stringify(s.n)},"st":"${g}","alt":${Math.round(geo.height)}}}`);
    }
  }
  postMessage({ tipo: "posiciones", geojson: `{"type":"FeatureCollection","features":[${partes.join(",")}]}`, n: partes.length, t: ahora.toISOString() });
}

/** Muestras de la trayectoria (traza en tierra) de un satélite: media órbita atrás y una adelante. */
function orbita(id) {
  let s = null;
  for (const lista of Object.values(satrecs)) { s = lista.find((x) => x.id === id); if (s) break; }
  if (!s) return { tipo: "orbita", id, error: "sin TLE" };
  const r = s.rec;
  const periodo = (2 * Math.PI) / r.no; // minutos
  const paso = periodo / 120;
  const ahora = Date.now();
  const muestras = [];
  for (let m = -periodo / 2; m <= periodo + 1e-9; m += paso) {
    const t = new Date(ahora + m * 60000);
    const pv = satellite.propagate(r, t);
    if (!pv || !pv.position || typeof pv.position === "boolean") continue;
    const geo = satellite.eciToGeodetic(pv.position, satellite.gstime(t));
    const lon = satellite.degreesLong(geo.longitude), lat = satellite.degreesLat(geo.latitude);
    if (Number.isFinite(lon) && Number.isFinite(lat)) muestras.push([+lon.toFixed(3), +lat.toFixed(3), Math.round(geo.height), Math.round(m * 10) / 10]);
  }
  const pv = satellite.propagate(r, new Date(ahora));
  const v = pv && pv.velocity && typeof pv.velocity !== "boolean" ? Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z) : null;
  return {
    tipo: "orbita", id, n: s.n, muestras,
    elementos: { inclinacion: (r.inclo * 180) / Math.PI, excentricidad: r.ecco, periodo_min: periodo, vel_kms: v,
      epoca_jd: r.jdsatepoch + (r.jdsatepochF || 0), designador: s.l1.slice(9, 17).trim() },
  };
}

onmessage = (e) => {
  const m = e.data;
  if (m.tipo === "orbita") { postMessage(orbita(m.id)); return; }
  if (m.tipo === "tle") {
    if (!m.agregar) satrecs = {};
    for (const [g, lista] of Object.entries(m.grupos)) {
      satrecs[g] = lista.map(([n, l1, l2]) => ({ n, l1, id: l2.slice(2, 7).trim(), rec: satellite.twoline2satrec(l1, l2) }));
    }
  }
  if (m.tipo === "grupos" || m.activos) activos = new Set(m.activos);
  if (m.intervalo) intervalo = m.intervalo;
  clearInterval(reloj);
  if (activos.size) { calcular(); reloj = setInterval(calcular, intervalo); }
};
