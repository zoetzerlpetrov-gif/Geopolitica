// Inteligencia estratégica corporativa: instalaciones propias (sedes, plantas, proveedores, almacenes) cruzadas con los
// eventos del mapa, matriz de riesgo 5×5 (ISO 31000), escenarios, exposición por país y radar de competidores.
// Las instalaciones se guardan SOLO en este navegador (localStorage); no se envían a ningún servidor.
import { esc, safeUrl, storage, distanciaKm, getJSON } from "./util.js";
import * as seg from "./seguimiento.js";

const CLAVE = "gp_corp_instalaciones";
export const TIPOS_INST = { sede: "Sede", planta: "Planta", almacen: "Almacén o centro de distribución", proveedor: "Proveedor", cliente: "Cliente clave", puerto: "Puerto o cruce usado" };

/** Lugares y eventos de varias capas → lista común {lat, lon, fecha, titulo, url, sev (1–5), tipo}. */
export function normalizar({ eventos = [], ataques, crimen, cortes, tornados, redCortes, salud } = {}) {
  const out = [];
  const tipoArea = { seguridad: "conflicto", clima: "clima", salud: "salud", tecnologia: "corte", infraestructura: "corte", geoeconomia: "sancion" };
  for (const e of eventos) {
    if (e.lat == null || e.lon == null) continue;
    out.push({ lat: e.lat, lon: e.lon, fecha: e.fecha_utc, titulo: e.titulo, url: e.url, sev: Number(e.severidad) || 2, tipo: tipoArea[e.area_principal] || "otro" });
  }
  const puntos = (fc, f) => (fc?.features || []).forEach((x) => {
    const c = x.geometry?.type === "Point" ? x.geometry.coordinates : null;
    if (c) out.push({ lon: c[0], lat: c[1], ...f(x.properties || {}) });
  });
  puntos(ataques, (p) => ({ fecha: p.date, titulo: p.title, url: p.url, sev: Number(p.severidad) || 3, tipo: "conflicto" }));
  puntos(crimen, (p) => ({ fecha: p.date, titulo: p.title, url: p.url, sev: Number(p.severidad) || 3, tipo: "crimen" }));
  puntos(cortes, (p) => ({ fecha: p.date, titulo: p.title, url: p.url, sev: p.severe ? 4 : 2, tipo: "corte" }));
  puntos(tornados, (p) => ({ fecha: p.date, titulo: p.title, url: p.url, sev: p.severe ? 4 : 3, tipo: "clima" }));
  puntos(redCortes, (p) => ({ fecha: p.fecha_utc, titulo: `Corte de internet: ${p.pais || ""}`, url: p.url, sev: p.en_curso ? 4 : 2, tipo: "corte" }));
  puntos(salud, (p) => ({ fecha: p.date, titulo: p.title, url: p.url, sev: 3, tipo: "salud" }));
  return out;
}

/** Amenazas a menos de «radioKm» de la instalación y de los últimos «dias» (las que no traen fecha cuentan). */
export function cercanas(inst, amenazas, { radioKm = 100, dias = 30, ahora = Date.now() } = {}) {
  const desde = ahora - dias * 86400000;
  return amenazas
    .filter((a) => (!a.fecha || Date.parse(a.fecha) >= desde) && distanciaKm(inst.lat, inst.lon, a.lat, a.lon) <= radioKm)
    .map((a) => ({ ...a, km: Math.round(distanciaKm(inst.lat, inst.lon, a.lat, a.lon)) }))
    .sort((a, b) => b.sev - a.sev || a.km - b.km);
}

/** Probabilidad 1–5: eventos cercanos (pesan más los graves y cercanos) + índice de inestabilidad del país (0–100). */
export function probabilidad(cerca, indicePais = null) {
  const peso = cerca.reduce((s, a) => s + a.sev * (a.km <= 25 ? 1.5 : 1), 0);
  let p = peso === 0 ? 1 : peso < 8 ? 2 : peso < 20 ? 3 : peso < 40 ? 4 : 5;
  if (indicePais != null && indicePais >= 50) p = Math.min(5, p + 1);
  return p;
}

/** Nivel de riesgo (probabilidad × impacto) con la banda de la matriz 5×5. */
export function nivel(prob, impacto) {
  const v = prob * impacto;
  const banda = v >= 20 ? ["critico", "Crítico", "#7F0000"] : v >= 10 ? ["alto", "Alto", "#D84315"] : v >= 5 ? ["medio", "Medio", "#F9A825"] : ["bajo", "Bajo", "#2E7D32"];
  return { valor: v, id: banda[0], etiqueta: banda[1], color: banda[2] };
}

/** Matriz 5×5 en SVG: filas = probabilidad (5 arriba), columnas = impacto; cada instalación es un número en su celda. */
export function htmlMatriz(filas) {
  const c = 52, o = 30;
  let s = `<svg viewBox="0 0 ${o + c * 5 + 4} ${o + c * 5 + 4}" class="matriz" role="img" aria-label="Matriz de riesgo 5 por 5">`;
  for (let p = 1; p <= 5; p++) for (let i = 1; i <= 5; i++) {
    const n = nivel(p, i), x = o + (i - 1) * c, y = (5 - p) * c;
    const aqui = filas.filter((f) => f.prob === p && f.impacto === i);
    s += `<rect x="${x}" y="${y}" width="${c - 2}" height="${c - 2}" fill="${n.color}" opacity="0.28"><title>Probabilidad ${p} × impacto ${i} = ${n.valor} (${n.etiqueta})</title></rect>`;
    if (aqui.length) s += `<text x="${x + c / 2 - 1}" y="${y + c / 2 + 5}" text-anchor="middle" class="matriz-n">${aqui.map((f) => f.num).join(",")}</text>`;
  }
  s += `<text x="${o + c * 2.5}" y="${o + c * 5 - 2}" text-anchor="middle" class="matriz-eje">Impacto →</text>`;
  s += `<text x="10" y="${c * 2.5}" text-anchor="middle" class="matriz-eje" transform="rotate(-90 10 ${c * 2.5})">Probabilidad →</text></svg>`;
  return s;
}

/** Tipos de amenaza presentes cerca → escenarios de la configuración (con «sancion» si el país tiene sanciones). */
export function escenariosPara(cerca, sancionesPais, cfg) {
  const tipos = new Set(cerca.map((a) => a.tipo));
  if (sancionesPais?.length) tipos.add("sancion");
  return [...tipos].filter((t) => cfg.escenarios[t]).map((t) => ({ id: t, ...cfg.escenarios[t] }));
}

/** Contexto de un país: índice de inestabilidad, sanciones y situación de pagos (CBDC, cripto, efectivo). */
export function exposicionPais(iso3, { indice = {}, cfg = {}, pagos = {} } = {}) {
  return {
    iso3,
    indice: indice[iso3]?.indice ?? null,
    eventos: indice[iso3]?.eventos ?? 0,
    sanciones: cfg.sanciones_pais?.[iso3] || [],
    pagos: pagos.paises?.[iso3] || {},
  };
}

/** Titulares del noticiero que mencionan a un competidor (sin distinguir mayúsculas ni acentos). */
export function enNoticias(nombre, noticiero, max = 15) {
  const n = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = n(nombre).trim();
  if (q.length < 3) return [];
  return (noticiero?.notas || []).filter((x) => n(x.t || x.titulo).includes(q)).slice(0, max);
}

export const enlacesRadar = (nombre, cfg) => cfg.radar.map((r) => ({ n: r.n, u: r.u.replace("{q}", encodeURIComponent(nombre)) }));

// ------------------------------------------------------------------ almacenamiento propio
export function leer() { try { return JSON.parse(storage.get(CLAVE) || "[]"); } catch (e) { return []; } }
export function guardar(lista) { storage.set(CLAVE, JSON.stringify(lista)); }

/** Valida una instalación capturada; devuelve [instalación, error]. */
export function validar(f) {
  const lat = Number(f.lat), lon = Number(f.lon), impacto = Number(f.impacto);
  if (!String(f.nombre || "").trim()) return [null, "Escribe un nombre."];
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180) || f.lat === "" || f.lon === "") return [null, "Coordenadas inválidas: latitud entre -90 y 90, longitud entre -180 y 180."];
  if (!(impacto >= 1 && impacto <= 5)) return [null, "El impacto va de 1 a 5."];
  return [{ id: `corp:${Date.now().toString(36)}`, nombre: String(f.nombre).trim().slice(0, 80), tipo: TIPOS_INST[f.tipo] ? f.tipo : "planta",
    lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4, iso3: String(f.iso3 || "").toUpperCase().slice(0, 3), impacto,
    nota: String(f.nota || "").slice(0, 200) }, null];
}

// ------------------------------------------------------------------ página
async function iniciar() {
  const $ = (id) => document.getElementById(id);
  const vivo = (f) => getJSON(`data/vivos/${f}`, { bust: true }).catch(() => null);
  const [cfg, pagos, ind, ciudades, eventos, ataques, crimen, cortes, tornados, redCortes, salud, noticiero] = await Promise.all([
    getJSON("config/corporativo.json"), getJSON("config/pagos.json").catch(() => ({})), getJSON("data/indice-paises.json", { bust: true }).catch(() => ({ paises: {} })),
    getJSON("config/ciudades.json").catch(() => ({ ciudades: [] })), getJSON("data/events.json", { bust: true }).catch(() => ({ eventos: [] })),
    vivo("ataques.geojson"), vivo("crimen.geojson"), vivo("cortes.geojson"), vivo("tornados.geojson"), vivo("red_cortes.geojson"), vivo("salud_oficial.geojson"), vivo("noticiero.json")]);
  const amenazas = normalizar({ eventos: eventos.eventos, ataques, crimen, cortes, tornados, redCortes, salud });
  const indice = ind.paises || {};
  $("cp-fuentes").textContent = `${amenazas.length} eventos y alertas cargados (eventos del mapa, ataques, crimen, cortes, tornados, cortes de internet y salud).`;

  // Ciudad → coordenadas y país (config/ciudades.json, ~500 ciudades).
  const lista = (ciudades.ciudades || []).map((c) => Array.isArray(c) ? Object.fromEntries(ciudades.campos.map((k, i) => [k, c[i]])) : c);
  $("cp-ciudades").innerHTML = lista.map((c) => `<option value="${esc(c.nombre_es || c.nombre)}">`).join("");
  $("cp-ciudad").addEventListener("change", () => {
    const c = lista.find((x) => (x.nombre_es || x.nombre) === $("cp-ciudad").value);
    if (c) { $("cp-lat").value = c.lat; $("cp-lon").value = c.lon; $("cp-iso3").value = c.iso3 || ""; }
  });

  function pintar() {
    const insts = leer();
    const radioKm = Number($("cp-radio").value) || 100, dias = Number($("cp-dias").value) || 30;
    const filas = insts.map((x, k) => {
      const cerca = cercanas(x, amenazas, { radioKm, dias });
      const exp = exposicionPais(x.iso3, { indice, cfg, pagos });
      const prob = probabilidad(cerca, exp.indice);
      return { ...x, num: k + 1, cerca, exp, prob, nv: nivel(prob, x.impacto), esc: escenariosPara(cerca, exp.sanciones, cfg) };
    });
    $("cp-lista").innerHTML = filas.length ? filas.map((f) => `
      <details class="cp-inst" ${f.nv.valor >= 10 ? "open" : ""}><summary><b>${f.num}. ${esc(f.nombre)}</b> · ${esc(TIPOS_INST[f.tipo])}${f.iso3 ? ` · ${esc(f.iso3)}` : ""}
        <span class="chip" style="background:${f.nv.color};color:#fff">Riesgo ${esc(f.nv.etiqueta)} (${f.prob}×${f.impacto}=${f.nv.valor})</span></summary>
        <p class="meta">${f.cerca.length} eventos a menos de ${radioKm} km en ${dias} días · índice de inestabilidad del país: ${f.exp.indice ?? "sin dato"}${f.nota ? ` · ${esc(f.nota)}` : ""}</p>
        <ul class="fuentes">${f.cerca.slice(0, 8).map((a) => `<li>[${a.sev}] ${a.km} km · ${a.url ? `<a href="${esc(safeUrl(a.url))}" target="_blank" rel="noopener noreferrer">${esc(a.titulo || "(sin título)")}</a>` : esc(a.titulo || "")} <span class="meta">${esc(String(a.fecha || "").slice(0, 10))}</span></li>`).join("") || "<li>Sin eventos cercanos en los datos actuales.</li>"}</ul>
        ${f.exp.sanciones.map((s) => `<p class="cp-sancion">⚠ ${esc(s.programa)} (${esc(s.emisor)}): ${esc(s.nota)} <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.fuente)}</a></p>`).join("")}
        ${f.esc.length ? `<h4>Escenarios a preparar</h4>${f.esc.map((e) => `<div class="cp-esc"><b>${esc(e.nombre)}</b>: ${esc(e.que_pasa)} <i>Impacto:</i> ${esc(e.impacto)}<ul>${e.acciones.map((a) => `<li>${esc(a)}</li>`).join("")}</ul><span class="meta">Señal de alerta: ${esc(e.indicador)}</span></div>`).join("")}` : ""}
        <p><button type="button" class="link-btn" data-seguir="${esc(f.id)}">${seg.sigue(f.id) ? "★ En el mapa (Seguimiento)" : "☆ Seguir en el mapa"}</button>
           <button type="button" class="link-btn" data-borrar="${esc(f.id)}">Quitar</button></p>
      </details>`).join("") : `<p class="meta">Agrega tu primera instalación con el formulario.</p>`;
    $("cp-matriz").innerHTML = filas.length ? htmlMatriz(filas) : "";
  }

  $("cp-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const [inst, err] = validar(f);
    $("cp-error").textContent = err || "";
    if (!inst) return;
    guardar([...leer(), inst]); e.target.reset(); pintar();
  });
  $("cp-lista").addEventListener("click", (e) => {
    const b = e.target.closest("[data-borrar],[data-seguir]");
    if (!b) return;
    const lista = leer();
    if (b.dataset.borrar) guardar(lista.filter((x) => x.id !== b.dataset.borrar));
    else {
      const x = lista.find((y) => y.id === b.dataset.seguir);
      if (x) seg.alternar({ id: x.id, n: x.nombre, familia: "corporativo", lat: x.lat, lon: x.lon });
    }
    pintar();
  });
  for (const id of ["cp-radio", "cp-dias"]) $(id).addEventListener("change", pintar);
  $("cp-exportar").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(leer(), null, 1)], { type: "application/json" }));
    a.download = "instalaciones-dominus.json"; a.click();
  });
  $("cp-importar").addEventListener("change", async (e) => {
    try {
      const datos = JSON.parse(await e.target.files[0].text());
      const ok = (Array.isArray(datos) ? datos : []).map((x) => validar(x)[0]).filter(Boolean);
      guardar([...leer(), ...ok]); $("cp-error").textContent = `${ok.length} instalaciones importadas.`; pintar();
    } catch (err) { $("cp-error").textContent = "El archivo no es una lista de instalaciones válida."; }
  });

  // Exposición por país.
  const paises = Object.keys({ ...indice, ...cfg.sanciones_pais, ...(pagos.paises || {}) }).filter((k) => k.length === 3).sort();
  $("cp-pais").innerHTML = `<option value="">Elige un país…</option>` + paises.map((k) => `<option value="${k}">${esc(k)}</option>`).join("");
  $("cp-pais").addEventListener("change", () => {
    const e = exposicionPais($("cp-pais").value, { indice, cfg, pagos });
    const p = Object.entries(e.pagos).map(([dim, v]) => `<li>${esc({ cbdc: "Moneda digital del banco central", cripto: "Criptomonedas", efectivo: "Efectivo" }[dim])}: ${esc(pagos.estados[dim][v.e][0])}. ${esc(v.nota)}</li>`).join("");
    $("cp-pais-res").innerHTML = !e.iso3 ? "" : `
      <p>Índice de inestabilidad: <b>${e.indice ?? "sin dato"}</b> (0 a 100; ${e.eventos} eventos recientes)</p>
      <h4>Sanciones</h4><ul class="fuentes">${e.sanciones.map((s) => `<li>${esc(s.programa)} (${esc(s.emisor)}): ${esc(s.nota)} <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.fuente)}</a></li>`).join("") || "<li>Sin programas de sanciones por país en la tabla. Revisa siempre a cada contraparte en las listas.</li>"}</ul>
      ${p ? `<h4>Pagos</h4><ul class="fuentes">${p}</ul>` : ""}
      <h4>Aranceles (consultar en la fuente)</h4><ul class="fuentes">${cfg.aranceles.map((a) => `<li><a href="${esc(a.u)}" target="_blank" rel="noopener noreferrer">${esc(a.n)}</a></li>`).join("")}</ul>`;
  });

  // Radar de competidores.
  $("cp-radar-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("cp-radar-q").value.trim();
    const notas = enNoticias(q, noticiero);
    $("cp-radar-res").innerHTML = q.length < 3 ? "<p class='meta'>Escribe al menos 3 letras.</p>" : `
      <h4>En el noticiero de DOMINUS (últimas 72 h): ${notas.length}</h4>
      <ul class="fuentes">${notas.map((n) => `<li><a href="${esc(safeUrl(n.u || n.url))}" target="_blank" rel="noopener noreferrer">${esc(n.t || n.titulo)}</a> <span class="meta">${esc(n.m || n.medio || "")}</span></li>`).join("") || "<li>Sin menciones en los titulares actuales.</li>"}</ul>
      <h4>Buscar en fuentes abiertas</h4><ul class="fuentes">${enlacesRadar(q, cfg).map((l) => `<li><a href="${esc(l.u)}" target="_blank" rel="noopener noreferrer">${esc(l.n)}</a></li>`).join("")}</ul>`;
  });

  // Guías de método.
  $("cp-guias").innerHTML = cfg.guias.map((g) => `<details class="guia-inv"><summary><b>${esc(g.t)}</b>: ${esc(g.para)}</summary><ol>${g.pasos.map((p) => `<li>${esc(p)}</li>`).join("")}</ol><p class="meta">${esc(g.norma)}</p></details>`).join("");
  pintar();
}

if (typeof document !== "undefined" && document.getElementById("cp-form")) iniciar();
