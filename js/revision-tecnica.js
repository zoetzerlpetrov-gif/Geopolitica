// Controlador de revision-tecnica.html (solo Admin). Consultas pasivas desde el navegador: DNS sobre HTTPS de
// Cloudflare, InternetDB, EPSS y OSV (todas aceptan CORS); catálogo KEV del propio proyecto. Nada se guarda en servidores.
import * as L from "./revision-tecnica-logica.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const enlace = (t) => esc(t).replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
const DOMINIO = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
let ultimo = null;

const paso = (t) => $("rt-progreso").insertAdjacentHTML("beforeend", `<li>${esc(t)}</li>`);
async function doh(nombre, tipo, extra = "") {
  const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(nombre)}&type=${tipo}${extra}`, { headers: { accept: "application/dns-json" } });
  return r.ok ? r.json() : { Answer: [] };
}
const datos = (j, tipo) => (j.Answer || []).filter((a) => a.type === tipo).map((a) => String(a.data));

async function correr() {
  const dominio = $("rt-dominio").value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const ips = $("rt-ips").value.split(/\s+/).map((x) => x.trim()).filter((x) => IPV4.test(x)).slice(0, 8);
  if (dominio && !DOMINIO.test(dominio)) { $("rt-res").innerHTML = '<p class="aviso">Dominio inválido.</p>'; return; }
  $("rt-correr").disabled = true; $("rt-progreso").innerHTML = ""; $("rt-res").innerHTML = "";
  const hall = [];
  let kev = [];
  try { const r = await fetch("data/seguridad/vulns_mundo.json", { cache: "no-store" }); if (r.ok) kev = (await r.json()).kev || []; } catch { /* sin catálogo */ }
  paso(kev.length ? `Catálogo de fallas explotadas: ${kev.length}` : "Sin catálogo KEV del proyecto (la comparación de software será limitada)");
  const kevPorCve = Object.fromEntries(kev.map((k) => [k.cve, k]));
  try {
    if (dominio) {
      const [txt, dmarc, caa, mx, a, aaaa] = await Promise.all([doh(dominio, "TXT"), doh(`_dmarc.${dominio}`, "TXT"), doh(dominio, "CAA"), doh(dominio, "MX"), doh(dominio, "A", "&do=true"), doh(dominio, "AAAA")]);
      const IPs = datos(a, 1).filter((x) => IPV4.test(x));
      hall.push(...L.revisarDNS({ dominio, txt: datos(txt, 16), dmarc: datos(dmarc, 16), caa: datos(caa, 257), mx: datos(mx, 15), dnssec: Boolean(a.AD) }));
      paso(`DNS revisado: ${IPs.length} IP públicas (${IPs.join(", ") || "ninguna"})${datos(aaaa, 28).length ? " + IPv6" : ""}`);
      for (const ip of IPs) if (!ips.includes(ip)) ips.push(ip);
    }
    for (const ip of ips.slice(0, 8)) {
      const r = await fetch(`https://internetdb.shodan.io/${ip}`);
      const idb = r.ok ? await r.json() : null;
      let epss = {};
      const cves = (idb?.vulns || []).slice(0, 100);
      if (cves.length) {
        const e = await fetch(`https://api.first.org/data/v1/epss?cve=${cves.join(",")}`).then((x) => (x.ok ? x.json() : { data: [] })).catch(() => ({ data: [] }));
        epss = Object.fromEntries((e.data || []).map((d) => [d.cve, Number(d.epss)]));
      }
      hall.push(...L.revisarIP(ip, idb, kevPorCve, epss));
      paso(`IP ${ip}: ${idb ? `${(idb.ports || []).length} puertos, ${(idb.vulns || []).length} vulnerabilidades conocidas` : "sin datos en InternetDB (buena señal: no se ven servicios expuestos)"}`);
    }
    const inv = L.leerInventario($("rt-inv").value);
    if (inv.length) { const r = L.revisarInventario(inv, kev); hall.push(...r); paso(`Software revisado: ${inv.length} productos, ${r.length} hallazgos`); }
    const deps = [];
    for (const f of $("rt-deps").files || []) {
      if (f.size > 5e6) { paso(`${f.name}: demasiado grande (máx. 5 MB)`); continue; }
      try { deps.push(...L.leerDependencias(f.name, await f.text())); } catch { paso(`${f.name}: no se pudo leer`); }
    }
    if (deps.length) {
      const lote = deps.slice(0, 1000);
      const r = await fetch("https://api.osv.dev/v1/querybatch", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queries: lote.map((d) => ({ package: { name: d.name, ecosystem: d.ecosystem }, version: d.version })) }) });
      const osv = r.ok ? await r.json() : { results: [] };
      const hd = L.revisarDependencias(lote, osv); hall.push(...hd);
      paso(`Dependencias revisadas: ${lote.length}, con vulnerabilidades: ${hd.length}`);
    }
  } catch (e) {
    paso(`Error de conexión: ${e.message}. Lo revisado hasta aquí se muestra abajo.`);
  }
  const r = L.resumen(hall);
  ultimo = { meta: { empresa: $("rt-empresa").value.trim(), dominio, fecha: new Date().toISOString().slice(0, 10), alcance: [dominio && `dominio ${dominio}`, ips.length && `${ips.length} IP`, $("rt-inv").value.trim() && "inventario de software", ($("rt-deps").files || []).length && "dependencias"].filter(Boolean).join(", ") || "—" }, r };
  $("rt-res").innerHTML = `<div class="kpis"><div class="kpi"><b>${esc(r.nivel)}</b>Nivel de riesgo</div>${L.SEV.map((s) => `<div class="kpi"><b>${r.conteo[s]}</b>${L.NOMBRE_SEV[s]}</div>`).join("")}</div>`
    + (r.lista.map((x) => `<div class="hall ${esc(x.sev)}"><h3>[${esc(L.NOMBRE_SEV[x.sev])}] ${esc(x.titulo)}</h3><p class="meta">${enlace(x.detalle)}</p><p><b>Qué hacer:</b> ${enlace(x.accion)}</p>${x.como_verificar ? `<p class="meta"><b>Cómo verificar:</b> ${enlace(x.como_verificar)}</p>` : ""}<p class="meta">Fuente: ${esc(x.fuente)}</p></div>`).join("") || '<p class="meta">Sin hallazgos con la información disponible.</p>');
  $("rt-informe").hidden = $("rt-imprimir").hidden = false;
  $("rt-correr").disabled = !$("rt-aut").checked;
}

if (typeof document !== "undefined" && $("rt-correr")) {
  $("rt-aut").addEventListener("change", () => { $("rt-correr").disabled = !$("rt-aut").checked; });
  $("rt-correr").addEventListener("click", correr);
  $("rt-informe").addEventListener("click", () => {
    if (!ultimo) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([L.informeMd(ultimo.meta, ultimo.r)], { type: "text/markdown" }));
    a.download = `revision-tecnica-${(ultimo.meta.dominio || "empresa").replace(/[^a-z0-9.-]/gi, "_")}-${ultimo.meta.fecha}.md`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $("rt-imprimir").addEventListener("click", () => window.print());
}
