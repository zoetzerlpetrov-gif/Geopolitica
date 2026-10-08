// Ventana «Análisis» (Fase 5): Vista México, Matriz de riesgo y Modo aprendizaje.
// Se descarga (import dinámico) solo la primera vez que se abre: no pesa en la carga inicial.
import { esc, fecha, storage } from "./util.js";
import { agruparMexico, semaforo, matriz, riesgoDe, nivelRiesgo, csvRiesgo, NIVELES_RIESGO, aleatorio, eventoQuiz, opcionesQuiz, anotar } from "./analisis-logica.js";
import * as cuaderno from "./cuaderno.js";

const SEMAFORO = { rojo: "Rojo (sev. 4–5)", ambar: "Ámbar (sev. 3)", verde: "Verde (sev. 1–2)" };
const MAX_MATRIZ = 500;

/**
 * @param {object} ctx
 * @param {() => object[]} ctx.todos       todos los eventos cargados
 * @param {() => object[]} ctx.visibles    los que pasan los filtros del panel
 * @param {object} ctx.tax                 { areas: Map, lista }
 * @param {(id:string) => void} ctx.abrirEvento
 */
export function crearAnalisis(ctx) {
  const dlg = document.getElementById("analisis");
  const cuerpo = document.getElementById("analisis-cuerpo");
  const tabs = [...dlg.querySelectorAll("[role=tab]")];
  let actual = storage.get("gp_analisis_tab") || "mexico";
  let celdaSel = null;
  let focoPrevio = null;
  const rnd = aleatorio();
  const vistosQuiz = new Set();
  let preguntaQuiz = null;

  const nombreArea = (id) => ctx.tax.areas.get(id)?.nombre || id;
  const colorArea = (id) => ctx.tax.areas.get(id)?.color || "#888";

  function abrir(tab = actual) {
    focoPrevio = document.activeElement;
    dlg.hidden = false;
    mostrar(tab);
    tabs.find((t) => t.dataset.tab === actual)?.focus();
  }
  function cerrar() {
    dlg.hidden = true;
    if (focoPrevio && document.contains(focoPrevio)) focoPrevio.focus();
  }
  function mostrar(tab) {
    actual = tab;
    storage.set("gp_analisis_tab", tab);
    for (const t of tabs) t.setAttribute("aria-selected", String(t.dataset.tab === tab));
    ({ mexico: vistaMexico, riesgo: vistaRiesgo, aprender: vistaAprender })[tab]();
  }

  // ---------- Vista México ----------
  function vistaMexico() {
    const grupos = agruparMexico(ctx.todos(), ctx.tax.lista.map((a) => a.id));
    const total = { rojo: 0, ambar: 0, verde: 0 };
    for (const g of grupos) for (const k in total) total[k] += g.conteo[k];
    const n = total.rojo + total.ambar + total.verde;
    cuerpo.innerHTML = `
      <p class="meta">Eventos con texto de impacto para México (regla automática, ver docs/INDICADORES.md), agrupados por área. El semáforo usa la severidad: ${Object.values(SEMAFORO).join(" · ")}.</p>
      <div class="sem-resumen" aria-label="Resumen del semáforo">
        <span class="sem sem-rojo">${total.rojo}</span><span class="sem sem-ambar">${total.ambar}</span><span class="sem sem-verde">${total.verde}</span>
        <span class="meta">${n} eventos en ${grupos.length} áreas</span>
      </div>
      ${grupos.length ? grupos.map((g) => `
        <section class="mx-area">
          <h3><span class="sem-punto sem-${g.peor}" title="${esc(SEMAFORO[g.peor])}"></span>
            <span class="swatch" style="background:${esc(colorArea(g.area))}"></span>${esc(nombreArea(g.area))}
            <span class="contador">${g.eventos.length}</span></h3>
          <p class="meta">${esc(ctx.tax.areas.get(g.area)?.ejemplo_mexico || "")}</p>
          <ul>${g.eventos.slice(0, 25).map((ev) => `<li>
            <span class="sem-punto sem-${semaforo(ev.severidad)}" title="Severidad ${ev.severidad}"></span>
            <button type="button" class="link-ev" data-ev="${esc(ev.id)}">${esc(ev.titulo)}</button>
            <span class="meta">${esc(fecha(ev.fecha_utc))} · ${esc(ev.impacto_mexico)}</span></li>`).join("")}
            ${g.eventos.length > 25 ? `<li class="meta">… y ${g.eventos.length - 25} más (filtro «Solo con impacto en México» del panel).</li>` : ""}</ul>
        </section>`).join("") : `<p>No hay eventos con impacto para México en los datos actuales.</p>`}`;
  }

  // ---------- Matriz de riesgo ----------
  function eventosMatriz() {
    return [...ctx.visibles()].sort((a, b) => b.severidad - a.severidad || b._t - a._t).slice(0, MAX_MATRIZ);
  }
  function vistaRiesgo() {
    const evs = eventosMatriz();
    const ajustes = cuaderno.ajustesRiesgo();
    const m = matriz(evs, ajustes);
    const nivelCelda = (p, i) => nivelRiesgo(p, i).id;
    let filas = "";
    for (let p = 5; p >= 1; p--) {
      filas += `<div class="mr-eje">${p}</div>`;
      for (let i = 1; i <= 5; i++) {
        const n = m[p - 1][i - 1].length;
        const sel = celdaSel && celdaSel[0] === p && celdaSel[1] === i;
        filas += `<button type="button" class="mr-celda nivel-${nivelCelda(p, i)} ${sel ? "sel" : ""}" data-p="${p}" data-i="${i}"
          aria-label="Probabilidad ${p}, impacto ${i}: ${n} eventos" ${n ? "" : "disabled"}>${n || ""}</button>`;
      }
    }
    const lista = celdaSel ? m[celdaSel[0] - 1][celdaSel[1] - 1] : [];
    cuerpo.innerHTML = `
      <p class="meta">Probabilidad (de que el hecho escale o tenga consecuencias en 30 días) × impacto, de 1 a 5, según ISO 31000.
        Se usan los ${evs.length} eventos más graves que pasan los filtros del panel. La probabilidad inicial sale de una regla
        (delta, verificación y correlaciones) y el impacto de la severidad. Ajústalos con tu criterio: se guardan solo en este navegador.</p>
      <div class="mr-wrap">
        <div class="mr-tit-y">Probabilidad</div>
        <div class="mr-grid">${filas}<div></div>${[1, 2, 3, 4, 5].map((i) => `<div class="mr-eje">${i}</div>`).join("")}</div>
        <div class="mr-tit-x">Impacto</div>
      </div>
      <div class="mr-leyenda">${NIVELES_RIESGO.map((n) => `<span><span class="mr-muestra nivel-${n.id}"></span>${n.nombre}</span>`).join("")}
        <button type="button" id="mr-csv" class="icon-btn">Exportar CSV</button></div>
      ${celdaSel ? `<h3>Probabilidad ${celdaSel[0]} × impacto ${celdaSel[1]} (${lista.length})</h3>
        <ul class="mr-lista">${lista.map((ev) => {
          const r = riesgoDe(ev, ajustes);
          return `<li><button type="button" class="link-ev" data-ev="${esc(ev.id)}">${esc(ev.titulo)}</button>
            <span class="mr-ajuste">
              <label>P <select data-aj="p" data-id="${esc(ev.id)}">${[1, 2, 3, 4, 5].map((v) => `<option ${v === r.p ? "selected" : ""}>${v}</option>`).join("")}</select></label>
              <label>I <select data-aj="i" data-id="${esc(ev.id)}">${[1, 2, 3, 4, 5].map((v) => `<option ${v === r.i ? "selected" : ""}>${v}</option>`).join("")}</select></label>
              <span class="chip">${r.origen === "usuario" ? "ajustado por ti" : "por regla"}</span>
              ${r.origen === "usuario" ? `<button type="button" class="txt-btn" data-reset="${esc(ev.id)}">Restablecer</button>` : ""}
            </span></li>`;
        }).join("")}</ul>` : `<p class="meta">Elige una celda para ver y ajustar sus eventos.</p>`}`;
  }
  function exportarCSV() {
    const evs = eventosMatriz();
    const nombres = Object.fromEntries(ctx.tax.lista.map((a) => [a.id, a.nombre]));
    const blob = new Blob([csvRiesgo(evs, cuaderno.ajustesRiesgo(), nombres)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `matriz-riesgo-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // ---------- Modo aprendizaje ----------
  const leerMarcador = () => { try { return JSON.parse(storage.get("gp_quiz") || "{}"); } catch (e) { return {}; } };
  function vistaAprender(nueva = !preguntaQuiz) {
    if (nueva) {
      const ev = eventoQuiz(ctx.todos(), rnd, vistosQuiz);
      preguntaQuiz = ev ? { ev, ops: opcionesQuiz(ev, ctx.tax.lista.map((a) => a.id), rnd), resp: null } : null;
      if (ev) vistosQuiz.add(ev.id);
    }
    const m = leerMarcador();
    const pct = m.intentos ? Math.round((100 * m.aciertos) / m.intentos) : 0;
    const q = preguntaQuiz;
    const area = q && ctx.tax.areas.get(q.ev.area_principal);
    cuerpo.innerHTML = `
      <p class="meta">¿En qué área clasificarías este hecho real? Lee el titular, piensa en la pregunta guía de cada área y elige.
        La respuesta «correcta» es la del clasificador automático; si no estás de acuerdo, anótalo en el checklist del evento (paso 7).</p>
      ${q ? `<div class="quiz">
        <p class="quiz-tit">${esc(q.ev.titulo)}</p>
        <p class="meta">${esc(q.ev.fuente)} · ${esc(fecha(q.ev.fecha_utc))}</p>
        <div class="quiz-ops">${q.ops.map((id) => {
          const cls = q.resp == null ? "" : id === q.ev.area_principal ? "bien" : id === q.resp ? "mal" : "";
          return `<button type="button" class="icon-btn ${cls}" data-op="${esc(id)}" ${q.resp != null ? "disabled" : ""}>
            <span class="swatch" style="background:${esc(colorArea(id))}"></span>${esc(nombreArea(id))}</button>`;
        }).join("")}</div>
        ${q.resp != null ? `<div class="pregunta"><b>${q.resp === q.ev.area_principal ? "Correcto" : "Respuesta del clasificador"}: ${esc(area.nombre)}</b>
          ${esc(area.que_estudia)}<br><i>Pregunta guía:</i> ${esc(area.pregunta_guia)}
          ${q.ev.areas_secundarias.length ? `<br><i>Secundarias:</i> ${q.ev.areas_secundarias.map((a) => esc(nombreArea(a))).join(", ")}` : ""}
          <br><i>Confianza del clasificador:</i> ${Math.round(q.ev.confianza_clasificacion * 100)} %</div>
          <div class="quiz-acc"><button type="button" class="icon-btn" id="quiz-sig">Siguiente</button>
          <button type="button" class="txt-btn" data-ev="${esc(q.ev.id)}">Ver ficha del evento</button></div>` : ""}
      </div>` : `<p>No hay más eventos para preguntar. Recarga la página para empezar de nuevo.</p>`}
      <h3>Tu marcador: ${m.aciertos || 0} de ${m.intentos || 0} (${pct} %)</h3>
      <ul class="quiz-areas">${ctx.tax.lista.filter((a) => m.porArea?.[a.id]).map((a) => {
        const [ok, n] = m.porArea[a.id];
        return `<li><span>${esc(a.nombre)}</span><span class="barra"><span style="width:${Math.round((100 * ok) / n)}%;background:${esc(a.color)}"></span></span><span class="num">${ok}/${n}</span></li>`;
      }).join("") || `<li class="meta">Responde para ver tu precisión por área.</li>`}</ul>
      ${m.intentos ? `<button type="button" class="txt-btn" id="quiz-reset">Reiniciar marcador</button>` : ""}`;
  }

  // ---------- Eventos ----------
  dlg.querySelector("[role=tablist]").addEventListener("click", (e) => {
    const t = e.target.closest("[role=tab]");
    if (t) mostrar(t.dataset.tab);
  });
  dlg.querySelector("[role=tablist]").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = tabs.findIndex((t) => t.dataset.tab === actual);
    const t = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    mostrar(t.dataset.tab);
    t.focus();
  });
  document.getElementById("analisis-cerrar").onclick = cerrar;
  dlg.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); cerrar(); } });
  cuerpo.addEventListener("click", (e) => {
    const ev = e.target.closest("[data-ev]");
    if (ev) { cerrar(); ctx.abrirEvento(ev.dataset.ev); return; }
    const celda = e.target.closest(".mr-celda");
    if (celda) { celdaSel = [Number(celda.dataset.p), Number(celda.dataset.i)]; vistaRiesgo(); return; }
    if (e.target.closest("#mr-csv")) { exportarCSV(); return; }
    const reset = e.target.closest("[data-reset]");
    if (reset) { cuaderno.actualizar(reset.dataset.reset, { r: undefined }); vistaRiesgo(); return; }
    const op = e.target.closest("[data-op]");
    if (op && preguntaQuiz && preguntaQuiz.resp == null) {
      preguntaQuiz.resp = op.dataset.op;
      storage.set("gp_quiz", JSON.stringify(anotar(leerMarcador(), preguntaQuiz.ev.area_principal, op.dataset.op === preguntaQuiz.ev.area_principal)));
      vistaAprender(false);
      document.getElementById("quiz-sig")?.focus();
      return;
    }
    if (e.target.closest("#quiz-sig")) { vistaAprender(true); return; }
    if (e.target.closest("#quiz-reset")) { storage.set("gp_quiz", "{}"); vistaAprender(false); }
  });
  cuerpo.addEventListener("change", (e) => {
    const s = e.target.closest("[data-aj]");
    if (!s) return;
    const ev = ctx.todos().find((x) => x.id === s.dataset.id);
    const r = riesgoDe(ev, cuaderno.ajustesRiesgo());
    cuaderno.actualizar(ev.id, { r: { p: r.p, i: r.i, [s.dataset.aj]: Number(s.value) } });
    vistaRiesgo();
  });

  return { abrir, cerrar, refrescar: () => { if (!dlg.hidden) mostrar(actual); } };
}
