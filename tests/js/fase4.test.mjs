import { test } from "node:test";
import assert from "node:assert/strict";
import * as A from "../../js/agencia-logica.js";

test("certificados: subdominios, emisores, comodines y los que vencen pronto", () => {
  const ahora = new Date("2026-10-28T12:00:00Z");
  const e = [
    { dns_names: ["sat.gob.mx", "www.sat.gob.mx"], not_before: "2026-06-01T00:00:00Z", not_after: "2026-11-10T00:00:00Z", issuer: { friendly_name: "DigiCert" } },
    { dns_names: ["*.sat.gob.mx"], not_before: "2026-01-01T00:00:00Z", not_after: "2027-01-01T00:00:00Z", issuer: { name: "C=US, O=Let's Encrypt, CN=R11" } },
    { dns_names: ["viejo.sat.gob.mx"], not_before: "2024-01-01T00:00:00Z", not_after: "2025-01-01T00:00:00Z", issuer: { friendly_name: "DigiCert" } },
  ];
  const s = A.resumenCertificados(e, ahora);
  assert.equal(s.total, 3); assert.equal(s.vigentes, 2);
  assert.deepEqual(s.comodines, ["*.sat.gob.mx"]);
  assert.deepEqual(s.emisores[0], ["DigiCert", 2]);
  assert.equal(s.emisores[1][0], "Let's Encrypt");
  assert.equal(s.vencen.length, 1); assert.equal(s.vencen[0].dias, 12);
  assert.ok(A.esDominio("sat.gob.mx") && !A.esDominio("https://x") && !A.esDominio("hola"));
  assert.match(A.urlCertSpotter(" SAT.gob.mx "), /domain=sat\.gob\.mx&include_subdomains=true/);
});

test("RIPEstat: IP y ASN", () => {
  assert.equal(A.urlsRipe("8.8.8.8").tipo, "ip");
  assert.match(A.urlsRipe("as8151").urls.prefijos, /resource=AS8151/);
  assert.equal(A.urlsRipe("hola"), null);
  const ip = A.resumenRipe("ip", { prefijo: { data: { resource: "8.8.8.0/24", announced: true, asns: [{ asn: 15169, holder: "GOOGLE" }] } }, pais: { data: { located_resources: [{ location: "US" }] } } });
  assert.deepEqual(ip, { tipo: "ip", prefijo: "8.8.8.0/24", anunciado: true, asns: [{ asn: 15169, titular: "GOOGLE" }], pais: "US" });
  const as = A.resumenRipe("asn", { as: { data: { resource: "8151", holder: "Uninet", announced: true } }, prefijos: { data: { prefixes: [{ prefix: "187.128.0.0/16" }, { prefix: "201.0.0.0/24" }, { prefix: "2806::/32" }] } } });
  assert.equal(as.prefijos_v4.length, 2); assert.equal(as.prefijos_v6.length, 1); assert.equal(as.direcciones_v4, 65536 + 256);
});

test("CIDR", () => {
  const r = A.cidr("192.168.10.37/27");
  assert.equal(r.red, "192.168.10.32"); assert.equal(r.difusion, "192.168.10.63"); assert.equal(r.equipos, 30); assert.equal(r.privada, "192.168.0.0/16");
  assert.equal(A.cidr("8.8.8.8/32").equipos, 1);
  assert.equal(A.cidr("8.8.8.8/24").privada, null);
  assert.equal(A.cidr("300.1.1.1/24"), null);
  assert.equal(A.cidr("10.0.0.0/8").equipos, 16777214);
});

test("cronología: orden, huecos y CSV", () => {
  let c = { hechos: [] };
  c = A.agregarHecho(c, { fecha: "2026-10-20", hecho: "Segundo", fuente: "Oficio 2" });
  c = A.agregarHecho(c, { fecha: "2026-10-01", hecho: "Primero, con \"comillas\"" });
  c = A.agregarHecho(c, { fecha: "", hecho: "sin fecha" });
  assert.deepEqual(c.hechos.map((h) => h.hecho), ["Primero, con \"comillas\"", "Segundo"]);
  assert.deepEqual(A.huecos(c), [{ desde: "2026-10-01", hasta: "2026-10-20", dias: 19 }]);
  assert.match(A.csvCronologia(c), /"Primero, con ""comillas"""/);
  assert.equal(A.quitarHecho(c, c.hechos[0].id).hechos.length, 1);
});

test("días hábiles de México (LFT art. 74) y semáforo", () => {
  assert.deepEqual(A.feriadosMX(2026), ["2026-01-01", "2026-02-02", "2026-03-16", "2026-05-01", "2026-09-16", "2026-11-16", "2026-12-25"]);
  assert.ok(A.feriadosMX(2030).includes("2030-10-01"));
  assert.ok(!A.feriadosMX(2027).includes("2027-10-01"));
  assert.equal(A.venceHabiles("2026-10-28", 10), "2026-11-11");
  assert.equal(A.venceHabiles("2026-10-28", 10, ["2026-11-02"]), "2026-11-12");
  assert.equal(A.venceHabiles("2026-11-13", 1), "2026-11-17");  // viernes → lunes 16 es feriado → martes 17
  assert.equal(A.habilesRestantes("2026-10-28", "2026-11-11"), 10);
  assert.equal(A.habilesRestantes("2026-11-11", "2026-10-28"), -10);
  assert.equal(A.semaforo({ estado: "recibido", limite: "2026-10-29" }, "2026-10-28").texto, "Vence en 1 día(s) hábil(es)");
  assert.equal(A.semaforo({ estado: "respondido", limite: "2026-10-01" }, "2026-10-28").texto, "Concluido");
  assert.match(A.semaforo({ estado: "turnado", limite: "2026-10-26" }, "2026-10-28").texto, /Vencido hace 2/);
  assert.match(A.csvOficios([{ folio: "A-1", recibido: "2026-10-28", remitente: "SSPC", asunto: "Informe", area: "TI", dias: 10, limite: "2026-11-11", estado: "turnado" }]), /"Turnado"/);
});
