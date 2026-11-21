// Lógica (funciones puras) de la Revisión técnica de vulnerabilidades para empresas (revision-tecnica.html).
// Todo es pasivo: DNS público, datos ya recolectados por InternetDB (Shodan) y comparación de versiones contra el
// catálogo KEV, OSV y EPSS. No se escanea ni se toca la infraestructura de la empresa.

export const SEV = ["critica", "alta", "media", "baja", "info"];
export const NOMBRE_SEV = { critica: "Crítica", alta: "Alta", media: "Media", baja: "Baja", info: "Info" };

// Puertos que no deberían estar abiertos a internet sin una razón clara.
export const PUERTOS_RIESGO = {
  21: ["FTP (archivos sin cifrar)", "alta"], 23: ["Telnet (acceso remoto sin cifrar)", "critica"], 25: ["SMTP (correo)", "info"],
  110: ["POP3 sin cifrar", "media"], 135: ["RPC de Windows", "alta"], 139: ["NetBIOS (archivos de Windows)", "alta"], 445: ["SMB (archivos de Windows)", "critica"],
  1433: ["Base de datos SQL Server", "critica"], 1521: ["Base de datos Oracle", "critica"], 2375: ["Docker sin protección", "critica"],
  3306: ["Base de datos MySQL", "critica"], 3389: ["Escritorio remoto de Windows (RDP)", "critica"], 5432: ["Base de datos PostgreSQL", "critica"],
  5900: ["VNC (control remoto)", "critica"], 6379: ["Redis", "critica"], 8080: ["Servidor web alterno o panel", "media"], 8443: ["Panel web alterno", "media"],
  9200: ["Elasticsearch", "critica"], 11211: ["Memcached", "alta"], 27017: ["MongoDB", "critica"], 161: ["SNMP (administración de red)", "alta"],
};

const h = (sev, titulo, detalle, accion, como_verificar = "", fuente = "") => ({ sev, titulo, detalle, accion, como_verificar, fuente });

/** Hallazgos de correo (SPF y DMARC) y DNS (CAA, DNSSEC) a partir de las respuestas DoH. */
export function revisarDNS({ dominio, txt = [], dmarc = [], caa = [], mx = [], dnssec = false }) {
  const out = [];
  const spf = txt.map((t) => t.replace(/"/g, "")).filter((t) => /^v=spf1/i.test(t));
  const verif = `En una terminal: nslookup -type=txt ${dominio}  (o en https://dnschecker.org)`;
  if (!mx.length) out.push(h("info", "El dominio no recibe correo (sin MX)", "No hay registros MX.", "Si no se usa para correo, publica SPF «v=spf1 -all» y DMARC «p=reject» para que nadie lo use para suplantar.", verif, "DNS"));
  if (!spf.length) out.push(h("alta", "Sin SPF: cualquiera puede enviar correo «desde» este dominio", "No hay registro SPF.", "Publica un TXT «v=spf1 include:<tu proveedor> -all» con los servidores que sí envían correo.", verif, "DNS"));
  else if (spf.length > 1) out.push(h("media", "Hay más de un SPF", spf.join(" | "), "Deja un solo registro SPF (con dos, los servidores lo invalidan).", verif, "DNS"));
  else if (/\+all/.test(spf[0])) out.push(h("critica", "SPF con «+all»: autoriza a todo internet", spf[0], "Cambia «+all» por «-all» (o «~all» mientras pruebas).", verif, "DNS"));
  else if (/\?all/.test(spf[0])) out.push(h("media", "SPF con «?all» (neutral): no protege", spf[0], "Usa «-all» o al menos «~all».", verif, "DNS"));
  const dm = dmarc.map((t) => t.replace(/"/g, "")).find((t) => /^v=DMARC1/i.test(t));
  const verifD = `nslookup -type=txt _dmarc.${dominio}`;
  if (!dm) out.push(h("alta", "Sin DMARC: los correos falsos con tu dominio no se bloquean", "No hay registro _dmarc.", `Publica en _dmarc.${dominio}: «v=DMARC1; p=quarantine; rua=mailto:dmarc@${dominio}» y luego sube a p=reject.`, verifD, "DNS"));
  else if (/p=none/i.test(dm)) out.push(h("media", "DMARC solo observa (p=none)", dm, "Cuando los reportes muestren que tu correo legítimo pasa, cambia a p=quarantine y luego p=reject.", verifD, "DNS"));
  if (!caa.length) out.push(h("baja", "Sin CAA: cualquier autoridad puede emitir certificados del dominio", "No hay registros CAA.", "Publica CAA con la autoridad que usas (por ejemplo «0 issue \"letsencrypt.org\"»).", `nslookup -type=caa ${dominio}`, "DNS"));
  if (!dnssec) out.push(h("baja", "Sin DNSSEC", "Las respuestas DNS del dominio no están firmadas.", "Actívalo en el registrador y en el proveedor DNS (en Cloudflare: DNS → Configuración → DNSSEC).", "https://dnssec-analyzer.verisignlabs.com", "DNS"));
  return out;
}

/** Hallazgos de exposición de una IP con los datos de InternetDB y el catálogo KEV ({cve: item}). */
export function revisarIP(ip, idb, kevPorCve = {}, epss = {}) {
  const out = [];
  if (!idb || idb.detail) return out;
  // IP de una CDN compartida (Cloudflare, Akamai…): sus puertos y software son del proveedor o de otros clientes.
  if ((idb.tags || []).includes("cdn")) {
    return [h("info", `${ip} es de una CDN compartida`, "Los puertos y el software que se ven en esa IP pertenecen al proveedor o a otros clientes; no se cuentan como hallazgos.",
      "Si la empresa da la IP real de su servidor de origen, agrégala en «IP públicas adicionales» para revisarla; y verifica que el origen solo acepte tráfico de la CDN.", "", "InternetDB")];
  }
  for (const p of idb.ports || []) {
    const r = PUERTOS_RIESGO[p];
    if (r && r[1] !== "info") out.push(h(r[1], `Puerto ${p} abierto a internet: ${r[0]}`, `IP ${ip}`, "Ciérralo en el firewall o limítalo a una VPN o a direcciones de confianza.", `Desde fuera de la red: nmap -Pn -p ${p} ${ip}  (o https://internetdb.shodan.io/${ip})`, "InternetDB"));
  }
  const vulns = idb.vulns || [];
  const enKev = vulns.filter((c) => kevPorCve[c]);
  for (const c of enKev) {
    const k = kevPorCve[c];
    out.push(h("critica", `${c}: falla que ya se explota (${k.fabricante} ${k.producto})`, `IP ${ip}. ${k.tipo || ""}`, k.versiones?.length ? `Actualiza ${k.versiones.map((v) => `${v.producto} a ${v.corregida.join(" o ")}`).join("; ")}.` : "Aplica el parche del aviso del fabricante.", k.como_verificar || "", "InternetDB + CISA KEV"));
  }
  const resto = vulns.filter((c) => !kevPorCve[c]);
  if (resto.length) {
    const altas = resto.filter((c) => (epss[c] || 0) >= 0.1);
    out.push(h(altas.length ? "alta" : "media", `${resto.length} vulnerabilidades conocidas en el software expuesto`, `IP ${ip}: ${resto.slice(0, 12).join(", ")}${resto.length > 12 ? "…" : ""}${altas.length ? ` · con probabilidad de ataque ≥ 10 %: ${altas.join(", ")}` : ""}`,
      "Identifica el software (CPE) y actualízalo a la versión vigente del fabricante.", `https://internetdb.shodan.io/${ip}`, "InternetDB + EPSS"));
  }
  if ((idb.cpes || []).length) out.push(h("info", `Software detectado en ${ip}`, idb.cpes.slice(0, 10).join(", "), "Confirma que cada uno esté en versión vigente.", "", "InternetDB"));
  return out;
}

/** Compara versiones tipo 1.2.10 vs 1.2.9 (números; letras se ignoran). Negativo si a < b. */
export function compararVersion(a, b) {
  const pa = String(a).split(/[.\-_+]/).map((x) => parseInt(x, 10) || 0), pb = String(b).split(/[.\-_+]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
  return 0;
}

/** Lista de software «producto versión» (una por línea) → [{nombre, version}]. */
export function leerInventario(texto) {
  return String(texto || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = l.match(/^(.*?)[\s:=@]+v?(\d[\w.\-+]*)$/);
    return m ? { nombre: m[1].trim(), version: m[2] } : { nombre: l, version: "" };
  }).slice(0, 300);
}

// Nombres comunes → como los escribe CISA (Chrome aparece como «Chromium», el iPhone como «iOS»…).
export const SINONIMOS = { chrome: "chromium", "google chrome": "chromium", iphone: "ios", ipad: "ipados", mac: "macos", outlook: "office", word: "office", excel: "office", exchange: "exchange server", fortigate: "fortios" };

/** Software del inventario que aparece en el catálogo KEV, con su estado según la versión corregida. */
export function revisarInventario(inv, kev = []) {
  const out = [];
  for (const s of inv) {
    const n = SINONIMOS[s.nombre.toLowerCase()] || s.nombre.toLowerCase();
    if (n.length < 3) continue;
    const coinciden = kev.filter((k) => `${k.fabricante} ${k.producto}`.toLowerCase().includes(n) || n.includes(String(k.producto).toLowerCase()) && k.producto.length > 3);
    for (const k of coinciden.slice(0, 8)) {
      const corr = (k.versiones || []).flatMap((v) => v.corregida);
      // Con versión instalada: corregida si es ≥ alguna versión corregida de la misma rama (mismo número mayor).
      const mismaRama = corr.filter((c) => String(c).split(".")[0] === String(s.version).split(".")[0]);
      const ok = s.version && (mismaRama.length ? mismaRama.some((c) => compararVersion(s.version, c) >= 0) : corr.length && corr.every((c) => compararVersion(s.version, c) >= 0));
      if (ok) continue;
      out.push(h(k.ransomware ? "critica" : "alta", `${s.nombre}${s.version ? ` ${s.version}` : ""}: ${k.cve} (${k.fabricante} ${k.producto}) se explota activamente`,
        `${k.tipo || ""}. Agregada al catálogo de CISA el ${k.fecha}.${s.version ? "" : " Sin versión: no se puede saber si ya está corregida."}`,
        corr.length ? `Actualiza a ${corr.join(" o ")} o posterior.` : "Aplica la actualización del aviso del fabricante.", k.como_verificar || "", "CISA KEV + NVD"));
    }
  }
  return out;
}

/** Dependencias de un archivo de proyecto: package-lock.json (npm) o requirements.txt (PyPI). */
export function leerDependencias(nombre, texto) {
  if (/package-lock\.json$/i.test(nombre)) {
    const j = JSON.parse(texto);
    const paquetes = j.packages ? Object.entries(j.packages).filter(([k]) => k).map(([k, v]) => ({ name: k.split("node_modules/").pop(), version: v.version }))
      : Object.entries(j.dependencies || {}).map(([k, v]) => ({ name: k, version: v.version }));
    return paquetes.filter((p) => p.name && p.version).map((p) => ({ ecosystem: "npm", ...p }));
  }
  if (/requirements.*\.txt$/i.test(nombre)) {
    return texto.split(/\r?\n/).map((l) => l.split("#")[0].trim()).map((l) => l.match(/^([A-Za-z0-9_.\-]+)\s*==\s*([\w.\-+]+)/)).filter(Boolean)
      .map((m) => ({ ecosystem: "PyPI", name: m[1], version: m[2] }));
  }
  return [];
}

/** Hallazgos de dependencias a partir de la respuesta de OSV querybatch (mismo orden que las consultas). */
export function revisarDependencias(deps, osv) {
  const out = [];
  (osv?.results || []).forEach((r, i) => {
    const ids = (r.vulns || []).map((v) => v.id);
    if (!ids.length) return;
    const d = deps[i];
    out.push(h(ids.length >= 3 ? "alta" : "media", `${d.name} ${d.version} (${d.ecosystem}): ${ids.length} vulnerabilidades conocidas`, ids.slice(0, 8).join(", "),
      `Actualiza ${d.name} a la versión que indica cada aviso de OSV y vuelve a generar el archivo de dependencias.`, `https://osv.dev/list?ecosystem=${d.ecosystem}&q=${encodeURIComponent(d.name)}`, "OSV"));
  });
  return out;
}

/** Ordena por severidad y cuenta. */
export function resumen(hallazgos) {
  const lista = [...hallazgos].sort((a, b) => SEV.indexOf(a.sev) - SEV.indexOf(b.sev));
  const conteo = Object.fromEntries(SEV.map((s) => [s, lista.filter((x) => x.sev === s).length]));
  const nivel = conteo.critica ? "crítico" : conteo.alta ? "alto" : conteo.media ? "medio" : "bajo";
  return { lista, conteo, nivel };
}

/** Informe en Markdown para entregar a la empresa. */
export function informeMd({ empresa, dominio, fecha, alcance }, r) {
  const l = [`# Revisión técnica de vulnerabilidades — ${empresa || dominio}`, "", `Fecha: ${fecha} · Dominio: ${dominio || "—"} · Nivel de riesgo: **${r.nivel}**`, "",
    `Alcance: ${alcance}. Revisión pasiva (DNS público, datos de InternetDB, catálogos CISA KEV, NVD, EPSS y OSV); no se escanearon ni se accedió a sistemas.`, "",
    `| Crítica | Alta | Media | Baja | Info |`, `|---|---|---|---|---|`, `| ${r.conteo.critica} | ${r.conteo.alta} | ${r.conteo.media} | ${r.conteo.baja} | ${r.conteo.info} |`, ""];
  r.lista.forEach((x, i) => l.push(`## ${i + 1}. [${NOMBRE_SEV[x.sev]}] ${x.titulo}`, "", x.detalle, "", `**Qué hacer:** ${x.accion}`, ...(x.como_verificar ? ["", `**Cómo verificar:** ${x.como_verificar}`] : []), "", `Fuente: ${x.fuente}`, ""));
  l.push("---", "Los resultados dependen de información pública en la fecha indicada. Confirma cada hallazgo antes de cambiar configuraciones en producción.");
  return l.join("\n");
}
