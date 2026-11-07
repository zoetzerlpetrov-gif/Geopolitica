import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { escritura, lienzo, trazo } from "./sintetico-escritura.mjs";
import { medir, sesgo, mascara } from "../../js/grafo-medir.js";
import { clasificar, clasificarAvanzado, clasificarFirma, temperamento, informe, indice, TEMPERAMENTOS, clave } from "../../js/grafo-logica.js";
import { redactar, cuartillas, interpretacion, AREAS, SINDROMES } from "../../js/grafo-redaccion.js";
import { ejemplo } from "../../js/grafo-ejemplos.js";
import { rasgosCuadro, eventosDeSerie, lectura, tipoEnlace, reloj, REGLAS, senalDeAuto } from "../../js/conducta-logica.js";

const CAT_G = JSON.parse(readFileSync(new URL("../../config/grafologia.json", import.meta.url), "utf8"));
const CAT_C = JSON.parse(readFileSync(new URL("../../config/lenguaje_corporal.json", import.meta.url), "utf8"));
const COMP_G = JSON.parse(readFileSync(new URL("../../config/grafologia_complemento.json", import.meta.url), "utf8"));
const cerca = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test("grafología: mide inclinación, dirección, tamaño y espacios de una escritura sintética", () => {
  const m = medir(escritura({ incl: 65, dir: 3, xh: 20, hueco: 2.5 }), null, 0.15);
  assert.equal(m.renglones, 6);
  assert.equal(m.palabras, 36);
  cerca(m.inclinacion, 65, 4, "inclinación");
  cerca(m.direccion, 3, 0.6, "dirección");
  cerca(m.zonaMediaPx, 20, 4, "zona media");
  cerca(m.zonaMediaMm, 3, 0.6, "zona media en mm");
  assert.ok(m.espacioPalabras > 1.5, `espacio entre palabras ${m.espacioPalabras}`);
  const inv = medir(escritura({ incl: 118, dir: -5 }));
  cerca(inv.inclinacion, 118, 4, "invertida");
  cerca(inv.direccion, -5, 0.6, "descendente");
  assert.equal(inv.zonaMediaMm, null, "sin escala no hay mm");
});

test("grafología: el sesgo de la hoja se estima y los renglones no se mezclan", () => {
  assert.equal(sesgo(mascara(escritura({ dir: 0 }))), 0);
  cerca(sesgo(mascara(escritura({ dir: 2 }))), 2, 0.3, "2°");
  cerca(sesgo(mascara(escritura({ dir: -8 }))), -8, 0.3, "−8°");
  assert.equal(medir(escritura({ dir: 8 })).renglones, 6);
});

test("grafología: imagen en blanco no truena", () => {
  const m = medir(lienzo(300, 200));
  assert.ok(m.vacio || m.renglones === 0);
  assert.deepEqual(clasificar(m), []);
});

test("grafología: clasificación con el catálogo de la persona", () => {
  const idx = indice(CAT_G);
  const c = clasificar(medir(escritura({ incl: 65, dir: 3, xh: 20 }), null, 0.15), { hojaCompleta: true });
  for (const x of c) assert.ok(idx.has(x.clave), `la clave existe en el catálogo: ${x.clave}`);
  const k = new Map(c.map((x) => [x.clave, x]));
  assert.ok(k.has("inclinacion/posicion/inclinada"));
  assert.equal(k.get("inclinacion/posicion/inclinada").variante, "Inclinada (65a50°)");
  assert.ok(k.has("direccion/orientacion/ascendente_1a50"));
  assert.ok(k.has("dimension/tamano/mediana_o_normal_3mm") || k.has("dimension/tamano/grande_3_5_mm"), "3 mm ± 10 %");
  assert.ok(k.has("orden/margenes_como_te_desenvuelves_en_la_vida/izquierdo"));
  // variantes usadas existen en el catálogo
  for (const x of c) if (x.variante) assert.ok(idx.get(x.clave).rasgo.variantes.includes(x.variante), x.variante);
});

test("grafología: firma frente al texto", () => {
  const img = escritura({ w: 1200, h: 900, renglones: 4 });
  trazo(img, 700, 760, 1000, 700, 4); trazo(img, 720, 720, 760, 800, 4); trazo(img, 800, 720, 860, 790, 4); trazo(img, 900, 700, 950, 780, 4);
  const rT = { x: 0, y: 0, w: 1200, h: 600 }, rF = { x: 650, y: 650, w: 450, h: 200 };
  const t = medir(img, rT), f = medir(img, rF);
  const c = clasificarFirma(f, t, rF, rT, { hojaCompleta: true });
  const ks = c.map((x) => x.clave), idx = indice(CAT_G);
  for (const k of ks) assert.ok(idx.has(k), k);
  assert.ok(ks.some((k) => k.startsWith("firma/direccion_de_las_firmas/")));
  assert.ok(ks.includes("firma/respecto_al_espacio_o_margen/derecha"));
  assert.ok(ks.some((k) => k.startsWith("firma/situacion/")));
});

test("grafología: indicadores de temperamento apuntan a rasgos que existen", () => {
  const idx = indice(CAT_G);
  for (const [id, inds] of Object.entries(TEMPERAMENTOS)) {
    assert.ok(idx.has(clave("temperamento", "general", id)), id);
    for (const [, ks] of inds) for (const k of ks) assert.ok(idx.has(k), `${id}: ${k}`);
  }
  const t = temperamento(["presion/calibre/pesada_0_75a1mm", "forma/anatomia/angulosa", "dimension/tamano/pequena_2_5_mm"]);
  assert.equal(t[0].id, "bilioso_activo_y_emotivo");
  assert.equal(t[0].cumple.length, 3);
  const inf = informe(CAT_G, new Map([["forma/anatomia/angulosa", { origen: "manual" }], ["dimension/tamano/pequena_2_5_mm", { origen: "medido", valor: "2.4 mm" }]]));
  assert.equal(inf.total, 2);
  assert.ok(inf.secciones.find((s) => s.id === "forma").items[0].interpretacion.length > 0);
  assert.match(inf.aviso, /no tiene validez científica/);
});

test("lenguaje corporal: catálogo coherente", () => {
  const autosConRegla = new Set([...Object.keys(REGLAS), "parpadeo", "ojos_cerrados", "cabeza_ladeada", "cabeza_girada", "cabeza_abajo", "hombros_arriba", "inquietud", "congelarse",
    "menton_arriba", "inclinarse_adelante", "echarse_atras", "asentir", "negar_cabeza", "encogimiento_rapido", "pies_inquietos", "parpadeo_bajo", "mirada_sostenida"]);
  for (const s of CAT_C.senales) {
    assert.ok(CAT_C.zonas.some((z) => z.id === s.zona), `${s.id}: zona`);
    for (const e of s.estados) assert.ok(CAT_C.estados[e], `${s.id}: estado ${e}`);
    if (s.auto) assert.ok(autosConRegla.has(s.auto), `${s.id}: auto ${s.auto} sin detector`);
  }
  for (const a of autosConRegla) assert.ok(senalDeAuto(CAT_C, a), `detector ${a} sin señal en el catálogo`);
  assert.ok(!CAT_C.estados.mentira, "no hay un estado «mentira»");
});

function serie(dur, fps, f) { const out = []; for (let t = 0; t <= dur + 1e-9; t += 1 / fps) out.push({ t: +t.toFixed(3), f: f(t) }); return out; }

test("lenguaje corporal: eventos frente a la línea base", () => {
  const cuadros = serie(60, 10, (t) => ({
    ceno: t >= 40 && t < 43 ? 0.7 : 0.05,
    labios_apretados: t >= 41 && t < 44 ? 0.6 : 0.05,
    mano_boca: t >= 42 && t < 43.5 ? 1 : 0,
    brazos_cruzados: 1, // toda la sesión, también en la línea base
    ojos: (t * 10) % 40 < 1 ? 0.9 : (t >= 45 && t < 55 && (t * 10) % 15 < 1 ? 0.9 : 0.05), // parpadea más entre 45 y 55 s
    roll: 0,
  }));
  const { eventos, base } = eventosDeSerie(cuadros, [0, 12]);
  assert.deepEqual(base, [0, 12]);
  const de = (s) => eventos.filter((e) => e.senal === s);
  assert.equal(de("ceno").length, 1); cerca(de("ceno")[0].t0, 40, 0.2, "inicio del ceño");
  assert.equal(de("labios_apretados").length, 1);
  assert.equal(de("mano_boca").length, 1);
  assert.ok(de("brazos_cruzados").every((e) => e.detalle === "también en la línea base"));
  assert.ok(de("parpadeo").length >= 1, "más parpadeo que en la línea base");
  const L = lectura(CAT_C, eventos);
  assert.ok(L.momentos.length >= 1, "hay un cúmulo");
  const m = L.momentos[0]; assert.ok(m.t0 >= 39 && m.t0 <= 42, `cúmulo en ${m.t0}`);
  assert.ok(m.estados.some((e) => e.id === "tension"), "el cúmulo apunta a tensión");
});

test("lenguaje corporal: rasgos por cuadro desde blendshapes y pose", () => {
  const f = rasgosCuadro({ b: { browDownLeft: 0.8, browDownRight: 0.6, mouthSmileLeft: 0.7, mouthSmileRight: 0.7, cheekSquintLeft: 0.5, cheekSquintRight: 0.5, eyeBlinkLeft: 0.1, eyeBlinkRight: 0.1 } });
  assert.equal(f.ceno, 0.7); assert.equal(f.sonrisa_genuina, 0.7); assert.equal(f.sonrisa_social, 0);
  // pose: persona de frente con brazos cruzados (muñecas en el lado contrario)
  const p = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  Object.assign(p[0], { x: 0.5, y: 0.2 }); Object.assign(p[9], { x: 0.48, y: 0.26 }); Object.assign(p[10], { x: 0.52, y: 0.26 });
  Object.assign(p[7], { x: 0.56, y: 0.2 }); Object.assign(p[8], { x: 0.44, y: 0.2 });
  Object.assign(p[11], { x: 0.62, y: 0.35 }); Object.assign(p[12], { x: 0.38, y: 0.35 });
  Object.assign(p[23], { x: 0.58, y: 0.7 }); Object.assign(p[24], { x: 0.42, y: 0.7 });
  Object.assign(p[15], { x: 0.43, y: 0.5 }); Object.assign(p[16], { x: 0.57, y: 0.5 });
  Object.assign(p[19], { x: 0.42, y: 0.5 }); Object.assign(p[20], { x: 0.58, y: 0.5 });
  const g = rasgosCuadro({ pose: p, ancho: 1000, alto: 1000 });
  assert.equal(g.brazos_cruzados, 1); assert.equal(g.mano_boca, 0);
  Object.assign(p[15], { x: 0.49, y: 0.27 });
  assert.equal(rasgosCuadro({ pose: p, ancho: 1000, alto: 1000 }).mano_boca, 1);
});

test("lenguaje corporal: enlaces", () => {
  assert.equal(tipoEnlace("https://www.youtube.com/watch?v=dQw4w9WgXcQ").tipo, "youtube");
  assert.equal(tipoEnlace("https://youtu.be/dQw4w9WgXcQ").id, "dQw4w9WgXcQ");
  assert.equal(tipoEnlace("https://www.youtube.com/shorts/abcdEFGH123").tipo, "youtube");
  assert.equal(tipoEnlace("https://vimeo.com/123456").tipo, "vimeo");
  assert.equal(tipoEnlace("https://ejemplo.org/v/clip.mp4").tipo, "archivo");
  assert.equal(tipoEnlace("https://www.tiktok.com/@x/video/1").tipo, "red_social");
  assert.equal(tipoEnlace("https://www.instagram.com/reel/abc/").tipo, "red_social");
  assert.equal(tipoEnlace("https://drive.google.com/file/d/x/view").tipo, "nube");
  assert.equal(tipoEnlace("javascript:alert(1)").tipo, "invalido");
  assert.equal(reloj(75), "01:15");
});

test("grafología: medidas avanzadas y rasgos estimados", () => {
  const idx = indice(CAT_G);
  const vertical = medir(escritura({ incl: 90 }), null, 0.15), inclinada = medir(escritura({ incl: 65, hueco: 2.5 }), null, 0.15);
  // letras sintéticas verticales quedan separadas; inclinadas se tocan
  assert.ok(vertical.avanzado.piezasPorPalabra > 3, `piezas ${vertical.avanzado.piezasPorPalabra}`);
  assert.ok(inclinada.avanzado.piezasPorPalabra <= 1.2);
  const a = clasificarAvanzado(inclinada, clasificar(inclinada));
  for (const x of a) { assert.ok(idx.has(x.clave), x.clave); assert.equal(x.confianza, "estimado"); if (x.variante) assert.ok(idx.get(x.clave).rasgo.variantes.includes(x.variante), x.variante); }
  const k = a.map((x) => x.clave);
  assert.ok(k.includes("continuidad/ligazon/ligada"));
  assert.ok(k.some((c) => c.startsWith("velocidad/intensidad/")), "velocidad estimada");
  assert.ok(k.includes("orden/estructura/ordenada_esmerada_exageradamente_ordenada"));
  assert.ok(clasificarAvanzado(vertical, clasificar(vertical)).some((x) => x.clave === "continuidad/ligazon/desligada"));
  // subrayado
  const img = escritura({ renglones: 2 }); trazo(img, 80, 130, 900, 130, 3); // entre el renglón 1 (base 120) y el 2
  assert.ok(medir(img).avanzado.subrayados > 0);
});

test("grafología: dibujo de ejemplo para cada rasgo", () => {
  for (const s of CAT_G.secciones) for (const g of s.grupos) for (const r of g.rasgos) {
    if (s.id === "temperamento") continue;
    const svg = ejemplo(clave(s.id, g.id, r.id), r.variantes[0] || "");
    assert.match(svg, /^<svg /, `${s.id}/${g.id}/${r.id}`);
    assert.doesNotMatch(svg, /NaN|undefined/, `${s.id}/${g.id}/${r.id}`);
  }
});

test("grafología: lecturas complementarias solo para rasgos sin interpretación", () => {
  const idx = indice(CAT_G);
  for (const k of Object.keys(COMP_G.interpretaciones)) { assert.ok(idx.has(k), k); assert.equal(idx.get(k).rasgo.interpretacion, "", k); }
  const i = interpretacion(idx.get("gestos_tipos/curvos/bucle").rasgo);
  assert.match(i.positivo, /^amabilidad: contacto amable/i); assert.match(i.negativo, /^diplomacia: falsedad/i);
});

test("grafología: análisis escrito en tres extensiones", () => {
  const m = medir(escritura({ incl: 65, hueco: 2.5, dir: 2 }), null, 0.15), b = clasificar(m, { hojaCompleta: true });
  const sel = new Map([...b.map((x) => [x.clave, { ...x, origen: "medido" }]), ...clasificarAvanzado(m, b).map((x) => [x.clave, { ...x, origen: "estimado" }])]);
  for (const k of ["gestos_tipos/curvos/bucle", "presion/profundidad/firme", "forma/anatomia/angulosa", "firma/situacion/proxima_al_texto"]) sel.set(k, { origen: "manual" });
  const op = (extension, areas) => redactar(CAT_G, COMP_G, sel, { extension, areas, medidas: { texto: m }, datos: { persona: "Ana" } });
  const breve = op("breve", ["personal", "laboral"]), media = op("media", ["personal", "laboral", "pareja"]), completa = op("completa", Object.keys(AREAS));
  assert.ok(cuartillas(breve) <= 1, `breve ${breve.palabras}`);
  assert.ok(cuartillas(media) >= 1.8 && cuartillas(media) <= 4.5, `media ${media.palabras}`);
  assert.ok(cuartillas(completa) > 5, `completa ${completa.palabras}`);
  const titulos = completa.secciones.map((x) => x.titulo);
  for (const t of ["I. Datos generales", "III. Metodología y fundamentos", "VII. Temperamento", "IX. Síntesis por áreas", "XI. Limitaciones, validez y uso ético", "XII. Conclusiones"]) assert.ok(titulos.includes(t), t);
  const todo = JSON.stringify(completa);
  assert.match(todo, /Pellat/); assert.match(todo, /Ana/); assert.doesNotMatch(todo, /undefined|NaN|\[object/);
  assert.ok(media.secciones.some((x) => x.titulo === "Pareja y vida afectiva"));
  // los síndromes apuntan a rasgos que existen
  const idx = indice(CAT_G);
  for (const x of SINDROMES) for (const k of (x.todos || x.algun.flat())) assert.ok(idx.has(k), k);
});

test("lenguaje corporal: nuevos detectores (asentir, acercarse, barbilla arriba, sin parpadear)", () => {
  const cuadros = serie(60, 10, (t) => ({
    pitch: 0.5 + (t >= 30 && t < 33 ? 0.06 * Math.sin(t * 2 * Math.PI * 2) : 0) + (t >= 45 && t < 48 ? -0.2 : 0),
    cercania: t >= 36 && t < 40 ? 0.12 : 0.1,
    ojos: t < 20 ? ((t * 10) % 40 < 1 ? 0.9 : 0.05) : t < 40 ? 0.05 : ((t * 10) % 40 < 1 ? 0.9 : 0.05),
  }));
  const { eventos } = eventosDeSerie(cuadros, [0, 15]);
  const de = (s) => eventos.filter((e) => e.senal === s);
  assert.ok(de("asentir").length >= 1, "asentir"); cerca(de("asentir")[0].t0, 30, 1, "inicio de asentir");
  assert.ok(de("inclinarse_adelante").length === 1, "se acerca a la cámara");
  assert.ok(de("menton_arriba").length === 1, "barbilla arriba");
  assert.ok(de("parpadeo_bajo").length >= 1, "sin parpadear");
  for (const e of eventos) assert.ok(senalDeAuto(CAT_C, e.senal), `sin señal en el catálogo: ${e.senal}`);
});
