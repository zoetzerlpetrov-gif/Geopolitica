// Interfaz de herramientas.html (caja del analista). La lógica está en herr-logica.js.
import { esc, safeUrl, activarLimpiar } from "./util.js";
activarLimpiar();
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
  $("aud-exportar").hidden = $("aud-quitar").hidden = !informes.length;
});
// Quita los resultados de la pantalla; los archivos solo se leyeron en memoria, no se guardaron.
$("aud-quitar").onclick = () => {
  informes.length = 0;
  $("aud-res").innerHTML = "";
  $("aud-archivos").value = "";
  $("aud-exportar").hidden = $("aud-quitar").hidden = true;
};
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
$("ach-ia").onclick = async () => {
  const C = await import("./chat_ia.js");
  const out = $("ach-ia-res"); out.hidden = false;
  const k = C.leerLlave()?.llave;
  if (!k) { out.textContent = "Primero guarda tu llave de Groq en el mapa: menú Herramientas → «Preguntar a la IA sobre las noticias»."; return; }
  const q = $("ach-pregunta").value.trim();
  if (!q) { out.textContent = "Escribe primero la pregunta de inteligencia."; return; }
  out.textContent = "Pensando…";
  const prompt = `Pregunta de inteligencia: ${q}\nHipótesis actuales: ${ach.h.join("; ")}\nPropón en español: 1) de 4 a 6 hipótesis mutuamente excluyentes (incluye una «nula» y una que nadie haya considerado), `
    + `2) 6 a 10 evidencias o indicadores que ayudarían a distinguirlas, indicando para cada una qué hipótesis la contradiría, 3) qué supuesto clave conviene revisar. `
    + `Formato: listas numeradas cortas. No afirmes hechos sobre el caso: son propuestas para investigar.`;
  try {
    await C.completar([{ role: "system", content: "Eres analista de inteligencia formado en técnicas analíticas estructuradas (Heuer y Pherson)." }, { role: "user", content: prompt }], k,
      { onTexto: (t) => { out.textContent = t; } });
  } catch (e) { out.textContent = C.mensajeError(e); }
};

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

// ------------------------------------------------------------------ bitácora normativa (carga compartida)
// La usan Normativa (avisos por ley), Auditorías (avisos por sector), la pestaña Bitácora y la Simulación de escenarios.
const jsonO = (u, def) => fetch(u).then((r) => (r.ok ? r.json() : def)).catch(() => def);
let BIT = { entradas: [], estado: null, generado: null };
const bitacoraP = Promise.all([jsonO("data/normativa/bitacora.json", { entradas: [] }), jsonO("config/normativa/bitacora_notas.json", {}), jsonO("data/normativa/estado.json", null)])
  .then(([b, n, e]) => (BIT = { entradas: H.conNotas(b.entradas || [], n), estado: e, generado: b.generado_utc }));
const COLOR_IMP = { alto: "#B71C1C", medio: "#E2711D", bajo: "#607D8B" };
const chipImp = (i) => `<span style="display:inline-block;padding:1px 8px;border-radius:10px;background:${COLOR_IMP[i] || "#607D8B"};color:#fff;font-size:.8em">${esc(H.IMPACTOS[i] || i)}</span>`;
/** Abre la pestaña Bitácora con filtros. */
function irABitacora({ pais = "", sector = "", ley = "", q = "", dias = "90", impacto = "am" } = {}) {
  const fijar = (id, v) => { const el = $(id); if (el && [...(el.options || [])].some((o) => o.value === v)) el.value = v; };
  fijar("bit-pais", pais); fijar("bit-sector", sector); fijar("bit-dias", String(dias)); fijar("bit-impacto", impacto);
  $("bit-q").value = q; $("bit-q").dataset.ley = ley;
  document.querySelector('.pestanas button[data-p="bitacora"]')?.click();
  document.dispatchEvent(new CustomEvent("bitacora:pintar"));
}

// ------------------------------------------------------------------ plantillas de auditoría
const audSel = $("aud-sector");
let audCfg = null;
const clave = () => `gp_aud_${audSel.value}`;
const audDatos = () => leer(clave(), { respuestas: {} });
const SEM = { verde: "#2E7D32", amarillo: "#F9A825", rojo: "#B71C1C", "sin evaluar": "var(--line)" };

function pintarResumenAud() {
  const d = audDatos(), areas = H.areasDe(audCfg, audSel.value);
  const total = H.cumplimiento(areas.flatMap((a) => a.controles.map((c) => d.respuestas[c.id]?.estado)));
  const hechos = areas.reduce((n, a) => n + a.controles.filter((c) => d.respuestas[c.id]?.estado).length, 0), todos = areas.reduce((n, a) => n + a.controles.length, 0);
  $("aud-resumen").innerHTML = `<p><b>Cumplimiento global: ${total == null ? "sin evaluar" : total + " %"}</b> · ${hechos} de ${todos} controles calificados</p>
    <div class="desliza"><table class="t"><tr><th>Área</th><th>Cumplimiento</th></tr>${areas.map((a) => {
      const p = H.cumplimiento(a.controles.map((c) => d.respuestas[c.id]?.estado));
      return `<tr><td>${esc(a.area)}</td><td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${SEM[H.semaforo(p)]}"></span> ${p == null ? "—" : p + " %"}</td></tr>`;
    }).join("")}</table></div>`;
}

function pintarAud() {
  const s = audCfg.sectores[audSel.value], d = audDatos(), est = audCfg.metodo.estados;
  for (const k of ["empresa", "alcance", "auditor", "fecha"]) $(`aud-${k}`).value = d[k] || "";
  $("aud-metodo").innerHTML = `<ol>${audCfg.metodo.fases.map(([f, t]) => `<li><b>${esc(f.replace(/^\d+\.\s*/, ""))}:</b> ${esc(t)}</li>`).join("")}</ol>
    <h3>Normas y estándares</h3><ul>${s.normas.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
    <p><b>Reguladores en México:</b> ${esc(s.reguladores_mx.join(", "))}<br><b>Internacionales:</b> ${esc(s.reguladores_int.join(", "))}</p>
    <p class="meta">${esc(audCfg.descripcion)}</p>`;
  $("aud-areas").innerHTML = H.areasDe(audCfg, audSel.value).map((a) => `<details class="tarjeta"><summary><b>${esc(a.area)}</b> <span class="meta">(${a.controles.length})</span></summary>
    ${a.controles.map((c) => { const r = d.respuestas[c.id] || {}; return `<div class="tarjeta" data-ctl="${c.id}">
      <p><b>${esc(c.c)}</b></p><p class="meta">Evidencia a pedir: ${esc(c.e)}<br>Referencia: ${esc(c.r)}</p>
      <div class="barra"><select data-k="estado" aria-label="Resultado"><option value="">— sin calificar —</option>${Object.entries(est).map(([k, v]) => `<option value="${k}" ${r.estado === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      <textarea data-k="nota" placeholder="Qué se encontró (condición) y por qué importa (efecto)" aria-label="Hallazgo">${esc(r.nota || "")}</textarea>
      <input type="text" data-k="evidencia" placeholder="Evidencia revisada (documento, muestra, entrevista)" value="${esc(r.evidencia || "")}" aria-label="Evidencia revisada"></div>`; }).join("")}</details>`).join("");
  pintarResumenAud();
  pintarCambiosAud();
}

function pintarCambiosAud() {
  const sel = H.filtrarBitacora(BIT.entradas, { sector: audSel.value, impacto: "am", dias: 90 });
  $("aud-cambios").innerHTML = sel.length ? `<div class="tarjeta"><p><b>🆕 ${sel.length} cambios normativos en los últimos 90 días tocan este sector</b>
    (${sel.filter((e) => e.impacto === "alto").length} de impacto alto). Revisa si cambian los controles, la evidencia o las preguntas antes de calificar.</p>
    <ul>${sel.slice(0, 5).map((e) => `<li>${chipImp(e.impacto)} ${esc(e.fecha)} · ${esc(e.pais)} · <a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.titulo.slice(0, 140))}</a></li>`).join("")}</ul>
    <button type="button" id="aud-ver-bit">Ver todos en la Bitácora normativa</button></div>` : "";
  $("aud-ver-bit")?.addEventListener("click", () => irABitacora({ sector: audSel.value }));
}
bitacoraP.then(() => { if (audCfg) pintarCambiosAud(); });

function guardarAud(e) {
  const d = audDatos();
  const ctl = e.target.closest("[data-ctl]");
  if (ctl) { const r = d.respuestas[ctl.dataset.ctl] ||= {}; r[e.target.dataset.k] = e.target.value; }
  for (const k of ["empresa", "alcance", "auditor", "fecha"]) d[k] = $(`aud-${k}`).value;
  guardar(clave(), d);
  if (!ctl || e.target.dataset.k === "estado") pintarResumenAud();
}

fetch("config/auditorias.json").then((r) => r.json()).then((cfg) => {
  audCfg = cfg;
  audSel.innerHTML = Object.entries(cfg.sectores).map(([k, s]) => `<option value="${k}">${esc(s.nombre)}</option>`).join("");
  audSel.onchange = pintarAud;
  $("p-auditorias").addEventListener("change", (e) => { if (e.target !== audSel) guardarAud(e); });
  $("p-auditorias").addEventListener("input", (e) => { if (e.target.matches("textarea, input[type=text]")) guardarAud(e); });
  $("aud-informe").onclick = () => descargar(`auditoria-${audSel.value}-${new Date().toISOString().slice(0, 10)}.md`, H.informeAuditoria(audCfg, audSel.value, audDatos()));
  $("aud-vaciar").onclick = () => { if (confirm("¿Vaciar todas las respuestas de este sector?")) { try { localStorage.removeItem(clave()); } catch (err) { /* nada */ } pintarAud(); } };
  pintarAud();
}).catch(() => { $("aud-areas").innerHTML = `<p class="medio">No se pudo cargar config/auditorias.json.</p>`; });

// ------------------------------------------------------------------ nube y seguridad
let nube = leer("gp_nube", {});
const RESP_N = [["si", "Sí"], ["parcial", "Parcial"], ["no", "No"], ["na", "No aplica"]];
function pintarNube() {
  guardar("gp_nube", nube);
  const p = H.puntajeCSF(nube);
  $("nube-res").innerHTML = `<div class="desliza"><table class="t"><tr>${Object.values(H.FUNCIONES_CSF).map((f) => `<th>${f}</th>`).join("")}</tr><tr>${Object.keys(H.FUNCIONES_CSF).map((k) =>
    `<td class="${p[k] == null ? "" : p[k] >= 80 ? "ok" : p[k] >= 50 ? "bajo" : "alto"}">${p[k] == null ? "—" : `${p[k]} %`}</td>`).join("")}</tr></table></div>
    <p class="meta">${Object.keys(nube).length} de ${H.CONTROLES_NUBE.length} controles respondidos. Prioriza los «No» de Proteger y Detectar: son los que más incidentes evitan.</p>`;
}
$("nube-ctl").innerHTML = Object.entries(H.FUNCIONES_CSF).map(([k, nombre]) => `<details class="tarjeta plegable"><summary><b>${k} · ${nombre}</b></summary>${H.CONTROLES_NUBE.map(([f, c, r], i) => f !== k ? "" :
  `<div class="barra" style="justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:6px"><span style="flex:1 1 360px">${esc(c)}<br><span class="meta">${esc(r)}</span></span>
   <select data-nube="${i}" aria-label="Respuesta"><option value="">—</option>${RESP_N.map(([v, n]) => `<option value="${v}" ${nube[i] === v ? "selected" : ""}>${n}</option>`).join("")}</select></div>`).join("")}</details>`).join("");
$("nube-ctl").addEventListener("change", (e) => { const i = e.target.dataset.nube; if (i === undefined) return; if (e.target.value) nube[i] = e.target.value; else delete nube[i]; pintarNube(); });
$("nube-resp").innerHTML = `<tr><th>Capa</th><th>IaaS (máquinas virtuales)</th><th>PaaS (plataforma)</th><th>SaaS (aplicación lista)</th></tr>` + H.RESPONSABILIDAD.map((r) => `<tr>${r.map((x, j) => `<td${j ? ` class="${x === "Cliente" ? "medio" : x === "Compartida" ? "bajo" : "ok"}"` : ""}>${esc(x)}</td>`).join("")}</tr>`).join("");
$("nube-md").onclick = () => {
  const p = H.puntajeCSF(nube), n = Object.fromEntries(RESP_N);
  descargar("autoevaluacion-nube.md", `# Autoevaluación de seguridad en la nube\n\nFecha: ${new Date().toISOString().slice(0, 10)}\n\n| Función (NIST CSF 2.0) | Cumplimiento |\n|---|---|\n`
    + Object.entries(H.FUNCIONES_CSF).map(([k, f]) => `| ${f} | ${p[k] == null ? "—" : p[k] + " %"} |`).join("\n")
    + `\n\n## Controles\n\n${H.CONTROLES_NUBE.map(([f, c, r], i) => `- [${n[nube[i]] || "sin responder"}] (${f}) ${c} _${r}_`).join("\n")}\n`);
};
$("nube-vaciar").onclick = () => { if (confirm("¿Vaciar la autoevaluación?")) { nube = {}; for (const s of document.querySelectorAll("[data-nube]")) s.value = ""; pintarNube(); } };
pintarNube();

// ------------------------------------------------------------------ normativa por jurisdicción
{
  const normas = {}, cargando = {}, ESTADOS = { cumple: "Cumple", parcial: "Cumple parcialmente", no: "No cumple", na: "No aplica" };
  // Cada catálogo se descarga solo cuando se elige su jurisdicción (son 21; México suma sus sectores adicionales).
  const cargarNorma = (iso) => (cargando[iso] ||= fetch(`config/normativa/${iso}.json`).then((r) => (r.ok ? r.json() : null)).then(async (n) => {
    if (n && iso === "MEX") {
      const x = await fetch("config/normativa/MEX_sectores.json").then((r) => r.json()).catch(() => null);
      if (x?.sectores) n.sectores = { ...n.sectores, ...x.sectores };
    }
    normas[iso] = n;
    return n;
  }).catch(() => null));
  const disponibles = H.JURISDICCIONES;
  await cargarNorma("MEX");
  const claveN = () => `gp_norma_${$("nor-jur").value}`;
  const resp = () => leer(claveN(), {});
  let actuales = [];
  $("nor-jur").innerHTML = disponibles.map(([i, n]) => `<option value="${i}">${n}</option>`).join("");
  const sectores = await (await fetch("config/auditorias.json")).json().then((c) => c.sectores).catch(() => ({}));
  const pintarSectoresN = () => {
    const v = $("nor-sector").value;
    $("nor-sector").innerHTML = `<option value="">Solo generales (toda empresa)</option>`
      + H.sectoresOrdenados(sectores, normas[$("nor-jur").value]?.sectores || {}).map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join("");
    if ([...$("nor-sector").options].some((o) => o.value === v)) $("nor-sector").value = v;
  };
  pintarSectoresN();
  const SEMN = { verde: "#2E7D32", amarillo: "#F9A825", rojo: "#B71C1C", "sin evaluar": "var(--line)" };
  function resumenN() {
    const c = H.cumplimientoNormativa($("nor-jur").value, actuales, resp());
    const nPreg = actuales.reduce((n, x) => n + (x.ley.preguntas || []).length, 0);
    $("nor-resumen").innerHTML = `<p><b>${actuales.length} leyes y normas · ${nPreg} preguntas · cumplimiento ${c.global == null ? "sin evaluar" : c.global + " %"}</b></p>
      <div class="desliza"><table class="t"><tr><th>Área</th><th>Preguntas</th><th>Cumplimiento</th></tr>${c.areas.map((a) => `<tr><td>${esc(a.area)}</td><td>${a.n}</td><td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${SEMN[H.semaforo(a.pct)]}"></span> ${a.pct == null ? "—" : a.pct + " %"}</td></tr>`).join("")}</table></div>`;
  }
  function pintarN() {
    const jur = $("nor-jur").value, n = normas[jur];
    if (!n) { $("nor-leyes").innerHTML = `<p class="meta">Esta jurisdicción aún no está disponible.</p>`; return; }
    actuales = H.leyesDe(n, $("nor-sector").value, $("nor-q").value);
    const sinSector = $("nor-sector").value && !n.sectores?.[$("nor-sector").value];
    const alertas = H.alertasPorLey(BIT.entradas, jur, 90);
    const recientes = H.filtrarBitacora(BIT.entradas, { pais: jur, impacto: "am", dias: 30 });
    $("nor-alertas").innerHTML = recientes.length ? `<div class="tarjeta"><p><b>🆕 ${recientes.length} cambios normativos en los últimos 30 días en esta jurisdicción</b>
      (${recientes.filter((e) => e.impacto === "alto").length} de impacto alto). Las leyes afectadas llevan la marca 🆕.</p>
      <button type="button" data-bit-pais="${esc(jur)}">Ver la Bitácora normativa de esta jurisdicción</button></div>` : "";
    const r = resp();
    const lista = (xs) => (xs || []).length ? `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
    let areaPrev = "";
    $("nor-leyes").innerHTML = actuales.map(({ area, ley: l }) => {
      const tit = area !== areaPrev ? `<h3>${esc(area)}</h3>` : ""; areaPrev = area;
      const al = alertas[l.id] || [];
      return `${tit}<details class="tarjeta"><summary><b>${esc(l.sigla ? `${l.sigla} — ` : "")}${esc(l.nombre)}</b> <span class="meta">${esc(l.tipo || "")} · ${esc(l.autoridad || "")}</span>${al.length ? ` <span title="Cambios en la bitácora (90 días)">🆕 ${al.length}</span>` : ""}</summary>
        ${al.length ? `<div class="tarjeta"><b>Cambios recientes que la tocan (bitácora, 90 días)</b><ul>${al.slice(0, 5).map((e) => `<li>${chipImp(e.impacto)} ${esc(e.fecha)} · <a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.titulo.slice(0, 150))}</a></li>`).join("")}</ul>
          <button type="button" data-bit-ley="${esc(l.id)}" data-bit-pais="${esc(jur)}">Ver en la Bitácora normativa</button></div>` : ""}
        <p><b>A quién aplica:</b> ${esc(l.aplica || "")}</p>
        <p class="meta">Última reforma: ${esc(l.ultima_reforma || "verificar")}${l.url ? ` · <a href="${esc(l.url)}" target="_blank" rel="noopener">texto oficial</a>` : ""}</p>
        <b>Obligaciones</b>${lista(l.obligaciones)}
        ${(l.tramites || []).length ? `<b>Trámites y reportes</b><div class="desliza"><table class="t"><tr><th>Qué</th><th>Plazo</th><th>Ante</th></tr>${l.tramites.map((t) => `<tr><td>${esc(t.que)}</td><td>${esc(t.plazo)}</td><td>${esc(t.ante)}</td></tr>`).join("")}</table></div>` : ""}
        ${l.sanciones ? `<p><b>Sanciones:</b> ${esc(l.sanciones)}</p>` : ""}
        ${(l.evidencia || []).length ? `<b>Evidencia que pide un auditor</b>${lista(l.evidencia)}` : ""}
        ${(l.preguntas || []).map((p, i) => { const id = H.idPregunta(jur, l, i), x = r[id] || {};
          return `<div class="tarjeta" data-np="${esc(id)}"><p>${esc(p)}</p><div class="barra"><select data-k="estado" aria-label="Resultado"><option value="">— sin calificar —</option>${Object.entries(ESTADOS).map(([k, v]) => `<option value="${k}" ${x.estado === k ? "selected" : ""}>${v}</option>`).join("")}</select>
            <input type="text" data-k="nota" value="${esc(x.nota || "")}" placeholder="Hallazgo o evidencia revisada" aria-label="Hallazgo" style="flex:1"></div></div>`; }).join("")}
      </details>`;
    }).join("") || `<p class="meta">Sin coincidencias.</p>`;
    if (sinSector) $("nor-leyes").insertAdjacentHTML("afterbegin", `<p class="meta">Este sector aún no tiene leyes específicas en esta jurisdicción: se muestran las generales.</p>`);
    $("nor-fuentes").innerHTML = `${esc(n.nota || "")} ${(n.fuentes_oficiales || []).length ? `Fuentes oficiales: ${n.fuentes_oficiales.map(([t, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>`).join(" · ")}` : ""}`;
    if ($("nor-cal").open) pintarCalendario();
    resumenN();
  }
  $("p-normativa").addEventListener("change", (e) => {
    const c = e.target.closest("[data-np]");
    if (!c) return;
    const d = resp(); (d[c.dataset.np] ||= {})[e.target.dataset.k] = e.target.value; guardar(claveN(), d);
    if (e.target.dataset.k === "estado") resumenN();
  });
  $("nor-jur").onchange = async () => { await cargarNorma($("nor-jur").value); pintarSectoresN(); pintarN(); }; $("nor-sector").onchange = pintarN;
  $("p-normativa").addEventListener("click", (e) => {
    const b = e.target.closest("[data-bit-pais]");
    if (b) irABitacora({ pais: b.dataset.bitPais, ley: b.dataset.bitLey || "", dias: b.dataset.bitLey ? "90" : "30" });
  });
  bitacoraP.then(() => pintarN());
  let tq = 0; $("nor-q").oninput = () => { clearTimeout(tq); tq = setTimeout(pintarN, 250); };
  function pintarCalendario() {
    const t = H.tramitesDe(actuales), c = $("nor-calendario");
    c.innerHTML = `<div class="desliza"><table class="t"><tr><th>Ley</th><th>Trámite o reporte</th><th>Plazo</th><th>Ante</th></tr>${t.map((x) => `<tr><td>${esc(x.ley)}</td><td>${esc(x.que)}</td><td>${esc(x.plazo)}</td><td>${esc(x.ante)}</td></tr>`).join("")}</table></div>`;
  }
  $("nor-cal").addEventListener("toggle", () => { if ($("nor-cal").open) pintarCalendario(); });
  $("nor-vaciar").onclick = () => { if (confirm("¿Vaciar todas las respuestas de esta jurisdicción?")) { try { localStorage.removeItem(claveN()); } catch (e) { /* nada */ } pintarN(); } };
  // Plantilla de proyecto en Excel (de la idea al cierre), por sector y países, con su base normativa.
  {
    const cfgPlan = await fetch("config/plan_proyecto.json").then((r) => r.json()).catch(() => null);
    const durPlan = await fetch("config/plan_duraciones.json").then((r) => r.json()).then((x) => x.reglas || []).catch(() => []);
    const extraS = await fetch("config/normativa/MEX_sectores.json").then((r) => r.json()).then((x) => x.sectores || {}).catch(() => ({}));
    $("plan-sector").innerHTML = `<option value="">Solo generales (toda empresa)</option>` + H.sectoresOrdenados(sectores, extraS).map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join("");
    $("plan-paises").innerHTML = H.JURISDICCIONES.map(([i, n]) => `<label style="display:inline-flex;gap:4px;align-items:center;margin:2px 10px 2px 0"><input type="checkbox" value="${i}"${i === "MEX" ? " checked" : ""}> ${esc(n)}</label>`).join("");
    const lunes = new Date(); lunes.setDate(lunes.getDate() + ((8 - lunes.getDay()) % 7 || 7));
    $("plan-inicio").value = lunes.toISOString().slice(0, 10);
    const opcionesPlan = async () => {
      const paises = [...$("plan-paises").querySelectorAll("input:checked")].map((c) => c.value);
      await Promise.all(paises.map(cargarNorma));
      const sector = $("plan-sector").value, extranjera = $("plan-extranjera").checked && paises.includes("MEX");
      const nombres = Object.fromEntries(H.JURISDICCIONES.map(([i, n]) => [i, n.replace(/^[^\p{L}]+/u, "")]));
      const P = await import("./plan-proyecto.js");
      const plan = P.construirPlan({ cfg: cfgPlan, catalogos: normas, jurisdicciones: paises, sector, extranjera, nombres, duraciones: durPlan });
      const sectorNombre = $("plan-sector").selectedOptions[0]?.textContent || "";
      const titulo = `${$("plan-nombre").value.trim() || "Plan de proyecto"} · ${sectorNombre} · ${paises.map((p) => nombres[p]).join(", ")}`;
      return { plan, paises, sector, extranjera, nombres, sectorNombre, titulo, inicio: new Date(`${$("plan-inicio").value || lunes.toISOString().slice(0, 10)}T00:00:00Z`) };
    };
    const resumenPlan = async () => {
      if (!cfgPlan) { $("plan-resumen").textContent = "No se pudo cargar config/plan_proyecto.json."; return; }
      const o = await opcionesPlan();
      $("plan-resumen").textContent = o.paises.length ? `${o.plan.tareas.length} tareas en 11 fases · ${o.plan.base.length} leyes y normas · ${o.plan.auditoria.length} preguntas de auditoría · ${o.plan.riesgos.length} riesgos · ${o.plan.recurrentes.length} obligaciones recurrentes`
        : "Elige al menos un país.";
    };
    $("p-normativa").addEventListener("change", (e) => { if (e.target.closest("#nor-plan")) resumenPlan(); });
    $("nor-plan").addEventListener("toggle", () => { if ($("nor-plan").open) resumenPlan(); });
    const archivo = (o, ext) => `plan-${(o.sector || "general")}-${o.paises.join("-")}-${new Date().toISOString().slice(0, 10)}.${ext}`;
    $("plan-xlsx").onclick = async () => {
      const o = await opcionesPlan();
      if (!o.paises.length) return;
      $("plan-xlsx").disabled = true; $("plan-xlsx").textContent = "Generando…";
      try {
        const X = await import("./plan-excel.js");
        const bytes = await X.excelPlanComprimido(o.plan, { cfg: cfgPlan, titulo: o.titulo, inicio: o.inicio, sectorNombre: o.sector ? o.sectorNombre : "", paises: o.paises.map((p) => o.nombres[p]), extranjera: o.extranjera, revisado: normas.MEX?.revisado || "" });
        const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
        const a = Object.assign(document.createElement("a"), { href: url, download: archivo(o, "xlsx") }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch (err) { $("plan-resumen").textContent = `No se pudo generar el Excel: ${err.message}`; }
      $("plan-xlsx").disabled = false; $("plan-xlsx").textContent = "⬇ Descargar Excel";
    };
    $("plan-json").onclick = async () => {
      const o = await opcionesPlan();
      if (!o.paises.length) return;
      const X = await import("./plan-excel.js");
      descargar(archivo(o, "json"), JSON.stringify(X.jsonPlan(o.plan, { titulo: o.titulo, inicio: o.inicio, sector: o.sector, paises: o.paises, extranjera: o.extranjera }), null, 1), "application/json");
    };
  }
  import("./exportar.js").then((X) => {
    $("nor-exp").innerHTML = X.htmlSelectorExportar("norx");
    $("norx-btn").onclick = () => X.exportar($("norx-fmt").value, ["jurisdiccion", "area", "ley", "autoridad", "pregunta", "resultado", "hallazgo", "evidencia", "url"],
      H.filasNormativa($("nor-jur").value, actuales, resp(), ESTADOS), { titulo: `Normativa ${$("nor-jur").selectedOptions[0]?.textContent || ""} ${$("nor-sector").selectedOptions[0]?.textContent || ""}`.trim(), tabla: "normativa" });
  });
  pintarN();
}

// ------------------------------------------------------------------ bitácora normativa (pestaña)
{
  const nombreJ = Object.fromEntries(H.JURISDICCIONES);
  const plantillaS = await jsonO("config/auditorias.json", { sectores: {} }).then((c) => c.sectores || {});
  const extraS = await jsonO("config/normativa/MEX_sectores.json", { sectores: {} }).then((c) => c.sectores || {});
  $("bit-pais").innerHTML = `<option value="">Todos los países</option>` + H.JURISDICCIONES.map(([i, n]) => `<option value="${i}">${esc(n)}</option>`).join("");
  $("bit-sector").innerHTML = `<option value="">Todos los sectores</option>` + H.sectoresOrdenados(plantillaS, extraS).map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join("");
  let mostrar = 100, actualesB = [];
  const filtros = () => ({ pais: $("bit-pais").value, sector: $("bit-sector").value, impacto: $("bit-impacto").value, dias: Number($("bit-dias").value), q: $("bit-q").value, ley: $("bit-q").dataset.ley || "" });
  function pintarB() {
    actualesB = H.filtrarBitacora(BIT.entradas, filtros());
    const f = filtros(), porPais = {};
    for (const e of actualesB) porPais[e.pais] = (porPais[e.pais] || 0) + 1;
    $("bit-resumen").innerHTML = `<p><b>${actualesB.length} cambios</b> con estos filtros · alto ${actualesB.filter((e) => e.impacto === "alto").length} · medio ${actualesB.filter((e) => e.impacto === "medio").length} · bajo ${actualesB.filter((e) => e.impacto === "bajo").length}
      ${f.ley ? ` · solo la ley «${esc(f.ley)}» <button type="button" id="bit-sin-ley">Quitar</button>` : ""}</p>
      <p class="meta">${Object.entries(porPais).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${esc(nombreJ[p] || p)}: ${n}`).join(" · ")}${BIT.generado ? ` · bitácora actualizada ${esc(BIT.generado.replace("T", " ").slice(0, 16))} UTC` : ""}</p>`;
    $("bit-sin-ley")?.addEventListener("click", () => { $("bit-q").dataset.ley = ""; mostrar = 100; pintarB(); });
    const lista = (xs) => xs.length ? `<ul>${xs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
    $("bit-lista").innerHTML = !BIT.entradas.length ? `<p class="meta">La bitácora aún no tiene datos publicados (el monitor corre a las 08:41 y 20:41 de Ciudad de México).</p>`
      : actualesB.slice(0, mostrar).map((e) => `<div class="tarjeta" style="border-left:4px solid ${COLOR_IMP[e.impacto] || "#607D8B"}">
        <p>${chipImp(e.impacto)} <b>${esc(e.fecha)}</b> · ${esc(nombreJ[e.pais] || e.pais)} · ${esc(e.tipo)} · <span class="meta">${esc(e.fuente)}</span>${e.revisada ? " · ✅ revisada" : ""}</p>
        <p><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.titulo)}</a></p>
        ${e.emisor ? `<p class="meta">${esc(e.emisor)}</p>` : ""}${e.resumen ? `<p>${esc(e.resumen)}</p>` : ""}
        <b>Qué afecta y qué hacer</b>${lista(e.afectaciones || [])}
        ${(e.leyes || []).length ? `<p>Leyes del catálogo: ${e.leyes.map((l) => `<button type="button" data-nor-jur="${esc(e.pais)}" data-nor-q="${esc(l.sigla || l.nombre)}" title="${esc(l.nombre)}">${esc(l.sigla || l.nombre.slice(0, 40))}${l.por === "autoridad" ? " (por autoridad)" : ""}</button>`).join(" ")}</p>` : ""}
        ${(e.sectores || []).length ? `<p class="meta">Sectores: ${esc(e.sectores.map((k) => plantillaS[k]?.nombre || extraS[k]?.nombre || k).join(", "))} · ${e.preguntas || 0} preguntas de auditoría relacionadas</p>` : ""}
        <p class="meta">Estado: ${esc(e.estado || "por revisar")} · detectado ${esc(e.detectado || "")}</p></div>`).join("")
        + (actualesB.length > mostrar ? `<button type="button" id="bit-mas">Mostrar ${Math.min(100, actualesB.length - mostrar)} más</button>` : "")
      || `<p class="meta">Sin cambios con estos filtros. Prueba un periodo más largo o «Todos los impactos».</p>`;
    $("bit-mas")?.addEventListener("click", () => { mostrar += 100; pintarB(); });
    const est = BIT.estado;
    $("bit-fuentes").innerHTML = est ? `<div class="desliza"><table class="t"><tr><th>País</th><th>Fuente</th><th>Estado</th><th>Nuevas en la última corrida</th></tr>
      ${Object.entries(est.fuentes || {}).map(([k, v]) => `<tr><td>${esc(nombreJ[k] || k)}</td><td>${esc(v.fuente)}</td><td>${v.ok ? "✅ al día" : `⚠️ ${esc(v.error || "error")}`}</td><td>${v.nuevas ?? 0}</td></tr>`).join("")}</table></div>
      <p><b>Sin fuente automática</b> (revisión semanal de la tarea de Claude en las fuentes oficiales del catálogo):</p>
      <ul>${Object.entries(est.sin_fuente || {}).map(([k, v]) => `<li>${esc(nombreJ[k] || k)}: ${esc(v)}</li>`).join("")}</ul>
      ${(est.desactualizadas || []).length ? `<p><b>Leyes del catálogo con reforma oficial más reciente que la registrada:</b></p><ul>${est.desactualizadas.map((d) => `<li>${esc(d.sigla || d.ley_id)}: catálogo ${esc(d.catalogo)} → oficial ${esc(d.oficial)}</li>`).join("")}</ul>` : `<p class="meta">Todas las fechas de última reforma de México coinciden con la compilación de la Cámara de Diputados.</p>`}`
      : `<p class="meta">Aún no hay estado publicado del monitor.</p>`;
  }
  for (const id of ["bit-pais", "bit-sector", "bit-impacto", "bit-dias"]) $(id).onchange = () => { mostrar = 100; pintarB(); };
  let tb = 0; $("bit-q").oninput = () => { clearTimeout(tb); tb = setTimeout(() => { mostrar = 100; pintarB(); }, 250); };
  document.addEventListener("bitacora:pintar", () => { mostrar = 100; pintarB(); });
  $("p-bitacora").addEventListener("click", (e) => {
    const b = e.target.closest("[data-nor-jur]");
    if (!b) return;
    $("nor-jur").value = b.dataset.norJur; $("nor-jur").dispatchEvent(new Event("change"));
    $("nor-q").value = b.dataset.norQ; $("nor-q").dispatchEvent(new Event("input"));
    document.querySelector('.pestanas button[data-p="normativa"]')?.click();
  });
  import("./exportar.js").then((X) => {
    $("bit-exp").innerHTML = X.htmlSelectorExportar("bitx");
    $("bitx-btn").onclick = () => X.exportar($("bitx-fmt").value, ["fecha", "pais", "impacto", "tipo", "titulo", "emisor", "leyes", "sectores", "afectaciones", "estado", "url"],
      actualesB.map((e) => ({ fecha: e.fecha, pais: e.pais, impacto: e.impacto, tipo: e.tipo, titulo: e.titulo, emisor: e.emisor, leyes: (e.leyes || []).map((l) => l.sigla || l.id).join("; "),
        sectores: (e.sectores || []).join("; "), afectaciones: (e.afectaciones || []).join(" | "), estado: e.estado || "", url: e.url })), { titulo: "Bitácora normativa", tabla: "bitacora" });
  });
  bitacoraP.then(pintarB);
}

// ------------------------------------------------------------------ seguimiento de proyecto (plan importado)
Promise.all([import("./plan-tablero.js"), import("./tableros-logica.js")]).then(([S, T]) => {
  const st = document.createElement("style"); st.textContent = T.CSS_TABLEROS + S.CSS_PLAN; document.head.appendChild(st);
  S.montarSeguimiento($("seg-raiz"), { bitacora: bitacoraP.then((b) => b.entradas) });
}).catch((e) => { $("seg-raiz").innerHTML = `<p class="meta">No se pudo cargar el seguimiento: ${esc(e.message)}</p>`; });

// ------------------------------------------------------------------ simulación de escenarios con los eventos del mapa
{
  const [evd, gz] = await Promise.all([fetch("data/events.json").then((r) => r.json()).catch(() => ({ eventos: [] })), fetch("config/gazetteer.json").then((r) => r.json()).catch(() => ({ paises: {} }))]);
  const evs = evd.eventos || [], cuenta = {};
  for (const e of evs) if (e.pais_iso3) cuenta[e.pais_iso3] = (cuenta[e.pais_iso3] || 0) + 1;
  const nombre = (i) => gz.paises?.[i]?.es || i;
  $("hesc-pais").innerHTML = `<option value="">Todo el mundo</option>` + H.mexicoPrimero(Object.keys(gz.paises || {}).map((i) => [i, nombre(i)])).map(([i]) => i)
    .map((i) => `<option value="${i}" ${i === "MEX" ? "selected" : ""}>${esc(nombre(i))}${cuenta[i] ? ` (${cuenta[i]})` : ""}</option>`).join("");
  const datosPais = () => {
    const iso = $("hesc-pais").value, sel = evs.filter((e) => !iso || e.pais_iso3 === iso), porArea = {};
    for (const e of sel) porArea[e.area_principal] = (porArea[e.area_principal] || 0) + (e.severidad >= 4 ? 2 : 1);
    const graves = sel.filter((e) => e.severidad >= 4).slice(0, 8).map((e) => `- ${e.titulo}`).join("\n");
    return { iso, sel, porArea, texto: `País: ${iso ? nombre(iso) : "todo el mundo"}. Eventos vigentes: ${sel.length}. Por tema: ${Object.entries(porArea).sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a} ${n}`).join(", ")}.${graves ? `\nEventos graves recientes:\n${graves}` : ""}` };
  };
  const pintarResumenEsc = () => {
    const d = datosPais(), r = H.riesgoRegulatorio(BIT.entradas, { pais: d.iso });
    $("hesc-resumen").textContent = `${d.sel.length} eventos vigentes · ${Object.entries(d.porArea).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([a, n]) => `${a}: ${n}`).join(" · ")}`
      + (r.n ? ` · ${r.n} cambios normativos en 90 días (alto ${r.alto})` : "");
  };
  bitacoraP.then(pintarResumenEsc);
  $("hesc-pais").onchange = pintarResumenEsc;
  pintarResumenEsc();
  import("./escenarios.js?v=plegables").then((E) => E.montarSimulador($("herr-esc"), {
    prefijo: "he", clave: "gp_herr_esc", plegables: true, ayudaContexto: "El país elegido y sus eventos se agregan solos al contexto. Para una empresa (ingresos, empleados), usa DOMINUS OPS.",
    contexto: () => {
      const d = datosPais(), r = H.riesgoRegulatorio(BIT.entradas, { pais: d.iso });
      const porArea = { ...d.porArea, instituciones: (d.porArea.instituciones || 0) + r.peso };
      return { cliente: {}, sector: "", eventosPorArea: porArea, texto: [d.texto, r.texto].filter(Boolean).join("\n") };
    },
  })).catch((e) => { $("herr-esc").innerHTML = `<p class="meta">No se pudo cargar el simulador: ${esc(e.message)}</p>`; });
}

// ------------------------------------------------------------------ vulnerabilidades críticas
{
  let vulns = null;
  const pintarV = async () => {
    vulns ??= await fetch("data/vulnerabilidades.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!vulns) { $("vul-estado").textContent = "Los datos aún no están disponibles (se generan con la siguiente ingesta)."; return; }
    const kevSel = $("vul-kev").checked;
    const f = H.filtrarVulns(vulns.vulnerabilidades, { q: $("vul-q").value, soloKev: kevSel, minCvss: kevSel ? 0 : Number($("vul-cvss").value), minEpss: Number($("vul-epss").value) });
    $("vul-estado").textContent = `${f.length} de ${vulns.vulnerabilidades.length} · actualizado ${String(vulns.generado_utc).slice(0, 16).replace("T", " ")} UTC · catálogo KEV: ${vulns.kev_total} explotadas en total`;
    $("vul-tabla").innerHTML = `<tr><th>CVE</th><th>Producto</th><th>CVSS</th><th>EPSS</th><th>Explotada (KEV)</th><th>Publicada</th><th>Descripción (NVD, en inglés)</th></tr>` + f.map((v) => `<tr>
      <td><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.id)}</a></td><td>${esc(v.producto)}</td>
      <td style="color:${v.cvss >= 9 ? "#B71C1C" : ""}"><b>${v.cvss ?? "—"}</b>${v.version ? ` <span class="meta">v${esc(v.version)}</span>` : ""}</td>
      <td>${v.epss == null ? "—" : `${(v.epss * 100).toFixed(1)} %`}</td>
      <td>${v.kev ? `⚠️ sí, desde ${esc(v.kev.agregado)}${v.kev.ransomware === "Known" ? " · usada en ransomware" : ""}<br><span class="meta">${esc(v.kev.accion)}</span>` : "—"}</td>
      <td>${esc(v.publicado)}</td><td class="meta">${esc(v.descripcion)}</td></tr>`).join("");
  };
  let tv = 0;
  $("vul-q").addEventListener("input", () => { clearTimeout(tv); tv = setTimeout(pintarV, 250); });
  for (const id of ["vul-kev", "vul-cvss", "vul-epss"]) $(id).addEventListener("change", pintarV);
  document.querySelector('.pestanas button[data-p="informatica"]')?.addEventListener("click", pintarV, { once: true });
  if (location.hash === "#informatica") pintarV();
  import("./exportar.js").then((X) => {
    $("vul-exp").innerHTML = X.htmlSelectorExportar("vulx");
    $("vulx-btn").onclick = () => vulns && X.exportar($("vulx-fmt").value, ["id", "producto", "cvss", "version", "epss", "kev", "publicado", "descripcion", "url"],
      H.filtrarVulns(vulns.vulnerabilidades, { q: $("vul-q").value, soloKev: $("vul-kev").checked, minCvss: Number($("vul-cvss").value), minEpss: Number($("vul-epss").value) }).map((v) => ({ ...v, kev: v.kev ? `sí (${v.kev.agregado})` : "" })),
      { titulo: "Vulnerabilidades críticas", tabla: "vulnerabilidades" });
  });
}

// ------------------------------------------------------------------ Fase 4: agencias (redes, certificados, casos y oficios)
import("./agencia-logica.js").then((A) => {
  if (!$("p-agencias")) return;
  const hoy = () => new Date().toISOString().slice(0, 10);
  $("ct-btn").addEventListener("click", async () => {
    const d = $("ct-dominio").value.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
    if (!A.esDominio(d)) { $("ct-res").innerHTML = `<p class="aviso">Escribe solo el dominio, por ejemplo «sat.gob.mx».</p>`; return; }
    $("ct-res").innerHTML = `<p class="meta">Consultando los registros de certificados de ${esc(d)}…</p>`;
    try {
      const r = await fetch(A.urlCertSpotter(d));
      if (r.status === 429) throw new Error("se alcanzó el límite gratuito de consultas por hora; intenta más tarde");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const s = A.resumenCertificados(await r.json());
      $("ct-res").innerHTML = `${kv({ "Certificados encontrados": String(s.total), "Vigentes hoy": String(s.vigentes), "Nombres distintos": String(s.subdominios.length), "Comodines (*.)": s.comodines.join(", ") || "ninguno" })}
        ${s.vencen.length ? `<p class="aviso">Vencen en 30 días o menos: ${s.vencen.map((v) => `${esc(v.nombres.join(", "))} (${esc(v.vence)}, ${v.dias} días)`).join(" · ")}</p>` : `<p class="ok">Ningún certificado vigente vence en los próximos 30 días.</p>`}
        <h4>Emisores</h4><p>${s.emisores.map(([e, n]) => `${esc(e)} (${n})`).join(" · ") || "—"}</p>
        <h4>Nombres vistos en certificados</h4><div class="desliza"><table class="t"><tr><th>Nombre</th><th>Certificados</th><th>Último emitido</th></tr>${s.subdominios.slice(0, 300).map((x) => `<tr><td class="mono">${esc(x.nombre)}</td><td>${x.certs}</td><td>${esc(x.ultimo.slice(0, 10))}</td></tr>`).join("")}</table></div>
        <p class="meta">Qué revisar: subdominios que no reconozcas, emisores que tu área no contrató y certificados por vencer. Cert Spotter muestra los certificados vigentes y recientes; para el historial completo, <a href="https://crt.sh/?q=${encodeURIComponent(d)}" target="_blank" rel="noopener">crt.sh</a>.</p>`;
    } catch (e) { $("ct-res").innerHTML = `<p class="aviso">No se pudo consultar: ${esc(e.message)}. Prueba en <a href="https://crt.sh/?q=${encodeURIComponent(d)}" target="_blank" rel="noopener">crt.sh</a>.</p>`; }
  });
  let pedidoRed = 0;  // solo la consulta más reciente pinta su resultado (una anterior más lenta no lo sobrescribe)
  $("red-btn").addEventListener("click", async () => {
    const q = $("red-q").value, c = A.urlsRipe(q), n = ++pedidoRed;
    if (!c) { $("red-res").innerHTML = `<p class="aviso">Escribe una IP (8.8.8.8) o un ASN (AS8151).</p>`; return; }
    $("red-res").innerHTML = `<p class="meta">Consultando RIPEstat…</p>`;
    try {
      const r = Object.fromEntries(await Promise.all(Object.entries(c.urls).map(async ([k, u]) => [k, await (await fetch(u)).json()])));
      if (n !== pedidoRed) return;
      const s = A.resumenRipe(c.tipo, r);
      $("red-res").innerHTML = c.tipo === "ip"
        ? kv({ "Red que la contiene": s.prefijo, "Anunciada en internet": s.anunciado ? "sí" : "no", "Sistema autónomo (titular)": s.asns.map((a) => `AS${a.asn} · ${a.titular}`).join("; ") || "—", "País del registro": s.pais })
        : `${kv({ "Sistema autónomo": s.asn, "Titular": s.titular, "Anunciado": s.anunciado ? "sí" : "no", "Bloques IPv4": String(s.prefijos_v4.length), "Direcciones IPv4 (aprox.)": s.direcciones_v4.toLocaleString("es-MX"), "Bloques IPv6": String(s.prefijos_v6.length) })}
          <p class="mono">${esc(s.prefijos_v4.slice(0, 60).join("  "))}${s.prefijos_v4.length > 60 ? " …" : ""}</p>`;
      $("red-res").innerHTML += `<p class="meta">Fuente: RIPEstat (RIPE NCC), con datos de los cinco registros regionales. El país es el del registro del bloque, no donde está físicamente el servidor.</p>`;
    } catch (e) { if (n === pedidoRed) $("red-res").innerHTML = `<p class="aviso">RIPEstat no respondió: ${esc(e.message)}</p>`; }
  });
  $("cidr-btn").addEventListener("click", () => {
    const r = A.cidr($("cidr-q").value);
    $("cidr-res").innerHTML = r ? kv({ "Red": `${r.red}/${r.bits}`, "Máscara": r.mascara, "Comodín (wildcard)": r.comodin, "Primera utilizable": r.primera, "Última utilizable": r.ultima,
      "Difusión (broadcast)": r.difusion, "Equipos posibles": r.equipos.toLocaleString("es-MX"), "Rango": r.privada ? `privado (${r.privada})` : "público" }) : `<p class="aviso">Formato: 192.168.10.37/27</p>`;
  });
  // Cronología
  let cro = leer("agencias-cronologia", { hechos: [] });
  const pintarCro = () => {
    guardar("agencias-cronologia", cro);
    const hs = A.huecos(cro);
    $("cro-res").innerHTML = cro.hechos.length ? `<ol class="lista-inv">${cro.hechos.map((h) => `<li><b>${esc(h.fecha)}${h.hora ? ` ${esc(h.hora)}` : ""}</b> · ${esc(h.hecho)} <span class="meta">(${esc(h.fuente || "sin fuente")} · confianza ${esc(h.confianza)})</span> <button type="button" data-cro-quitar="${esc(h.id)}" aria-label="Quitar">✕</button></li>`).join("")}</ol>
      ${hs.length ? `<p class="aviso">Huecos sin información: ${hs.map((x) => `${esc(x.desde)} → ${esc(x.hasta)} (${x.dias} días)`).join(" · ")}</p>` : ""}` : `<p class="meta">Sin hechos todavía.</p>`;
  };
  $("cro-agregar").addEventListener("click", () => {
    cro = A.agregarHecho(cro, { fecha: $("cro-fecha").value, hora: $("cro-hora").value, hecho: $("cro-hecho").value, fuente: $("cro-fuente").value, confianza: $("cro-conf").value });
    $("cro-hecho").value = ""; $("cro-fuente").value = ""; pintarCro();
  });
  $("cro-res").addEventListener("click", (e) => { const id = e.target.dataset?.croQuitar; if (id) { cro = A.quitarHecho(cro, id); pintarCro(); } });
  $("cro-csv").addEventListener("click", () => descargar(`cronologia-${hoy()}.csv`, A.csvCronologia(cro), "text/csv"));
  $("cro-vaciar").addEventListener("click", () => { if (confirm("¿Borrar todos los hechos de la cronología?")) { cro = { hechos: [] }; pintarCro(); } });
  pintarCro();
  // Oficios
  let oficios = leer("agencias-oficios", []);
  $("of-inhabiles").value = leer("agencias-inhabiles", "");
  $("of-recibido").value = hoy();
  const extra = () => $("of-inhabiles").value.split(/[,\s]+/).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x));
  const pintarOf = () => {
    guardar("agencias-oficios", oficios); guardar("agencias-inhabiles", $("of-inhabiles").value);
    const ex = extra();
    $("of-tabla").innerHTML = `<tr><th>Folio</th><th>Recibido</th><th>Remitente</th><th>Asunto</th><th>Área</th><th>Límite</th><th>Estado</th><th>Semáforo</th><th></th></tr>` + oficios.map((o, i) => {
      o.limite = A.venceHabiles(o.recibido, o.dias, ex);
      const s = A.semaforo(o, hoy(), ex);
      return `<tr><td>${esc(o.folio)}</td><td>${esc(o.recibido)}</td><td>${esc(o.remitente)}</td><td>${esc(o.asunto)}</td><td>${esc(o.area)}</td><td>${esc(o.limite)}</td>
        <td><select data-of-estado="${i}">${Object.entries(A.ESTADOS_OFICIO).map(([k, n]) => `<option value="${k}"${o.estado === k ? " selected" : ""}>${esc(n)}</option>`).join("")}</select></td>
        <td><span style="color:${s.color};font-weight:600">● ${esc(s.texto)}</span></td><td><button type="button" data-of-quitar="${i}" aria-label="Quitar">✕</button></td></tr>`;
    }).join("");
  };
  $("of-agregar").addEventListener("click", () => {
    const dias = Number($("of-dias").value);
    if (!$("of-folio").value.trim() || !$("of-recibido").value || !(dias > 0)) { alert("Folio, fecha de recepción y plazo son obligatorios."); return; }
    oficios.push({ folio: $("of-folio").value.trim(), recibido: $("of-recibido").value, remitente: $("of-remitente").value.trim(), asunto: $("of-asunto").value.trim(), area: $("of-area").value.trim(), dias, estado: "recibido" });
    for (const id of ["of-folio", "of-remitente", "of-asunto"]) $(id).value = "";
    pintarOf();
  });
  $("of-tabla").addEventListener("change", (e) => { const i = e.target.dataset?.ofEstado; if (i != null) { oficios[i].estado = e.target.value; pintarOf(); } });
  $("of-tabla").addEventListener("click", (e) => { const i = e.target.dataset?.ofQuitar; if (i != null && confirm("¿Quitar este oficio?")) { oficios.splice(Number(i), 1); pintarOf(); } });
  $("of-inhabiles").addEventListener("change", pintarOf);
  $("of-csv").addEventListener("click", () => descargar(`oficios-${hoy()}.csv`, A.csvOficios(oficios), "text/csv"));
  pintarOf();
});
