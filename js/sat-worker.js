// Web Worker: calcula la posición de los satélites con SGP4 (satellite.js) fuera del hilo principal.
// Recibe {tipo:"tle", grupos:{id:[[nombre,l1,l2],...]}} y {tipo:"grupos", activos:[...]}; cada `intervalo`
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

onmessage = (e) => {
  const m = e.data;
  if (m.tipo === "tle") {
    satrecs = {};
    for (const [g, lista] of Object.entries(m.grupos)) {
      satrecs[g] = lista.map(([n, l1, l2]) => ({ n, id: l2.slice(2, 7).trim(), rec: satellite.twoline2satrec(l1, l2) }));
    }
  }
  if (m.tipo === "grupos") activos = new Set(m.activos);
  if (m.intervalo) intervalo = m.intervalo;
  clearInterval(reloj);
  if (activos.size) { calcular(); reloj = setInterval(calcular, intervalo); }
};
