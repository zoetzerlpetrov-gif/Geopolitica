import { test } from "node:test";
import assert from "node:assert/strict";
import * as A from "../../js/analitica-logica.js";

const dias = Array.from({ length: 28 }, (_, i) => ({ dia: `2026-10-${String(i + 1).padStart(2, "0")}`, total: i < 21 ? 100 + (i % 3) : 160,
  areas: { seguridad: i < 21 ? 20 : 50 }, sev: { 4: 3 }, paises: { MEX: i < 21 ? 2 : 8, USA: 10 } }));

test("series y anomalía", () => {
  assert.equal(A.serie(dias, "area:seguridad")[25].n, 50);
  assert.equal(A.serie(dias, "pais:MEX")[0].n, 2);
  assert.equal(A.serie(dias, "sev:4")[0].n, 3);
  const z = A.anomalia(A.serie(dias, "total").map((p) => p.n));
  assert.ok(z.z > 2 && z.cambio_pct > 50);
  assert.equal(A.anomalia([1, 2, 3]), null);
});

test("países en alza, polilínea, perfil y frescura", () => {
  const alza = A.paisesAlza(dias);
  assert.equal(alza[0].pais, "MEX"); assert.equal(alza[0].razon, 4);
  assert.equal(A.polilinea([0, 10], 100, 50, 0), "0,50 100,0");
  const p = A.perfilPais([{ pais_iso3: "MEX", severidad: 5, area_principal: "seguridad" }, { pais_iso3: "USA", severidad: 1 }], "MEX");
  assert.deepEqual(p, { total: 1, graves: 1, areas: { seguridad: 1 } });
  const ahora = new Date("2026-10-22T12:00:00Z");
  const f = A.frescura([{ nombre: "a", actualizado: "2026-10-22T11:00:00Z", cada_h: 1 }, { nombre: "b", actualizado: "2026-10-20T00:00:00Z", cada_h: 6 }, { nombre: "c" }], ahora);
  assert.deepEqual(f.map((x) => x.estado), ["al día", "detenida", "sin dato"]);
});

test("CSV, Banco Mundial y prompt", () => {
  assert.match(A.eventosCSV([{ titulo: 'Dice "hola"', pais_iso3: "MEX" }]), /"Dice ""hola"""/);
  assert.deepEqual(A.leerBM([{}, [{ value: 2.5, date: "2024" }]]), { valor: 2.5, anio: "2024" });
  assert.equal(A.leerBM([{}, []]), null);
  assert.match(A.promptSerie("Seguridad", [{ dia: "d", n: 3 }], { media_base: 1, media_reciente: 3, z: 2 }), /z = 2/);
});

test("esquema, gráfico sugerido, mapa y nombres de país", () => {
  const svg = A.diagramaER();
  for (const t of ["eventos", "conteos", "paises", "areas"]) assert.match(svg, new RegExp(`>${t}<`));
  assert.equal((svg.match(/class="er-rel/g) || []).length, A.RELACIONES.length);
  const filas = [{ pais: "MEX", n: 5 }, { pais: "USA", n: 3n }];
  const s = A.sugerirGrafico(["pais", "n"], filas);
  assert.deepEqual(s, { tipo: "barras", x: "pais", ys: ["n"] });
  assert.match(A.graficoSVG(s, filas, (v) => (v === "MEX" ? "México" : v)), /México/);
  const tiempo = [{ dia: "2026-10-01", n: 1 }, { dia: "2026-10-02", n: 4 }, { dia: "2026-10-03", n: 2 }];
  assert.equal(A.sugerirGrafico(["dia", "n"], tiempo).tipo, "linea");
  assert.match(A.graficoSVG(A.sugerirGrafico(["dia", "n"], tiempo), tiempo), /<polyline/);
  assert.equal(A.sugerirGrafico(["titulo"], [{ titulo: "x" }]), null);
  const paises = { MEX: { es: "México", en: "Mexico", lat: 23, lon: -102 }, USA: { es: "Estados Unidos", en: "United States", lat: 39, lon: -98 }, CAN: { es: "Canadá", en: "Canada", lat: 60, lon: -100 } };
  assert.deepEqual(A.puntosMapa(["pais", "n"], filas, paises).map((p) => p.etiqueta), ["México", "Estados Unidos"]);
  assert.equal(A.puntosMapa(["titulo", "lat", "lon"], [{ titulo: "a", lat: 1, lon: 2 }], paises)[0].lon, 2);
  assert.equal(A.puntosMapa(["fuente", "n"], [{ fuente: "Reuters", n: 1 }], paises), null);
  assert.equal(A.nombrePais(paises, "MEX"), "México (MEX)");
  assert.deepEqual(A.resolverPaises("Mexico, usa ; Canadá, XYZ, mex", paises), ["MEX", "USA", "CAN", "XYZ"]);
});
