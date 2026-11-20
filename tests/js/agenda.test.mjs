import { test } from "node:test";
import assert from "node:assert/strict";
import { esc, filtrar, meses, porMes } from "../../js/agenda.js";

test("la agenda filtra por tema, etapa, estado y probabilidad, y escapa el texto", () => {
  const s = [{ titulo: "A", etapa: "dictamen", temas: ["trabajo"], estado: "en curso", probabilidad: 0.6 },
    { titulo: "B", etapa: "desmentida", temas: ["familia_civil"], estado: "desmentida", probabilidad: 0.02 }];
  assert.equal(filtrar(s, { tema: "trabajo", estado: "en curso", prob: 0.5 }).length, 1);
  assert.equal(filtrar(s, { estado: "desmentida" })[0].titulo, "B");
  assert.equal(esc("<b>"), "&lt;b&gt;");
});

test("los próximos 12 meses cruzan el año y reparten las señales por su ventana", () => {
  assert.deepEqual(meses("2026-11", 3), ["2026-11", "2026-12", "2027-01"]);
  const r = porMes([{ estado: "en curso", ventana: ["2026-12", "2027-01"], probabilidad: 0.8, titulo: "x" }], "2026-11", 3);
  assert.deepEqual(r.map(([m, l]) => [m, l.length]), [["2026-11", 0], ["2026-12", 1], ["2027-01", 1]]);
});
