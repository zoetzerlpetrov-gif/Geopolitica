// Interfaz de ops.html (DOMINUS OPS). Datos: config/dominus_ops.json; lógica: ops-logica.js.
import { esc, getJSON } from "./util.js";
import * as O from "./ops-logica.js";

const $ = (id) => document.getElementById(id);
const CLAVES = ["gp_ops_dmi", "gp_ops_gob", "gp_ops_raci", "gp_ops_pl", "gp_ops_kpi"];
const leer = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch (e) { return def; } };
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* modo privado */ } };
const descargar = (nombre, texto, tipo = "text/markdown") => {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([texto], { type: tipo })); a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

document.querySelector(".pestanas").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-p]");
  if (!b) return;
  for (const x of document.querySelectorAll(".pestanas button")) x.setAttribute("aria-selected", String(x === b));
  for (const p of document.querySelectorAll(".panel")) p.hidden = p.id !== `p-${b.dataset.p}`;
  try { history.replaceState(null, "", `#${b.dataset.p}`); } catch (err) { /* nada */ }
});

const cfg = await getJSON("config/dominus_ops.json");
const dims = cfg.dmi.dimensiones;

// ------------------------------------------------------------------ mapa maestro y fases
$("ciclo").innerHTML = cfg.mapa_maestro.map(([f, fn, r]) => `<div><b>${esc(f)}</b><br>${esc(fn)}<br><span class="meta">→ ${esc(r)}</span></div>`).join("");
$("fases").innerHTML = cfg.fases.map((f) => `<details class="tarjeta"><summary><b>${esc(f.nombre)}</b></summary><p>${esc(f.objetivo)}</p>
  ${f.etapas.map((e) => `<div class="tarjeta"><h3>${esc(e.nombre)}</h3>${Object.entries(e.bloques).map(([k, v]) => `<p><b>${esc(k)}:</b> ${esc(v.join(" · "))}</p>`).join("")}
    ${e.war_room ? `<p class="meta">🛰️ En el War Room: ${esc(e.war_room)}</p>` : ""}</div>`).join("")}</details>`).join("");

// ------------------------------------------------------------------ Readiness Assessment y DMI
let dmiD = leer("gp_ops_dmi", { puntos: {}, evidencia: {}, cuest: {} });
const cuest = cfg.fases[0].cuestionario;
function pintarDMI() {
  guardar("gp_ops_dmi", dmiD);
  const total = O.dmi(dmiD.puntos), nv = O.nivelDMI(total, cfg.dmi.niveles);
  $("dmi-total").textContent = total == null ? "DMI —" : `DMI ${total.toFixed(1)}`;
  $("dmi-nivel").textContent = nv ? `Nivel ${nv[0]} · ${nv[1]}: ${nv[2]}` : "Califica al menos una dimensión.";
  $("dmi-niveles").innerHTML = cfg.dmi.niveles.map(([n, nom]) => `${n} ${nom}`).join(" · ");
  const pts = O.puntosRadar(dims.map((d) => dmiD.puntos[d] || 0));
  const malla = [1, 2, 3, 4, 5].map((k) => `<polygon class="malla" points="${O.puntosRadar(dims.map(() => k)).map((p) => p.join(",")).join(" ")}"/>`).join("");
  const etiquetas = O.puntosRadar(dims.map(() => 5.9)).map(([x, y], i) => `<text x="${x}" y="${y}" text-anchor="middle">${esc(dims[i].split(" ")[0])}</text>`).join("");
  $("dmi-radar").innerHTML = malla + `<polygon class="area" points="${pts.map((p) => p.join(",")).join(" ")}"/>` + etiquetas;
  $("dmi-tabla").innerHTML = `<tr><th>Dimensión</th><th>Nivel (1-5)</th><th>Evidencia</th></tr>` + dims.map((d) => `<tr><td>${esc(d)}</td>
    <td><select data-dmi="${esc(d)}"><option value="">—</option>${cfg.dmi.niveles.map(([n, nom]) => `<option value="${n}" ${Number(dmiD.puntos[d]) === n ? "selected" : ""}>${n} ${nom}</option>`).join("")}</select></td>
    <td><input type="text" data-ev="${esc(d)}" value="${esc(dmiD.evidencia[d] || "")}" style="width:100%"></td></tr>`).join("");
  $("dmi-org").value = dmiD.org || ""; $("dmi-fecha").value = dmiD.fecha || "";
}
$("dmi-cuest").innerHTML = cuest.map((s, i) => `<details class="tarjeta"><summary><b>${esc(s.seccion)}</b></summary>${s.preguntas.map((q, j) => `<div class="barra" style="justify-content:space-between">
  <span style="flex:1 1 320px">${esc(q)}</span><select data-q="${i}-${j}" aria-label="Respuesta"><option value="">—</option>${[1, 2, 3, 4, 5].map((n) => `<option ${Number(dmiD.cuest[`${i}-${j}`]) === n ? "selected" : ""}>${n}</option>`).join("")}</select></div>`).join("")}</details>`).join("");
$("p-dmi").addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.dmi) dmiD.puntos[t.dataset.dmi] = Number(t.value) || undefined;
  else if (t.dataset.ev) dmiD.evidencia[t.dataset.ev] = t.value;
  else if (t.dataset.q) dmiD.cuest[t.dataset.q] = Number(t.value) || undefined;
  else if (t.id === "dmi-org") dmiD.org = t.value;
  else if (t.id === "dmi-fecha") dmiD.fecha = t.value;
  else return;
  pintarDMI();
});
$("dmi-sugerir").onclick = () => { Object.assign(dmiD.puntos, O.sugerirDMI(O.promediosCuestionario(cuest, dmiD.cuest))); pintarDMI(); };
$("dmi-md").onclick = () => {
  const total = O.dmi(dmiD.puntos), nv = O.nivelDMI(total, cfg.dmi.niveles), prom = O.promediosCuestionario(cuest, dmiD.cuest);
  descargar("readiness-assessment.md", `# DOMINUS Readiness Assessment: ${dmiD.org || "(organización)"}\n\nFecha: ${dmiD.fecha || new Date().toISOString().slice(0, 10)}\n\n`
    + `## Índice de Madurez DOMINUS (DMI): ${total ?? "—"}${nv ? ` · Nivel ${nv[0]} ${nv[1]}` : ""}\n\n| Dimensión | Nivel | Evidencia |\n|---|---|---|\n`
    + dims.map((d) => `| ${d} | ${dmiD.puntos[d] ?? "—"} | ${dmiD.evidencia[d] || ""} |`).join("\n")
    + `\n\n## Cuestionario (promedio por sección)\n\n${Object.entries(prom).map(([s, v]) => `- ${s}: ${v ?? "sin responder"}`).join("\n")}\n\n`
    + `## Siguiente paso\n\nRoadmap: subir primero las dimensiones en 1-2; re-medir el DMI en 6 a 12 meses.\n`);
};
pintarDMI();

// ------------------------------------------------------------------ gobernanza
let gob = leer("gp_ops_gob", {});
function pintarGob() {
  guardar("gp_ops_gob", gob);
  $("gob-tabla").innerHTML = `<tr><th>Dimensión</th><th>Falla común</th><th>Calificación</th><th>Esfuerzo</th><th>Hallazgo</th><th>Cómo lo sostiene el War Room</th></tr>`
    + cfg.gobernanza.map(([d, falla, control]) => { const g = gob[d] || {}; return `<tr class="${O.colorGob(Number(g.nota))}"><td><b>${esc(d)}</b></td><td>${esc(falla)}</td>
      <td><select data-g="${esc(d)}" data-k="nota"><option value="">—</option>${[1, 2, 3, 4, 5].map((n) => `<option ${Number(g.nota) === n ? "selected" : ""}>${n}</option>`).join("")}</select></td>
      <td><select data-g="${esc(d)}" data-k="esfuerzo"><option value="">—</option>${[1, 2, 3, 4, 5].map((n) => `<option ${Number(g.esfuerzo) === n ? "selected" : ""}>${n}</option>`).join("")}</select></td>
      <td><input type="text" data-g="${esc(d)}" data-k="hallazgo" value="${esc(g.hallazgo || "")}"></td><td class="meta">${esc(control)}</td></tr>`; }).join("");
  const plan = O.planRemediacion(cfg.gobernanza, gob);
  $("gob-plan").innerHTML = plan.length ? `<ol>${plan.map((x) => `<li><b>${esc(x.d)}</b> (calificación ${x.nota}, esfuerzo ${x.esfuerzo || "?"}): ${esc(x.hallazgo || x.falla)} → control: ${esc(x.control)}</li>`).join("")}</ol>`
    : `<p class="meta">Sin brechas registradas (calificaciones de 1 a 3).</p>`;
}
$("gob-tabla").addEventListener("change", (e) => { const t = e.target; if (!t.dataset.g) return; (gob[t.dataset.g] ||= {})[t.dataset.k] = t.value; pintarGob(); });
pintarGob();

let raci = leer("gp_ops_raci", { roles: ["Consejo", "Director general", "CFO", "CISO", "PMO"], filas: [{ d: "Aprobar presupuesto del proyecto", v: ["A", "R", "C", "I", "C"] }] });
function pintarRaci() {
  guardar("gp_ops_raci", raci);
  $("raci-tabla").innerHTML = `<tr><th>Decisión crítica</th>${raci.roles.map((r, j) => `<th><input type="text" data-rol="${j}" value="${esc(r)}" size="10"></th>`).join("")}<th></th></tr>`
    + raci.filas.map((f, i) => `<tr><td><input type="text" data-dec="${i}" value="${esc(f.d)}" style="width:100%"></td>${raci.roles.map((_, j) => `<td><select data-rc="${i}-${j}">${["", "R", "A", "C", "I"].map((x) => `<option ${f.v[j] === x ? "selected" : ""}>${x}</option>`).join("")}</select></td>`).join("")}
      <td><button type="button" class="btn" data-rx="${i}" aria-label="Quitar">×</button></td></tr>`).join("");
  const avisos = raci.filas.filter((f) => f.v.filter((x) => x === "A").length !== 1).map((f) => f.d);
  $("raci-avisos").innerHTML = avisos.length ? `<p class="meta">⚠️ Cada decisión necesita exactamente un «A»: ${esc(avisos.join("; "))}.</p>` : "";
}
$("raci-tabla").addEventListener("change", (e) => {
  const d = e.target.dataset;
  if (d.rol !== undefined) raci.roles[d.rol] = e.target.value;
  if (d.dec !== undefined) raci.filas[d.dec].d = e.target.value;
  if (d.rc !== undefined) { const [i, j] = d.rc.split("-").map(Number); raci.filas[i].v[j] = e.target.value; }
  pintarRaci();
});
$("raci-tabla").addEventListener("click", (e) => { const x = e.target.closest("[data-rx]"); if (x) { raci.filas.splice(Number(x.dataset.rx), 1); pintarRaci(); } });
$("raci-mas").onclick = () => { raci.filas.push({ d: "Nueva decisión", v: raci.roles.map(() => "") }); pintarRaci(); };
$("raci-rol").onclick = () => { raci.roles.push(`Rol ${raci.roles.length + 1}`); raci.filas.forEach((f) => f.v.push("")); pintarRaci(); };
pintarRaci();

// ------------------------------------------------------------------ plantillas
let pl = leer("gp_ops_pl", {});
const plSel = $("pl-sel"), plFase = $("pl-fase");
plFase.innerHTML = cfg.fases.map((f, i) => `<option value="${i}">${esc(f.nombre)}</option>`).join("");
const actual = () => cfg.fases[plFase.value].plantillas[plSel.value];
const claveP = () => `${plFase.value}-${plSel.value}`;
const filasP = () => pl[claveP()] ?? actual().ejemplo.map((f) => [...f]);
function pintarPl() {
  const p = actual(), filas = filasP();
  $("pl-obj").textContent = p.objetivo ? `Objetivo: ${p.objetivo}` : "";
  $("pl-ia").textContent = cfg.fases[plFase.value].ia || "";
  $("pl-tabla").innerHTML = `<tr>${p.columnas.map((c) => `<th>${esc(c)}</th>`).join("")}<th></th></tr>`
    + filas.map((f, i) => `<tr>${f.map((v, j) => `<td contenteditable="true" data-c="${i}-${j}">${esc(v)}</td>`).join("")}<td><button type="button" class="btn" data-px="${i}" aria-label="Quitar fila">×</button></td></tr>`).join("");
}
const llenarSel = () => { plSel.innerHTML = cfg.fases[plFase.value].plantillas.map((p, i) => `<option value="${i}">${esc(p.titulo)}</option>`).join(""); pintarPl(); };
plFase.onchange = llenarSel; plSel.onchange = pintarPl;
$("pl-tabla").addEventListener("input", (e) => {
  const c = e.target.dataset.c; if (!c) return;
  const [i, j] = c.split("-").map(Number), filas = filasP(); filas[i][j] = e.target.textContent; pl[claveP()] = filas; guardar("gp_ops_pl", pl);
});
$("pl-tabla").addEventListener("click", (e) => { const x = e.target.closest("[data-px]"); if (!x) return; const filas = filasP(); filas.splice(Number(x.dataset.px), 1); pl[claveP()] = filas; guardar("gp_ops_pl", pl); pintarPl(); });
$("pl-fila").onclick = () => { const filas = filasP(); filas.push(actual().columnas.map(() => "")); pl[claveP()] = filas; guardar("gp_ops_pl", pl); pintarPl(); };
$("pl-ejemplo").onclick = () => { delete pl[claveP()]; guardar("gp_ops_pl", pl); pintarPl(); };
$("pl-vaciar").onclick = () => { pl[claveP()] = []; guardar("gp_ops_pl", pl); pintarPl(); };
$("pl-csv").onclick = () => descargar(`${actual().titulo}.csv`, "﻿" + O.aCSV(actual().columnas, filasP()), "text/csv");
$("pl-md").onclick = () => { const p = actual(); descargar(`${p.titulo}.md`, `# ${p.titulo}\n\n| ${p.columnas.join(" | ")} |\n|${p.columnas.map(() => "---").join("|")}|\n${filasP().map((f) => `| ${f.join(" | ")} |`).join("\n")}\n`); };
llenarSel();

// ------------------------------------------------------------------ Battle Rhythm, KPIs y SITREP
$("ritmo-tabla").innerHTML = `<tr><th>Ceremonia</th><th>Frecuencia</th><th>Propósito</th><th>Resultado</th></tr>` + cfg.battle_rhythm.map((r) => `<tr>${r.map((x) => `<td>${esc(x)}</td>`).join("")}</tr>`).join("");
let kpis = leer("gp_ops_kpi", [{ nombre: "Entregas a tiempo", meta: "95 %", valor: "", dueno: "Dir. Operaciones", estado: "" }]);
function pintarKpi() {
  guardar("gp_ops_kpi", kpis);
  $("kpi-tabla").innerHTML = `<tr><th>KPI</th><th>Meta</th><th>Valor</th><th>Dueño</th><th>Semáforo</th><th></th></tr>` + kpis.map((k, i) => `<tr class="${k.estado}">
    ${["nombre", "meta", "valor", "dueno"].map((c) => `<td><input type="text" data-kp="${i}" data-c="${c}" value="${esc(k[c] || "")}"></td>`).join("")}
    <td><select data-kp="${i}" data-c="estado">${[["", "—"], ["verde", "Verde"], ["ambar", "Ámbar"], ["rojo", "Rojo"]].map(([v, n]) => `<option value="${v}" ${k.estado === v ? "selected" : ""}>${n}</option>`).join("")}</select></td>
    <td><button type="button" class="btn" data-kx="${i}" aria-label="Quitar">×</button></td></tr>`).join("");
}
$("kpi-tabla").addEventListener("change", (e) => { const t = e.target; if (t.dataset.kp === undefined) return; kpis[t.dataset.kp][t.dataset.c] = t.value; pintarKpi(); });
$("kpi-tabla").addEventListener("click", (e) => { const x = e.target.closest("[data-kx]"); if (x) { kpis.splice(Number(x.dataset.kx), 1); pintarKpi(); } });
$("kpi-mas").onclick = () => { kpis.push({ nombre: "", meta: "", valor: "", dueno: "", estado: "" }); pintarKpi(); };
pintarKpi();
$("sit-btn").onclick = async () => {
  $("sit-res").textContent = "Leyendo los eventos del mapa…";
  const d = await getJSON("data/events.json", { bust: true }).catch(() => ({ eventos: [] }));
  const paises = $("sit-paises").value.split(/[,\s]+/).filter((p) => /^[A-Za-z]{3}$/.test(p));
  $("sit-res").textContent = O.sitrep(d.eventos || [], paises, kpis, new Date(), Number($("sit-horas").value)).texto;
};
$("sit-copiar").onclick = () => navigator.clipboard?.writeText($("sit-res").textContent).catch(() => null);

// ------------------------------------------------------------------ doctrina, salas, exportar
$("doctrina").innerHTML = cfg.doctrina.map((d) => `<li>${esc(d)}</li>`).join("");
$("salas").innerHTML = cfg.salas.map(([n, t]) => `<div class="tarjeta"><b>${esc(n)}</b><br><span class="meta">${esc(t)}</span></div>`).join("");
$("ops-exportar").onclick = () => descargar("dominus-ops.json", JSON.stringify(Object.fromEntries(CLAVES.map((k) => [k, leer(k, null)])), null, 1), "application/json");
$("ops-importar").onchange = async (e) => {
  try {
    const d = JSON.parse(await e.target.files[0].text());
    for (const k of CLAVES) if (d[k] != null) guardar(k, d[k]);
    location.reload();
  } catch (err) { alert(`Archivo no válido: ${err.message}`); }
};

const inicial = location.hash.slice(1);
if (inicial) document.querySelector(`.pestanas button[data-p="${CSS.escape(inicial)}"]`)?.click();
