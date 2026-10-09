// Alerta de sismos: solo avisa de sismos que pueden sacudir fuerte donde está la persona.
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluar, radioPeligro, deUsgs, deEmsc, deSsn, sinDuplicados, ciudadDeZonaHoraria, redondear } from "../../js/alerta-sismos.js";

const CDMX = { lat: 19.43, lon: -99.13 };
const ahora = Date.parse("2026-10-09T21:00:00Z");
const s = (mag, lat, lon, extra = {}) => ({ id: "x", mag, lat, lon, prof_km: 15, tiempo: ahora - 3 * 60000, tsunami: false, ...extra });

test("radio de peligro crece con la magnitud y los sismos menores no cuentan", () => {
  assert.equal(radioPeligro(4.9), 0);
  assert.equal(radioPeligro(5.2), 40);
  assert.equal(radioPeligro(7.1), 400);
  assert.equal(radioPeligro(7.1, 1.5), 600);
});

test("M7.1 en la costa de Guerrero (~300 km) dispara alarma en la CDMX; M5 ahí no", () => {
  const r = evaluar(s(7.1, 17.0, -100.0), CDMX, { ahora });
  assert.equal(r.nivel, "alarma");
  assert.ok(r.distancia_km > 250 && r.distancia_km < 320);
  assert.equal(evaluar(s(5.0, 17.0, -100.0), CDMX, { ahora }), null);
});

test("aviso sin sonido entre 1 y 2 veces la distancia; nada si es viejo o lejano", () => {
  assert.equal(evaluar(s(6.0, 17.5, -100.5), CDMX, { ahora }).nivel, "aviso");          // ~260 km, radio 150
  assert.equal(evaluar(s(7.5, 35, 140), CDMX, { ahora }), null);                         // Japón
  assert.equal(evaluar(s(7.1, 17.0, -100.0, { tiempo: ahora - 45 * 60000 }), CDMX, { ahora }), null);  // hace 45 min
});

test("un sismo muy profundo cerca sacude menos: la distancia al foco cuenta", () => {
  assert.equal(evaluar(s(5.5, 19.43, -99.13, { prof_km: 150 }), CDMX, { ahora }).nivel, "aviso");  // se siente, pero no hay alarma
  assert.equal(evaluar(s(5.5, 19.43, -99.13, { prof_km: 10 }), CDMX, { ahora }).nivel, "alarma");
});

test("bandera de tsunami a menos de 1,000 km avisa aunque la sacudida no llegue", () => {
  const r = evaluar(s(7.6, 15.0, -105.0, { tsunami: true, prof_km: 20 }), CDMX, { ahora });
  assert.ok(r && /tsunami/.test(r.motivo));
});

test("lectores de USGS, EMSC y SSN, y sin duplicados entre fuentes", () => {
  const u = deUsgs({ id: "us1", properties: { mag: 6.6, place: "Panama", time: ahora, tsunami: 1, url: "u" }, geometry: { coordinates: [-81.4, 7.7, 10] } });
  assert.deepEqual([u.lat, u.lon, u.prof_km, u.tsunami], [7.7, -81.4, 10, true]);
  const e = deEmsc({ id: "e1", properties: { mag: 6.5, lat: 7.74, lon: -81.46, depth: 10, time: new Date(ahora + 30000).toISOString(), flynn_region: "PANAMA", auth: "GFZ", source_id: "1" } });
  assert.equal(e.fuente, "EMSC (GFZ)");
  assert.equal(sinDuplicados([u, e]).length, 1);
  const xml = `<item><title>4.3, 171 km al SUROESTE de  MAPASTEPEC, CHIS</title><description><![CDATA[ <p>Fecha:2026-10-09 10:59:36 (Hora de M&eacute;xico)<br/>Lat/Lon: 14.107/-93.689<br/>Profundidad: 10.0 km </p> ]]></description><link>http://x</link><geo:lat>14.107</geo:lat><geo:long>-93.689</geo:long></item>`;
  const ss = deSsn(`<rss>${xml}</rss>`);
  assert.equal(ss.length, 1);
  assert.equal(ss[0].tiempo, Date.parse("2026-10-09T16:59:36Z"));
});

test("ciudad sugerida por la zona horaria, sin red; ubicación redondeada a ~5 km", () => {
  const c = ciudadDeZonaHoraria("America/Mexico_City", [["Mexico City", "Ciudad de México", "MEX", 19.43, -99.13, "capital", 1]]);
  assert.equal(c.nombre, "Ciudad de México");
  assert.equal(redondear(19.4327), 19.45);
});
