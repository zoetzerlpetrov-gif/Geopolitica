import { test } from "node:test";
import assert from "node:assert/strict";
import { notasDe, cambio, valorTxt, htmlNota, htmlIndicadores } from "../../js/noticiero.js";

const D = { notas: [
  { t: "Bitcoin sube", u: "https://a/1", m: "coindesk.com", f: "2026-10-21T10:00:00Z", s: ["cripto"], via: "rss" },
  { t: "Guerra en el este", u: "https://a/2", m: "bbc.com", f: "2026-10-21T11:00:00Z", s: ["geopolitica"], via: "gdelt" },
  { t: "XRP y la ISO 20022", u: "https://a/3", m: "x.com", f: "2026-10-21T09:00:00Z", s: ["cripto", "cbdc"], via: "gdelt" },
] };

test("notasDe filtra por sección y texto, de la más reciente a la más antigua", () => {
  assert.deepEqual(notasDe(D, "").map((n) => n.u), ["https://a/2", "https://a/1", "https://a/3"]);
  assert.deepEqual(notasDe(D, "cripto").map((n) => n.u), ["https://a/1", "https://a/3"]);
  assert.deepEqual(notasDe(D, "", "BBC").map((n) => n.u), ["https://a/2"]);
});

test("cambio: puntos porcentuales para tasas y % para precios", () => {
  assert.deepEqual(cambio({ valor: 6.5, previo: 6.75, unidad: "%" }), { txt: "▼ 0.25 pp", clase: "baja" });
  assert.deepEqual(cambio({ valor: 20, previo: 19, unidad: "MXN por USD" }), { txt: "▲ 5.26 %", clase: "sube" });
  assert.equal(cambio({ valor: 1 }), null);
  assert.equal(valorTxt({ valor: 18.4234, decimales: 4 }), "18.4234");
});

test("htmlNota escapa y no enlaza esquemas peligrosos", () => {
  const h = htmlNota({ t: "<b>x</b>", u: "javascript:alert(1)", m: "m", f: "2026-10-21T10:00:00Z", s: [], via: "gdelt", img: "http://inseguro/x.jpg" }, Date.parse("2026-10-21T11:00:00Z"));
  assert.ok(h.includes("&lt;b&gt;") && h.includes('href="#"') && !h.includes("<img"));
});

test("htmlIndicadores muestra fuente y cambio", () => {
  const h = htmlIndicadores({ grupos: [{ titulo: "México", fuente: "Banxico", enlace: "https://www.banxico.org.mx", datos: [{ nombre: "Tasa objetivo", valor: 6.5, previo: 6.75, unidad: "%", fecha: "2026-10-20" }] }] });
  assert.ok(h.includes("Banxico") && h.includes("6.50 %") && h.includes("0.25 pp"));
});
