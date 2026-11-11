import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { consultarDNS, consultarGravatar, interpretarDireccion, interpretarEncabezados, interpretarTelefono } from "../../js/contactos.js";
import { consultarIncidentesDominio, consultarInfraestructura, consultarRdap, proveedorCorreo } from "../../js/contactos-fuentes.js";
import { analizarArchivoCorreo, consultarFirmas, dominiosEnlaces } from "../../js/contactos-eml.js";
import { buscarLadaMx, consultarCorreoGithub, urlMencion } from "../../js/contactos-publicos.js";
import { consultarIpPublica, interpretarIpPublica } from "../../js/contactos-ip.js";
import { abrirCoordenadasMapa, conectarCoordenadasMapa, leerCoordenadas, puntoGeografico, textoCoordenadas } from "../../js/coordenadas-mapa.js";

test("el módulo de contactos aparece en Herramientas, fuera del acceso administrativo", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const lateral = html.slice(html.indexOf('id="g-herramientas"'), html.indexOf('id="b-herr-foto"'));
  assert.match(lateral, /<details class="bloque plegable" id="b-herr-contactos" data-grupo="herramientas">/);
  for (const id of ["contacto-correo", "contacto-cabeceras", "contacto-telefono", "contacto-ip"]) {
    assert.ok(lateral.includes(`<form id="${id}" class="contacto-form"`));
  }
  // El bloque de contactos es para clientes (otros bloques del grupo pueden ser solo de administración).
  const bloque = lateral.slice(lateral.indexOf('id="b-herr-contactos"'));
  assert.doesNotMatch(bloque.slice(0, bloque.indexOf("</details>")), /data-solo-admin|\/admin\/huella/);
  assert.match(html, /<script type="module" src="js\/contactos\.js"><\/script>/);
  assert.match(lateral, /<fieldset class="contacto-opciones">[\s\S]*?<legend>Fuentes opcionales<\/legend>/);
  assert.match(lateral, /<input name="github" type="checkbox">/);
});

test("GitHub exige evidencia exacta y separa perfiles de cambios de código públicos", async () => {
  const email = "equipo@example.org";
  const sha = "a".repeat(40);
  const fecha = new Date("2026-11-07T20:00:00Z");
  const datos = await consultarCorreoGithub(email, async (url, opciones) => {
    assert.equal(url.origin, "https://api.github.com");
    assert.equal(opciones.referrerPolicy, "no-referrer");
    if (url.pathname === "/search/users") {
      assert.equal(url.searchParams.get("q"), `${email} in:email`);
      return Response.json({ total_count: 2, items: [{ login: "equipo" }, { login: "otro" }] });
    }
    if (url.pathname === "/users/equipo") return Response.json({ email: "Equipo@example.org", name: "Nombre publicado", company: "Ejemplo", location: "México" });
    if (url.pathname === "/users/otro") return Response.json({ email: "diferente@example.org", name: "Excluir" });
    assert.equal(url.pathname, "/search/commits");
    assert.equal(url.searchParams.get("q"), `author-email:${email} author-date:2021-11-07..2026-11-07`);
    const commit = (email, date) => ({ sha, repository: { full_name: "equipo/proyecto" }, commit: { author: { email, date, name: "Autor" } } });
    return Response.json({ total_count: 20, items: [
      commit(email, "2021-11-06T20:00:00Z"),
      commit("otro@example.org", "2026-11-01T20:00:00Z"),
      commit(email, "2026-11-01T20:00:00Z"),
      commit(email, "2026-11-01T20:00:00Z"),
    ] });
  }, fecha);
  assert.deepEqual(datos.perfiles, { parcial: false, filas: [
    { enlace: "https://github.com/equipo", etiqueta: "@equipo", datos: "Perfil público · Nombre publicado · Ejemplo · México" },
  ] });
  assert.deepEqual(datos.cambios, { parcial: true, filas: [
    { enlace: `https://github.com/equipo/proyecto/commit/${sha}`, etiqueta: "equipo/proyecto · aaaaaaa", datos: "2026-11-01 · Autor declarado: Autor" },
  ] });
  assert.match((await consultarCorreoGithub(email, async () => new Response(null, { status: 403 }))).perfiles.estado, /no disponible/);
  assert.match((await consultarCorreoGithub("", () => assert.fail("No debe consultar sin correo"))).estado, /correo completo/);
});

test("la lada usa el prefijo mexicano más específico y conserva su fuente", () => {
  const tabla = new Map([["5255", "Ciudad de México"], ["52551", "Ejemplo más específico"], ["52999", "Conkal/Mérida"]]);
  assert.deepEqual(buscarLadaMx("+525512345678", tabla), { lada: "551", region: "Ejemplo más específico", fuente: "Google libphonenumber" });
  assert.deepEqual(buscarLadaMx("+525612345678", tabla), { lada: "56", region: "Ciudad de México", fuente: "IFT" });
  assert.deepEqual(buscarLadaMx("+529991234567", tabla), { lada: "999", region: "Conkal/Mérida", fuente: "Google libphonenumber" });
  assert.equal(buscarLadaMx("+442079460958", tabla), null);
});

test("los cuatro buscadores conservan las comillas, el prefijo telefónico y el sitio elegido", () => {
  const destinos = {
    Google: "https://www.google.com/search",
    Bing: "https://www.bing.com/search",
    DuckDuckGo: "https://duckduckgo.com/",
    "Brave Search": "https://search.brave.com/search",
  };
  for (const [motor, destino] of Object.entries(destinos)) {
    const url = new URL(urlMencion("+525512345678", motor, "linkedin.com"));
    assert.equal(url.origin + url.pathname, destino);
    assert.equal(url.searchParams.get("q"), '"+525512345678" site:linkedin.com');
    assert.equal(new URL(urlMencion("equipo@example.org", motor)).searchParams.get("q"), '"equipo@example.org"');
  }
  assert.equal(urlMencion("equipo@example.org", "https://example.org"), "");
  assert.equal(urlMencion("equipo@example.org", "Bing", "example.org"), "");
});

test("valida IP públicas y construye nombres de DNS inverso para IPv4 e IPv6", () => {
  assert.deepEqual(interpretarIpPublica("204.79.197.212"), { ip: "204.79.197.212", version: 4, reverso: "212.197.79.204.in-addr.arpa" });
  assert.deepEqual(interpretarIpPublica("[2606:4700:4700:0:0:0:0:1111]"), {
    ip: "2606:4700:4700::1111", version: 6,
    reverso: "1.1.1.1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.7.4.0.0.7.4.6.0.6.2.ip6.arpa",
  });
  for (const invalida of ["10.1.2.3", "127.0.0.1", "100.64.1.2", "192.0.2.8", "010.1.2.3", "256.1.2.3", "::1", "fc00::1", "fe80::1",
    "2001:db8::1", "3fff:100::1", "2606:::1111", "https://example.org"]) {
    assert.throws(() => interpretarIpPublica(invalida), /pública válida/);
  }
});

test("la IP separa geolocalización, BGP y PTR cuando un proveedor falla", async () => {
  const ip = "204.79.197.212";
  const resultado = await consultarIpPublica(ip, async (entrada, opciones) => {
    const url = new URL(entrada);
    assert.equal(opciones.referrerPolicy, "no-referrer");
    if (url.hostname === "ip-info.com") {
      assert.equal(url.searchParams.get("ip"), ip);
      return Response.json({ ip, city: "Teterboro", region: "New Jersey", latitude: 40.8618, longitude: -74.0587, is_anycast: true });
    }
    if (url.pathname.includes("prefix-overview")) return Response.json({ status: "ok", data: {
      announced: true, resource: "204.79.197.0/24", asns: [{ asn: 8068, holder: "Microsoft Corporation" }],
    } });
    if (url.pathname.includes("rir-geo")) return new Response(null, { status: 500 });
    assert.equal(url.hostname, "dns.google");
    assert.equal(url.searchParams.get("name"), "212.197.79.204.in-addr.arpa");
    return Response.json({ Status: 0, Answer: [{ type: 12, data: "a-0010.a-msedge.net." }] });
  });
  assert.equal(Object.fromEntries(resultado.ubicacion.filas)["Ciudad estimada"], "Teterboro");
  assert.deepEqual(resultado.ubicacion.coordenadas, { lat: 40.8618, lon: -74.0587 });
  assert.match(Object.fromEntries(resultado.ubicacion.filas).Anycast, /varias ubicaciones/);
  assert.equal(Object.fromEntries(resultado.registro.filas)["ASN y organización"], "AS8068 · Microsoft Corporation");
  assert.equal(Object.fromEntries(resultado.dns.filas)["Nombre inverso (PTR)"], "a-0010.a-msedge.net.");
  await assert.rejects(() => consultarIpPublica("192.168.0.1", () => assert.fail("No consultar una IP privada")), /pública válida/);
});

test("el buscador distingue coordenadas decimales de nombres y conserva el orden latitud, longitud", () => {
  const esperado = { lat: 40.8618, lon: -74.0587 };
  assert.deepEqual(leerCoordenadas(" 40.8618, -74.0587 "), esperado);
  assert.deepEqual(leerCoordenadas("40.8618 -74.0587"), esperado);
  assert.equal(textoCoordenadas(esperado), "40.8618, -74.0587");
  assert.equal(leerCoordenadas("91, 180"), null);
  assert.equal(leerCoordenadas("10, 181"), null);
  assert.equal(leerCoordenadas("Avenida 5 de Mayo"), undefined);
  assert.equal(puntoGeografico(null, null), null);
  assert.equal(puntoGeografico("40", "-74"), null);
  assert.deepEqual(puntoGeografico(0, 0), { lat: 0, lon: 0 });
});

test("la ficha de IP pasa el punto y la vista elegida al mapa principal", async () => {
  const punto = { lat: 40.8618, lon: -74.0587 };
  const vista = { base: "satelite", proyeccion: "globe", aproximada: true };
  await assert.rejects(() => abrirCoordenadasMapa(punto, vista), /se está preparando/);
  conectarCoordenadasMapa((p, v) => {
    assert.deepEqual(p, punto);
    assert.deepEqual(v, vista);
    return true;
  });
  assert.equal(await abrirCoordenadasMapa(punto, vista), true);
  conectarCoordenadasMapa(null);
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

test("Gravatar recibe la huella y muestra solamente cuentas públicas con enlaces HTTPS", async () => {
  const hash = createHash("sha256").update("equipo@example.org").digest("hex");
  assert.deepEqual(await consultarGravatar("Equipo@EXAMPLE.ORG", async (url, opciones) => {
    assert.equal(url, `https://api.gravatar.com/v3/profiles/${hash}`);
    assert.equal(opciones.referrerPolicy, "no-referrer");
    return Response.json({
      hash, display_name: "Equipo", location: "México",
      description: "Biografía", job_title: "Analista", company: "Ejemplo",
      verified_accounts: [
        { service_label: "GitHub", url: "https://github.com/example" },
        { service_label: "Oculta", url: "https://example.org", is_hidden: true },
        { service_label: "Inválida", url: "javascript:alert(1)" },
      ],
      profile_url: "https://gravatar.com.ejemplo.org/usuario",
      avatar_url: `https://0.gravatar.com/avatar/${hash}`,
    });
  }), {
    nombre: "Equipo", ubicacion: "México", biografia: "Biografía", cargo: "Analista", empresa: "Ejemplo",
    cuentas: [{ nombre: "GitHub", url: "https://github.com/example" }], enlace: "", avatar: `https://0.gravatar.com/avatar/${hash}`,
  });
  assert.match((await consultarGravatar("", () => assert.fail("No debe consultar la red"))).estado, /dirección de correo/);
  assert.match((await consultarGravatar("equipo@example.org", async () => new Response(null, { status: 404 }))).estado, /Sin perfil/);
  assert.match((await consultarGravatar("equipo@example.org", async () => new Response(null, { status: 429 }))).estado, /no disponible/);
});

test("distingue Null MX y reconoce proveedores por el hostname completo", async () => {
  const registros = await consultarDNS("example.org", async (url) => Response.json({
    Status: 0, Answer: url.searchParams.get("type") === "MX" ? [{ type: 15, data: "0 ." }] : [],
  }));
  assert.match(registros[0][1], /declara que no recibe correo/);
  assert.equal(proveedorCorreo(["10 ejemplo.mail.protection.outlook.com.", "20 outlook.com.evil.example."]), "Microsoft 365");
  assert.equal(proveedorCorreo(["10 evilmail.protection.outlook.com."]), "");
});

test("RDAP usa el registro IANA y reconoce el dominio padre de un subdominio", async () => {
  const urls = [];
  const rdap = await consultarRdap("mx.example.org", async (url) => {
    urls.push(String(url));
    if (urls.length === 1) return Response.json({ services: [[["org"], ["https://rdap.example/rdap/"]]] });
    if (urls.length === 2) return new Response(null, { status: 404 });
    return Response.json({ objectClassName: "domain", ldhName: "example.org", events: [{ eventAction: "registration", eventDate: "2001-01-02T00:00:00Z" }] });
  });
  assert.deepEqual(urls, ["https://data.iana.org/rdap/dns.json", "https://rdap.example/rdap/domain/mx.example.org", "https://rdap.example/rdap/domain/example.org"]);
  assert.equal(Object.fromEntries(rdap.filas)["Dominio registrado"], "example.org");
  assert.equal(Object.fromEntries(rdap.filas)["Alta en el registro"], "2001-01-02T00:00:00Z");
});

test("infraestructura DNS y catálogo de incidentes solo consultan nombres de dominio", async () => {
  const registros = await consultarInfraestructura("example.org", async (url) => {
    assert.ok(url.searchParams.get("name").endsWith("example.org"));
    assert.equal(url.searchParams.get("edns_client_subnet"), "0.0.0.0/0");
    const mta = url.searchParams.get("name").startsWith("_mta-sts");
    return Response.json({ Status: 0, Answer: mta ? [{ type: 16, data: '"v=STSv1; id=1"' }] : [] });
  });
  assert.equal(Object.fromEntries(registros)["MTA-STS · anuncio DNS"], "v=STSv1; id=1");
  const incidentes = await consultarIncidentesDominio("example.org", async (url) => {
    assert.equal(url.searchParams.get("Domain"), "example.org");
    return Response.json([
      { Domain: "example.org", Name: "Ejemplo", BreachDate: "2025-01-01", IsVerified: true, DataClasses: ["Email addresses"] },
      { Domain: "otro.example.org", Name: "Otro" },
    ]);
  });
  assert.deepEqual(incidentes, { cantidad: 1, filas: [["Ejemplo", "2025-01-01 · Verificado por HIBP · Email addresses"]] });
});

test("analiza un .eml multipart y calcula la huella del adjunto decodificado", async () => {
  const eml = [
    "From: Equipo <equipo@example.org>", "Subject: Aviso", "MIME-Version: 1.0", 'Content-Type: multipart/mixed; boundary="test"', "",
    "--test", "Content-Type: text/plain", "", "Visita https://example.org/path?token=local", "--test", 'Content-Type: application/octet-stream; name="a.bin"',
    'Content-Disposition: attachment; filename="a.bin"', "Content-Transfer-Encoding: base64", "", "AAH/", "--test--", "",
  ].join("\r\n");
  const analisis = await analizarArchivoCorreo(new File([eml], "mensaje.eml"));
  const hash = createHash("sha256").update(Buffer.from([0, 1, 255])).digest("hex");
  assert.deepEqual(analisis.adjuntos, [["a.bin", `application/octet-stream · 3 bytes · SHA-256 ${hash}`]]);
  assert.deepEqual(dominiosEnlaces(analisis.correo.text, ["javascript:alert(1)", "https://example.net/private", "https://example.org/otro"]), ["example.net", "example.org"]);
  await assert.rejects(() => analizarArchivoCorreo(new File(["From: a@example.org"], "truncado.eml")), /mensaje .eml completo/);
});

test("DKIM comprueba el mensaje original y detecta cambios de cuerpo o cabeceras firmadas", async () => {
  const cuerpo = "Hola \tmundo \t\r\n\r\n";
  const bh = createHash("sha256").update("Hola mundo\r\n").digest("base64");
  for (const tipo of ["rsa", "ed25519"]) {
    const claves = tipo === "rsa" ? generateKeyPairSync("rsa", { modulusLength: 2048 }) : generateKeyPairSync("ed25519");
    const dkim = `v=1; a=${tipo}-sha256; c=relaxed/relaxed; d=example.org; s=test; h=from:subject; bh=${bh}; b=`;
    const canon = Buffer.from(`from:Equipo <equipo@example.org>\r\nsubject:Hola mundo\r\ndkim-signature:${dkim}`);
    const firma = tipo === "rsa" ? sign("sha256", canon, claves.privateKey) : sign(null, createHash("sha256").update(canon).digest(), claves.privateKey);
    const mensaje = `DKIM-Signature: ${dkim}${firma.toString("base64")}\r\nFrom: Equipo <equipo@example.org>\r\nSubject: Hola\r\n\tmundo\r\n\r\n${cuerpo}`;
    const publica = tipo === "rsa" ? claves.publicKey.export({ format: "der", type: "pkcs1" }).toString("base64") : claves.publicKey.export({ format: "jwk" }).x;
    const resolver = async (nombre) => {
      assert.equal(nombre, "test._domainkey.example.org");
      return [`v=DKIM1; k=${tipo}; p=${Buffer.from(publica, "base64").toString("base64")}`];
    };
    assert.match((await consultarFirmas(mensaje, true, resolver))[0][1], /Firma criptográfica válida/);
    assert.match((await consultarFirmas(mensaje.replace("Hola \tmundo", "Otro cuerpo"), true, resolver))[0][1], /hash del cuerpo no coincide/);
    assert.match((await consultarFirmas(mensaje.replace("Equipo <", "Otro <"), true, resolver))[0][1], /firma criptográfica no coincide/);
    assert.match((await consultarFirmas(mensaje, false, resolver))[0][1], /Usa el .eml completo/);
  }
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
