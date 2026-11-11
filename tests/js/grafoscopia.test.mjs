import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ELEMENTOS, SENALES, ESCALA, compararMedidas, normalizar, superposicion, analizarSuperposicion, sugerirConclusion, redactarDictamen, dictamenHTML, dictamenTexto } from "../../js/grafoscopia-logica.js";
import { medir, mascara } from "../../js/grafo-medir.js";

const med = (inc, extra = {}) => ({ inclinacion: inc, direccion: 0, hampa: 1.5, jamba: 1.2, grosorPx: 3, zonaMediaPx: 20, espacioPalabras: 1, caja: { x0: 0, x1: 299, y0: 0, y1: 99 }, avanzado: { piezasPorLetra: 0.4, guirnalda: 0.1, variacionGrosor: 0.3, sinuosidad: 0.05 }, ...extra });

test("medidas: la dubitada dentro del rango de las indubitadas sale «dentro»; muy distinta sale «fuera»", () => {
  const ind = [med(70), med(73), med(68)];
  const ok = compararMedidas(med(71), ind).find((m) => m.id === "inclinacion");
  assert.equal(ok.estado, "dentro"); assert.equal(ok.min, 68); assert.equal(ok.max, 73);
  const mal = compararMedidas(med(95), ind).find((m) => m.id === "inclinacion");
  assert.equal(mal.estado, "fuera");
  const prop = compararMedidas(med(71, { caja: { x0: 0, x1: 99, y0: 0, y1: 99 } }), ind).find((m) => m.id === "proporcion");
  assert.equal(prop.estado, "fuera", "una firma 1:1 frente a indubitadas 3:1");
  assert.equal(compararMedidas({ vacio: true }, ind)[0].estado, "sin_dato");
});

// Máscara sintética: una «firma» de trazos en forma de onda; desplazar = otra persona, copiar = calco
function firma(w, h, fase = 0, amp = 18, grosor = 2) {
  const m = new Uint8Array(w * h);
  for (let x = 10; x < w - 10; x++) { const y = Math.round(h / 2 + amp * Math.sin((x + fase) / 9)); for (let d = -grosor; d <= grosor; d++) if (y + d >= 0 && y + d < h) m[(y + d) * w + x] = 1; }
  return { w, h, m };
}

test("superposición: idéntica = 1; la misma forma con variación natural queda lejos de 1", () => {
  const a = normalizar(firma(300, 100)), b = normalizar(firma(300, 100));
  assert.equal(superposicion(a, b), 1);
  const c = normalizar(firma(300, 100, 6, 15));
  const s = superposicion(a, c); assert.ok(s > 0 && s < 0.8, `variación ${s}`);
  assert.ok(Number.isNaN(superposicion(a, { vacio: true })));
});

test("posible calco: la dubitada coincide con una indubitada mucho más que las auténticas entre sí", () => {
  const ind = [firma(300, 100, 0), firma(300, 100, 5, 15), firma(300, 100, 11, 21)].map((x) => normalizar(x));
  const calcada = normalizar(firma(300, 100, 0));
  const r = analizarSuperposicion(calcada, ind);
  assert.equal(r.calco, true); assert.equal(r.maxDub, 1);
  const natural = analizarSuperposicion(normalizar(firma(300, 100, 3, 17)), ind);
  assert.equal(natural.calco, false);
});

const cot = (c, v, d) => Object.fromEntries([...Array(c).fill("coincide"), ...Array(v).fill("variacion"), ...Array(d).fill("diverge")].map((valor, i) => [`e${i}`, { valor }]));

test("conclusión sugerida: coincidencias sin divergencias → apoyo a la misma persona; divergencias + señales → otra persona", () => {
  const base = { material: { copia: false, indubitadas: 10, contemporaneas: true } };
  assert.equal(sugerirConclusion({ ...base, cotejo: cot(9, 2, 0) }).nivel, 2);
  assert.equal(sugerirConclusion({ ...base, cotejo: cot(6, 1, 1) }).nivel, 3);
  assert.equal(sugerirConclusion({ ...base, cotejo: cot(4, 1, 4) }).nivel, 5);
  assert.equal(sugerirConclusion({ ...base, cotejo: cot(4, 1, 4), senales: ["temblor"] }).nivel, 6);
  assert.equal(sugerirConclusion({ ...base, cotejo: cot(2, 0, 0) }).nivel, 4, "pocos elementos valorados");
  assert.equal(sugerirConclusion({ ...base, cotejo: cot(8, 0, 1), senales: ["lentitud", "retoques"] }).nivel, 5);
});

test("conclusión sugerida: copia o pocas indubitadas bajan «fuerte» a «moderado»; nunca sugiere identificación categórica", () => {
  const c = cot(12, 0, 0);
  assert.equal(sugerirConclusion({ cotejo: c, material: { copia: true, indubitadas: 10 } }).nivel, 3);
  const r = sugerirConclusion({ cotejo: c, material: { copia: false, indubitadas: 3 } });
  assert.equal(r.nivel, 3); assert.ok(r.razones.some((x) => x.includes("3 indubitada")));
  assert.ok(![1, 7].includes(sugerirConclusion({ cotejo: cot(20, 0, 0), material: { indubitadas: 20 } }).nivel));
  assert.ok(sugerirConclusion({ cotejo: c, superposicion: { calco: true } }).razones.some((x) => x.includes("calco")));
});

test("dictamen: secciones de un peritaje, tablas de cotejo y medidas, conclusión elegida", () => {
  const medidas = compararMedidas(med(71), [med(70), med(73)]);
  const doc = redactarDictamen({ dubitada: { descripcion: "Pagaré", copia: true }, indubitadas: [{ descripcion: "INE", tipo: "espontanea" }, { descripcion: "Muestra", tipo: "recabada" }],
    medidas, superposicion: { maxDub: 0.5, mediaDub: 0.45, maxEntre: 0.55, calco: false }, cotejo: { inclinacion: { valor: "coincide", nota: "igual" }, ataques: { valor: "diverge" } },
    senales: ["temblor"], nivel: 4, consideraciones: "Revisar originales" }, { expediente: "123/2026", perito: "Perito X" });
  const t = doc.secciones.map((s) => s.titulo);
  for (const s of ["Datos generales", "Planteamiento del problema", "Material de estudio", "Método y técnica", "Mediciones (apoyo instrumental)", "Superposición", "Cotejo", "Señales de falsificación o alteración", "Consideraciones técnicas", "Conclusión", "Alcance y limitaciones"]) assert.ok(t.includes(s), s);
  assert.ok(doc.secciones.find((s) => s.titulo === "Conclusión").parrafos[0].startsWith("Inconcluso"));
  assert.ok(doc.secciones.find((s) => s.titulo === "Material de estudio").parrafos[0].includes("recabadas"));
  const h = dictamenHTML(doc); assert.ok(h.includes("<th>Elemento</th>") && h.includes("Divergencia significativa") && h.includes("123/2026"));
  assert.ok(dictamenTexto(doc).includes("CONCLUSIÓN"));
  assert.ok(doc.secciones.find((s) => s.titulo === "Alcance y limitaciones").parrafos[0].includes("copia"));
});

test("catálogo: ids únicos y escala de 7 niveles", () => {
  const ids = ELEMENTOS.flatMap((g) => g.items.map((i) => i.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(SENALES.map((s) => s.id)).size, SENALES.length);
  assert.deepEqual(ESCALA.map((e) => e.n), [1, 2, 3, 4, 5, 6, 7]);
});

test("medición real de una firma sintética en ImageData (de punta a punta con grafo-medir)", () => {
  const { w, h, m } = firma(400, 140, 0, 20, 2), data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { const v = m[i] ? 20 : 245; /* dos tonos exactos: antes la tinta quedaba sobre el umbral */ data.set([v, v, v, 255], i * 4); }
  const img = { width: w, height: h, data };
  const r = medir(img); assert.ok(!r.vacio);
  const n = normalizar(mascara(img)); assert.equal(n.vacio, false);
  assert.ok(superposicion(n, n) === 1);
});

test("página: pestaña de peritaje en Conducta y escritura (solo administración)", () => {
  const h = readFileSync(new URL("../../conducta.html", import.meta.url), "utf8");
  assert.ok(h.includes('data-panel="p-pericia"') && h.includes('id="p-pericia"') && h.includes("js/grafoscopia.js"));
  for (const id of ["p-dub-archivo", "p-indub-archivo", "p-medidas", "p-sup", "p-cotejo", "p-senales", "p-nivel", "p-redactar", "p-word", "p-pdf", "p-imprimir"]) assert.ok(h.includes(`id="${id}"`), id);
  const planes = JSON.parse(readFileSync(new URL("../../config/planes.json", import.meta.url), "utf8"));
  assert.ok(planes.solo_admin.some((s) => s.href === "conducta.html"));
});

// ---------- medidas del trazo y análisis automático ----------
import { trazo, esqueleto, analisisAutomatico, SOLO_A_MANO } from "../../js/grafoscopia-logica.js";

function lienzo(w, h) { return { w, h, m: new Uint8Array(w * h) }; }
function disco(M, cx, cy, r) { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if (x >= 0 && y >= 0 && x < M.w && y < M.h && (x - cx) ** 2 + (y - cy) ** 2 <= r * r) M.m[y * M.w + x] = 1; }
/** Línea horizontal de grosor `g`; `afilar` adelgaza los extremos (trazo rápido); `temblor` agrega ondulación fina. */
function linea({ g = 5, afilar = false, temblor = 0 } = {}) {
  const M = lienzo(400, 80);
  for (let x = 40; x <= 360; x++) {
    const t = Math.min(x - 40, 360 - x) / 60, r = afilar ? Math.max(0.6, (g / 2) * Math.min(1, t)) : g / 2;
    disco(M, x, 40 + (temblor ? temblor * Math.sin(x * 0.6) : 0), r);
  }
  return M;
}

test("trazo: extremos romos (lento) frente a afilados (rápido); temblor sube la irregularidad del borde", () => {
  const romo = trazo(linea()), afilado = trazo(linea({ afilar: true })), tembloroso = trazo(linea({ g: 3, temblor: 2 }));
  assert.equal(romo.puntas, 2); assert.equal(romo.piezas, 1);
  assert.ok(romo.extremos > 0.75, `romo ${romo.extremos}`);
  assert.ok(afilado.extremos < romo.extremos - 0.2, `afilado ${afilado.extremos} vs romo ${romo.extremos}`);
  assert.ok(tembloroso.temblor > romo.temblor * 2 && tembloroso.temblor > 0.05, `temblor ${tembloroso.temblor} vs ${romo.temblor}`);
  const dos = linea(); for (let y = 0; y < 80; y++) for (let x = 195; x <= 205; x++) dos.m[y * 400 + x] = 0;
  assert.equal(trazo(dos).piezas, 2, "un corte del trazo = 2 piezas (levantamiento)");
  assert.equal(trazo(lienzo(50, 50)), null);
});

test("esqueleto de 1 píxel conserva la conexión", () => {
  const M = linea({ g: 9 }), s = esqueleto(M);
  let n = 0; for (let x = 60; x < 340; x++) { let c = 0; for (let y = 0; y < 80; y++) c += s[y * 400 + x]; if (c === 1) n++; }
  assert.ok(n > 260, `columnas con un solo píxel: ${n}`);
});

const mm = (id, dub, min, max, estado, nombre = id) => ({ id, nombre, unidad: "", dubitada: dub, min, max, media: (min + max) / 2, desv: 0.1, estado });

test("análisis automático: propone cotejo con notas y marca señales con su motivo", () => {
  const medidas = [mm("inclinacion", 71, 68, 73, "dentro"), mm("temblor", 1.4, 1.1, 1.15, "fuera"), mm("extremos", 0.95, 0.5, 0.6, "fuera"),
    mm("variacionGrosor", 0.3, 0.3, 0.5, "dentro"), mm("piezas", 6, 2, 3, "fuera"), mm("proporcion", 3, 2.8, 3.2, "dentro")];
  const sup = { mediaDub: 0.5, mediaEntre: 0.52, entre: [0.48, 0.55], maxDub: 0.6, maxEntre: 0.55, calco: false };
  const a = analisisAutomatico(medidas, sup, { copia: true });
  assert.equal(a.cotejo.inclinacion.valor, "coincide"); assert.ok(a.cotejo.inclinacion.nota.includes("68–73"));
  assert.equal(a.cotejo.habilidad.valor, "diverge", "temblor y extremos fuera");
  assert.equal(a.cotejo.velocidad.valor, "diverge");
  assert.equal(a.cotejo.morfologia.valor, "coincide", "la forma coincide según la superposición");
  assert.ok(a.cotejo.presion.nota.includes("copia"));
  assert.ok(a.senales.temblor && a.senales.lentitud && a.senales.levantamientos && a.senales.forma_sin_ritmo);
  assert.ok(!a.senales.calco);
  for (const id of SOLO_A_MANO) assert.ok(!a.cotejo[id], `${id} se deja a mano`);
  const limpio = analisisAutomatico([mm("inclinacion", 71, 68, 73, "dentro"), mm("temblor", 1.1, 1.1, 1.15, "dentro")], { ...sup, calco: true, maxDub: 0.95 });
  assert.deepEqual(Object.keys(limpio.senales), ["calco"]);
});

test("dictamen: las notas automáticas salen sin emojis", () => {
  const doc = redactarDictamen({ cotejo: { inclinacion: { valor: "coincide", nota: "🤖 Inclinación: 71 (indubitadas 68–73) ⚠️." } } }, {});
  const fila = doc.secciones.find((s) => s.titulo === "Cotejo").tabla.filas[0];
  assert.ok(!fila[2].includes("🤖") && fila[2].includes("(fuera del rango)"));
});
