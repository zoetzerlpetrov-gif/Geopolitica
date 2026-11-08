// Informe de lenguaje corporal (≈ 1 cuartilla) con lo detectado automáticamente y lo marcado a mano. Redacción con
// plantillas, sin IA: describe hallazgos, momentos y preguntas a explorar; no emite veredictos (no hay señal de la mentira).
import { lectura, reloj, senalDeAuto } from "./conducta-logica.js";

const sinPunto = (t) => String(t || "").trim().replace(/[.;,\s]+$/, "");
const minus = (t) => (t ? t[0].toLowerCase() + t.slice(1) : t);
const lista = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);
const veces = (n) => (n === 1 ? "1 vez" : `${n} veces`);
const corto = (n) => minus(String(n).replace(/\s*\([^)]*\)/g, "").trim()); // nombre sin aclaraciones entre paréntesis
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/**
 * eventos: [{senal, t0, t1, origen, enBase, detalle, nota}] (automáticos y manuales)
 * auto: { cuadros, sinCara, duracion, base, fps } o null · opciones: { fuente, desfase (s del video al iniciar), persona, contexto }
 */
export function informeConducta(catalogo, eventos, auto = null, { fuente = "", desfase = 0, persona = "", contexto = "" } = {}) {
  const evs = eventos.map((e) => ({ ...e, s: e.s || senalDeAuto(catalogo, e.senal) })).filter((e) => e.s);
  const fuera = evs.filter((e) => !e.enBase);
  const L = lectura(catalogo, evs);
  const t = (x) => reloj(x + desfase);
  const quien = persona ? persona : "la persona observada";
  const secciones = [];
  const sec = (titulo, parrafos) => secciones.push({ titulo, parrafos: parrafos.filter(Boolean) });

  // 1. Material y método
  const nAuto = fuera.filter((e) => e.origen !== "manual").length, nMan = fuera.filter((e) => e.origen === "manual").length;
  const visible = auto?.cuadros ? Math.round((1 - auto.sinCara / auto.cuadros) * 100) : null;
  sec("Material y método", [
    `Se revisó ${fuente || "un video"}${auto ? ` durante ${reloj(auto.duracion)} (${auto.cuadros} cuadros; rostro visible en ${visible} %)` : ""}${contexto ? `, en el contexto de ${sinPunto(contexto)}` : ""}. `
    + `${auto ? `La línea base fue el tramo ${t(auto.base[0])}–${t(auto.base[1])}: cada señal se valora como cambio frente a ese comportamiento. ` : ""}`
    + `Se registraron ${plural(fuera.length, "señal", "señales")} fuera de la línea base: ${nAuto} por análisis automático de rostro y postura y ${nMan} por observación directa.`,
  ]);

  if (!fuera.length) {
    sec("Hallazgos", [`No se registraron cambios frente a la línea base. En lo observado, ${quien} mantuvo un comportamiento estable. Esto no permite afirmar ni descartar nada sobre el contenido de lo que dijo; solo indica que no hubo reacciones visibles diferentes a su forma habitual de moverse.`]);
  } else {
    // 2. Hallazgos principales: lecturas con más señales distintas
    const top = L.estados.slice(0, 2);
    const frases = top.map((e) => `${minus(e.nombre)} (${plural(e.peso, "señal", "señales distintas")}: ${lista(e.senales.slice(0, 3).map(corto))})`);
    const conteo = {}; for (const e of fuera) conteo[e.s.id] = (conteo[e.s.id] || 0) + 1;
    const rep = Object.entries(conteo).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, n]) => `${corto(catalogo.senales.find((s) => s.id === id).nombre)} (${veces(n)})`);
    sec("Hallazgos principales", [
      `Las lecturas con más respaldo son ${lista(frases)}. ${top[0] && top[0].peso >= 3 ? "La primera reúne tres o más señales distintas: es la hipótesis más consistente del registro." : "Ninguna reúne tres o más señales distintas; son indicios débiles."}${rep.length ? ` Lo que más se repitió: ${lista(rep)}.` : ""}`,
    ]);
    // 3. Evolución en el tiempo
    if (auto?.duracion > 20) {
      const mitad = (auto.base[1] + auto.duracion) / 2;
      const a = fuera.filter((e) => e.t0 < mitad).length, b = fuera.length - a;
      sec("Evolución en el tiempo", [`${a === b ? "Las señales se repartieron de forma pareja entre la primera y la segunda mitad" : a > b ? `Las señales se concentraron en la primera mitad (${a} frente a ${b}): activación inicial que después bajó` : `Las señales aumentaron en la segunda mitad (${b} frente a ${a}): la tensión o la implicación crecieron al avanzar`}. Conviene relacionarlo con los temas de cada parte.`]);
    }
    // 4. Momentos para explorar
    if (L.momentos.length) sec("Momentos para explorar", [
      `${L.momentos.length === 1 ? "Hubo 1 momento" : `Hubo ${L.momentos.length} momentos`} con tres o más señales distintas en cinco segundos; ahí conviene revisar qué se preguntó o dijo justo antes:`,
      ...L.momentos.slice(0, 3).map((m) => `• ${t(m.t0)}–${t(m.t1)}: ${lista(m.senales.slice(0, 4).map(corto))}. Lectura más probable: ${lista(m.estados.slice(0, 2).map((e) => minus(e.nombre)))}.`),
    ]);
    else sec("Momentos para explorar", ["No hubo cúmulos de tres o más señales distintas en cinco segundos. Las señales aparecieron aisladas, lo que reduce su valor interpretativo."]);
    // 5. Observaciones manuales
    const notas = fuera.filter((e) => e.origen === "manual" && e.nota);
    if (nMan) sec("Observaciones del analista", [`Se marcaron a mano ${plural(nMan, "señal", "señales")}${notas.length ? `: ${notas.slice(0, 4).map((e) => `${t(e.t0)} «${sinPunto(e.nota)}» (${corto(e.s.nombre)})`).join("; ")}` : ""}. ${fuera.some((e) => e.s.id === "si_y_no") ? "Hubo al menos una incongruencia entre lo que se dice y lo que se gesticula: el hallazgo que más justifica una pregunta de seguimiento." : ""}`]);
    // 6. Explicaciones alternativas de las señales principales
    const principales = Object.entries(conteo).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => catalogo.senales.find((s) => s.id === id)).filter((s) => s.alternativas);
    if (principales.length) sec("Otras explicaciones posibles", [`Antes de interpretar, descartar causas ajenas al tema: ${principales.map((s) => `${corto(s.nombre)} (${minus(sinPunto(s.alternativas))})`).join("; ")}.`]);
  }
  // 7. Recomendaciones y límites
  sec("Recomendaciones", [
    fuera.length ? `Volver sobre los momentos señalados con preguntas abiertas, pedir detalles concretos (quién, dónde, cuándo) y comparar con lo dicho la primera vez.${visible != null && visible < 60 ? " El rostro se vio en menos del 60 % de los cuadros: una toma más cercana y de frente mejoraría el análisis." : ""}` : "Para observar reacciones, plantear los temas de interés después de un tramo neutral y anotar el minuto de cada pregunta.",
  ]);
  sec("Alcance", ["Describe señales observables y su lectura habitual; no determina si la persona miente ni atribuye intenciones. Las señales reflejan tensión o emoción, que pueden tener causas muy distintas (Bond y DePaulo, 2006)."]);

  const doc = { titulo: `Informe de lenguaje corporal${persona ? ` · ${persona}` : ""}`, secciones };
  doc.palabras = secciones.reduce((n, s) => n + [s.titulo, ...s.parrafos].join(" ").split(/\s+/).filter(Boolean).length, 0);
  return doc;
}

const escH = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const informeHTML = (d) => `<h2>${escH(d.titulo)}</h2>${d.secciones.map((s) => `<h3>${escH(s.titulo)}</h3>${s.parrafos.map((p) => `<p>${escH(p)}</p>`).join("")}`).join("")}`;
export const informeTexto = (d) => [d.titulo.toUpperCase(), "", ...d.secciones.flatMap((s) => [s.titulo.toUpperCase(), ...s.parrafos, ""])].join("\n");
