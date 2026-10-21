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

// ---------------------------------------------------------------- Lote E: leyes por mes, contratos, poder político y guías

/** Meses del resumen del DOF, del más reciente al más antiguo. */
export const mesesDof = (r) => Object.keys(r?.por_mes || {}).sort().reverse();
const nombreMes = (m) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("es-MX", { month: "long", year: "numeric" });

/** Un mes del DOF: cuántas publicaciones hubo por tipo y qué leyes, reformas y decretos se publicaron. */
export function htmlMesDof(r, mes) {
  const tipos = Object.entries(r?.por_mes?.[mes] || {}).sort((a, b) => b[1] - a[1]);
  if (!tipos.length) return `<p class="meta">Sin datos del DOF para ese mes todavía (el historial se completa unos 30 días por hora desde enero de 2025).</p>`;
  const total = tipos.reduce((s, [, n]) => s + n, 0);
  const leyes = (r.leyes || []).filter((x) => x.f.startsWith(mes));
  return `<p><b>${esc(nombreMes(mes))}:</b> ${total} publicaciones en el DOF.</p>
    <table class="tabla-inv"><tbody>${tipos.map(([t, n]) => `<tr><td>${esc(t)}</td><td class="num">${n}</td></tr>`).join("")}</tbody></table>
    <h4>Leyes, reformas y decretos del mes (${leyes.length})</h4>
    ${leyes.length ? `<ul class="lista-inv">${leyes.map((x) => `<li><span class="meta">${esc(x.f)} · ${esc(x.t)}${x.d ? ` · ${esc(x.d)}` : ""}</span><br>
      <a href="${esc(x.u)}" target="_blank" rel="noopener noreferrer">${esc(x.x)}</a></li>`).join("")}</ul>` : `<p class="meta">Ninguno ese mes.</p>`}`;
}

/** Leyes federales que contienen todas las palabras buscadas, de la reforma más reciente a la más antigua. */
export function buscarLeyes(d, q, max = 25) {
  const pal = norm(q).split(" ").filter(Boolean);
  return (d?.leyes || []).filter((l) => pal.every((p) => norm(l.n).includes(p))).slice(0, max);
}

export function htmlLeyes(d, res) {
  const anios = Object.entries(d?.por_anio || {}).slice(-10), max = Math.max(1, ...anios.map(([, n]) => n));
  return `<p class="meta">${(d?.leyes || []).length} leyes federales vigentes (Cámara de Diputados). Barras: cuántas tuvieron su <b>última</b> reforma en cada año.</p>
    <div class="barras-anio">${anios.map(([a, n]) => `<div title="${n} leyes con última reforma en ${a}"><span style="height:${Math.round((n / max) * 60) + 2}px"></span><b>${n}</b><i>${a}</i></div>`).join("")}</div>
    <ul class="lista-inv">${res.map((l) => `<li><a href="${esc(l.ref)}" target="_blank" rel="noopener noreferrer">${esc(l.n)}</a>
      <span class="meta">Publicada ${esc(l.pub)} · ${l.ult ? `última reforma ${esc(l.ult)}` : "sin reformas"}${l.pdf ? ` · <a href="${esc(l.pdf)}" target="_blank" rel="noopener noreferrer">texto vigente (PDF)</a>` : ""}</span></li>`).join("")}</ul>`;
}

/** Varios RFC o nombres (uno por renglón) contra el listado 69-B del SAT. */
export function verificarProveedores(datos, texto, max = 60) {
  return String(texto || "").split(/\n+/).map((x) => x.trim()).filter((x) => x.length >= 3).slice(0, max)
    .map((q) => ({ q, res: buscar69b(datos, q, 3) }));
}

export function htmlProveedores(filas, datos) {
  if (!filas.length) return `<p class="meta">Escribe al menos un RFC o nombre (uno por renglón).</p>`;
  const conHallazgo = filas.filter((f) => f.res.length).length;
  return `<p><b>${conHallazgo} de ${filas.length}</b> aparecen en el listado 69-B (corte del SAT: ${esc(datos?.corte_sat || "—")}).</p>
    <table class="tabla-inv"><thead><tr><th>Buscado</th><th>Resultado</th></tr></thead><tbody>${filas.map((f) => `<tr><td>${esc(f.q)}</td><td>${f.res.length
      ? f.res.map((r) => `<b>${esc(r.situacion)}</b> · ${esc(r.nombre)} <code>${esc(r.rfc)}</code>`).join("<br>") : `<span class="meta">sin coincidencia</span>`}</td></tr>`).join("")}</tbody></table>
    <p class="meta">«Presunto» o «Definitivo» es un foco rojo fuerte. No aparecer no garantiza nada: el listado solo incluye a quienes el SAT ya notificó.</p>`;
}

/** Focos rojos en contratación pública (OCDE, Open Contracting Partnership, IMCO y Transparencia Mexicana). */
export const FOCOS_CONTRATOS = [
  ["Adjudicación directa o invitación a tres en montos altos", "La ley prevé la licitación pública como regla; las excepciones deben justificarse por escrito."],
  ["Un solo participante en una licitación", "Puede indicar requisitos hechos a la medida o acuerdos entre competidores."],
  ["Plazos muy cortos entre la convocatoria y la entrega de propuestas", "Deja fuera a quien no conocía la licitación de antemano."],
  ["Montos justo debajo del límite que obliga a licitar", "Contratos fraccionados para evitar la licitación."],
  ["Proveedor recién creado o sin experiencia en el giro", "Revisa fecha de constitución, objeto social y domicilio."],
  ["Proveedor en el listado 69-B del SAT o sancionado", "Usa el verificador de arriba y el directorio de proveedores sancionados."],
  ["Convenios modificatorios que suben mucho el monto o el plazo", "El contrato real termina siendo otro."],
  ["Domicilio, teléfono o representante compartido entre «competidores»", "Señal de colusión o de empresas de un mismo grupo."],
  ["Pagos anticipados grandes sin avance verificable", "Riesgo de obra o servicio inexistente."],
];

/** Fuentes oficiales para poder político y declaraciones (se abren en su sitio). */
export const FUENTES_PODER = [
  ["Cámara de Diputados: integración por grupo parlamentario", "https://web.diputados.gob.mx/"],
  ["Senado de la República: senadores por grupo parlamentario", "https://www.senado.gob.mx/"],
  ["Sistema de Información Legislativa (SEGOB): iniciativas y votaciones", "https://sil.gobernacion.gob.mx/"],
  ["Gaceta Parlamentaria de la Cámara de Diputados", "https://gaceta.diputados.gob.mx/"],
  ["INE: resultados electorales y cómputos", "https://www.ine.mx/"],
  ["Organismos Públicos Locales Electorales (OPLE) de cada estado: gubernaturas y ayuntamientos", "https://www.ine.mx/voto-y-elecciones/oples/"],
  ["DeclaraNet: declaraciones públicas de servidores públicos federales", "https://declaranet.gob.mx/"],
  ["Plataforma Digital Nacional: declaraciones, sancionados y contrataciones", "https://www.plataformadigitalnacional.org/"],
  ["Compras MX (antes CompraNet): procedimientos de contratación federal", "https://comprasmx.buengobierno.gob.mx/"],
  ["Plataforma Nacional de Transparencia: solicitudes de información", "https://www.plataformadetransparencia.org.mx/"],
];

/** Guías: señales de lavado de dinero, empresas fantasma y nepotismo, con su base legal. */
export const GUIAS = [
  { titulo: "Lavado de dinero: señales de alerta", base: "LFPIORPI, Código Penal Federal (art. 400 Bis), Recomendaciones del GAFI",
    puntos: ["Operaciones en efectivo fraccionadas para no rebasar umbrales de aviso", "Empresas con ingresos que no corresponden a su tamaño, empleados o giro",
      "Cadenas de empresas y fideicomisos sin razón económica clara", "Compras de inmuebles, autos de lujo, joyas o arte pagadas con efectivo o por terceros",
      "Transferencias con jurisdicciones de alto riesgo (listas del GAFI)", "Beneficiario final oculto detrás de prestanombres"] },
  { titulo: "Empresas fantasma (facturación simulada)", base: "Código Fiscal de la Federación, art. 69-B; Ley Federal contra la Delincuencia Organizada (facturación falsa)",
    puntos: ["Domicilio fiscal inexistente, en casa habitación o compartido con muchas empresas", "Sin empleados registrados ni activos, pero con facturación alta",
      "Objeto social muy amplio («todo tipo de servicios»)", "Constituida hace poco y con contratos grandes de inmediato",
      "Mismos socios, representantes o contadores en varias empresas proveedoras", "Aparece en el listado 69-B del SAT (verifica arriba)"] },
  { titulo: "Nepotismo y conflicto de interés", base: "Ley General de Responsabilidades Administrativas (conflicto de interés y declaración de intereses); reglas de cada institución",
    puntos: ["Contratación de familiares en el área que dirige la persona servidora pública", "Contratos a empresas de familiares o socios de quien decide",
      "Intercambio de contrataciones entre funcionarios («te contrato a tu familiar y tú al mío»)", "Declaración de intereses incompleta o no presentada",
      "Fuentes para revisar: declaraciones públicas (DeclaraNet), contratos (Compras MX), registros de empresas y notas de prensa"],
    nota: "DOMINUS no cruza apellidos ni datos de personas de forma automática: un mismo apellido no prueba parentesco. Documenta cada vínculo con su fuente." },
];

export const htmlGuia = (g) => `<details class="guia-inv"><summary><b>${esc(g.titulo)}</b></summary><p class="meta">Base legal: ${esc(g.base)}</p>
  <ul>${g.puntos.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>${g.nota ? `<p class="meta">${esc(g.nota)}</p>` : ""}</details>`;
