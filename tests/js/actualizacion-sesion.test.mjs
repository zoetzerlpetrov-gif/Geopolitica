import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { iniciarCacheAplicacion, mantenerSeleccion } from "../../js/actualizacion-app.js";
import { iniciarRefresco } from "../../js/refresh.js";
import { LineaTiempo } from "../../js/linea-tiempo.js";

test("activar una nueva caché no recarga la página ni modifica las selecciones", async (t) => {
  const anterior = globalThis.location;
  let recargas = 0, registrado;
  globalThis.location = { reload() { recargas++; } };
  t.after(() => { globalThis.location = anterior; });
  const sw = new EventTarget();
  sw.controller = {};
  sw.register = async (url) => { registrado = url; };
  const avisos = [], filtros = { capas: new Set(["estafas", "ciberataques"]), pais: "MEX" };
  await iniciarCacheAplicacion(sw, (texto) => avisos.push(texto));
  sw.dispatchEvent(new Event("controllerchange"));
  sw.dispatchEvent(new Event("controllerchange"));
  assert.equal(registrado, "sw.js");
  assert.equal(recargas, 0);
  assert.equal(avisos.length, 2);
  assert.equal(filtros.pais, "MEX");
  assert.deepEqual([...filtros.capas], ["estafas", "ciberataques"]);
  const app = readFileSync(new URL("../../js/app.js", import.meta.url), "utf8");
  assert.ok(app.includes("iniciarCacheAplicacion(navigator.serviceWorker"));
  assert.ok(!/addEventListener\("controllerchange"[\s\S]{0,180}location\.reload/.test(app));
});

test("un service worker nuevo espera; no fuerza su activación sobre las pestañas abiertas", () => {
  let forzadas = 0;
  const eventos = new Map();
  vm.runInNewContext(readFileSync(new URL("../../sw.js", import.meta.url), "utf8"), {
    self: { skipWaiting() { forzadas++; }, addEventListener(tipo, fn) { eventos.set(tipo, fn); } },
  });
  eventos.get("install")?.({ waitUntil() {} });
  assert.equal(forzadas, 0);
  assert.ok(eventos.has("fetch")); // Se conserva la actualización normal por red.
});

test("un tipo seleccionado sigue seleccionado con cero coincidencias, sin duplicar opciones", () => {
  const select = { value: "", options: [{ value: "" }],
    ownerDocument: { createElement: () => ({}) }, add(o) { this.options.push(o); } };
  mantenerSeleccion(select, "Corte de internet");
  mantenerSeleccion(select, "Corte de internet");
  assert.equal(select.value, "Corte de internet");
  assert.equal(select.options.length, 2);
  assert.equal(select.options[1].textContent, "Corte de internet (0)");
  mantenerSeleccion(select, ""); // Solo la acción del usuario quita el filtro.
  assert.equal(select.value, "");
});

function tiempo() {
  const elementos = new Map(["lt-ventana", "lt-atras", "lt-hist", "lt-texto", "lt-play"].map((id) => [id, { value: "0", max: "0", setAttribute() {} }]));
  const cambios = [];
  const linea = new LineaTiempo({ querySelector: (id) => elementos.get(id.slice(1)) }, (v) => cambios.push(v));
  return { linea, cambios };
}
const H = 3600000, base = Date.parse("2026-11-01T00:00:00Z");
const eventos = (a, b) => [{ _t: base + a * H }, { _t: base + b * H }];

test("refrescar los eventos conserva ventana y horas atrás aunque cambien ambos extremos", () => {
  const { linea, cambios } = tiempo();
  linea.setEventos(eventos(0, 48));
  linea.sel.value = "24";
  linea.rng.value = "36"; // 12 horas atrás.
  linea.rng.oninput();
  linea.setEventos(eventos(24, 60));
  assert.equal(linea.sel.value, "24");
  assert.equal(linea.horasAtras, 12);
  assert.deepEqual(cambios.at(-1), { desde: base + 24 * H, hasta: base + 48 * H });
  linea.setEventos([]);
  assert.equal(linea.sel.value, "24");
  assert.equal(linea.horasAtras, 12);
  assert.deepEqual(cambios.at(-1), { desde: base + 24 * H, hasta: base + 48 * H });
  linea.setEventos(eventos(50, 62));
  assert.equal(linea.horasAtras, 12); // Incluso si la ventana de datos se acorta.
});

test("la posición «ahora» continúa siguiendo los datos recientes sin cambiar la ventana", () => {
  const { linea, cambios } = tiempo();
  linea.setEventos(eventos(0, 48));
  linea.sel.value = "6";
  linea.setEventos(eventos(24, 60));
  assert.equal(linea.horasAtras, 0);
  assert.deepEqual(cambios.at(-1), { desde: base + 54 * H, hasta: base + 60 * H });
});

test("una descarga fallida se reintenta sin reiniciar la sesión ni darla por actualizada", async (t) => {
  const originales = { fetch: globalThis.fetch, setInterval: globalThis.setInterval, document: globalThis.document, warn: console.warn };
  globalThis.setInterval = () => 0;
  globalThis.document = { addEventListener() {} };
  console.warn = () => {};
  t.after(() => Object.assign(globalThis, { fetch: originales.fetch, setInterval: originales.setInterval, document: originales.document }) && (console.warn = originales.warn));
  const viejo = { generado_utc: "2026-11-01T10:00:00Z", eventos_total: 1, fuentes: [] };
  const nuevo = { ...viejo, generado_utc: "2026-11-01T11:00:00Z", eventos_total: 2 };
  globalThis.fetch = async () => ({ ok: true, json: async () => nuevo });
  let aplicadas = 0;
  const filtros = { pais: "MEX", subtipos: ["spacex-starlink"], severidad: 3 };
  const antes = structuredClone(filtros);
  const elDatos = {}, elProxima = {};
  const refresco = iniciarRefresco({ runLog: viejo, elDatos, elProxima, onNuevosDatos: async () => {
    if (++aplicadas === 1) throw new Error("red interrumpida");
  } });
  await refresco.revisar();
  assert.ok(elDatos.textContent.includes("1 eventos"));
  await refresco.revisar();
  assert.equal(aplicadas, 2);
  assert.ok(elDatos.textContent.includes("2 eventos"));
  await refresco.revisar();
  assert.equal(aplicadas, 2);
  assert.deepEqual(filtros, antes);
});
