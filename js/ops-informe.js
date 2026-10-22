// DOMINUS OPS → Informe integral de las 6 fases (vista previa, IA opcional y exportación a Word, PDF, impresión).
import * as I from "./ops-informe-logica.js";
import { exportarDocumento, htmlSelectorDocumento } from "./exportar.js";

const $ = (id) => document.getElementById(id);
const leer = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch (e) { return def; } };
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* modo privado */ } };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export async function iniciarInforme(cfg) {
  const biblioteca = (await Promise.all(["gobierno_normas", "procesos_mejora"].map((n) => fetch(`config/ops_biblioteca/${n}.json`).then((r) => r.json()).catch(() => ({ metodologias: [] }))))).flatMap((g) => g.metodologias);
  let op = leer("gp_ops_inf", { tarifas: I.TARIFAS, noOfrecidos: I.NO_OFRECIDOS, contingencia: 10, impuesto: 16, consultor: "", fecha: "", ia: {} });
  const datos = () => ({ cliente: leer("gp_ops_cliente", {}), dmi: leer("gp_ops_dmi", { puntos: {} }), gob: leer("gp_ops_gob", {}), raci: leer("gp_ops_raci", { filas: [] }),
    pl: leer("gp_ops_pl", {}), kpi: leer("gp_ops_kpi", []), esc: leer("gp_ops_esc", []), bib: leer("gp_ops_bib", {}) });
  const opciones = () => ({ tarifas: op.tarifas, noOfrecidos: op.noOfrecidos, contingencia: Number(op.contingencia) / 100 || 0, impuesto: Number(op.impuesto) / 100 || 0, consultor: op.consultor, fecha: op.fecha });

  function pintarAjustes() {
    $("inf-consultor").value = op.consultor || ""; $("inf-fecha").value = op.fecha || new Date().toISOString().slice(0, 10);
    $("inf-cont").value = op.contingencia; $("inf-imp").value = op.impuesto; $("inf-no").value = op.noOfrecidos.join("\n");
    $("inf-tarifas").innerHTML = `<tr><th>Rol</th><th>Tarifa (MXN/h)</th><th>Dedicación (0–1)</th></tr>` + op.tarifas.map((t, i) => `<tr><td><input data-t="${i}" data-k="rol" value="${esc(t.rol)}" style="width:100%"></td>
      <td><input data-t="${i}" data-k="tarifa" value="${t.tarifa}" inputmode="decimal" size="8"></td><td><input data-t="${i}" data-k="dedicacion" value="${t.dedicacion}" inputmode="decimal" size="5"></td></tr>`).join("");
  }
  $("p-informe").addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.t) op.tarifas[t.dataset.t][t.dataset.k] = t.dataset.k === "rol" ? t.value : Number(t.value) || 0;
    else if (t.id === "inf-consultor") op.consultor = t.value; else if (t.id === "inf-fecha") op.fecha = t.value;
    else if (t.id === "inf-cont") op.contingencia = t.value; else if (t.id === "inf-imp") op.impuesto = t.value;
    else if (t.id === "inf-no") op.noOfrecidos = t.value.split("\n").map((x) => x.trim()).filter(Boolean);
    else return;
    guardar("gp_ops_inf", op);
  });
  const html = () => I.informeHTML(cfg, datos(), { biblioteca, opciones: opciones(), ia: op.ia || {} });
  const ver = () => { $("inf-vista").innerHTML = html(); };
  $("inf-ver").onclick = ver;
  $("inf-ia").onclick = async () => {
    const CH = await import("./chat_ia.js");
    const k = CH.leerLlave()?.llave;
    if (!k) { $("inf-estado").textContent = "Guarda tu llave de Groq en el mapa (Herramientas → «Preguntar a la IA») para redactar con IA. Sin ella, el informe usa el resumen automático."; return; }
    $("inf-estado").textContent = "Redactando con IA (solo con las cifras calculadas)…";
    try {
      const r = await CH.completar(I.promptInforme(cfg, datos(), biblioteca), k, { maxTokens: 3500 });
      const t = typeof r === "string" ? r : r?.texto || "";
      const [resumen, detallado] = t.split(/===\s*DETALLE\s*===/i);
      op.ia = { resumen: (resumen || "").replace(/^\s*1\)\s*RESUMEN EJECUTIVO:?\s*/i, "").trim(), detallado: (detallado || "").replace(/^\s*2\)\s*ANÁLISIS DETALLADO:?\s*/i, "").trim() };
      guardar("gp_ops_inf", op);
      $("inf-estado").textContent = "Listo. Revisa la redacción: la IA puede equivocarse; corrige en Word si hace falta.";
      ver();
    } catch (e) { $("inf-estado").textContent = CH.mensajeError ? CH.mensajeError(e) : e.message; }
  };
  $("inf-doc").innerHTML = htmlSelectorDocumento("infd");
  $("infd-btn").onclick = () => exportarDocumento($("infd-fmt").value, { titulo: `Informe DOMINUS OPS ${leer("gp_ops_cliente", {}).nombre || ""}`.trim(), html: html() })
    .catch((e) => { $("inf-estado").textContent = e.message; });
  pintarAjustes();
  document.querySelector('.pestanas button[data-p="informe"]')?.addEventListener("click", ver);
}
