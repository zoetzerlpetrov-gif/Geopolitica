import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../../js/revision-tecnica-logica.js";

test("correo y DNS: sin SPF ni DMARC es alto; +all es crítico; p=none es medio", () => {
  const a = L.revisarDNS({ dominio: "x.mx", txt: [], dmarc: [], caa: [], mx: ["10 mx.x.mx"], dnssec: false });
  assert.deepEqual(a.map((h) => h.sev), ["alta", "alta", "baja", "baja"]);
  const b = L.revisarDNS({ dominio: "x.mx", txt: ['"v=spf1 +all"'], dmarc: ['"v=DMARC1; p=none"'], caa: ["0 issue letsencrypt.org"], mx: ["1 m"], dnssec: true });
  assert.deepEqual(b.map((h) => h.sev), ["critica", "media"]);
});

test("IP: puertos peligrosos y fallas del catálogo KEV son críticos", () => {
  const kev = { "CVE-2024-3400": { fabricante: "Palo Alto", producto: "PAN-OS", versiones: [{ producto: "pan-os", corregida: ["10.2.9-h1"] }] } };
  const r = L.revisarIP("203.0.113.1", { ports: [443, 3389], vulns: ["CVE-2024-3400", "CVE-2020-1"], cpes: ["cpe:/a:x"] }, kev, { "CVE-2020-1": 0.3 });
  assert.equal(r.filter((h) => h.sev === "critica").length, 2);
  assert.ok(r.some((h) => h.sev === "alta" && /1 vulnerabilidades/.test(h.titulo)));
  assert.deepEqual(L.revisarIP("1.1.1.1", { detail: "No information available" }), []);
  const cdn = L.revisarIP("172.67.1.1", { ports: [8080, 3306], vulns: ["CVE-2024-3400"], tags: ["cdn"], cpes: ["cpe:/a:wordpress:wordpress"] }, kev);
  assert.equal(cdn.length, 1);
  assert.equal(cdn[0].sev, "info");
});

test("inventario: versión vieja vulnerable, versión corregida no aparece", () => {
  const kev = [{ cve: "CVE-1", fabricante: "Fortinet", producto: "FortiOS", versiones: [{ producto: "fortios", corregida: ["7.2.8", "7.4.4"] }], fecha: "2026-01-01", ransomware: true }];
  const inv = L.leerInventario("FortiOS 7.2.5\nFortiOS 7.4.5\nNotepad");
  assert.deepEqual(inv[0], { nombre: "FortiOS", version: "7.2.5" });
  const r = L.revisarInventario(inv, kev);
  assert.equal(r.length, 1);
  assert.match(r[0].titulo, /7\.2\.5/);
  assert.equal(r[0].sev, "critica");
  const chrome = L.revisarInventario(L.leerInventario("Chrome 120.0.6099.71"), [{ cve: "CVE-2", fabricante: "Google", producto: "Chromium V8", versiones: [{ producto: "chrome", corregida: ["131.0.6778.85"] }], fecha: "2026-01-01" }]);
  assert.equal(chrome.length, 1);
  assert.ok(L.compararVersion("10.2.10", "10.2.9") > 0 && L.compararVersion("1.0", "1.0.0") === 0);
});

test("dependencias npm y PyPI, hallazgos de OSV y el informe en Markdown", () => {
  const npm = L.leerDependencias("package-lock.json", JSON.stringify({ packages: { "": {}, "node_modules/lodash": { version: "4.17.15" } } }));
  const py = L.leerDependencias("requirements.txt", "django==3.2.0  # web\nrequests>=2\n");
  assert.deepEqual(npm, [{ ecosystem: "npm", name: "lodash", version: "4.17.15" }]);
  assert.deepEqual(py, [{ ecosystem: "PyPI", name: "django", version: "3.2.0" }]);
  const h = L.revisarDependencias(npm, { results: [{ vulns: [{ id: "GHSA-1" }, { id: "GHSA-2" }, { id: "GHSA-3" }] }] });
  assert.equal(h[0].sev, "alta");
  const r = L.resumen([...h, ...L.revisarDNS({ dominio: "x.mx", txt: ['"v=spf1 +all"'], dmarc: [], caa: [], mx: ["1 m"], dnssec: true })]);
  assert.equal(r.nivel, "crítico");
  const md = L.informeMd({ empresa: "ACME", dominio: "x.mx", fecha: "2026-11-21", alcance: "dominio x.mx" }, r);
  assert.match(md, /# Revisión técnica de vulnerabilidades — ACME/);
  assert.match(md, /no se escanearon/);
});
