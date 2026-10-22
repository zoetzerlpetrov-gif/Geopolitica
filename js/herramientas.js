// Interfaz de herramientas.html (caja del analista). La lógica está en herr-logica.js.
import { esc, safeUrl } from "./util.js";
import * as H from "./herr-logica.js";

const $ = (id) => document.getElementById(id);
const leer = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch (e) { return def; } };
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* modo privado */ } };
const descargar = (nombre, texto, tipo = "text/markdown") => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([texto], { type: tipo })); a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
const kv = (o) => `<dl class="kv">${Object.entries(o).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;
const alertasHtml = (a) => a.length ? a.map((x) => `<p class="${x.nivel}">${esc(x.texto)}</p>`).join("") : `<p class="ok">Sin señales de riesgo en lo revisado.</p>`;
const tam = (n) => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;

// ------------------------------------------------------------------ pestañas
document.querySelector(".pestanas").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-p]");
  if (!b) return;
  for (const x of document.querySelectorAll(".pestanas button")) x.setAttribute("aria-selected", String(x === b));
  for (const p of document.querySelectorAll(".panel")) p.hidden = p.id !== `p-${b.dataset.p}`;
  try { history.replaceState(null, "", `#${b.dataset.p}`); } catch (err) { /* nada */ }
});
const inicial = location.hash.slice(1);
if (inicial) document.querySelector(`.pestanas button[data-p="${CSS.escape(inicial)}"]`)?.click();

// ------------------------------------------------------------------ auditoría de archivos
const informes = [];
const MAX_TEXTO = 25 * 1048576;  // se analizan hasta 25 MB de contenido por archivo

async function auditar(f) {
  const bytes = new Uint8Array(await f.arrayBuffer());
  const firma = H.tipoPorFirma(bytes);
  const ext = H.extensionCoincide(f.name, firma.tipo);
  const [sha256, sha1] = await Promise.all([H.huella(bytes, "SHA-256"), H.huella(bytes, "SHA-1")]);
  const ent = H.entropia(bytes.slice(0, Math.min(bytes.length, 4 * 1048576)));
  const r = { nombre: f.name, tamano: f.size, tipo: firma.nombre, sha256, sha1, entropia: ent, modificado: f.lastModified ? new Date(f.lastModified).toISOString() : "",
    meta: {}, alertas: [], externos: [], ioc: null, detalle: "" };
  if (!ext.coincide) r.alertas.push({ nivel: "alto", texto: `La extensión «.${ext.ext}» no corresponde al contenido (${firma.nombre}). Es la técnica clásica para disfrazar un archivo.` });
  if (["exe", "elf", "macho"].includes(firma.tipo)) r.alertas.push({ nivel: "alto", texto: "Es un programa ejecutable: no lo abras si no conoces su origen. Puedes buscar su SHA-256 en VirusTotal (enlace abajo)." });
  const comprimidos = ["zip", "jpg", "png", "gif", "webp", "mp4", "mp3", "ogg", "rar", "7z", "gz", "pdf"];
  if (ent > 7.6 && !comprimidos.includes(firma.tipo)) r.alertas.push({ nivel: "medio", texto: `Entropía muy alta (${ent} de 8): el contenido parece cifrado o empaquetado.` });
  try {
    if (firma.tipo === "zip") {
      const entradas = H.leerZip(bytes);
      const interesa = entradas.filter((e) => /^docProps\/(core|app)\.xml$|^meta\.xml$|\.rels$|^xl\/workbook\.xml$|^word\/document\.xml$/.test(e.nombre) && e.tamano < 20 * 1048576);
      const textos = {};
      for (const e of interesa) { try { textos[e.nombre] = await H.textoZip(bytes, e); } catch (err) { /* parte no legible */ } }
      const o = H.analizarOffice(entradas, textos);
      Object.assign(r.meta, o.meta); r.alertas.push(...o.alertas); r.externos = o.externos;
      r.detalle = `${entradas.length} archivos dentro. ` + entradas.slice(0, 12).map((e) => e.nombre).join(", ") + (entradas.length > 12 ? "…" : "");
      const peligrosos = entradas.filter((e) => /\.(exe|scr|js|vbs|bat|cmd|ps1|lnk|hta|jar|msi|iso)$/i.test(e.nombre)).map((e) => e.nombre);
      if (peligrosos.length) r.alertas.push({ nivel: "alto", texto: `Dentro del ZIP hay archivos que se ejecutan: ${peligrosos.slice(0, 8).join(", ")}.` });
    } else if (firma.tipo === "pdf") {
      const texto = new TextDecoder("latin1").decode(bytes.slice(0, MAX_TEXTO));
      const p = H.analizarPdf(texto);
      Object.assign(r.meta, Object.fromEntries(Object.entries(p.meta).map(([k, v]) => [k, /Creado|Modificado/.test(k) ? H.fechaPdf(v) : v])));
      r.meta["Versión de PDF"] = p.version; r.meta["Páginas (aprox.)"] = String(p.paginas); r.alertas.push(...p.alertas); r.externos = p.urls;
    } else if (firma.tipo === "ole") {
      r.alertas.push({ nivel: "medio", texto: "Formato de Office anterior a 2007: puede traer macros sin que se note en la extensión. Ábrelo en vista protegida." });
      const t = new TextDecoder("latin1").decode(bytes.slice(0, MAX_TEXTO));
      if (/VBA|_VBA_PROJECT|Macros/.test(t)) r.alertas.push({ nivel: "alto", texto: "Se encontraron marcas de proyecto VBA: contiene macros." });
    }
    if (["texto", "pdf", "ole", "rtf"].includes(firma.tipo) || firma.tipo === "desconocido") {
      r.ioc = H.extraerIOC(new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, Math.min(bytes.length, 5 * 1048576))));
    }
  } catch (err) { r.alertas.push({ nivel: "bajo", texto: `No se pudo revisar por dentro: ${err.message}` }); }
  return r;
}

function htmlInforme(r) {
  const ioc = r.ioc ? Object.entries(r.ioc).filter(([, v]) => v.length) : [];
  return `<div class="tarjeta"><h3>${esc(r.nombre)}</h3>
    ${kv({ "Qué es": r.tipo, "Tamaño": tam(r.tamano), "Entropía (0–8)": String(r.entropia), "Fecha del archivo en tu equipo": r.modificado })}
    <p class="mono">SHA-256: ${esc(r.sha256)}<br>SHA-1: ${esc(r.sha1)}</p>
    ${alertasHtml(r.alertas)}
    ${Object.keys(r.meta).length ? `<h3>Metadatos</h3>${kv(r.meta)}<p class="meta">Los metadatos pueden revelar nombres, empresa y fechas internas. Antes de publicar un documento, quítalos (en Word: Archivo → Información → Inspeccionar documento).</p>` : ""}
    ${r.externos.length ? `<h3>Vínculos externos</h3><ul>${r.externos.slice(0, 30).map((u) => `<li class="mono">${esc(H.defang(u))}</li>`).join("")}</ul>` : ""}
    ${ioc.length ? `<h3>Indicadores dentro del archivo</h3>${kv(Object.fromEntries(ioc.map(([k, v]) => [k, v.slice(0, 15).map(H.defang).join(" · ") + (v.length > 15 ? ` (+${v.length - 15})` : "")])))}` : ""}
    ${r.detalle ? `<p class="meta">${esc(r.detalle)}</p>` : ""}
    <p class="meta">Buscar la huella en <a href="https://www.virustotal.com/gui/file/${r.sha256}" target="_blank" rel="noopener">VirusTotal</a> (solo se envía la huella, no el archivo).</p></div>`;
}

const mdInforme = (r) => `## ${r.nombre}\n\n- Tipo: ${r.tipo}\n- Tamaño: ${tam(r.tamano)}\n- SHA-256: \`${r.sha256}\`\n- SHA-1: \`${r.sha1}\`\n- Entropía: ${r.entropia}\n`
  + Object.entries(r.meta).map(([k, v]) => `- ${k}: ${v}`).join("\n") + "\n\n### Hallazgos\n\n"
  + (r.alertas.length ? r.alertas.map((a) => `- [${a.nivel}] ${a.texto}`).join("\n") : "- Sin señales de riesgo en lo revisado.") + "\n";

$("aud-archivos").addEventListener("change", async (e) => {
  const res = $("aud-res");
  res.innerHTML = `<p class="meta">Revisando ${e.target.files.length} archivo(s)…</p>`;
  informes.length = 0;
  for (const f of e.target.files) informes.push(await auditar(f));
  res.innerHTML = informes.map(htmlInforme).join("");
  $("aud-exportar").hidden = !informes.length;
});
$("aud-exportar").onclick = () => descargar(`auditoria-archivos-${new Date().toISOString().slice(0, 10)}.md`,
  `# Auditoría de archivos\n\nGenerado ${new Date().toISOString()} en el navegador (DOMINUS OSINT, caja del analista).\n\n` + informes.map(mdInforme).join("\n"));

// ------------------------------------------------------------------ informática
const ETIQ_IOC = { urls: "URL", dominios: "Dominios", ipv4: "IPv4", correos: "Correos", sha256: "SHA-256", sha1: "SHA-1", md5: "MD5", cve: "CVE", btc: "Bitcoin" };
$("ioc-btn").onclick = () => {
  const r = H.extraerIOC($("ioc-texto").value);
  const filas = Object.entries(r).filter(([, v]) => v.length);
  $("ioc-res").innerHTML = filas.length ? kv(Object.fromEntries(filas.map(([k, v]) => [`${ETIQ_IOC[k]} (${v.length})`, v.join("\n")])))
    + (r.cve.length ? `<p class="meta">CVE: ${r.cve.map((c) => `<a href="https://nvd.nist.gov/vuln/detail/${c}" target="_blank" rel="noopener">${c}</a>`).join(" · ")} · revisa si está en el
      <a href="https://www.cisa.gov/known-exploited-vulnerabilities-catalog" target="_blank" rel="noopener">catálogo KEV de CISA</a> (explotadas activamente).</p>` : "")
    : `<p class="meta">No se encontraron indicadores.</p>`;
};
$("ioc-defang").onclick = () => { $("ioc-texto").value = H.defang(H.refang($("ioc-texto").value)); };
$("ioc-refang").onclick = () => { $("ioc-texto").value = H.refang($("ioc-texto").value); };

$("enc-btn").onclick = () => {
  const r = H.analizarEncabezados($("enc-texto").value);
  const res = (v) => `${v}${v === "pass" ? " ✅" : ["fail", "softfail", "none", "permerror"].includes(v) ? " ⚠️" : ""}`;
  $("enc-res").innerHTML = kv({ "De": r.de, "Para": r.para, "Asunto": r.asunto, "Fecha": r.fecha, "Return-Path": r.returnPath, "Reply-To": r.replyTo, "SPF": res(r.spf), "DKIM": res(r.dkim), "DMARC": res(r.dmarc) })
    + (r.alertas.length ? r.alertas.map((a) => `<p class="alto">${esc(a)}</p>`).join("") : `<p class="ok">Sin discrepancias evidentes. Aun así, no abras enlaces ni adjuntos si no esperabas el correo.</p>`)
    + (r.recibidos.length ? `<h3>Ruta del correo (del origen al destino)</h3><div class="desliza"><table class="t"><tr><th>#</th><th>Desde</th><th>Recibido por</th><th>IP</th><th>Fecha</th></tr>
      ${r.recibidos.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.de)}</td><td>${esc(x.por)}</td><td class="mono">${esc(x.ip)}</td><td>${esc(x.fecha)}</td></tr>`).join("")}</table></div>` : "");
};

$("dns-btn").onclick = async () => {
  const d = $("dns-dominio").value.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  const out = $("dns-res");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) { out.innerHTML = `<p class="medio">Escribe solo el dominio, por ejemplo «gob.mx».</p>`; return; }
  out.innerHTML = `<p class="meta">Consultando dns.google…</p>`;
  const q = async (nombre, tipo) => H.leerDoH(await (await fetch(`https://dns.google/resolve?name=${encodeURIComponent(nombre)}&type=${tipo}`)).json());
  try {
    const tipos = ["A", "AAAA", "MX", "NS", "TXT", "CAA"];
    const r = await Promise.all(tipos.map((t) => q(d, t)));
    const dmarc = await q(`_dmarc.${d}`, "TXT");
    const correo = H.revisarCorreoDominio(r[4].map((x) => x.valor), dmarc.map((x) => x.valor));
    out.innerHTML = `<div class="desliza"><table class="t"><tr><th>Tipo</th><th>Valor</th><th>TTL (s)</th></tr>${tipos.flatMap((t, i) => r[i].filter((x) => x.tipo === t))
      .map((x) => `<tr><td>${x.tipo}</td><td class="mono">${esc(x.valor)}</td><td>${x.ttl}</td></tr>`).join("") || `<tr><td colspan="3">Sin registros (¿existe el dominio?)</td></tr>`}</table></div>
      <h3>Protección contra suplantación de correo</h3>${kv({ "SPF": correo.spf || "—", "DMARC": correo.dmarc || "—" })}
      ${correo.hallazgos.length ? correo.hallazgos.map((h) => `<p class="medio">${esc(h)}</p>`).join("") : `<p class="ok">SPF y DMARC con política que rechaza o pone en cuarentena.</p>`}
      <p class="meta">Más: <a href="https://crt.sh/?q=${encodeURIComponent(d)}" target="_blank" rel="noopener">certificados emitidos (crt.sh)</a> ·
        <a href="https://rdap.org/domain/${encodeURIComponent(d)}" target="_blank" rel="noopener">registro del dominio (RDAP)</a> ·
        <a href="https://securityheaders.com/?q=${encodeURIComponent(d)}&hide=on" target="_blank" rel="noopener">encabezados de seguridad del sitio</a> ·
        <a href="https://web.archive.org/web/*/${encodeURIComponent(d)}" target="_blank" rel="noopener">versiones anteriores (Internet Archive)</a></p>`;
  } catch (err) { out.innerHTML = `<p class="medio">No se pudo consultar: ${esc(err.message)}</p>`; }
};

document.querySelector(".tarjeta [data-cod]").parentElement.addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-cod]");
  if (!b) return;
  const t = $("cod-texto").value, out = $("cod-res");
  try {
    const k = b.dataset.cod;
    if (k.startsWith("sha")) out.textContent = await H.huella(t, { sha256: "SHA-256", sha1: "SHA-1", sha512: "SHA-512" }[k]);
    else if (k === "b64") out.textContent = H.base64.codificar(t);
    else if (k === "deb64") out.textContent = H.base64.decodificar(t);
    else if (k === "url") out.textContent = decodeURIComponent(t.replace(/\+/g, " "));
    else if (k === "jwt") { const j = H.decodificarJWT(t); out.innerHTML = `<pre>${esc(JSON.stringify(j.cab, null, 2))}\n${esc(JSON.stringify(j.carga, null, 2))}</pre>${j.avisos.map((a) => `<p class="medio">${esc(a)}</p>`).join("")}<p class="meta">La firma no se verifica: eso requiere la llave del emisor.</p>`; }
  } catch (err) { out.textContent = `No se pudo: ${err.message}`; }
});

const ENLACES_TI = [
  ["Catálogo KEV de CISA (vulnerabilidades explotadas)", "https://www.cisa.gov/known-exploited-vulnerabilities-catalog"],
  ["NVD (base nacional de vulnerabilidades de EUA)", "https://nvd.nist.gov/vuln/search"],
  ["MITRE ATT&CK (tácticas y técnicas de atacantes)", "https://attack.mitre.org/"],
  ["VirusTotal (archivos, URL, dominios, IP)", "https://www.virustotal.com/"],
  ["AbuseIPDB (reputación de una IP)", "https://www.abuseipdb.com/"],
  ["URLhaus (URL de malware, abuse.ch)", "https://urlhaus.abuse.ch/"],
  ["Shodan (equipos expuestos a internet)", "https://www.shodan.io/"],
  ["CERT-MX / Guardia Nacional: reporte de incidentes", "https://www.gob.mx/gncertmx"],
  ["CyberChef (navaja suiza de conversión de datos, GCHQ)", "https://gchq.github.io/CyberChef/"],
];
$("enlaces-ti").innerHTML = ENLACES_TI.map(([n, u]) => `<li><a href="${esc(safeUrl(u))}" target="_blank" rel="noopener">${esc(n)}</a></li>`).join("");

// ------------------------------------------------------------------ análisis: ICD 203
$("icd-tabla").innerHTML = `<tr><th>Rango</th><th>Término en español</th><th>Término oficial (inglés)</th></tr>` + H.ICD203.map((r) => `<tr data-min="${r.min}"><td>${r.min}–${r.max} %</td><td>${r.es}</td><td>${r.en}</td></tr>`).join("");
const pintarICD = () => {
  const p = Number($("icd-pct").value), t = H.terminoICD(p);
  $("icd-txt").textContent = `${p} % → «${t.es}»`;
  for (const tr of $("icd-tabla").querySelectorAll("tr[data-min]")) tr.style.fontWeight = Number(tr.dataset.min) === t.min ? "700" : "";
};
$("icd-pct").oninput = pintarICD; pintarICD();

// ------------------------------------------------------------------ ACH
let ach = leer("gp_ach", { h: ["Hipótesis 1", "Hipótesis 2"], e: [{ t: "Evidencia 1", peso: 1, celdas: ["N", "N"] }] });
const OPC = ["CC", "C", "N", "I", "II"];
function pintarACH() {
  guardar("gp_ach", ach);
  $("ach-tabla").innerHTML = `<tr><th>Evidencia</th><th>Peso</th>${ach.h.map((h, j) => `<th><input type="text" data-h="${j}" value="${esc(h)}" aria-label="Hipótesis ${j + 1}"></th>`).join("")}<th></th></tr>`
    + ach.e.map((e, i) => `<tr><td><input type="text" data-et="${i}" value="${esc(e.t)}" aria-label="Evidencia ${i + 1}">${H.diagnostica(e, ach.h.length) ? "" : `<span class="meta"> (no diagnóstica)</span>`}</td>
      <td><select data-ep="${i}">${[1, 2, 3].map((p) => `<option ${Number(e.peso) === p ? "selected" : ""}>${p}</option>`).join("")}</select></td>
      ${ach.h.map((_, j) => `<td><select data-ec="${i}-${j}">${OPC.map((o) => `<option ${e.celdas[j] === o ? "selected" : ""}>${o}</option>`).join("")}</select></td>`).join("")}
      <td><button type="button" class="btn" data-ex="${i}" aria-label="Quitar evidencia">×</button></td></tr>`).join("");
  const r = H.puntuarACH(ach.h, ach.e);
  $("ach-res").innerHTML = `<p>Menos inconsistente (más sostenible): <b>${esc(r[0]?.hipotesis || "")}</b></p><ol>${r.map((x) => `<li>${esc(x.hipotesis)}: ${x.inconsistencia} puntos en contra</li>`).join("")}</ol>
    <p class="meta">Siguiente paso del método: revisa qué evidencia, si fuera falsa, cambiaría el resultado (sensibilidad) y define indicadores para vigilar.</p>`;
}
$("ach-tabla").addEventListener("change", (e) => {
  const d = e.target.dataset;
  if (d.h !== undefined) ach.h[d.h] = e.target.value;
  if (d.et !== undefined) ach.e[d.et].t = e.target.value;
  if (d.ep !== undefined) ach.e[d.ep].peso = Number(e.target.value);
  if (d.ec !== undefined) { const [i, j] = d.ec.split("-").map(Number); ach.e[i].celdas[j] = e.target.value; }
  pintarACH();
});
$("ach-tabla").addEventListener("click", (e) => { const x = e.target.closest("[data-ex]"); if (x) { ach.e.splice(Number(x.dataset.ex), 1); pintarACH(); } });
$("ach-h").onclick = () => { ach.h.push(`Hipótesis ${ach.h.length + 1}`); ach.e.forEach((e) => e.celdas.push("N")); pintarACH(); };
$("ach-e").onclick = () => { ach.e.push({ t: `Evidencia ${ach.e.length + 1}`, peso: 1, celdas: ach.h.map(() => "N") }); pintarACH(); };
$("ach-limpiar").onclick = () => { if (confirm("¿Vaciar la matriz ACH?")) { ach = { h: ["Hipótesis 1", "Hipótesis 2"], e: [] }; pintarACH(); } };
$("ach-md").onclick = async () => {
  const md = `| Evidencia | Peso | ${ach.h.join(" | ")} |\n|---|---|${ach.h.map(() => "---").join("|")}|\n` + ach.e.map((e) => `| ${e.t} | ${e.peso} | ${e.celdas.join(" | ")} |`).join("\n")
    + "\n\n" + H.puntuarACH(ach.h, ach.e).map((x, i) => `${i + 1}. ${x.hipotesis}: ${x.inconsistencia}`).join("\n");
  try { await navigator.clipboard.writeText(md); $("ach-res").insertAdjacentHTML("beforeend", `<p class="ok">Copiado.</p>`); } catch (err) { descargar("ach.md", md); }
};
pintarACH();

$("escala").innerHTML = `<div class="desliza"><table class="t"><tr><th colspan="2">Fuente</th><th colspan="2">Información</th></tr>${Object.keys(H.ESCALA_FUENTE).map((k, i) =>
  `<tr><td><b>${k}</b></td><td>${H.ESCALA_FUENTE[k]}</td><td><b>${i + 1}</b></td><td>${H.ESCALA_INFO[i + 1]}</td></tr>`).join("")}</table></div>
  <p class="meta">Se califican por separado: una fuente confiable (A) puede pasar un dato dudoso (4) → «A4». Úsalo en cada nota de tu cuaderno.</p>`;

// ------------------------------------------------------------------ CARVER
let carver = leer("gp_carver", [{ nombre: "Centro de datos principal", C: 9, A: 4, R: 7, V: 5, E: 6, R2: 6 }]);
function pintarCARVER() {
  guardar("gp_carver", carver);
  const orden = H.puntuarCARVER(carver);
  $("carver-tabla").innerHTML = `<tr><th>Activo</th>${H.CRITERIOS_CARVER.map(([k, n, q]) => `<th title="${esc(q)}">${n}</th>`).join("")}<th>Total</th><th>Prioridad</th><th></th></tr>`
    + carver.map((a, i) => `<tr><td><input type="text" data-cn="${i}" value="${esc(a.nombre)}" aria-label="Activo"></td>
      ${H.CRITERIOS_CARVER.map(([k]) => `<td><input type="number" min="1" max="10" data-cv="${i}-${k}" value="${Number(a[k]) || 1}" aria-label="${k}"></td>`).join("")}
      <td><b>${orden.find((o) => o.nombre === a.nombre)?.total ?? ""}</b></td><td>${orden.findIndex((o) => o.nombre === a.nombre) + 1}</td>
      <td><button type="button" class="btn" data-cx="${i}" aria-label="Quitar">×</button></td></tr>`).join("");
}
$("carver-tabla").addEventListener("change", (e) => {
  const d = e.target.dataset;
  if (d.cn !== undefined) carver[d.cn].nombre = e.target.value;
  if (d.cv !== undefined) { const [i, k] = d.cv.split("-"); carver[i][k] = Number(e.target.value); }
  pintarCARVER();
});
$("carver-tabla").addEventListener("click", (e) => { const x = e.target.closest("[data-cx]"); if (x) { carver.splice(Number(x.dataset.cx), 1); pintarCARVER(); } });
$("carver-mas").onclick = () => { carver.push({ nombre: `Activo ${carver.length + 1}` }); pintarCARVER(); };
pintarCARVER();

// ------------------------------------------------------------------ actores
let actores = leer("gp_actores", [{ nombre: "Regulador del sector", poder: 5, interes: 4, postura: "Neutral" }]);
function pintarActores() {
  guardar("gp_actores", actores);
  $("act-tabla").innerHTML = `<tr><th>Actor</th><th>Poder (1–5)</th><th>Interés (1–5)</th><th>Postura</th><th>Estrategia</th><th></th></tr>`
    + actores.map((a, i) => `<tr><td><input type="text" data-an="${i}" value="${esc(a.nombre)}" aria-label="Actor"></td>
      <td><input type="number" min="1" max="5" data-ap="${i}" value="${a.poder}"></td><td><input type="number" min="1" max="5" data-ai="${i}" value="${a.interes}"></td>
      <td><select data-as="${i}">${["Aliado", "Neutral", "Opositor"].map((p) => `<option ${a.postura === p ? "selected" : ""}>${p}</option>`).join("")}</select></td>
      <td>${H.cuadranteActor(a.poder, a.interes)}</td><td><button type="button" class="btn" data-ax="${i}" aria-label="Quitar">×</button></td></tr>`).join("");
}
$("act-tabla").addEventListener("change", (e) => {
  const d = e.target.dataset;
  if (d.an !== undefined) actores[d.an].nombre = e.target.value;
  if (d.ap !== undefined) actores[d.ap].poder = Number(e.target.value);
  if (d.ai !== undefined) actores[d.ai].interes = Number(e.target.value);
  if (d.as !== undefined) actores[d.as].postura = e.target.value;
  pintarActores();
});
$("act-tabla").addEventListener("click", (e) => { const x = e.target.closest("[data-ax]"); if (x) { actores.splice(Number(x.dataset.ax), 1); pintarActores(); } });
$("act-mas").onclick = () => { actores.push({ nombre: `Actor ${actores.length + 1}`, poder: 3, interes: 3, postura: "Neutral" }); pintarActores(); };
pintarActores();

// ------------------------------------------------------------------ marcos
const sel = $("marco-sel");
sel.innerHTML = Object.entries(H.MARCOS).map(([k, m]) => `<option value="${k}">${esc(m.nombre)}</option>`).join("");
let marcos = leer("gp_marcos", {});
function pintarMarco() {
  const id = sel.value, m = H.MARCOS[id], v = marcos[id] || { titulo: "", campos: [] };
  $("marco-uso").textContent = m.uso;
  $("marco-titulo").value = v.titulo || "";
  $("marco-campos").innerHTML = m.campos.map(([c, q], i) => `<label class="tarjeta" style="display:block"><b>${esc(c)}</b><br><span class="meta">${esc(q)}</span>
    <textarea data-mc="${i}">${esc(v.campos[i] || "")}</textarea></label>`).join("");
}
const guardarMarco = () => {
  marcos[sel.value] = { titulo: $("marco-titulo").value, campos: [...document.querySelectorAll("[data-mc]")].map((t) => t.value) };
  guardar("gp_marcos", marcos);
};
sel.onchange = pintarMarco;
$("marco-campos").addEventListener("input", guardarMarco);
$("marco-titulo").addEventListener("input", guardarMarco);
$("marco-md").onclick = () => { guardarMarco(); const v = marcos[sel.value]; descargar(`${sel.value}.md`, H.marcoAMarkdown(sel.value, v.campos, v.titulo)); };
$("marco-limpiar").onclick = () => { if (confirm("¿Vaciar esta plantilla?")) { delete marcos[sel.value]; guardar("gp_marcos", marcos); pintarMarco(); } };
pintarMarco();
