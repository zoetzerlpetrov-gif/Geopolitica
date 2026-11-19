import { test } from "node:test";
import assert from "node:assert/strict";
import { validar, servirPublico, servirAdmin, CAMPOS } from "../../cloudflare/legal/service.js";
import { valor, fechaLarga, cargar } from "../../js/legal.js";
import { revisar, puedeGuardar, CAMPOS as FORM } from "../../js/legal_admin.js";

const completo = { tipo_persona: "moral", razon_social: "DOMINUS OSINT, S.A.S. de C.V.", nombre_comercial: "DOMINUS OSINT", rfc: "dos251119ab1", domicilio: "Av. Ejemplo 1, CDMX",
  correo_privacidad: "privacidad@dominusosint.com", correo_contacto: "contacto@dominusosint.com", telefono: "+52 55 0000 0000", departamento_datos: "Área de datos",
  jurisdiccion: "la Ciudad de México", representante_ue: "", sitio: "https://dominusosint.com/", actualizado_privacidad: "2026-11-19", actualizado_terminos: "2026-11-19" };

test("validación del Worker: campos, formatos y limpieza", () => {
  const { datos } = validar(completo);
  assert.equal(datos.rfc, "DOS251119AB1");
  assert.match(validar({ ...completo, extra: "x" }).error, /no permitidos/);
  assert.match(validar({ ...completo, correo_privacidad: "no-es-correo" }).error, /formato/);
  assert.match(validar({ ...completo, tipo_persona: "otra" }).error, /fisica o moral/);
  assert.match(validar({ ...completo, domicilio: "x".repeat(301) }).error, /300/);
  assert.equal(validar({ ...completo, domicilio: "<b>Calle</b> 1" }).datos.domicilio, "b Calle /b 1");
  assert.deepEqual(Object.keys(CAMPOS).sort(), FORM.map(([k]) => k).sort());   // el formulario y el Worker piden lo mismo
});

function dbFalsa() {
  let fila = null;
  return { prepare: (sql) => ({ bind: (...a) => ({ run: async () => { fila = { datos: a[0], actualizado: 1 }; }, first: async () => fila }), run: async () => {}, first: async () => (sql.startsWith("SELECT") ? fila : null) }) };
}

test("Worker: guarda solo con el origen correcto y publica en /legal/datos.json", async () => {
  const env = { OSINT_PLANS_DB: dbFalsa() };
  const json = (v, status = 200) => Response.json(v, { status });
  const url = new URL("https://geopolitica.example.workers.dev/admin/huella/legal");
  const malo = await servirAdmin(new Request(url, { method: "PUT", headers: { Origin: "https://otro.com", "Content-Type": "application/json" }, body: "{}" }), url, env, json, "1");
  assert.equal(malo.status, 403);
  const ok = await servirAdmin(new Request(url, { method: "PUT", headers: { Origin: url.origin, "Content-Type": "application/json" }, body: JSON.stringify(completo) }), url, env, json, "1");
  assert.equal(ok.status, 200);
  const pub = await servirPublico(env);
  assert.equal(pub.headers.get("access-control-allow-origin"), "*");
  assert.equal((await pub.json()).razon_social, completo.razon_social);
  assert.equal((await servirPublico({})).status, 200);   // sin base: objeto vacío
});

test("páginas públicas: valores, fechas y respaldo", async () => {
  assert.equal(fechaLarga("2026-11-19"), "19 de noviembre de 2026");
  assert.equal(valor({ razon_social: "  " }, "razon_social"), null);
  assert.equal(valor(completo, "actualizado_terminos"), "19 de noviembre de 2026");
  const pedir = async (u) => (u === "config/legal.json"
    ? { ok: true, json: async () => ({ endpoint: "https://w/legal/datos.json", datos: { nombre_comercial: "DOMINUS OSINT", domicilio: "" } }) }
    : { ok: true, json: async () => ({ domicilio: "Calle 1" }) });
  assert.deepEqual(await cargar(pedir), { nombre_comercial: "DOMINUS OSINT", domicilio: "Calle 1" });
  const caido = async (u) => { if (u !== "config/legal.json") throw new Error("red"); return pedir(u); };
  assert.equal((await cargar(caido)).domicilio, "");
});

test("revisión del formulario", () => {
  assert.equal(revisar(completo).length, 0);
  assert.ok(revisar({}).some((x) => x.includes("razón social")));
  assert.ok(revisar({ ...completo, tipo_persona: "fisica" }).some((x) => x.includes("sociedad")));
  assert.equal(puedeGuardar({ hostname: "geopolitica.zoetzerl-petrov.workers.dev" }), true);
  assert.equal(puedeGuardar({ hostname: "admin.dominusosint.com" }), true);
  assert.equal(puedeGuardar({ hostname: "zoetzerlpetrov-gif.github.io" }), false);
});
