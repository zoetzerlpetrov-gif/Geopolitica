// Informe de lenguaje corporal y voz (≈ 500 palabras) con lo detectado automáticamente y lo marcado a mano. Redacción con
// plantillas, sin IA: describe hallazgos, momentos y preguntas a explorar; no emite veredictos (no hay señal de la mentira).
import { lectura, reloj, senalDeAuto } from "./conducta-logica.js";
import { textoEntre, NOMBRE_IDIOMA } from "./transcribir.js";

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
  // En idiomas tonales, el tono más agudo y la monotonía dependen de las palabras: no se interpretan.
  const tonal = !!auto?.idiomas?.tonal;
  const evs = eventos.map((e) => ({ ...e, s: e.s || senalDeAuto(catalogo, e.senal) })).filter((e) => e.s && !(tonal && ["tono_sube", "voz_monotona"].includes(e.s.id) && /voz/.test(e.origen || "")));
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
    + `${auto?.voz ? `En la voz hubo habla en ${auto.voz.voz} % del tiempo${auto.voz.tonoBase ? ` (tono base ≈ ${auto.voz.tonoBase} Hz${auto.voz.silabasBase ? `, ${auto.voz.silabasBase} sílabas por segundo` : ""})` : ""}. ` : ""}`
    + `${fuera.length === 1 ? "Se registró" : "Se registraron"} ${plural(fuera.length, "señal", "señales")} fuera de la línea base: ${nAuto} por análisis automático de rostro, postura y voz y ${nMan} por observación directa.`,
  ]);

  const voz = fuera.filter((e) => /voz/.test(e.origen || "") || e.s.zona === "voz");
  const conteo = {}; for (const e of fuera) (conteo[e.s.id] ||= []).push(e);
  const dicho = (desde, hasta, max = 170) => { const tx = textoEntre(auto?.transcripcion, desde, hasta); return tx ? (tx.length > max ? `…${tx.slice(-max)}` : tx) : ""; };
  const I = auto?.idiomas;
  if (I?.idiomas?.length) {
    const nombres = I.idiomas.map((i) => NOMBRE_IDIOMA[i] || i);
    secciones[0].parrafos.push(`Idioma${nombres.length > 1 ? "s" : ""} del audio: ${lista(nombres)}.`
      + (I.tonal ? " Al tratarse de un idioma tonal, en el que el tono distingue palabras, las señales de tono más agudo y voz monótona tienen poco valor y no se interpretan." : "")
      + (I.varios ? " Como la persona cambió de idioma, los cambios de ritmo y tono pueden deberse al idioma y no a la emoción; solo deben compararse tramos en el mismo idioma." : ""));
  }
  if (auto?.transcripcion?.length) secciones[0].parrafos.push("El audio se transcribió automáticamente en el navegador para ubicar qué se dijo antes de cada señal; la transcripción puede contener errores y no distingue quién habla.");

  if (!fuera.length) {
    sec("Hallazgos", [`No se registraron cambios frente a la línea base. En lo observado, ${quien} mantuvo un comportamiento estable${auto?.voz ? ", tanto en el cuerpo como en la voz" : ""}. Esto no permite afirmar ni descartar nada sobre el contenido de lo que dijo; solo indica que no hubo reacciones visibles o audibles diferentes a su forma habitual de expresarse. Una ausencia de señales puede deberse a que los temas no generaron tensión, a que la persona controla bien su expresión o a que la toma no permitía ver con detalle.`]);
  } else {
    // Hallazgos principales: lecturas con más señales distintas
    const top = L.estados.slice(0, 3);
    const frases = top.map((e) => `${minus(e.nombre)} (${plural(e.peso, "señal", "señales distintas")}: ${lista(e.senales.slice(0, 3).map(corto))})`);
    const rep = Object.entries(conteo).filter(([, es]) => es.length > 1).sort((a, b) => b[1].length - a[1].length).slice(0, 3).map(([id, es]) => `${corto(catalogo.senales.find((s) => s.id === id).nombre)} (${veces(es.length)})`);
    sec("Hallazgos principales", [
      `Las lecturas con más respaldo son ${lista(frases)}. ${top[0] && top[0].peso >= 3 ? "La primera reúne tres o más señales distintas: es la hipótesis más consistente del registro, aunque no la única posible." : "Ninguna reúne tres o más señales distintas; deben tomarse como indicios débiles."}${rep.length ? ` Lo que más se repitió: ${lista(rep)}.` : ""}`,
    ]);
    // Voz
    if (auto?.voz || voz.length) {
      const porTipo = {}; for (const e of voz) (porTipo[e.s.id] ||= []).push(e);
      const partes = Object.entries(porTipo).map(([id, es]) => `${corto(catalogo.senales.find((s) => s.id === id).nombre)} (${veces(es.length)}, desde ${t(es[0].t0)}${es[0].detalle ? `; ${es[0].detalle}` : ""})`);
      sec("Lo que muestra la voz", [partes.length
        ? `Frente a su forma habitual de hablar se registró: ${lista(partes)}. Los cambios de tono y ritmo son de los pocos que la investigación asocia de forma consistente con el estrés, que puede venir del tema, de la situación o del miedo a no ser creído.`
        : "La voz se mantuvo dentro de su línea base: sin cambios notables de tono, volumen, pausas ni ritmo."]);
    }
    // Evolución en el tiempo
    if (auto?.duracion > 20) {
      const mitad = (auto.base[1] + auto.duracion) / 2;
      const a = fuera.filter((e) => e.t0 < mitad).length, b = fuera.length - a;
      sec("Evolución en el tiempo", [`${a === b ? "Las señales se repartieron de forma pareja entre la primera y la segunda mitad" : a > b ? `Las señales se concentraron en la primera mitad (${a} frente a ${b}): activación inicial que después bajó, algo común cuando la persona se habitúa a la situación` : `Las señales aumentaron en la segunda mitad (${b} frente a ${a}): la tensión o la implicación crecieron al avanzar, lo que conviene relacionar con los temas de esa parte`}.`]);
    }
    // Momentos para explorar, con lo que se dijo antes
    if (L.momentos.length) sec("Momentos para explorar", [
      `${L.momentos.length === 1 ? "Hubo 1 momento" : `Hubo ${L.momentos.length} momentos`} con tres o más señales distintas en cinco segundos. Son los puntos donde vale la pena revisar qué se preguntó o se dijo justo antes:`,
      ...L.momentos.slice(0, 3).map((m) => { const d = dicho(m.t0 - 10, m.t0 + 1); return `• ${t(m.t0)}–${t(m.t1)}: ${lista(m.senales.slice(0, 4).map(corto))}. Lecturas posibles: ${lista(m.estados.slice(0, 3).map((e) => minus(e.nombre)))}.${d ? ` Antes se dijo: «${sinPunto(d)}».` : ""}`; }),
    ]);
    else sec("Momentos para explorar", ["No hubo cúmulos de tres o más señales distintas en cinco segundos. Las señales aparecieron aisladas, lo que reduce su valor interpretativo; cada una por separado admite muchas explicaciones."]);
    // Qué podría significar cada señal (variantes, sin veredicto)
    const principales = Object.entries(conteo).sort((a, b) => b[1].length - a[1].length).slice(0, 5);
    const yaCitado = new Set(L.momentos.slice(0, 3).map((m) => dicho(m.t0 - 10, m.t0 + 1)).filter(Boolean));
    const primeraIdea = (x) => sinPunto(String(x || "").replace(/^lectura popular:\s*/i, "").split(/\.\s/)[0]);
    sec("Qué podría significar cada señal", [
      "Cada señal admite varias lecturas; ninguna es concluyente por sí sola:",
      ...principales.map(([id, es]) => {
        const s = catalogo.senales.find((x) => x.id === id), d = dicho(es[0].t0 - 8, es[0].t0 + 1, 110);
        const ctx = d && ![...yaCitado].some((c) => c.includes(d) || d.includes(c)) ? ` Contexto: «${sinPunto(d)}».` : "";
        if (ctx) yaCitado.add(d);
        return `• ${corto(s.nombre)} (${veces(es.length)}, desde ${t(es[0].t0)}): ${s.lectura ? `puede indicar ${minus(primeraIdea(s.lectura))}` : "sin lectura habitual"}${s.alternativas ? `; o deberse a ${minus(primeraIdea(s.alternativas))}` : ""}.${ctx}`;
      }),
    ]);
    // Observaciones manuales
    const notas = fuera.filter((e) => e.origen === "manual" && e.nota);
    const nMan2 = fuera.filter((e) => e.origen === "manual").length;
    if (nMan2) sec("Observaciones del analista", [`Se marcaron a mano ${plural(nMan2, "señal", "señales")}${notas.length ? `: ${notas.slice(0, 4).map((e) => `${t(e.t0)} «${sinPunto(e.nota)}» (${corto(e.s.nombre)})`).join("; ")}` : ""}. ${fuera.some((e) => e.s.id === "si_y_no") ? "Hubo al menos una incongruencia entre lo que se dice y lo que se gesticula: el hallazgo que más justifica una pregunta de seguimiento." : ""}`]);
  }
  sec("Recomendaciones", [
    fuera.length ? `Volver sobre los momentos señalados con preguntas abiertas, pedir detalles concretos (quién, dónde, cuándo, qué se vio u oyó) y comparar con lo dicho la primera vez. Descartar antes las causas ajenas al tema.${visible != null && visible < 60 ? " El rostro se vio en menos del 60 % de los cuadros: una toma más cercana y de frente mejoraría el análisis." : ""}${auto && !auto.voz ? " Para incluir la voz, analizar con audio (en la pestaña compartida, activar «Compartir audio de la pestaña»)." : ""}` : "Para observar reacciones, plantear los temas de interés después de un tramo neutral y anotar el minuto de cada pregunta.",
  ]);
  sec("Alcance", ["Este informe describe señales observables y audibles y sus lecturas habituales; no determina si la persona miente ni atribuye intenciones. Las señales reflejan tensión, emoción o esfuerzo mental, que pueden tener causas muy distintas (Bond y DePaulo, 2006; DePaulo et al., 2003)."]);

  const doc = { titulo: `Informe de lenguaje corporal${persona ? ` · ${persona}` : ""}`, secciones };
  doc.palabras = secciones.reduce((n, s) => n + [s.titulo, ...s.parrafos].join(" ").split(/\s+/).filter(Boolean).length, 0);
  return doc;
}

const escH = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const informeHTML = (d) => `<h2>${escH(d.titulo)}</h2>${d.secciones.map((s) => `<h3>${escH(s.titulo)}</h3>${s.parrafos.map((p) => `<p>${escH(p)}</p>`).join("")}`).join("")}`;
export const informeTexto = (d) => [d.titulo.toUpperCase(), "", ...d.secciones.flatMap((s) => [s.titulo.toUpperCase(), ...s.parrafos, ""])].join("\n");
