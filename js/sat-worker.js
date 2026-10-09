// Web Worker: calcula la posición de los satélites con SGP4 (satellite.js) fuera del hilo principal.
// Recibe {tipo:"tle", grupos:{id:[[nombre,l1,l2],...]}}, {tipo:"grupos", activos:[...]} y {tipo:"orbita", id}
// (traza en tierra y elementos orbitales de un satélite, para su ficha); cada `intervalo`
// ms responde con un texto GeoJSON listo para MapLibre (así el hilo principal no arma objetos).
/* global satellite */
importScripts("../vendor/satellite/satellite.min.js", "sol.js");

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

/**
 * Pases visibles a simple vista desde (lat, lon) en las próximas `horas` (ver js/sol.js).
 * Recorre cada satélite de los grupos pedidos en pasos de 30 s; un pase empieza cuando sube a más de
 * `elevMin` grados y termina al bajar. Solo se informa si en algún momento del pase el satélite está
 * iluminado y el observador a oscuras. El brillo real (magnitud) no se calcula: depende de la forma
 * y orientación de cada satélite, que el TLE no trae.
 */
function pases({ lat, lon, horas = 24, grupos, elevMin = 10, max = 40 }) {
  const obs = { latitude: lat * Math.PI / 180, longitude: lon * Math.PI / 180, height: 0 };
  const inicio = Date.now(), pasoMs = 30000, n = Math.ceil((horas * 3600000) / pasoMs);
  // Momentos y condiciones de luz (iguales para todos los satélites): se calculan una sola vez.
  const tiempos = [];
  for (let i = 0; i <= n; i++) {
    const t = new Date(inicio + i * pasoMs), gmst = satellite.gstime(t);
    tiempos.push({ t, gmst, oscuro: SOL.alturaSol(lat, lon, t, gmst) < -6, sol: SOL.solECI(t) });
  }
  const vistos = new Set(), out = [];
  for (const g of grupos || Object.keys(satrecs)) {
    for (const s of satrecs[g] || []) {
      if (vistos.has(s.id)) continue;
      vistos.add(s.id);
      let pase = null;
      for (const k of tiempos) {
        const pv = satellite.propagate(s.rec, k.t);
        if (!pv || !pv.position || typeof pv.position === "boolean") { pase = null; continue; }
        const ang = satellite.ecfToLookAngles(obs, satellite.eciToEcf(pv.position, k.gmst));
        const elev = ang.elevation * 180 / Math.PI, az = ang.azimuth * 180 / Math.PI;
        if (elev >= elevMin) {
          const p = pv.position, visible = k.oscuro && !SOL.enSombra([p.x, p.y, p.z], k.sol);
          if (!pase) pase = { id: s.id, n: s.n, grupo: g, ini: k.t.getTime(), az_ini: az, elev_max: elev, t_max: k.t.getTime(), visible: false, vis_ini: null };
          if (elev > pase.elev_max) { pase.elev_max = elev; pase.t_max = k.t.getTime(); pase.az_max = az; }
          if (visible) { pase.visible = true; pase.vis_ini ??= k.t.getTime(); pase.vis_fin = k.t.getTime(); }
          pase.fin = k.t.getTime(); pase.az_fin = az;
        } else if (pase) {
          if (pase.visible) out.push(pase);
          pase = null;
        }
      }
      if (pase?.visible) out.push(pase);
    }
  }
  out.sort((a, b) => a.vis_ini - b.vis_ini);
  return { tipo: "pases", lat, lon, horas, total: out.length, pases: out.slice(0, max).map((p) => ({ ...p,
    elev_max: Math.round(p.elev_max), desde: SOL.rumbo(p.az_ini), hacia: SOL.rumbo(p.az_fin), dur_min: Math.max(1, Math.round((p.vis_fin - p.vis_ini) / 60000)) })) };
}

onmessage = (e) => {
  const m = e.data;
  if (m.tipo === "orbita") { postMessage(orbita(m.id)); return; }
  if (m.tipo === "pases") {
    if (m.grupos_tle) for (const [g, lista] of Object.entries(m.grupos_tle)) satrecs[g] ??= lista.map(([n, l1, l2]) => ({ n, l1, id: l2.slice(2, 7).trim(), rec: satellite.twoline2satrec(l1, l2) }));
    postMessage(pases(m));
    return;
  }
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
