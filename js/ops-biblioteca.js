// DOMINUS OPS → Biblioteca de metodologías: fichas y plantillas llenables (config/ops_biblioteca/*.json).
import { esc, safeUrl } from "./util.js";
import * as O from "./ops-logica.js";
import { exportar, exportarDocumento, htmlSelectorExportar, htmlSelectorDocumento } from "./exportar.js";

const $ = (id) => document.getElementById(id);
const leer = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch (e) { return def; } };
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* modo privado */ } };
export const CLAVE_BIB = "gp_ops_bib";

export async function iniciarBiblioteca() {
  const grupos = (await Promise.all(["gobierno_normas", "procesos_mejora"].map((n) => fetch(`config/ops_biblioteca/${n}.json`).then((r) => r.json()).catch(() => null)))).filter(Boolean);
  const todas = grupos.flatMap((g) => g.metodologias.map((m) => ({ ...m, grupo: g.grupo })));
  const porId = Object.fromEntries(todas.map((m) => [m.id, m]));
  let datos = leer(CLAVE_BIB, {});
  const cliente = () => leer("gp_ops_cliente", {});

  function llenarSelector() {
    const lista = O.buscarMetodologias(todas, $("bib-q").value);
    const actual = $("bib-sel").value;
    $("bib-sel").innerHTML = grupos.map((g) => {
      const de = lista.filter((m) => m.grupo === g.grupo);
      return de.length ? `<optgroup label="${esc(g.grupo)}">${de.map((m) => `<option value="${m.id}">${esc(m.nombre)}</option>`).join("")}</optgroup>` : "";
    }).join("");
    if (lista.some((m) => m.id === actual)) $("bib-sel").value = actual;
    pintarFicha();
  }

  const tabla = (filas, cab) => (filas || []).length ? `<div class="desliza"><table class="t"><tr>${cab.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>${filas.map((f) => `<tr>${(Array.isArray(f) ? f : [f]).map((x) => `<td>${esc(x)}</td>`).join("")}</tr>`).join("")}</table></div>` : "";
  function pintarFicha() {
    const m = porId[$("bib-sel").value];
    $("bib-pl-caja").hidden = !m;
    if (!m) { $("bib-ficha").innerHTML = `<p class="meta">Sin coincidencias.</p>`; return; }
    $("bib-ficha").innerHTML = `<div class="tarjeta"><h3>${esc(m.nombre)}</h3>
      <p class="meta">${esc(m.tipo || "")} · ${esc(m.organismo || "")} · ${esc(m.version || "")}${m.certificable ? " · certificable" : ""}</p>
      <p><b>Para qué sirve:</b> ${esc(m.para_que)}</p><p><b>Cuándo usarla:</b> ${esc(m.cuando_usar)}</p><p><b>Cuándo no:</b> ${esc(m.cuando_no)}</p>
      <details><summary><b>Conceptos clave</b></summary>${tabla(m.conceptos, ["Término", "Qué significa"])}</details>
      <details open><summary><b>Proceso paso a paso</b></summary><ol>${(m.proceso || []).map(([p, d]) => `<li><b>${esc(p)}:</b> ${esc(d)}</li>`).join("")}</ol></details>
      <details><summary><b>Roles</b></summary>${tabla(m.roles, ["Rol", "Responsabilidad"])}</details>
      <details><summary><b>Métricas</b></summary>${tabla(m.metricas, ["Métrica", "Cómo se mide"])}</details>
      <details><summary><b>Errores comunes</b></summary><ul>${(m.errores_comunes || []).map((e) => `<li>${esc(e)}</li>`).join("")}</ul></details>
      <details><summary><b>Certificaciones, cursos en México y libros</b></summary>${tabla(m.certificaciones, ["Certificación", "Organismo", "Nota"])}${tabla(m.cursos_mexico, ["Curso o proveedor", "Modalidad"])}${tabla(m.libros, ["Título", "Autor", "Idioma"])}</details>
      ${(m.relacion || []).length ? `<p class="meta">Relacionadas: ${m.relacion.map((r) => (porId[r] ? `<a href="#" data-rel="${r}">${esc(porId[r].nombre)}</a>` : esc(r))).join(" · ")}</p>` : ""}</div>`;
    $("bib-pl").innerHTML = (m.plantillas || []).map((p) => `<option value="${esc(p.id)}">${esc(p.nombre)}</option>`).join("");
    pintarPlantilla();
  }

  const plantilla = () => porId[$("bib-sel").value]?.plantillas?.find((p) => p.id === $("bib-pl").value);
  const valores = () => datos[$("bib-pl").value] || {};
  function campoHtml(c, v) {
    const id = `bf-${c.k}`;
    if (c.tipo === "tabla") {
      const filas = Array.isArray(v) ? v : [];
      return `<div class="tarjeta"><b>${esc(c.etiqueta)}</b><div class="desliza"><table class="t" data-tabla="${esc(c.k)}"><tr>${c.columnas.map((x) => `<th>${esc(x)}</th>`).join("")}<th></th></tr>
        ${filas.map((f, i) => `<tr>${c.columnas.map((_, j) => `<td contenteditable="true" data-c="${i}-${j}">${esc(f[j] ?? "")}</td>`).join("")}<td><button type="button" data-borrar="${i}" aria-label="Quitar fila">✕</button></td></tr>`).join("")}</table></div>
        <button type="button" data-fila="${esc(c.k)}">+ Fila</button></div>`;
    }
    if (c.tipo === "area") return `<label style="display:block">${esc(c.etiqueta)}<textarea id="${id}" data-k="${esc(c.k)}" rows="3" style="width:100%">${esc(v ?? "")}</textarea></label>`;
    if (c.tipo === "lista") return `<label>${esc(c.etiqueta)} <select id="${id}" data-k="${esc(c.k)}"><option value=""></option>${(c.opciones || []).map((o) => `<option ${String(v) === String(o) ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`;
    const tipo = c.tipo === "fecha" ? "date" : c.tipo === "numero" ? "number" : "text";
    return `<label>${esc(c.etiqueta)} <input type="${tipo}" id="${id}" data-k="${esc(c.k)}" value="${esc(v ?? "")}"${tipo === "number" ? ' step="any"' : ""}></label>`;
  }
  function pintarPlantilla() {
    const p = plantilla();
    if (!p) { $("bib-form").innerHTML = ""; $("bib-prop").textContent = ""; return; }
    $("bib-prop").textContent = p.proposito || "";
    const v = valores();
    const simples = p.campos.filter((c) => c.tipo !== "tabla" && c.tipo !== "area"), resto = p.campos.filter((c) => c.tipo === "tabla" || c.tipo === "area");
    $("bib-form").innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px">${simples.map((c) => campoHtml(c, v[c.k])).join("")}</div>${resto.map((c) => campoHtml(c, v[c.k])).join("")}`;
    const tab = p.campos.find((c) => c.tipo === "tabla");
    $("bib-tab").hidden = !tab;
  }
  const guardarV = (v) => { datos[$("bib-pl").value] = v; guardar(CLAVE_BIB, datos); };

  $("bib-form").addEventListener("input", (e) => {
    const v = { ...valores() };
    if (e.target.dataset.k) v[e.target.dataset.k] = e.target.value;
    const td = e.target.closest("[data-c]");
    if (td) {
      const k = td.closest("[data-tabla]").dataset.tabla, [i, j] = td.dataset.c.split("-").map(Number);
      const filas = (v[k] || []).map((f) => [...f]); (filas[i] ||= [])[j] = td.textContent; v[k] = filas;
    }
    guardarV(v);
  });
  $("bib-form").addEventListener("change", (e) => { if (e.target.tagName === "SELECT") { const v = { ...valores(), [e.target.dataset.k]: e.target.value }; guardarV(v); } });
  $("bib-form").addEventListener("click", (e) => {
    const v = { ...valores() };
    const add = e.target.closest("[data-fila]"), del = e.target.closest("[data-borrar]");
    if (add) { const c = plantilla().campos.find((x) => x.k === add.dataset.fila); v[c.k] = [...(v[c.k] || []), c.columnas.map(() => "")]; }
    else if (del) { const k = del.closest("[data-tabla]").dataset.tabla; v[k] = (v[k] || []).filter((_, i) => i !== Number(del.dataset.borrar)); }
    else return;
    guardarV(v); pintarPlantilla();
  });
  $("bib-ficha").addEventListener("click", (e) => { const a = e.target.closest("[data-rel]"); if (!a) return; e.preventDefault(); $("bib-q").value = ""; llenarSelector(); $("bib-sel").value = a.dataset.rel; pintarFicha(); });
  $("bib-q").addEventListener("input", llenarSelector);
  $("bib-sel").onchange = pintarFicha;
  $("bib-pl").onchange = pintarPlantilla;
  $("bib-ejemplo").onclick = () => { const p = plantilla(); if (p && (!Object.keys(valores()).length || confirm("¿Reemplazar lo capturado con el ejemplo?"))) { guardarV(structuredClone(p.ejemplo || {})); pintarPlantilla(); } };
  $("bib-vaciar").onclick = () => { if (confirm("¿Vaciar esta plantilla?")) { delete datos[$("bib-pl").value]; guardar(CLAVE_BIB, datos); pintarPlantilla(); } };
  $("bib-doc").innerHTML = htmlSelectorDocumento("bibd");
  $("bib-tab").innerHTML = ` Tabla: ${htmlSelectorExportar("bibt")}`;
  $("bibd-btn").onclick = () => {
    const m = porId[$("bib-sel").value], p = plantilla();
    if (!p) return;
    const d = O.documentoPlantilla(m, p, valores(), cliente());
    exportarDocumento($("bibd-fmt").value, { titulo: d.titulo, html: d.html, md: d.md }).catch((err) => alert(err.message));
  };
  $("bibt-btn").onclick = () => {
    const p = plantilla(), c = p?.campos.find((x) => x.tipo === "tabla");
    if (!c) return;
    const filas = (valores()[c.k] || []).map((f) => Object.fromEntries(c.columnas.map((col, i) => [col, f[i] ?? ""])));
    exportar($("bibt-fmt").value, c.columnas, filas, { titulo: `${p.nombre} - ${c.etiqueta}` }).catch((err) => alert(err.message));
  };
  llenarSelector();
  // Para el informe y los tableros: qué metodologías tienen plantillas llenadas.
  return { todas, datos: () => leer(CLAVE_BIB, {}), safeUrl };
}
