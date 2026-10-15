// Verificador de mensajes sospechosos (todo local).  Ejecutar:  node --test "tests/js/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { analizarMensaje, revisarEnlaces, htmlResultado } from "../../js/verificador.js";

test("phishing bancario con enlace falso: riesgo alto", () => {
  const r = analizarMensaje("URGENTE: tu cuenta BBVA será bloqueada hoy. Confirma tu NIP en http://bbva-seguridad-mx.xyz/login");
  assert.equal(r.nivel, "alto");
  assert.ok(r.senales.some((s) => s.id === "datos") && r.senales.some((s) => s.id === "urgencia"));
  const e = r.enlaces[0];
  assert.equal(e.host, "bbva-seguridad-mx.xyz");
  assert.ok(e.senales.some((s) => /no es su dominio oficial/.test(s)) && e.senales.some((s) => /\.xyz/.test(s)) && e.senales.some((s) => /http/.test(s)));
});

test("secuestro virtual y sextorsión: alto aunque no traigan enlaces", () => {
  assert.equal(analizarMensaje("Tenemos a tu hija, no cuelgues y no avises a la policía. Deposita en OXXO").nivel, "alto");
  assert.equal(analizarMensaje("Tengo tus fotos íntimas, si no pagas las mando a tus contactos").nivel, "alto");
});

test("mensaje normal: bajo; dominio oficial no se marca; acortadores sí", () => {
  const r = analizarMensaje("Hola, nos vemos mañana a las 5 en el café. Revisa https://www.bbva.mx/personas.html");
  assert.equal(r.nivel, "bajo");
  assert.deepEqual(r.enlaces[0].senales, []);
  assert.match(revisarEnlaces("mira bit.ly/abc123")[0].senales[0], /acortado/);
  assert.equal(revisarEnlaces("cuesta 1.5 pesos").length, 0);
  assert.equal(analizarMensaje("   ").nivel, "vacio");
});

test("el resultado escapa el texto y recuerda que no se guarda nada", () => {
  const h = htmlResultado(analizarMensaje("Ganaste un premio <script>x</script> en premio-<b>.top"));
  assert.doesNotMatch(h, /<script>/);
  assert.match(h, /no se envió ni se guardó/);
});

test("conjunto de prueba: detecta todos los fraudes de ejemplo sin alarmar mensajes normales", async () => {
  const { readFileSync } = await import("node:fs");
  const d = JSON.parse(readFileSync(new URL("../datos/mensajes_verificador.json", import.meta.url)));
  const no = d.fraude.filter((m) => analizarMensaje(m).nivel === "bajo");
  const fp = d.normal.filter((m) => analizarMensaje(m).nivel !== "bajo");
  assert.deepEqual(no, [], "fraudes no detectados");
  assert.deepEqual(fp, [], "falsas alarmas");
});

test("dominios que imitan marcas: cero por o, uno por l, rn por m y una letra de diferencia", async () => {
  const { marcaImitada } = await import("../../js/verificador.js");
  assert.equal(marcaImitada("icl0ud.com"), "icloud");
  assert.equal(marcaImitada("paypa1.com"), "paypal");
  assert.equal(marcaImitada("rnercadolibre.com.mx"), "mercadolibre");
  assert.equal(marcaImitada("amazom.com.mx"), "amazon");
  assert.equal(marcaImitada("www.icloud.com"), null);
  assert.equal(marcaImitada("netflix.com"), null);
  assert.equal(marcaImitada("ejemplo.com"), null);
  assert.equal(analizarMensaje("Hemos bloqueado tu cuenta de ocloud, inicia sesión para desbloquear icl0ud.com").nivel, "alto");
});
