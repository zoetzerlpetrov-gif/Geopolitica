// Calor, frío, UV y anticiclones: colores, fichas y severidad en la lista de amenazas.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as CX from "../../js/clima_extremos.js";
import { normalizar } from "../../js/amenazas.js";

test("índice de calor y UV en sus categorías", () => {
  assert.deepEqual([20, 30, 35, 45, 55].map(CX.catIndiceCalor), [0, 1, 2, 3, 4]);
  assert.equal(CX.colorUV(11.2), "#7B2D8E");
  assert.equal(CX.colorUV(2), "#3DA35D");
});

test("fichas de calor, frío y anticiclones", () => {
  const p = { onda_calor: true, calor_nivel: 3, calor_tramos: [{ inicio: "2026-06-02", fin: "2026-06-04", dias: 3 }], indice_calor_max_c: 41, indice_calor_cat: "Peligro",
    climatologia: true, ola_frio: false, heladas: ["2026-01-03"], serie: [["2026-06-02", 36, 20, 41, 30, 5]] };
  assert.match(CX.filasCalor(p)[0][1], /3 días/);
  assert.match(CX.filasFrio(p)[1][1], /ene/);
  assert.deepEqual(CX.serie(p, "hi"), [["2026-06-02", 41]]);
  assert.match(CX.filasAnticiclon({ kind: "bloqueo", hemisferio: "norte", lon_ini: -10, lon_fin: 9, dias: 4, de_horizontes: 6 })[2][1], /-10° a 9°/);
  assert.match(CX.filasAnticiclon({ kind: "alta", subtropical: true, altura500_dam: 592, anomalia_dam: 3, horizontes: 5, de_horizontes: 6 })[0][1], /subtropical/);
  assert.equal(CX.filasAnticiclon({ kind: "domo", domo_calor: true, altura500_dam: 592, anomalia_dam: 14, t850_c: 24, horizontes: 5, de_horizontes: 6 })[0][1].startsWith("Domo"), true);
});
