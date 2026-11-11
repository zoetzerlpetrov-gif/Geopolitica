// Protección contra las «líneas que cruzan el mundo». Cuando una trayectoria pasa por la línea de cambio de fecha
// (longitud ±180°), los datos saltan de 179° a -179°. El mapa une esos dos puntos por el camino largo y dibuja una
// raya horizontal de lado a lado del planeta (así pasó con el pronóstico del ciclón «Pena», noviembre de 2026).
// Aquí se corrige en cualquier GeoJSON antes de pintarlo:
//  - Líneas: se cortan en ±180° (con la latitud interpolada) y quedan como MultiLineString.
//  - Polígonos: el anillo se «desenvuelve» (longitudes continuas, p. ej. 179 → 181) para no cruzar el mapa.
//  - Los bordes de mundo completo (-180 → 180 en un rectángulo) se dejan como están.
// protegerMapLibre(maplibregl) aplica la corrección a TODA fuente GeoJSON que se agregue o actualice en el mapa.

const SALTO = 180, BORDE_MUNDO = 359.999;

/** Corta una línea [[lon, lat], …] donde cruza ±180°. Devuelve una lista de tramos (al menos uno). */
export function cortarLinea(pts) {
  if (!Array.isArray(pts) || pts.length < 2) return [pts];
  const tramos = []; let actual = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = b[0] - a[0];
    if (Math.abs(d) <= SALTO) { actual.push(b); continue; }
    if (Math.abs(d) < BORDE_MUNDO) {
      // b del otro lado: se lleva al mismo lado que a para calcular dónde cruza
      const bx = b[0] + (d > 0 ? -360 : 360), borde = bx > a[0] ? 180 : -180;
      const t = (borde - a[0]) / (bx - a[0]), lat = a[1] + t * (b[1] - a[1]);
      actual.push([borde, lat]); tramos.push(actual); actual = [[-borde, lat], b];
    } else { tramos.push(actual); actual = [b]; }
  }
  tramos.push(actual);
  return tramos.filter((t) => t.length >= 2).length ? tramos.filter((t) => t.length >= 2) : [pts];
}

/** Anillo con longitudes continuas (sin saltos de más de 180°), salvo que sea un borde de mundo completo. */
export function desenvolverAnillo(anillo) {
  if (!Array.isArray(anillo) || anillo.length < 2) return anillo;
  for (let i = 1; i < anillo.length; i++) if (Math.abs(anillo[i][0] - anillo[i - 1][0]) >= BORDE_MUNDO) return anillo;
  let previo = null, cambio = false;
  const out = anillo.map((c) => {
    let x = c[0];
    if (previo != null) { while (x - previo > SALTO) x -= 360; while (x - previo < -SALTO) x += 360; }
    if (x !== c[0]) cambio = true;
    previo = x;
    return x === c[0] ? c : [x, ...c.slice(1)];
  });
  return cambio ? out : anillo;
}

const tieneSalto = (pts) => { for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i][0] - pts[i - 1][0]) > SALTO) return true; return false; };

/** Geometría sin rayas de lado a lado. Devuelve la misma geometría si no hacía falta tocarla. */
export function geometriaSegura(g) {
  if (!g || typeof g !== "object") return g;
  try {
    switch (g.type) {
      case "LineString": {
        if (!tieneSalto(g.coordinates || [])) return g;
        const t = cortarLinea(g.coordinates);
        return t.length === 1 ? { ...g, coordinates: t[0] } : { type: "MultiLineString", coordinates: t };
      }
      case "MultiLineString": {
        if (!(g.coordinates || []).some(tieneSalto)) return g;
        return { ...g, coordinates: g.coordinates.flatMap(cortarLinea) };
      }
      case "Polygon": {
        if (!(g.coordinates || []).some(tieneSalto)) return g;
        return { ...g, coordinates: g.coordinates.map(desenvolverAnillo) };
      }
      case "MultiPolygon": {
        if (!(g.coordinates || []).some((p) => p.some(tieneSalto))) return g;
        return { ...g, coordinates: g.coordinates.map((p) => p.map(desenvolverAnillo)) };
      }
      case "GeometryCollection": return { ...g, geometries: (g.geometries || []).map(geometriaSegura) };
      default: return g;
    }
  } catch (e) { return g; }
}

/** FeatureCollection, Feature o geometría con la corrección aplicada. Lo que no es objeto (una URL) se deja igual. */
export function geojsonSeguro(d) {
  if (!d || typeof d !== "object") return d;
  if (d.type === "FeatureCollection" && Array.isArray(d.features)) {
    let cambio = false;
    const features = d.features.map((f) => { const g = f?.geometry ? geometriaSegura(f.geometry) : f?.geometry; if (g === f?.geometry) return f; cambio = true; return { ...f, geometry: g }; });
    return cambio ? { ...d, features } : d;
  }
  if (d.type === "Feature") { const g = geometriaSegura(d.geometry); return g === d.geometry ? d : { ...d, geometry: g }; }
  return geometriaSegura(d);
}

/** Instala la corrección en MapLibre: addSource y setData de toda fuente GeoJSON. Se puede llamar varias veces. */
export function protegerMapLibre(ml = globalThis.maplibregl) {
  if (!ml?.Map || ml.__antimeridiano) return;
  ml.__antimeridiano = true;
  const add = ml.Map.prototype.addSource;
  ml.Map.prototype.addSource = function (id, src) {
    if (src && src.type === "geojson" && src.data && typeof src.data === "object") src = { ...src, data: geojsonSeguro(src.data) };
    return add.call(this, id, src);
  };
  const G = ml.GeoJSONSource?.prototype;
  if (G?.setData) { const set = G.setData; G.setData = function (data, ...r) { return set.call(this, geojsonSeguro(data), ...r); }; }
}
