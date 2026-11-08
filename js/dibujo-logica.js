// Tests proyectivos de dibujo: medidas de la foto (situación, dimensión, presión estimada) y redacción del informe.
// Sin DOM. Las lecturas vienen de config/dibujo_proyectivo.json (resumen del manual de la persona usuaria).
import { mascara } from "./grafo-medir.js";

/** Zona de la hoja (3 × 3) según el centro del dibujo, en proporciones 0–1. */
export function zonaDe(cx, cy) {
  const col = cx < 1 / 3 ? "izquierda" : cx > 2 / 3 ? "derecha" : "", fila = cy < 1 / 3 ? "superior" : cy > 2 / 3 ? "inferior" : "";
  if (fila && col) return `${fila}_${col}`;
  return fila || col || "centro";
}

/** Dimensión por la fracción de la hoja que ocupa el rectángulo del dibujo; cortado en dos o más bordes = muy grande. */
export function dimensionDe(fraccion, bordes = 0) {
  if (bordes >= 2) return "muy_grande";
  if (fraccion >= 0.75) return "grande";
  if (fraccion >= 0.35) return "normal";
  if (fraccion >= 0.17) return "pequeno";
  return "muy_pequeno";
}

/** Presión estimada por el contraste entre trazo y papel (útil sobre todo con lápiz). */
export function fuerzaDe(contraste) {
  if (!(contraste > 0)) return "";
  return contraste < 0.35 ? "fina" : contraste > 0.72 ? "fuerte" : "firme";
}

/** Mide una imagen { width, height, data } de la hoja completa. Devuelve null si casi no hay trazo. */
export function medirDibujo(img) {
  const M = mascara(img), { w, h, m } = M;
  const filas = new Uint32Array(h), cols = new Uint32Array(w); let n = 0, sx = 0, sy = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) { filas[y]++; cols[x]++; n++; sx += x; sy += y; }
  if (n < Math.max(30, w * h * 0.0005)) return null;
  // Recorta colas (motas sueltas): 0,5 % de los píxeles de trazo en cada extremo
  const corte = (v) => { const lim = n * 0.005; let a = 0, s = 0; while (a < v.length - 1 && s + v[a] <= lim) s += v[a++]; let b = v.length - 1; s = 0; while (b > a && s + v[b] <= lim) s += v[b--]; return [a, b]; };
  const [x0, x1] = corte(cols), [y0, y1] = corte(filas);
  const caja = { x0, y0, x1, y1 }, fraccion = ((x1 - x0 + 1) * (y1 - y0 + 1)) / (w * h);
  const margen = 0.012, bordes = [x0 <= w * margen, y0 <= h * margen, x1 >= w * (1 - margen), y1 >= h * (1 - margen)].filter(Boolean).length;
  const cx = sx / n / w, cy = sy / n / h, contraste = M.grisPapel > 0 ? (M.grisPapel - M.grisTinta) / M.grisPapel : NaN;
  return { ancho: w, alto: h, caja, fraccion, bordes, cx, cy, contraste, zona: zonaDe(cx, cy), dimension: dimensionDe(fraccion, bordes), fuerza: fuerzaDe(contraste) };
}

/** Valores que se marcan solos a partir de la medida: { "grupo/opcion": { origen, valor } }. */
export function preMarcar(med) {
  if (!med) return {};
  const pct = (v) => `${Math.round(v * 100)} %`;
  const out = {
    [`situacion/${med.zona}`]: { origen: "medido", valor: `centro del dibujo a ${pct(med.cx)} del ancho y ${pct(med.cy)} del alto` },
    [`dimension/${med.dimension}`]: { origen: "medido", valor: `ocupa ${pct(med.fraccion)} de la hoja${med.bordes ? `; toca ${med.bordes} borde(s)` : ""}` },
  };
  if (med.fuerza) out[`fuerza/${med.fuerza}`] = { origen: "estimado", valor: `contraste del trazo ${pct(med.contraste)}` };
  return out;
}

const sinPunto = (t) => String(t || "").trim().replace(/[.;,\s]+$/, "");
const may = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);

/**
 * Redacta el informe. estado: { test, valores: { "grupo/opcion": { origen, valor } }, partes: { "tipo/parte": { mods: [], nota } },
 * garabatos: [ids], colores: [ids], etapa: "ninos" | "adultos", observaciones }. datos: { persona, edad, fecha, analista }.
 * Devuelve { titulo, secciones: [{ titulo, parrafos, filas? }], palabras } (mismo formato que el análisis grafológico).
 */
export function redactarDibujo(cat, estado = {}, datos = {}) {
  const test = cat.tests.find((t) => t.id === estado.test);
  const doc = { titulo: `Informe de test proyectivo${test ? `: ${test.nombre}` : ""}`, secciones: [] };
  const sec = (titulo, parrafos, filas) => { const ps = parrafos.filter(Boolean); if (ps.length || filas) doc.secciones.push({ titulo, parrafos: ps, ...(filas ? { filas } : {}) }); };
  sec("Datos", [], [["Persona", datos.persona || "—"], ["Edad", datos.edad || "—"], ["Fecha del dibujo", datos.fecha || "—"], ["Analista", datos.analista || "—"],
    ["Test", test?.nombre || "—"], ["Consigna", test?.consigna || "—"]]);
  sec("Cómo se lee", ["Primero se observan los valores gráficos del dibujo (dónde se ubica en la hoja, cuánto espacio ocupa, hacia dónde se dirige, el tipo de trazo, la presión, la continuidad, el desarrollo y la armonía) y después los elementos que lo forman. Ningún rasgo se interpreta aislado: las lecturas se refuerzan o se debilitan entre sí, igual que en la escritura."]);
  const vals = [];
  for (const g of cat.valores) {
    const elegidos = g.opciones.filter((o) => estado.valores?.[`${g.id}/${o.id}`]);
    if (!elegidos.length) continue;
    vals.push(`${g.nombre}: ${elegidos.map((o) => { const e = estado.valores[`${g.id}/${o.id}`]; return `${o.nombre.toLowerCase()}${e.valor ? ` (${e.origen === "estimado" ? "estimado" : e.origen === "medido" ? "medido" : "observado"}: ${e.valor})` : ""}, que según tu manual remite a ${sinPunto(o.lectura).replace(/^el /, "al ").replace(/^a el /, "al ")}`.replace(" a al ", " al "); }).join("; ")}.`);
  }
  sec("Valores gráficos", vals.length ? vals : ["No se marcaron valores gráficos."]);
  const tipos = test?.partes?.length ? test.partes.filter((t) => cat.partes[t]) : Object.keys(cat.partes);
  const mods = Object.fromEntries(cat.modificadores.map((m) => [m.id, m]));
  const elems = [];
  for (const tipo of tipos) for (const g of cat.partes[tipo]) for (const p of g.partes) {
    const e = estado.partes?.[`${tipo}/${p.id}`]; if (!e || (!e.mods?.length && !e.nota)) continue;
    const ms = (e.mods || []).map((id) => mods[id]).filter(Boolean);
    elems.push(`${p.nombre}${ms.length ? ` — ${ms.map((m) => m.nombre.toLowerCase()).join(" y ")}` : ""}: representa ${sinPunto(p.representa)} (${g.grupo.toLowerCase()}: ${sinPunto(g.representa)}).`
      + (ms.length ? ` ${may(ms.map((m) => sinPunto(m.lectura)).join("; "))} (lectura complementaria).` : "") + (e.nota ? ` Observación: ${sinPunto(e.nota)}.` : ""));
  }
  if (elems.length) sec("Elementos del dibujo", elems);
  const gar = cat.garabatos.filter((g) => estado.garabatos?.includes(g.id));
  if (gar.length) sec("Garabatos", gar.map((g) => `${g.nombre}: ${sinPunto(g.lectura)}.`));
  const col = cat.colores.filter((c) => estado.colores?.includes(c.id));
  if (col.length) sec("Colores", [`Lectura según la edad: ${estado.etapa === "ninos" ? "niños y adolescentes (hasta 16 años)" : "jóvenes y adultos"}.`,
    ...col.map((c) => `${c.nombre} (${c.clave}): ${sinPunto(estado.etapa === "ninos" ? c.ninos : c.adultos)}.`)]);
  if (estado.observaciones) sec("Observaciones del analista", [sinPunto(estado.observaciones) + "."]);
  const total = vals.length + elems.length + gar.length + col.length;
  sec("Síntesis", [total ? `Se consideraron ${vals.length} grupo(s) de valores gráficos, ${elems.length} elemento(s) del dibujo${gar.length ? `, ${gar.length} tipo(s) de garabato` : ""}${col.length ? ` y ${col.length} color(es)` : ""}. Las lecturas que coinciden entre sí (por ejemplo, un dibujo pequeño, en la zona izquierda y con trazo fino) son las que tienen más peso; una sola señal es un indicio débil.` : "Aún no hay valores ni elementos marcados.",
    "Conviene contrastar este dibujo con otros de la misma persona (el manual pide varios: figura humana, figura del sexo opuesto, autorretrato, árbol y casa) y con la entrevista."]);
  sec("Alcance", [cat.aviso]);
  doc.palabras = doc.secciones.reduce((n, s) => n + [s.titulo, ...(s.parrafos || []), ...(s.filas || []).flat()].join(" ").split(/\s+/).filter(Boolean).length, 0);
  return doc;
}
