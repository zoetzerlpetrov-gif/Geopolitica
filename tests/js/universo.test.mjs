import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tsmg, sol, luna, planeta, separacion, camara, aPantalla, vector, radec, recortarContorno } from "../../js/universo.js";

const cielo = JSON.parse(readFileSync(new URL("../../data/base/cielo.json", import.meta.url)));
const EL = (id) => cielo.planetas[id].el;
const T = (s) => new Date(s);

test("tiempo sidéreo de Greenwich en la época J2000", () => {
  assert.ok(Math.abs(tsmg(T("2000-01-01T12:00:00Z")) - 280.46) < 0.01);
});

test("Sol: equinoccio de marzo de 2024 cerca de AR 0°, Dec 0°", () => {
  const [ra, dec] = sol(T("2024-03-20T03:06:00Z"));
  assert.ok(Math.min(ra, 360 - ra) < 0.1 && Math.abs(dec) < 0.05, `${ra} ${dec}`);
});

test("Luna: eclipse total del 8 de abril de 2024 (junto al Sol) y luna llena del 23 de abril", () => {
  const t = T("2024-04-08T18:18:00Z");
  assert.ok(separacion(luna(t), sol(t)) < 1, `eclipse: ${separacion(luna(t), sol(t))}`);
  const l = T("2024-04-23T23:49:00Z");
  assert.ok(separacion(luna(l), sol(l)) > 178, `llena: ${separacion(luna(l), sol(l))}`);
});

test("planetas: gran conjunción Júpiter–Saturno, oposición de Marte y elongación de Venus (2020)", () => {
  const t = T("2020-12-21T18:00:00Z");
  assert.ok(separacion(planeta(EL("jup"), EL("ter"), t), planeta(EL("sat"), EL("ter"), t)) < 0.4);
  const m = T("2020-10-13T23:20:00Z");
  assert.ok(separacion(planeta(EL("mar"), EL("ter"), m), sol(m)) > 175);
  const v = T("2020-03-24T22:00:00Z");
  const e = separacion(planeta(EL("ven"), EL("ter"), v), sol(v));
  assert.ok(e > 45 && e < 47.5, `Venus: ${e}`);
});

test("cámara: el punto del cielo opuesto a la vista queda al centro; el norte arriba; bearing y pitch lo mueven", () => {
  const f = T("2026-10-17T00:00:00Z");
  const g = tsmg(f);
  const cam = camara({ lng: 0, lat: 0 }, f);
  const antipoda = [(g + 180) % 360, 0];
  const c = aPantalla(cam, vector(...antipoda), 1000, 800);
  assert.ok(Math.abs(c[0] - 500) < 1e-6 && Math.abs(c[1] - 400) < 1e-6);
  assert.ok(aPantalla(cam, vector(antipoda[0], 10), 1000, 800)[1] < 400);                                // más al norte → arriba
  assert.equal(aPantalla(cam, vector(g, 0), 1000, 800), null);                                            // detrás de la cámara: no se dibuja
  assert.ok(aPantalla(camara({ lng: 0, lat: 0, bearing: 180 }, f), vector(antipoda[0], 10), 1000, 800)[1] > 400); // bearing 180: el norte abajo
  assert.ok(aPantalla(camara({ lng: 0, lat: 0, pitch: 40 }, f), vector(...antipoda), 1000, 800)[1] > 400);    // inclinar: el cielo baja
  const [ra] = radec(vector(359.9, 0));
  assert.ok(Math.abs(ra - 359.9) < 1e-9);
});

test("catálogo: estrellas, constelaciones y planetas presentes", () => {
  assert.ok(cielo.estrellas.length > 2500 && cielo.constelaciones.length >= 88 && cielo.lineas.length > 80);
  assert.ok(cielo.nombres.some(([n]) => n === "Sirio") && cielo.objetos.some(([n]) => /Andrómeda/.test(n)));
  assert.deepEqual(Object.keys(cielo.planetas).sort(), ["jup", "mar", "mer", "nep", "sat", "ter", "ura", "ven"]);
});

test("contornos grandes: se densifican y se recortan al frente de la cámara", () => {
  const f = [1, 0, 0];
  // cuadrado de 40° centrado en la dirección de la cámara: todo visible y densificado
  const c = [vector(-20, -20), vector(20, -20), vector(20, 20), vector(-20, 20)];
  const v = recortarContorno(c, f);
  assert.ok(v.length > 40 && v.every((x) => x[0] >= 0.05 - 1e-9));
  // contorno que cruza detrás: solo queda la parte de enfrente
  const cruz = recortarContorno([vector(-120, 0), vector(0, 30), vector(120, 0), vector(0, -30)], f);
  assert.ok(cruz.length > 3 && cruz.every((x) => x[0] >= 0.05 - 1e-9));
  assert.deepEqual(recortarContorno([vector(170, 0), vector(180, 10), vector(190, 0)], f), []); // todo detrás
});
