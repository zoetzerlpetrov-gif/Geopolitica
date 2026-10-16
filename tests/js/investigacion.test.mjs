import { test } from "node:test";
import assert from "node:assert/strict";
import { buscar69b, html69b, buscarFbi, htmlFbi, sha256Hex, htmlActa, csvActa, agregarEntidad, agregarRelacion, quitarEntidad, grados, svgVinculos,
  LISTAS_OFICIALES, FUENTES_INVESTIGACION } from "../../js/investigacion.js";
import { relevantes, htmlRespuesta, promptUsuario, preguntar, mensajeError, llaveValida, MODELOS } from "../../js/chat_ia.js";

const SAT = { corte_sat: "31 de diciembre de 2025", filas: [
  ["AAA010101AAA", "EMPRESA FANTASMA, S.A. DE C.V.", "Definitivo", "01/02/2020", "", "01/08/2020", ""],
  ["BBB0202022B1", "Servicios Ñandú SC", "Presunto", "03/03/2025", "", "", ""],
  ["CCC030303CC3", "Comercializadora Ejemplo", "Desvirtuado", "01/01/2021", "05/05/2021", "", ""]] };

test("69-B: busca por RFC parcial y por palabras sin acentos ni puntuación", () => {
  assert.equal(buscar69b(SAT, "aaa0101")[0].rfc, "AAA010101AAA");
  assert.equal(buscar69b(SAT, "empresa fantasma sa")[0].situacion, "Definitivo");
  assert.equal(buscar69b(SAT, "nandu")[0].rfc, "BBB0202022B1");
  assert.deepEqual(buscar69b(SAT, "ab"), []);
  const h = html69b(buscar69b(SAT, "comercializadora"), SAT);
  assert.match(h, /Desvirtuado/);
  assert.match(h, /desvirtuado 05\/05\/2021/);
  assert.match(html69b([], SAT), /No aparecer no garantiza nada/);
});

test("FBI: busca por nombre o tema y escapa el HTML", () => {
  const datos = { fichas: [{ nombre: "JOHN <b>DOE</b>", temas: ["Cyber's Most Wanted"], categoria: "Buscado", url: "https://www.fbi.gov/wanted/x" }] };
  const r = buscarFbi(datos, "cyber");
  assert.equal(r.length, 1);
  assert.ok(!htmlFbi(r).includes("<b>DOE"));
  assert.match(htmlFbi(r), /no actúes por tu cuenta/);
});

test("enlaces oficiales con https", () => {
  for (const [, u] of [...LISTAS_OFICIALES, ...FUENTES_INVESTIGACION]) assert.match(u, /^https:\/\//);
});

test("cadena de custodia: SHA-256 conocido, acta y CSV", async () => {
  assert.equal(await sha256Hex(new TextEncoder().encode("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  const reg = [{ nombre: 'foto "1".jpg', bytes: 1234, tipo: "image/jpeg", modificado: "2026-10-01T00:00:00.000Z", sha256: "ab".repeat(32), calculado_utc: "2026-10-16T00:00:00.000Z" }];
  const acta = htmlActa({ caso: "CI-<1>", responsable: "Perito" }, reg);
  assert.match(acta, /CI-&lt;1&gt;/);
  assert.match(acta, /ISO\/IEC 27037/);
  assert.equal(csvActa(reg).split("\n")[1].split(",")[0], '"foto ""1"".jpg"');
});

test("cuaderno de vínculos: entidades únicas, relaciones válidas, grados y gráfico", () => {
  let c = { entidades: [], relaciones: [] };
  c = agregarEntidad(c, "Empresa X", "empresa");
  c = agregarEntidad(c, "empresa x", "empresa");
  c = agregarEntidad(c, "Juan", "persona");
  c = agregarEntidad(c, "Cuenta 123", "cuenta");
  assert.equal(c.entidades.length, 3);
  const [e, j, k] = c.entidades.map((x) => x.id);
  c = agregarRelacion(c, j, e, "socio de", "Acta constitutiva");
  c = agregarRelacion(c, e, k, "titular de");
  c = agregarRelacion(c, e, e, "consigo");
  c = agregarRelacion(c, e, "nada", "x");
  assert.equal(c.relaciones.length, 2);
  assert.deepEqual(grados(c), { [e]: 2, [j]: 1, [k]: 1 });
  assert.equal((svgVinculos(c).match(/<circle/g) || []).length, 3);
  c = quitarEntidad(c, e);
  assert.equal(c.relaciones.length, 0);
  assert.match(svgVinculos({ entidades: [], relaciones: [] }), /Agrega entidades/);
});

const EVENTOS = [
  { titulo: "Bloqueo en el estrecho de Ormuz", resumen: "Tanqueros detenidos", pais_iso3: "IRN", severidad: 4, fecha_utc: "2026-10-15T10:00:00Z", url: "https://a.example/1", fuente: "A" },
  { titulo: "Sismo en Oaxaca", resumen: "Magnitud 5", pais_iso3: "MEX", severidad: 3, fecha_utc: "2026-10-16T10:00:00Z", url: "https://b.example/2", fuente: "B" },
  { titulo: "Elecciones en Chile", resumen: "", pais_iso3: "CHL", severidad: 1, fecha_utc: "2026-10-14T10:00:00Z", url: "https://c.example/3", fuente: "C" }];

test("chat: elige noticias relacionadas o, si no hay, las más graves", () => {
  assert.equal(relevantes(EVENTOS, "¿Qué pasa en Ormuz con los tanqueros?")[0].pais_iso3, "IRN");
  assert.deepEqual(relevantes(EVENTOS, "zzzz qqqq").map((e) => e.pais_iso3), ["IRN", "MEX", "CHL"]);
  assert.match(promptUsuario("¿Ormuz?", EVENTOS.slice(0, 1)), /\[1\] 2026-10-15 · IRN/);
});

test("chat: citas enlazadas y HTML escapado", () => {
  const h = htmlRespuesta("Hay bloqueo [1] <script>x</script> [9]", EVENTOS, "openai/gpt-oss-120b");
  assert.match(h, /<a href="https:\/\/a\.example\/1"[^>]*>\[1\]<\/a>/);
  assert.ok(!h.includes("<script>"));
  assert.match(h, /\[9\]/);
  assert.match(h, /openai\/gpt-oss-120b/);
});

const LLAVE = "gsk_" + "a".repeat(40);
const sse = (trozos) => new Response(new ReadableStream({ start(c) {
  const enc = new TextEncoder();
  for (const t of trozos) c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`));
  c.enqueue(enc.encode("data: [DONE]\n\n")); c.close(); } }), { status: 200 });

test("chat Groq: valida la llave", () => {
  assert.ok(llaveValida(LLAVE));
  assert.ok(!llaveValida("sk-123"));
  assert.ok(!llaveValida("gsk_ con espacios"));
});

test("chat Groq: respuesta en flujo, llave en la cabecera y salto de modelo retirado", async () => {
  const pedidos = [];
  const fetchFn = async (url, op) => {
    const b = JSON.parse(op.body); pedidos.push([url, op.headers.Authorization, b.model, b.reasoning_effort]);
    if (b.model === MODELOS[0]) return new Response(JSON.stringify({ error: { code: "model_decommissioned", message: "retirado" } }), { status: 400 });
    return sse(["Hay ", "bloqueo [1]."]);
  };
  const textos = [];
  const r = await preguntar("¿Ormuz?", EVENTOS, LLAVE, { fetchFn, onTexto: (t) => textos.push(t) });
  assert.equal(r.texto, "Hay bloqueo [1].");
  assert.equal(r.modelo, MODELOS[1]);
  assert.deepEqual(textos, ["Hay ", "Hay bloqueo [1]."]);
  assert.equal(pedidos[0][0], "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(pedidos[0][1], `Bearer ${LLAVE}`);
  assert.equal(pedidos[1][3], "low");
});

test("chat Groq: errores con mensaje claro (llave, límite, cancelar, sin respuesta)", async () => {
  const con = (estado, code) => async () => new Response(JSON.stringify({ error: { code, message: "x" } }), { status: estado });
  await assert.rejects(preguntar("¿Ormuz?", EVENTOS, LLAVE, { fetchFn: con(401, "invalid_api_key") }), (e) => /no aceptó la llave/.test(mensajeError(e)));
  await assert.rejects(preguntar("¿Ormuz?", EVENTOS, LLAVE, { fetchFn: con(429, "rate_limit_exceeded") }), (e) => /límite gratuito/.test(mensajeError(e)));
  await assert.rejects(preguntar("¿Ormuz?", EVENTOS, "malformada"), (e) => /no aceptó la llave/.test(mensajeError(e)));
  const colgado = (url, op) => new Promise((_, mal) => op.signal.addEventListener("abort", () => mal(op.signal.reason)));
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(new DOMException("cancelada", "AbortError")), 20);
  await assert.rejects(preguntar("¿Ormuz?", EVENTOS, LLAVE, { fetchFn: colgado, signal: ctrl.signal }), (e) => mensajeError(e) === "Pregunta cancelada.");
  await assert.rejects(preguntar("¿Ormuz?", EVENTOS, LLAVE, { fetchFn: colgado, esperaMs: 30 }), (e) => /no respondió/.test(mensajeError(e)));
});
