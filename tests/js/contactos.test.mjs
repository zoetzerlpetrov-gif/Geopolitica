import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { consultarDNS, consultarGravatar, interpretarDireccion, interpretarEncabezados, interpretarTelefono } from "../../js/contactos.js";

test("el módulo de contactos aparece en Herramientas, fuera del acceso administrativo", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const lateral = html.slice(html.indexOf('id="g-herramientas"'), html.indexOf('id="b-herr-foto"'));
  assert.match(lateral, /<details class="bloque plegable" id="b-herr-contactos" data-grupo="herramientas">/);
  for (const id of ["contacto-correo", "contacto-cabeceras", "contacto-telefono"]) {
    assert.ok(lateral.includes(`<form id="${id}"`));
  }
  assert.doesNotMatch(lateral, /data-solo-admin|\/admin\/huella/);
  assert.match(html, /<script type="module" src="js\/contactos\.js"><\/script>/);
});

test("separa el correo del dominio DNS y admite dominios internacionalizados", () => {
  assert.deepEqual(interpretarDireccion("  Equipo+aviso@Ejemplo.ORG "), {
    correo: "Equipo+aviso@Ejemplo.ORG", dominio: "ejemplo.org",
  });
  assert.deepEqual(interpretarDireccion("México.example."), { correo: "", dominio: "xn--mxico-bsa.example" });
  for (const valor of ["@example.org", "a..b@example.org", "a@b@example.org", "https://example.org", "127.0.0.1", ""]) {
    assert.throws(() => interpretarDireccion(valor));
  }
});

test("DNS solo usa el dominio y separa un error del servicio de un registro ausente", async () => {
  const { dominio } = interpretarDireccion("privado@example.org");
  const respuestas = await consultarDNS(dominio, async (url, opciones) => {
    assert.equal(url.origin, "https://dns.google");
    assert.ok(!url.href.includes("privado"));
    assert.equal(opciones.referrerPolicy, "no-referrer");
    if (url.searchParams.get("name") === "_dmarc.example.org") return Response.json({ Status: 3 });
    if (url.searchParams.get("type") === "MX") return Response.json({ Status: 2 });
    return Response.json({ Status: 0, Answer: [
      { type: 5, data: "alias.example.org." },
      { type: 16, data: '"v=spf1 " "-all"' },
      { type: 16, data: '"otro TXT"' },
    ] });
  });
  assert.deepEqual(respuestas, [
    ["MX", "Consulta no disponible. Inténtalo de nuevo."],
    ["SPF", "v=spf1 -all"],
    ["DMARC", "Sin registro. DNS no reconoce este nombre."],
  ]);
});

test("Gravatar recibe la huella del correo y los enlaces quedan limitados a Gravatar", async () => {
  const hash = createHash("sha256").update("equipo@example.org").digest("hex");
  assert.deepEqual(await consultarGravatar("Equipo@EXAMPLE.ORG", async (url, opciones) => {
    assert.equal(url, `https://api.gravatar.com/v3/profiles/${hash}`);
    assert.equal(opciones.referrerPolicy, "no-referrer");
    return Response.json({
      hash, display_name: "Equipo", location: "México",
      profile_url: "https://gravatar.com.ejemplo.org/usuario",
      avatar_url: `https://0.gravatar.com/avatar/${hash}`,
    });
  }), { nombre: "Equipo", ubicacion: "México", enlace: "", avatar: `https://0.gravatar.com/avatar/${hash}` });
  assert.match((await consultarGravatar("", () => assert.fail("No debe consultar la red"))).estado, /dirección de correo/);
  assert.match((await consultarGravatar("equipo@example.org", async () => new Response(null, { status: 404 }))).estado, /Sin perfil/);
  assert.match((await consultarGravatar("equipo@example.org", async () => new Response(null, { status: 429 }))).estado, /no disponible/);
});

test("se leen encabezados plegados y se ignoran encabezados falsos dentro del cuerpo", () => {
  const entrada = [
    "From: Equipo <equipo@example.org>", "Received: from mx.example.org by correo.example.net [192.0.2.1]; Fri, 6 Nov 2026 12:00:00 +0000",
    "Authentication-Results: correo.example.net; spf=pass;", "\tdkim=pass; dmarc=pass", "",
    "Reply-To: alguien@example.net", "Received: from falso.example.net",
  ].join("\r\n");
  const resultado = interpretarEncabezados(entrada);
  assert.equal(resultado.de, "Equipo <equipo@example.org>");
  assert.equal(resultado.dkim, "pass");
  assert.equal(resultado.replyTo, "");
  assert.equal(resultado.recibidos.length, 1);
  assert.equal(resultado.recibidos[0].ip, "192.0.2.1");
  assert.throws(() => interpretarEncabezados("Texto sin encabezados"));
});

test("el teléfono usa México para números nacionales y distingue numeración sin asignación", () => {
  const resultado = Object.fromEntries(interpretarTelefono(" 55 1234 5678 ", (entrada, opciones) => {
    assert.equal(entrada, "55 1234 5678");
    assert.deepEqual(opciones, { defaultCountry: "MX", extract: false });
    return {
      number: "+525512345678", country: "MX", countryCallingCode: "52", formatInternational: () => "+52 55 1234 5678",
      isPossible: () => true, isValid: () => false, getType: () => assert.fail("El tipo requiere numeración válida"),
    };
  }));
  assert.equal(resultado["País o territorio de numeración"], "México");
  assert.equal(resultado["Tipo de línea según numeración"], "Sin clasificar");
  assert.throws(() => interpretarTelefono("123", () => undefined));
});
