// Herramientas para creadores (js/creadores-logica.js).
import test from "node:test";
import assert from "node:assert/strict";
import * as L from "../../js/creadores-logica.js";

test("contar: en X cada enlace vale 23 y un emoji 2", () => {
  assert.equal(L.contar("hola https://example.com/un/enlace/muy/largo", "x"), 5 + 23);
  assert.equal(L.contar("🚀", "x"), 2);
  assert.equal(L.contar("🚀", "instagram"), 1);
});

test("adaptar: respeta el límite de cada red sin cortar palabras y con las etiquetas permitidas", () => {
  const d = { titulo: "Tres errores al ahorrar", cuerpo: "palabra ".repeat(200).trim(), cta: "¿Cuál cometes tú?", enlace: "https://ejemplo.com/a", etiquetas: "#finanzas ahorro, México ahorro" };
  for (const red of Object.keys(L.REDES)) {
    const t = L.adaptar(d, red);
    assert.ok(L.contar(t, red) <= L.REDES[red].limite, `${red}: ${L.contar(t, red)}`);
  }
  const x = L.adaptar(d, "x");
  assert.match(x, /^Tres errores al ahorrar/);
  assert.equal(x.split("\n\n").at(-2), "https://ejemplo.com/a", "el enlace va en su propio bloque, antes de las etiquetas");
  assert.match(x, /#finanzas #ahorro$/);
  assert.ok(!/palabr…|pal…/.test(x));
  assert.equal(L.adaptar(d, "youtube_titulo"), "Tres errores al ahorrar");
  assert.deepEqual(L.etiquetas("#a, a b ¡c!"), ["#a", "#b", "#c"]);
});

test("contraste y temas del día", () => {
  assert.equal(L.contraste("#000000", "#ffffff"), 21);
  assert.ok(L.contraste("#0a0f17", "#f2f4f8") > 15);
  const n = { notas: [{ t: "A", m: "M", f: "2026-11-24", u: "https://a", s: ["salud"] }, { t: "B", m: "M", f: "2026-11-25", u: "https://b", s: ["salud", "cultura"] }] };
  assert.deepEqual(L.temasDelDia(n, "salud").map((x) => x.titulo), ["B", "A"]);
  assert.deepEqual(L.temasDelDia(n, "cultura").map((x) => x.titulo), ["B"]);
});
