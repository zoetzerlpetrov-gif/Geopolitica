import { test } from "node:test";
import assert from "node:assert/strict";
import { reformasDelPlan, reformasDelSector, htmlReformas, mismoSector } from "../../js/agenda-avisos.js";

const S = [
  { estado: "en curso", titulo: "PROY-NOM eficiencia", sectores: ["energia_electrica"], leyes_ids: [], probabilidad: 0.75, url: "https://dof.gob.mx/x", etapa_nombre: "Proyecto en consulta pública", ventana: ["2026-12", "2027-03"], confirmacion: "oficial (DOF)" },
  { estado: "en curso", titulo: "Reforma LFT <script>", sectores: [], leyes_ids: ["MEX:lft"], probabilidad: 0.6, url: "javascript:alert(1)", etapa_nombre: "Dictamen" },
  { estado: "publicada", titulo: "Vieja", sectores: ["energia_electrica"], leyes_ids: ["MEX:lft"], probabilidad: 0.9 },
];

test("reformas que tocan un plan por ley o por sector, solo en curso y por probabilidad", () => {
  const r = reformasDelPlan({ leyes: ["MEX:lft"], sector: "Energía eléctrica" }, S);
  assert.deepEqual(r.map((x) => x.titulo), ["PROY-NOM eficiencia", "Reforma LFT <script>"]);
  assert.equal(reformasDelPlan({ leyes: [], sector: "" }, S).length, 0);
  assert.equal(reformasDelSector("energia_electrica", S).length, 1);
  assert.ok(mismoSector("energia_electrica", "energia_electrica") && !mismoSector("Minería", "energia_electrica"));
});

test("el HTML escapa el texto, bloquea enlaces que no son https y dice que es estimación", () => {
  const h = htmlReformas(S.slice(0, 2));
  assert.ok(!h.includes("<script>") && h.includes("&lt;script&gt;") && !h.includes("javascript:") && /estimación/.test(h));
  assert.match(htmlReformas([]), /Sin reformas/);
});
