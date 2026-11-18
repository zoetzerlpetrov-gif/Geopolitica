import { test } from "node:test";
import assert from "node:assert/strict";
import { analizarEnlace, conEdad, dominioRegistrable, edadDominio, htmlEnlace } from "../../js/verif_enlace.js";

test("dominio registrable con sufijos de dos niveles", () => {
  assert.equal(dominioRegistrable("www.bbva.mx"), "bbva.mx");
  assert.equal(dominioRegistrable("login.santander.com.mx"), "santander.com.mx");
  assert.equal(dominioRegistrable("a.b.c.ejemplo.xyz"), "ejemplo.xyz");
});

test("enlaces de fraude típicos: riesgo alto", () => {
  const casos = ["https://bbva-mx-seguridad.xyz/login", "http://paypa1.com/verify", "https://xn--pple-43d.com", "http://192.168.10.5/banca", "javascript:alert(1)",
    "https://descargas.ejemplo.com/factura.pdf.exe"];
  for (const u of casos) assert.equal(conEdad(analizarEnlace(u), null).nivel, "alto", u);
});

test("señales moderadas y sitios oficiales", () => {
  assert.equal(conEdad(analizarEnlace("bit.ly/abc"), null).nivel, "medio");
  assert.equal(conEdad(analizarEnlace("https://cuenta-x.netlify.app"), null).nivel, "medio");
  const sat = conEdad(analizarEnlace("https://www.sat.gob.mx/portal"), null);
  assert.equal(sat.nivel, "bajo");
  assert.ok(sat.buenas.some((b) => b.includes("gobierno")));
  assert.ok(analizarEnlace("https://x.com/r?url=https://malo.xyz").senales.some((s) => /redirigirte/.test(s.t)));
});

test("edad del dominio con RDAP simulado", async () => {
  const hoy = new Date("2026-11-18T00:00:00Z");
  const nuevo = await edadDominio("nuevo.com", async () => ({ ok: true, status: 200, json: async () => ({ events: [{ eventAction: "registration", eventDate: "2026-11-10T00:00:00Z" }] }) }), hoy);
  assert.deepEqual(nuevo, { dias: 8, creado: "2026-11-10" });
  assert.equal(conEdad(analizarEnlace("https://nuevo.com"), nuevo).nivel, "alto");
  assert.deepEqual(await edadDominio("nada.com", async () => ({ ok: false, status: 404 })), { noRegistrado: true });
  assert.deepEqual(await edadDominio("banco.com.mx", async () => { throw new Error("no debe consultarse"); }), { noDisponible: true });
  const viejo = conEdad(analizarEnlace("https://example.com"), { dias: 11000, creado: "1995-08-14" });
  assert.equal(viejo.nivel, "bajo");
  assert.ok(htmlEnlace(viejo).includes("existe desde 1995-08-14") && htmlEnlace(viejo).includes('href="https://www.virustotal.com/gui/search/https%3A%2F%2Fexample.com%2F"'));
  assert.ok(htmlEnlace(analizarEnlace("")).includes("Pega primero"));
});
