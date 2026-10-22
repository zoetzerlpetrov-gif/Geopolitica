// Simulador de escenarios de riesgo (interfaz). Se usa en DOMINUS OPS (Risk Management, con los datos del cliente) y en
// Herramientas (con los eventos del mapa). El cálculo lo hace js/ciencia.js; la IA (opcional, con la llave de Groq de la
// persona) solo sugiere qué escenarios revisar y redacta la interpretación de números ya calculados.
import { esc } from "./util.js";
import * as C from "./ciencia.js";
import * as L from "./escenarios-logica.js";

const leer = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch (e) { return def; } };
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* modo privado */ } };
const num = (n, d = 0) => (n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("es-MX", { maximumFractionDigits: d }));
const NIVEL_COLOR = { bajo: "#2E7D32", medio: "#F9A825", alto: "#E65100", crítico: "#B71C1C" };

/**
 * @param raiz      elemento contenedor
 * @param op.clave  clave de localStorage del registro de riesgos
 * @param op.contexto () => ({ texto, cliente, sector, eventosPorArea }) — se lee al proponer y simular
 * @param op.ayudaContexto texto bajo el campo de contexto
 */
export async function montarSimulador(raiz, op) {
  const [cat, mod] = await Promise.all([fetch("config/escenarios.json").then((r) => r.json()), fetch("config/modelos_ciencia.json").then((r) => r.json())]);
  const escenarios = cat.escenarios, porId = Object.fromEntries(escenarios.map((e) => [e.id, e]));
  const modelo = Object.fromEntries(mod.modelos.filter((m) => m.motor).map((m) => [m.motor, m]));
  const id = (s) => `${op.prefijo}-${s}`;
  const $ = (s) => raiz.querySelector(`#${id(s)}`);
  let registro = leer(op.clave, []), actual = null, ajustesIA = {};

  raiz.innerHTML = `
    <div class="tarjeta"><h3>1. Contexto</h3>
      <textarea id="${id("ctx")}" rows="4" style="width:100%" placeholder="Describe la situación: qué hace la empresa, dónde opera, qué te preocupa, qué está pasando."></textarea>
      <p class="meta">${esc(op.ayudaContexto || "")}</p>
      <div class="barra"><button type="button" id="${id("prop")}">🎯 Proponer escenarios</button><button type="button" id="${id("prop-ia")}">🤖 Más ideas con IA</button></div>
      <div id="${id("lista")}"></div></div>
    <div class="tarjeta"><h3>2. Describe tu propio escenario</h3>
      <textarea id="${id("libre")}" rows="3" style="width:100%" placeholder="Ej.: «Un bloqueo de 5 días en la autopista México-Querétaro detiene el 40 % de nuestras entregas»"></textarea>
      <div class="barra"><button type="button" id="${id("libre-btn")}">🔎 Convertir en modelo</button><span class="meta">Sin llave de IA se eligen los modelos por palabras clave; con llave, la IA sugiere modelo y ajustes y tú los revisas.</span></div>
      <div id="${id("libre-res")}"></div></div>
    <div class="tarjeta"><h3>3. Simular</h3>
      <div class="barra"><select id="${id("sel")}" aria-label="Escenario" style="max-width:420px">${Object.entries(Object.groupBy ? Object.groupBy(escenarios, (e) => e.categoria) : escenarios.reduce((g, e) => ((g[e.categoria] ||= []).push(e), g), {}))
        .map(([c, es]) => `<optgroup label="${esc(c)}">${es.map((e) => `<option value="${e.id}">${esc(e.nombre)}</option>`).join("")}</optgroup>`).join("")}</select>
        <button type="button" id="${id("sim")}">▶ Simular</button><button type="button" id="${id("todos")}">▶▶ Simular los propuestos (${"≥"}10)</button></div>
      <p class="meta" id="${id("desc")}"></p><div id="${id("params")}" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px"></div>
      <div id="${id("res")}"></div></div>
    <div class="tarjeta"><h3>4. Registro de riesgos y matriz 5×5</h3>
      <div id="${id("matriz")}"></div><div class="desliza"><table class="t" id="${id("reg")}"></table></div>
      <div class="barra"><span id="${id("exp")}"></span><button type="button" id="${id("interp")}">🤖 Interpretar el registro con IA</button><button type="button" id="${id("vaciar")}">Vaciar registro</button></div>
      <div id="${id("interp-res")}" class="tarjeta" hidden style="white-space:pre-wrap"></div>
      <p class="meta">Escalas: probabilidad anual &lt;1 %, 1–5 %, 5–20 %, 20–50 %, ≥50 %; impacto (VaR 95 % sobre ingresos anuales) &lt;0.1 %, 0.1–1 %, 1–5 %, 5–15 %, ≥15 %. ISO 31000:2018 e ISO/IEC 31010:2019.
        El motor (js/ciencia.js) y la base de modelos (config/modelos_ciencia.json) son los mismos en cualquier navegador; los datos que captures se quedan en este equipo.</p></div>`;

  const contextoTexto = () => { const c = op.contexto(); return [c.texto, $("ctx").value].filter(Boolean).join("\n"); };
  const ctxSim = () => { const c = op.contexto(); const cl = { ingresos: 100000000, empleados: 100, margen: 10, ...Object.fromEntries(Object.entries(c.cliente || {}).filter(([, v]) => v !== "" && v != null)) }; return { cliente: cl, faltan: !(Number(c.cliente?.ingresos) > 0) }; };
  // El contexto automático (cliente o eventos) se suma al texto que escribas aquí.

  // ---------- propuestas
  let propuestos = [];
  function pintarLista(items, origen) {
    propuestos = [...new Set([...items.map((x) => x.id), ...propuestos])];
    const html = items.map((x) => `<li><label><input type="checkbox" data-pid="${x.id}" checked> <b>${esc(porId[x.id].nombre)}</b></label> <span class="meta">${esc(origen)}: ${esc(x.motivos ? x.motivos.join("; ") : x.motivo || "")}</span> <a href="#" data-ver="${x.id}">ver</a></li>`).join("");
    $("lista").insertAdjacentHTML("beforeend", items.length ? `<ul class="fuentes">${html}</ul>` : `<p class="meta">Sin coincidencias; agrega detalle al contexto o elige un escenario abajo.</p>`);
  }
  $("prop").onclick = () => {
    const c = op.contexto();
    $("lista").innerHTML = "";
    propuestos = [];
    let p = C.proponer(escenarios, { texto: contextoTexto(), sector: c.sector, eventosPorArea: c.eventosPorArea || {} }, 15);
    // Siempre al menos 10: se completa con los escenarios base del catálogo.
    for (const e of escenarios) if (p.length < 10 && e.base && !p.some((x) => x.id === e.id)) p.push({ id: e.id, motivos: ["riesgo base para cualquier empresa"] });
    pintarLista(p, "regla");
  };
  async function ia(mensajes) {
    const CH = await import("./chat_ia.js");
    const k = CH.leerLlave()?.llave;
    if (!k) throw new Error("Guarda tu llave de Groq en el mapa (Herramientas → «Preguntar a la IA») para usar esta opción.");
    const r = await CH.completar(mensajes, k, { maxTokens: 1200 });
    return typeof r === "string" ? r : r?.texto || "";
  }
  $("prop-ia").onclick = async () => {
    $("lista").insertAdjacentHTML("beforeend", `<p class="meta" data-tmp>Consultando a la IA…</p>`);
    try {
      const r = L.leerRespuestaIA(await ia(L.promptPropuestas(escenarios, contextoTexto(), propuestos)), escenarios);
      for (const x of r) ajustesIA[x.id] = { ...(ajustesIA[x.id] || {}), ...x.ajustes };
      pintarLista(r.filter((x) => !propuestos.includes(x.id)), "IA");
    } catch (e) { $("lista").insertAdjacentHTML("beforeend", `<p class="meta">${esc(e.message)}</p>`); }
    raiz.querySelector("[data-tmp]")?.remove();
  };
  $("libre-btn").onclick = async () => {
    const d = $("libre").value.trim();
    if (d.length < 10) { $("libre-res").innerHTML = `<p class="meta">Describe el escenario con al menos una frase.</p>`; return; }
    $("libre-res").innerHTML = `<p class="meta">Analizando…</p>`;
    let r = [];
    try { r = L.leerRespuestaIA(await ia(L.promptEscenarioLibre(escenarios, d, contextoTexto())), escenarios); } catch (e) { /* sin IA: reglas */ }
    const origen = r.length ? "IA" : "palabras clave";
    if (!r.length) r = C.proponer(escenarios, { texto: d }, 4).map((x) => ({ id: x.id, motivo: x.motivos.join("; "), ajustes: {} }));
    for (const x of r) ajustesIA[x.id] = { ...(ajustesIA[x.id] || {}), ...x.ajustes };
    $("libre-res").innerHTML = r.length ? `<p class="meta">Modelos sugeridos (${origen}). Revisa los parámetros antes de simular:</p><ul class="fuentes">${r.map((x) => `<li><a href="#" data-ver="${x.id}">${esc(porId[x.id].nombre)}</a> <span class="meta">${esc(x.motivo)}${Object.keys(x.ajustes).length ? ` · ajustes: ${esc(JSON.stringify(x.ajustes))}` : ""}</span></li>`).join("")}</ul>`
      : `<p class="meta">No se encontró un modelo parecido. Elige uno en «Simular».</p>`;
  };
  raiz.addEventListener("click", (e) => { const a = e.target.closest("[data-ver]"); if (!a) return; e.preventDefault(); $("sel").value = a.dataset.ver; pintarParams(); $("sel").scrollIntoView({ behavior: "smooth", block: "center" }); });

  // ---------- parámetros
  function pintarParams() {
    const e = porId[$("sel").value], aj = ajustesIA[e.id] || {};
    const m = modelo[e.modelo];
    $("desc").innerHTML = `${esc(e.descripcion)}${m ? `<br>Modelo: <b>${esc(m.nombre)}</b> (${esc(m.rama)}) — <code>${esc(m.formula)}</code><br><span class="meta">Supuestos: ${esc(m.supuestos)} Limitaciones: ${esc(m.limitaciones)} Referencia: ${esc(m.referencia)}.</span>` : ""}`;
    $("params").innerHTML = e.parametros.map((p) => {
      const v = aj[p.k] ?? p.valor, txt = p.tipo === "json" ? JSON.stringify(v) : String(v);
      return `<label title="${esc(p.ayuda || "")}">${esc(p.etiqueta)}${p.unidad ? ` <span class="meta">(${esc(p.unidad)})</span>` : ""}
        ${p.tipo === "json" ? `<textarea data-pk="${p.k}" rows="3" style="width:100%;font-family:monospace;font-size:12px">${esc(txt)}</textarea>` : `<input data-pk="${p.k}" value="${esc(txt)}">`}
        ${p.ayuda ? `<span class="meta">${esc(p.ayuda)}</span>` : ""}</label>`;
    }).join("");
  }
  $("sel").onchange = pintarParams;
  pintarParams();
  const valoresParams = () => Object.fromEntries([...$("params").querySelectorAll("[data-pk]")].map((x) => {
    const p = porId[$("sel").value].parametros.find((q) => q.k === x.dataset.pk);
    if (p.tipo === "json") { try { return [p.k, JSON.parse(x.value)]; } catch (e) { throw new Error(`«${p.etiqueta}» no es JSON válido`); } }
    return [p.k, /^-?\d+(\.\d+)?(e-?\d+)?$/i.test(x.value.trim()) ? Number(x.value) : x.value];
  }));

  function resultadoHtml(e, r, faltan) {
    const lin = (k, v) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`;
    const extra = r.radios ? `<h4>Radios de daño</h4><table class="t">${r.radios.map((x) => `<tr><td>${x.kpa} kPa</td><td>${esc(x.efecto)}</td><td>${num(x.radio_m)} m</td></tr>`).join("")}</table>`
      : r.opciones ? `<h4>Opciones</h4><table class="t">${r.opciones.map((o) => `<tr><td>${esc(o.nombre)}</td><td>EMV ${num(o.emv)}</td></tr>`).join("")}</table>`
      : r.por_area ? `<h4>Impacto por área</h4><table class="t">${r.por_area.map((o) => `<tr><td>${esc(o.area)}</td><td>${num(o.impacto)}</td></tr>`).join("")}</table>` : "";
    return `<div class="desliza"><table class="t">${lin("Probabilidad anual", r.prob == null ? "—" : `${num(r.prob * 100, 2)} %`)}${r.prob_horizonte != null ? lin("Probabilidad en el horizonte elegido", `${num(r.prob_horizonte * 100, 2)} %`) : ""}${lin("Pérdida anual esperada", num(r.perdida))}
      ${lin("VaR 95 % (pérdida que solo se supera 1 de cada 20 años)", num(r.var95))}${lin("VaR 99 %", num(r.var99))}${r.tvar95 != null ? lin("TVaR 95 % (promedio del peor 5 %)", num(r.tvar95)) : ""}
      ${lin("Nivel 5×5", r.nivel ? `<b style="color:${NIVEL_COLOR[r.nivel]}">${r.nivel}</b> (P ${r.nivel_prob} × I ${r.nivel_imp})` : r.nivel_prob ? `P ${r.nivel_prob} × I sin dato` : "—")}</table></div>
      ${faltan ? `<p class="meta">⚠️ Sin ingresos del cliente: se usaron 100 millones como referencia para las expresiones y el impacto. Captúralos en la pestaña Cliente (OPS) o en los parámetros.</p>` : ""}
      ${L.svgResultado(r)}${extra}
      <h4>Cálculo paso a paso</h4><div class="desliza"><table class="t"><tr><th>Paso</th><th>Fórmula</th><th>Resultado</th></tr>${r.pasos.map(([a, b, c]) => `<tr><td>${esc(a)}</td><td><code>${esc(b)}</code></td><td>${esc(String(c))}</td></tr>`).join("")}</table></div>
      ${(e.mitigaciones || []).length ? `<h4>Controles que reducen este riesgo</h4><ul>${e.mitigaciones.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}`;
  }
  function correr(e, valores) {
    const { cliente, faltan } = ctxSim();
    const r = C.simular(e, valores, { cliente });
    if (r.muestra) { r.histograma = C.histograma(r.muestra, 24); delete r.muestra; }
    return { r, faltan };
  }
  const aRegistro = (e, r) => ({ id: e.id, nombre: e.nombre, categoria: e.categoria, modelo: e.modelo, prob: r.prob, perdida: r.perdida, var95: r.var95, var99: r.var99,
    nivel_prob: r.nivel_prob, nivel_imp: r.nivel_imp, nivel: r.nivel, params: r.params, fecha: new Date().toISOString().slice(0, 10), respuesta: "", dueno: "" });
  $("sim").onclick = () => {
    const e = porId[$("sel").value];
    try {
      const { r, faltan } = correr(e, valoresParams());
      actual = aRegistro(e, r);
      $("res").innerHTML = resultadoHtml(e, r, faltan) + `<div class="barra"><button type="button" id="${id("agregar")}">➕ Agregar al registro de riesgos</button></div>`;
      $("agregar").onclick = () => { registro = [...registro.filter((x) => x.id !== actual.id), actual]; guardar(op.clave, registro); pintarRegistro(); $("agregar").textContent = "Agregado ✓"; };
    } catch (err) { $("res").innerHTML = `<p class="meta">No se pudo simular: ${esc(err.message)}</p>`; }
  };
  $("todos").onclick = () => {
    const ids = [...raiz.querySelectorAll("[data-pid]:checked")].map((x) => x.dataset.pid);
    const lista = ids.length >= 10 ? ids : [...new Set([...ids, ...escenarios.filter((e) => e.base).map((e) => e.id), ...escenarios.map((e) => e.id)])].slice(0, Math.max(10, ids.length));
    const nuevos = [];
    for (const i of lista) { try { nuevos.push(aRegistro(porId[i], correr(porId[i], ajustesIA[i] || {}).r)); } catch (err) { /* parámetro inválido: se omite */ } }
    registro = [...registro.filter((x) => !nuevos.some((n) => n.id === x.id)), ...nuevos];
    guardar(op.clave, registro); pintarRegistro();
    $("res").innerHTML = `<p class="meta">Se simularon ${nuevos.length} escenarios con sus valores por defecto (y los ajustes sugeridos). Revisa cada uno para afinar sus parámetros.</p>`;
  };

  // ---------- registro y matriz
  function pintarRegistro() {
    const m = L.matriz(registro), color = (p, i) => { const x = p * i; return x >= 15 ? "#B71C1C" : x >= 10 ? "#E65100" : x >= 5 ? "#F9A825" : "#2E7D32"; };
    $("matriz").innerHTML = `<div class="desliza"><table class="t" style="max-width:640px"><tr><th>Prob. \\ Impacto</th>${[1, 2, 3, 4, 5].map((i) => `<th>${i}</th>`).join("")}</tr>${m.map((fila, k) => `<tr><th>${5 - k}</th>${fila.map((cel, i) => `<td style="background:${color(5 - k, i + 1)}22;border-left:4px solid ${color(5 - k, i + 1)};font-size:12px">${cel.map(esc).join("<br>")}</td>`).join("")}</tr>`).join("")}</table></div>`;
    const orden = [...registro].sort((a, b) => (b.nivel_prob || 0) * (b.nivel_imp || 0) - (a.nivel_prob || 0) * (a.nivel_imp || 0) || (b.perdida || 0) - (a.perdida || 0));
    $("reg").innerHTML = `<tr><th>Escenario</th><th>Prob. anual</th><th>Pérdida esperada</th><th>VaR 95 %</th><th>Nivel</th><th>Respuesta</th><th>Dueño</th><th></th></tr>` + orden.map((r) => `<tr data-rid="${r.id}">
      <td>${esc(r.nombre)}<br><span class="meta">${esc(r.categoria)} · ${esc(r.fecha)}</span></td><td>${r.prob == null ? "—" : `${num(r.prob * 100, 1)} %`}</td><td>${num(r.perdida)}</td><td>${num(r.var95)}</td>
      <td>${r.nivel ? `<b style="color:${NIVEL_COLOR[r.nivel]}">${r.nivel}</b>` : "—"}</td>
      <td><select data-rk="respuesta"><option></option>${["Evitar", "Reducir", "Transferir", "Aceptar"].map((x) => `<option ${r.respuesta === x ? "selected" : ""}>${x}</option>`).join("")}</select></td>
      <td><input data-rk="dueno" value="${esc(r.dueno || "")}" size="12"></td><td><button type="button" data-quitar="${r.id}" aria-label="Quitar">✕</button></td></tr>`).join("");
  }
  $("reg").addEventListener("change", (e) => { const tr = e.target.closest("[data-rid]"); if (!tr) return; const r = registro.find((x) => x.id === tr.dataset.rid); r[e.target.dataset.rk] = e.target.value; guardar(op.clave, registro); });
  $("reg").addEventListener("click", (e) => { const b = e.target.closest("[data-quitar]"); if (!b) return; registro = registro.filter((x) => x.id !== b.dataset.quitar); guardar(op.clave, registro); pintarRegistro(); });
  $("vaciar").onclick = () => { if (confirm("¿Vaciar el registro de riesgos?")) { registro = []; guardar(op.clave, registro); pintarRegistro(); } };
  $("interp").onclick = async () => {
    const out = $("interp-res"); out.hidden = false;
    if (!registro.length) { out.textContent = "Primero simula y agrega escenarios al registro."; return; }
    out.textContent = "Redactando…";
    try { out.textContent = await ia(L.promptInterpretacion(registro, contextoTexto())); } catch (e) { out.textContent = e.message; }
  };
  import("./exportar.js").then((X) => {
    $("exp").innerHTML = X.htmlSelectorExportar(id("x"));
    raiz.querySelector(`#${id("x")}-btn`).onclick = () => {
      const filas = L.filasRegistro(registro);
      X.exportar(raiz.querySelector(`#${id("x")}-fmt`).value, Object.keys(filas[0] || { escenario: "" }), filas, { titulo: "Registro de riesgos", nota: "Probabilidades y pérdidas calculadas con el motor científico de DOMINUS (ciencia.js).", tabla: "registro_riesgos" });
    };
  });
  pintarRegistro();
  return { registro: () => registro };
}
