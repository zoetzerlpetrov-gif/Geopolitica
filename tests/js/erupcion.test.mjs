// Escenarios de erupción: modelos simples sobre un volcán sintético (cono perfecto).  Ejecutar:  node --test "tests/js/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { Rejilla, conoEnergia, recorridos, elipse, zonasCeniza, tipoMagma, veiSugerido, aPixelGlobal, aLonLatGlobal, zoomPara,
  alturaTerrarium, ESCENARIOS, LAVA_KM, htmlBloque } from "../../js/erupcion.js";

const LAT = 19, LON = -98.6, Z = 12;

/** Cono de 3,000 m de alto con pendiente de 10 % (baja 100 m por km) sobre una llanura a 1,000 m. */
function cono() {
  const w = 801, h = 801;
  const [gx, gy] = aPixelGlobal(LON, LAT, Z);
  const r = new Rejilla({ z: Z, ox: Math.round(gx) - 400, oy: Math.round(gy) - 400, w, h, alt: new Float32Array(w * h), lat: LAT });
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) r.alt[j * w + i] = Math.max(1000, 3000 - 0.1 * Math.hypot(i - 400, j - 400) * r.mpp);
  return r;
}

test("conversiones de mosaico: ida y vuelta, zoom según radio y altura Terrarium", () => {
  const [x, y] = aPixelGlobal(LON, LAT, Z);
  const [lon, lat] = aLonLatGlobal(x, y, Z);
  assert.ok(Math.abs(lon - LON) < 1e-4 && Math.abs(lat - LAT) < 1e-4);
  assert.equal(zoomPara(15, LAT), 12);
  assert.ok(zoomPara(100, LAT) <= 10 && zoomPara(100, LAT) >= 7);
  assert.equal(alturaTerrarium(128, 0, 0), 0);
  assert.equal(alturaTerrarium(133, 160, 0), 1440);
});

test("la cima se encuentra aunque la coordenada caiga a un lado del cráter", () => {
  const r = cono();
  const [lon, lat] = r.aLonLat(400 + 8, 400 - 5);
  const c = r.cima(lon, lat, 1500);
  assert.equal(c.i, 400); assert.equal(c.j, 400);
  assert.ok(Math.abs(c.alt - 3000) < 1);
});

test("cono de energía: en un cono de 10 % con colapso de 500 m y H/L 0.2, el flujo llega a ~5 km en todas direcciones", () => {
  // 3000 + 500 − 0.2·d = 3000 − 0.1·d  →  d = 5,000 m
  const c = conoEnergia(cono(), 400, 400, 500, 0.2, 30);
  assert.ok(Math.abs(c.maxKm - 5) < 0.15, `máximo ${c.maxKm}`);
  assert.ok(Math.abs(c.medioKm - 5) < 0.2, `promedio ${c.medioKm}`);
  assert.equal(c.anillo.length, 121);
  assert.deepEqual(c.anillo[0], c.anillo.at(-1));
  assert.equal(c.recortado, false);
  // Más energía (colapso mayor y H/L menor) llega más lejos.
  assert.ok(conoEnergia(cono(), 400, 400, 1500, 0.15, 60).maxKm > 10);
});

test("lava y lahares bajan por la pendiente hasta su largo y se repiten con la misma semilla", () => {
  const r = cono();
  const a = recorridos(r, 400, 400, { n: 30, largoKm: 6, dh: 3, salidaM: 400, semilla: 7 });
  assert.ok(a.lineas.length >= 25);
  assert.ok(a.alcanceKm > 4 && a.alcanceKm < 7.5, `alcance ${a.alcanceKm}`);
  const b = recorridos(r, 400, 400, { n: 30, largoKm: 6, dh: 3, salidaM: 400, semilla: 7 });
  assert.deepEqual(a.lineas[3], b.lineas[3]);
  // En la llanura plana (sin pendiente) los recorridos se detienen: no hay a dónde bajar.
  const largo = recorridos(r, 400, 400, { n: 10, largoKm: 40, dh: 0, salidaM: 400, semilla: 3 });
  assert.ok(largo.alcanceKm < 22, `alcance ${largo.alcanceKm}`);
  assert.ok(largo.atrapados > 0);
});

test("ceniza: elipse orientada con el viento; sin viento, círculo de la mitad del largo", () => {
  const anillo = elipse([0, 0], 90, 100, 20, 10);
  const xs = anillo.map((p) => p[0]);
  assert.ok(Math.max(...xs) > 0.85 && Math.max(...xs) < 0.95, "≈100 km al este (0.9° de longitud en el ecuador)");
  assert.ok(Math.min(...xs) < -0.07 && Math.min(...xs) > -0.11, "≈10 km contra el viento");
  const conViento = zonasCeniza([0, 0], ESCENARIOS[4], { desde: 270, kmh: 50 });
  assert.deepEqual(conViento.map((z) => z.id), ["ceniza1mm", "ceniza1cm", "ceniza10cm"]);
  const sinViento = zonasCeniza([0, 0], ESCENARIOS[4], null);
  const radio = Math.max(...sinViento[0].anillo.map((p) => Math.abs(p[1])));
  assert.ok(Math.abs(radio - 0.675) < 0.02, `radio ${radio}`);
  assert.deepEqual(zonasCeniza([0, 0], ESCENARIOS[0], null), []);
});

test("tipo de magma por tipo de volcán, IEV sugerido y tablas completas", () => {
  assert.equal(tipoMagma("Shield"), "fluido");
  assert.equal(tipoMagma("México · Pyroclastic cone · última erupción: 1952"), "fluido");
  assert.equal(tipoMagma("Stratovolcano"), "intermedio");
  assert.equal(tipoMagma("Caldera"), "viscoso");
  assert.equal(tipoMagma(""), "intermedio");
  assert.equal(tipoMagma("Papúa · Complex · roca: Basalt / Picro-Basalt"), "fluido", "la roca manda sobre la forma");
  assert.equal(tipoMagma("Stratovolcano · roca: Dacite"), "viscoso");
  assert.equal(tipoMagma("México · Estratovolcán · roca: andesita basáltica / dacita"), "fluido");
  assert.equal(tipoMagma("roca: riolita"), "viscoso");
  assert.equal(tipoMagma("Caldera · roca: Andesite / Basaltic Andesite"), "intermedio");
  assert.equal(veiSugerido("intermedio"), 3);
  assert.equal(ESCENARIOS.length, 7);
  for (const k of Object.keys(LAVA_KM)) assert.equal(LAVA_KM[k].length, 7);
  for (let i = 1; i < 7; i++) {
    assert.ok(ESCENARIOS[i].balistica >= ESCENARIOS[i - 1].balistica);
    if (ESCENARIOS[i - 1].ceniza) assert.ok(ESCENARIOS[i].ceniza[0] > ESCENARIOS[i - 1].ceniza[0]);
  }
});

test("bloque de la ficha: escapa el nombre y marca el IEV sugerido", () => {
  const h = htmlBloque({ lon: -98.62, lat: 19.02, nombre: "Popocatépetl <script>", tipo: "Stratovolcano", pais: "México", gvp: "341090" });
  assert.ok(h.includes("Popocatépetl &lt;script&gt;"));
  assert.match(h, /class="mini activo" data-vei="3"/);
  assert.match(h, /data-gvp="341090"/);
  assert.match(h, /Intermedio \(andesítico/);
});
