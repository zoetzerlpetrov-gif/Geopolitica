// Herramientas de apoyo a investigaciones (fraude, corrupción, lavado, personas buscadas). Todo con fuentes públicas y
// oficiales; nada localiza ni sigue a personas. Lo que el investigador captura (evidencias, vínculos) se queda en su
// navegador: no se sube a ningún servidor.
//  1. Buscador del listado 69-B del SAT (empresas que facturan operaciones simuladas, EFOS).
//  2. Directorio de fichas oficiales del FBI (solo nombre, categoría y enlace a la ficha) y enlaces a otras listas.
//  3. Cadena de custodia: huella SHA-256 y hora de cada archivo de evidencia, con acta descargable (ISO/IEC 27037).
//  4. Cuaderno de vínculos: personas, empresas, cuentas y relaciones de un caso, con gráfico de red.
import { esc, sinAcentos, storage } from "./util.js";

export const norm = (t) => sinAcentos(String(t || "")).toUpperCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------- 1. SAT 69-B

export const SITUACION_69B = {
  "Presunto": ["#E2711D", "El SAT presume que sus facturas amparan operaciones inexistentes; aún puede desvirtuarlo."],
  "Definitivo": ["#C62828", "Quedó firme: sus facturas no tienen efectos fiscales. Quien las usó debe corregir su situación."],
  "Desvirtuado": ["#2E9E6E", "Demostró que sus operaciones sí existieron: ya no está señalado."],
  "Sentencia Favorable": ["#2E9E6E", "Un tribunal le dio la razón: ya no está señalado."],
};

/** Busca por RFC exacto/parcial o por palabras del nombre (todas deben aparecer). Máximo `max` resultados. */
export function buscar69b(datos, q, max = 50) {
  const consulta = norm(q);
  if (consulta.length < 3) return [];
  const palabras = consulta.split(" ");
  const out = [];
  for (const f of datos?.filas || []) {
    const rfc = f[0], nombre = norm(f[1]);
    if (rfc.startsWith(consulta.replace(/\s/g, "")) || palabras.every((p) => nombre.includes(p))) {
      out.push({ rfc, nombre: f[1], situacion: f[2], dof_presunto: f[3], dof_desvirtuado: f[4], dof_definitivo: f[5], dof_sentencia: f[6] });
      if (out.length >= max) break;
    }
  }
  return out;
}

export function html69b(res, datos) {
  if (!res.length) return `<p class="meta">Sin coincidencias en el listado 69-B (corte del SAT: ${esc(datos?.corte_sat || "—")}). No aparecer no garantiza nada: el listado solo incluye a quienes el SAT ya notificó.</p>`;
  return `<ul class="lista-inv">${res.map((r) => { const [c, t] = SITUACION_69B[r.situacion] || ["#8D99A6", ""];
    const fechas = [["presunto", r.dof_presunto], ["desvirtuado", r.dof_desvirtuado], ["definitivo", r.dof_definitivo], ["sentencia favorable", r.dof_sentencia]].filter(([, f]) => f);
    return `<li><b>${esc(r.nombre)}</b> <code>${esc(r.rfc)}</code> <span class="chip" style="background:${c};color:#fff;border-color:${c}">${esc(r.situacion)}</span>
      <div class="meta">${esc(t)}${fechas.length ? ` DOF: ${fechas.map(([k, f]) => `${k} ${esc(f)}`).join(" · ")}.` : ""}</div></li>`; }).join("")}</ul>
    <p class="meta">Fuente: SAT, listado completo del artículo 69-B del CFF (corte: ${esc(datos?.corte_sat || "—")}). Verifica siempre en el portal del SAT antes de actuar.</p>`;
}

// ---------------------------------------------------------------- 2. Personas buscadas (enlaces oficiales)

export const LISTAS_OFICIALES = [
  ["Interpol: notificaciones rojas (personas buscadas)", "https://www.interpol.int/How-we-work/Notices/Red-Notices/View-Red-Notices"],
  ["Interpol: notificaciones amarillas (personas desaparecidas)", "https://www.interpol.int/How-we-work/Notices/Yellow-Notices/View-Yellow-Notices"],
  ["Fiscalía General de la República (FGR)", "https://www.gob.mx/fgr"],
  ["Comisión Nacional de Búsqueda: versión pública del registro de personas desaparecidas", "https://versionpublicarnpdno.segob.gob.mx/"],
  ["FBI: más buscados", "https://www.fbi.gov/wanted"],
];

/** Fuentes públicas para investigar fraude, corrupción y lavado (se abren en su sitio; aquí no se copian sus datos). */
export const FUENTES_INVESTIGACION = [
  ["Plataforma Digital Nacional (servidores públicos sancionados, declaraciones, contrataciones)", "https://www.plataformadigitalnacional.org/"],
  ["SAT: listados 69-B y 69 (contribuyentes incumplidos)", "https://www.gob.mx/sat"],
  ["UIF: Unidad de Inteligencia Financiera", "https://www.gob.mx/uif"],
  ["GAFI/FATF: jurisdicciones de alto riesgo y bajo vigilancia (listas negra y gris)", "https://www.fatf-gafi.org/en/countries/black-and-grey-lists.html"],
  ["OpenSanctions: sanciones y personas políticamente expuestas (búsqueda)", "https://www.opensanctions.org/"],
  ["ICIJ Offshore Leaks (Papeles de Panamá, Pandora, etc.)", "https://offshoreleaks.icij.org/"],
  ["OFAC: lista SDN del Tesoro de EUA", "https://sanctionssearch.ofac.treas.gov/"],
  ["OpenCorporates: registros de empresas de muchos países", "https://opencorporates.com/"],
];

export function buscarFbi(datos, q, max = 40) {
  const consulta = norm(q);
  if (consulta.length < 3) return [];
  const palabras = consulta.split(" ");
  return (datos?.fichas || []).filter((f) => { const t = norm(`${f.nombre} ${(f.temas || []).join(" ")} ${f.categoria}`); return palabras.every((p) => t.includes(p)); }).slice(0, max);
}

export function htmlFbi(res) {
  if (!res.length) return `<p class="meta">Sin coincidencias en las fichas públicas del FBI.</p>`;
  return `<ul class="lista-inv">${res.map((f) => `<li><a href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">${esc(f.nombre)}</a>
    <div class="meta">${esc([f.categoria, ...(f.temas || [])].filter(Boolean).join(" · "))}${f.recompensa ? ` · ${esc(f.recompensa)}` : ""}${f.publicado ? ` · publicado ${esc(f.publicado)}` : ""}</div></li>`).join("")}</ul>
    <p class="meta">Si reconoces a alguien, no actúes por tu cuenta: avisa a la autoridad por los medios de la ficha oficial.</p>`;
}

// ---------------------------------------------------------------- 3. Cadena de custodia

export async function sha256Hex(buf) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Archivo → registro de custodia (la huella se calcula en el navegador; el archivo no sale del equipo). */
export async function registroEvidencia(file, ahora = new Date()) {
  return { nombre: file.name, bytes: file.size, tipo: file.type || "desconocido", modificado: file.lastModified ? new Date(file.lastModified).toISOString() : "",
    sha256: await sha256Hex(await file.arrayBuffer()), calculado_utc: ahora.toISOString() };
}

export function htmlActa(caso, registros) {
  const filas = registros.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.nombre)}</td><td>${r.bytes.toLocaleString("es-MX")}</td><td>${esc(r.tipo)}</td><td>${esc(r.modificado)}</td><td><code>${esc(r.sha256)}</code></td><td>${esc(r.calculado_utc)}</td></tr>`).join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Acta de huellas digitales – ${esc(caso.caso || "caso")}</title>
<style>body{font:12px/1.4 system-ui,sans-serif;margin:24px;color:#111}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4px;text-align:left;vertical-align:top}code{word-break:break-all;font-size:11px}h1{font-size:18px}.firma{margin-top:48px;display:flex;gap:48px}.firma div{border-top:1px solid #111;padding-top:4px;min-width:220px}</style></head><body>
<h1>Acta de registro de huellas digitales (SHA-256) de evidencia</h1>
<p><b>Caso o carpeta:</b> ${esc(caso.caso || "—")}<br><b>Responsable:</b> ${esc(caso.responsable || "—")}<br><b>Descripción:</b> ${esc(caso.descripcion || "—")}<br><b>Generada:</b> ${esc(new Date().toISOString())} (UTC)</p>
<table><thead><tr><th>#</th><th>Archivo</th><th>Bytes</th><th>Tipo</th><th>Última modificación (según el sistema)</th><th>Huella SHA-256</th><th>Calculada (UTC)</th></tr></thead><tbody>${filas}</tbody></table>
<p>La huella SHA-256 identifica el contenido exacto de cada archivo: si cambia un solo bit, la huella cambia por completo. Para comprobar que una copia es idéntica, vuelve a calcular su huella y compárala con esta acta.
Esta acta documenta el estado de los archivos al momento del cálculo; no sustituye el registro de cadena de custodia que exige la autoridad (CNPP, arts. 227 y 228; ISO/IEC 27037).</p>
<div class="firma"><div>Nombre y firma de quien calcula</div><div>Nombre y firma de quien recibe</div></div></body></html>`;
}

export function csvActa(registros) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return ["archivo,bytes,tipo,modificado,sha256,calculado_utc", ...registros.map((r) => [r.nombre, r.bytes, r.tipo, r.modificado, r.sha256, r.calculado_utc].map(q).join(","))].join("\n");
}

// ---------------------------------------------------------------- 4. Cuaderno de vínculos

export const TIPOS_ENTIDAD = { persona: ["Persona", "#1F6FB2"], empresa: ["Empresa", "#E2711D"], cuenta: ["Cuenta bancaria / cripto", "#2E9E6E"], telefono: ["Teléfono / correo", "#8E44AD"],
  lugar: ["Lugar / inmueble", "#B9770E"], vehiculo: ["Vehículo / barco / avión", "#5B6C8F"], otro: ["Otro", "#8D99A6"] };
const CLAVE = "gp_vinculos";

export function cargarCuaderno() {
  try { const d = JSON.parse(storage.get(CLAVE) || "null"); if (d && Array.isArray(d.entidades) && Array.isArray(d.relaciones)) return d; } catch { /* vacío */ }
  return { entidades: [], relaciones: [] };
}
export function guardarCuaderno(c) { storage.set(CLAVE, JSON.stringify(c)); }

export function agregarEntidad(c, nombre, tipo) {
  const n = String(nombre || "").trim();
  if (!n || c.entidades.some((e) => norm(e.nombre) === norm(n))) return c;
  return { ...c, entidades: [...c.entidades, { id: `e${Date.now().toString(36)}${c.entidades.length}`, nombre: n.slice(0, 120), tipo: TIPOS_ENTIDAD[tipo] ? tipo : "otro" }] };
}

export function agregarRelacion(c, a, b, tipo, fuente) {
  if (!a || !b || a === b || !c.entidades.some((e) => e.id === a) || !c.entidades.some((e) => e.id === b)) return c;
  return { ...c, relaciones: [...c.relaciones, { a, b, tipo: String(tipo || "relacionado con").trim().slice(0, 80), fuente: String(fuente || "").trim().slice(0, 300) }] };
}

export function quitarEntidad(c, id) {
  return { entidades: c.entidades.filter((e) => e.id !== id), relaciones: c.relaciones.filter((r) => r.a !== id && r.b !== id) };
}

/** Grado (número de relaciones) de cada entidad: los nodos más conectados suelen ser los «intermediarios». */
export function grados(c) {
  const g = Object.fromEntries(c.entidades.map((e) => [e.id, 0]));
  for (const r of c.relaciones) { g[r.a] = (g[r.a] || 0) + 1; g[r.b] = (g[r.b] || 0) + 1; }
  return g;
}

/** Gráfico en círculo (SVG): nodos coloreados por tipo, tamaño según conexiones, líneas con el tipo de relación. */
export function svgVinculos(c) {
  const n = c.entidades.length;
  if (!n) return `<p class="meta">Agrega entidades y relaciones para ver el gráfico.</p>`;
  const W = 320, R = n === 1 ? 0 : 120, g = grados(c), pos = {};
  c.entidades.forEach((e, i) => { const a = (2 * Math.PI * i) / n - Math.PI / 2; pos[e.id] = [W / 2 + R * Math.cos(a), W / 2 + R * Math.sin(a)]; });
  const lineas = c.relaciones.map((r) => { const [x1, y1] = pos[r.a] || [0, 0], [x2, y2] = pos[r.b] || [0, 0];
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#8D99A6" stroke-width="1.2"><title>${esc(r.tipo)}${r.fuente ? ` — ${esc(r.fuente)}` : ""}</title></line>`; }).join("");
  const nodos = c.entidades.map((e) => { const [x, y] = pos[e.id], [, col] = TIPOS_ENTIDAD[e.tipo] || TIPOS_ENTIDAD.otro, r = 5 + Math.min(9, (g[e.id] || 0) * 1.5);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${col}"><title>${esc(e.nombre)} (${g[e.id] || 0} relaciones)</title></circle>
      <text x="${x.toFixed(1)}" y="${(y + r + 10).toFixed(1)}" text-anchor="middle" font-size="9" fill="currentColor">${esc(e.nombre.slice(0, 22))}</text>`; }).join("");
  return `<svg class="graf-vinculos" viewBox="0 0 ${W} ${W + 14}" role="img" aria-label="Gráfico de vínculos del caso">${lineas}${nodos}</svg>`;
}
