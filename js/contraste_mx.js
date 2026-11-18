// Contraste de fuentes (grupo «🇲🇽 Monitor México»): lo que reporta cada institución sobre el mismo tema, lado a lado.
// Lee data/vivos/contraste_mx.json (tools/mexico/contraste_mx.py): comercio (ONU vs Banxico, destinos sin país) y
// seguridad (SESNSP por categoría y señales de posible reclasificación). Gráficas en SVG propio (sin librerías).

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v, d = 1) => (v == null || !Number.isFinite(Number(v)) ? "—" : Number(v).toLocaleString("es-MX", { maximumFractionDigits: d }));
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const perTxt = (p) => `${MES[Number(String(p).slice(4, 6)) - 1]} ${String(p).slice(0, 4)}`;

export const COLORES = { eua: "#1565C0", paises_identificados: "#2E7D32", sin_pais: "#C62828" };
export const PALETA = ["#C62828", "#6A1B9A", "#E65100", "#1565C0", "#2E7D32", "#00838F", "#AD1457", "#5D4037", "#455A64", "#9E9D24"];

/** Barras apiladas al 100 % por mes (EUA, países identificados, sin país). */
export function svgReparto(meses) {
  const ent = Object.entries(meses || {});
  if (!ent.length) return "";
  const W = 300, H = 120, bw = Math.max(6, Math.floor((W - 20) / ent.length) - 4);
  const barras = ent.map(([p, m], i) => {
    const x = 10 + i * (bw + 4);
    let y = H - 16;
    return Object.keys(COLORES).map((k) => {
      const h = m.total ? ((m[k] || 0) / m.total) * (H - 26) : 0;
      y -= h;
      return `<rect x="${x}" y="${y.toFixed(1)}" width="${bw}" height="${h.toFixed(1)}" fill="${COLORES[k]}"><title>${esc(perTxt(p))}: ${esc(k.replace("_", " "))} ${num(m[k])} MUSD</title></rect>`;
    }).join("") + (i % 3 === 0 ? `<text x="${x}" y="${H - 4}" font-size="8" fill="currentColor">${esc(perTxt(p))}</text>` : "");
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="cx-svg" role="img" aria-label="Reparto mensual de las exportaciones petroleras por destino">${barras}</svg>`;
}

/** Líneas con índice (primer año = 100) para comparar categorías de distinto tamaño. */
export function svgIndice(series, claves, nombres) {
  const anios = [...new Set(claves.flatMap((k) => Object.keys(series[k] || {})))].sort();
  if (anios.length < 2) return "";
  const W = 300, H = 140, x = (i) => 24 + (i * (W - 34)) / (anios.length - 1);
  const valores = [];
  const lineas = claves.map((k, j) => {
    const base = series[k]?.[anios[0]];
    if (!base) return "";
    const pts = anios.map((a, i) => [x(i), (series[k][a] ?? null) == null ? null : (series[k][a] / base) * 100]).filter(([, v]) => v != null);
    valores.push(...pts.map(([, v]) => v));
    return { k, j, pts };
  }).filter(Boolean);
  const max = Math.max(150, ...valores), min = Math.min(50, ...valores), y = (v) => H - 18 - ((v - min) / (max - min)) * (H - 28);
  return `<svg viewBox="0 0 ${W} ${H}" class="cx-svg" role="img" aria-label="Índice de víctimas por categoría">
    <line x1="24" x2="${W - 10}" y1="${y(100)}" y2="${y(100)}" stroke="currentColor" stroke-opacity=".3" stroke-dasharray="3 3"/>
    <text x="0" y="${y(100) + 3}" font-size="8" fill="currentColor">100</text>
    ${lineas.map(({ k, j, pts }) => `<polyline fill="none" stroke="${PALETA[j % PALETA.length]}" stroke-width="2" points="${pts.map(([a, b]) => `${a.toFixed(1)},${y(b).toFixed(1)}`).join(" ")}"><title>${esc(nombres[k] || k)}</title></polyline>`).join("")}
    <text x="24" y="${H - 4}" font-size="8" fill="currentColor">${esc(anios[0])}</text><text x="${W - 30}" y="${H - 4}" font-size="8" fill="currentColor">${esc(anios[anios.length - 1])}</text>
  </svg><div class="cx-leyenda">${lineas.map(({ k, j }) => `<span><i style="background:${PALETA[j % PALETA.length]}"></i>${esc(nombres[k] || k)}</span>`).join("")}</div>`;
}

export function htmlComercio(c) {
  const meses = c?.meses || {};
  const ent = Object.entries(meses);
  if (!ent.length) return `<p class="meta">Aún no hay datos de comercio (se generan cada semana).</p>`;
  const [ultP, ult] = ent[ent.length - 1];
  const prom = ent.reduce((s, [, m]) => s + (m.sin_pais_pct || 0), 0) / ent.length;
  return `<p>De las exportaciones de petróleo y combustibles que México reporta a la ONU, en ${esc(perTxt(ultP))} el <b>${num(ult.sin_pais_pct)} %</b>
      (${num(ult.sin_pais)} millones de USD) fue a destinos <b>sin país</b> («áreas no especificadas»); promedio de los meses mostrados: ${num(prom)} %.</p>
    ${svgReparto(meses)}
    <div class="cx-leyenda"><span><i style="background:${COLORES.eua}"></i>Estados Unidos</span><span><i style="background:${COLORES.paises_identificados}"></i>Otros países identificados</span><span><i style="background:${COLORES.sin_pais}"></i>Sin país publicado</span></div>
    <table class="tabla-ficha cx-tabla"><tr><th>Mes</th><th>ONU: petroleras</th><th>Banxico: petroleras</th><th>Sin país</th><th>Cuba (ONU)</th></tr>
      ${ent.slice().reverse().map(([p, m]) => `<tr><td>${esc(perTxt(p))}</td><td>${num(m.total)}</td><td>${num(m.banxico_petroleras)}</td><td>${num(m.sin_pais_pct)} %</td><td>${num(m.cuba, 3)}</td></tr>`).join("")}</table>
    <p class="meta">Millones de USD. Reservar el país de destino es una práctica de confidencialidad que usan varios países para el crudo; no prueba por sí misma que se oculte algo, pero impide verificar destinos como Cuba con la estadística oficial. Para el detalle por país está el <a href="https://www.banxico.org.mx/CuboComercioExterior/" target="_blank" rel="noopener noreferrer">Cubo de Comercio Exterior de Banxico</a> (consulta manual). Las diferencias ONU–Banxico también vienen de fechas de corte y revisiones.</p>`;
}

/** INEGI (actas de defunción) vs SESNSP (fiscalías): líneas y tabla de la brecha. */
export function htmlInegi(i) {
  const f = i?.filas || [];
  if (!f.length) return "";
  const serie = { inegi: Object.fromEntries(f.map((x) => [x.anio, x.inegi])), sesnsp: Object.fromEntries(f.map((x) => [x.anio, x.sesnsp])),
    con_otros: Object.fromEntries(f.map((x) => [x.anio, x.sesnsp_con_otros])) };
  const nombres = { inegi: "INEGI: homicidios (actas de defunción)", sesnsp: "SESNSP: homicidio doloso + feminicidio", con_otros: "SESNSP + «otros delitos contra la vida»" };
  const ult = f[f.length - 1];
  const links = Object.entries(i.enlaces || {}).map(([k, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">INEGI ${esc(k)}</a>`).join(" · ");
  return `<h4>INEGI vs fiscalías (SESNSP): ¿cuántos homicidios hay?</h4>
    <p>En ${esc(ult.anio)}${ult.preliminar ? " (preliminar)" : ""} el INEGI registra <b>${num(ult.inegi, 0)}</b> homicidios; las fiscalías, <b>${num(ult.sesnsp, 0)}</b> víctimas de homicidio doloso y feminicidio: una diferencia de <b>${num(ult.brecha, 0)} (${num(ult.brecha_pct)} %)</b>.</p>
    ${svgAbsoluto(serie, ["inegi", "sesnsp", "con_otros"], nombres)}
    <table class="tabla-ficha cx-tabla"><tr><th>Año</th><th>INEGI</th><th>SESNSP</th><th>Diferencia</th></tr>${f.slice().reverse().map((x) => `<tr><td>${esc(x.anio)}${x.preliminar ? "*" : ""}</td><td>${num(x.inegi, 0)}</td><td>${num(x.sesnsp, 0)}</td><td>${num(x.brecha, 0)} (${num(x.brecha_pct)} %)</td></tr>`).join("")}</table>
    <p class="meta">El INEGI cuenta muertes con certificado o acta de defunción (incluye las que no llegan a una carpeta de investigación); el SESNSP cuenta víctimas en carpetas abiertas por las fiscalías. Una brecha que crece mientras las fiscalías reportan bajas indica que parte de la baja no se ve en las actas de defunción. * preliminar. ${links}</p>`;
}

/** Líneas en valores absolutos (mismo eje) para comparar fuentes del mismo fenómeno. */
export function svgAbsoluto(series, claves, nombres) {
  const anios = [...new Set(claves.flatMap((k) => Object.keys(series[k] || {})))].sort();
  if (anios.length < 2) return "";
  const W = 300, H = 140, x = (i) => 30 + (i * (W - 40)) / (anios.length - 1);
  const vals = claves.flatMap((k) => Object.values(series[k] || {}));
  const max = Math.max(...vals) * 1.05, min = Math.min(...vals) * 0.9, y = (v) => H - 18 - ((v - min) / (max - min)) * (H - 28);
  return `<svg viewBox="0 0 ${W} ${H}" class="cx-svg" role="img" aria-label="Comparación de fuentes por año">
    <text x="0" y="12" font-size="8" fill="currentColor">${esc(num(max, 0))}</text><text x="0" y="${H - 18}" font-size="8" fill="currentColor">${esc(num(min, 0))}</text>
    ${claves.map((k, j) => `<polyline fill="none" stroke="${PALETA[j % PALETA.length]}" stroke-width="2" points="${anios.filter((a) => series[k]?.[a] != null).map((a) => `${x(anios.indexOf(a)).toFixed(1)},${y(series[k][a]).toFixed(1)}`).join(" ")}"><title>${esc(nombres[k] || k)}</title></polyline>`).join("")}
    <text x="30" y="${H - 4}" font-size="8" fill="currentColor">${esc(anios[0])}</text><text x="${W - 30}" y="${H - 4}" font-size="8" fill="currentColor">${esc(anios[anios.length - 1])}</text>
  </svg><div class="cx-leyenda">${claves.map((k, j) => `<span><i style="background:${PALETA[j % PALETA.length]}"></i>${esc(nombres[k] || k)}</span>`).join("")}</div>`;
}

export function htmlSeguridad(s) {
  if (!s?.anuales) return `<p class="meta">Aún no hay datos de seguridad (SESNSP; se generan cada 3 días).</p>`;
  const nombres = s.categorias || {};
  const principales = ["homicidio_doloso", "feminicidio", "homicidio_culposo", "otros_vida"].filter((k) => s.anuales[k]);
  const otros = ["secuestro", "extorsion", "trata", "rapto", "trafico_menores", "lesiones_dolosas"].filter((k) => s.anuales[k]);
  const p = s.mismo_periodo || {}, a = s.anio_actual, b = String(Number(a) - 1);
  const fila = (k) => {
    const x = p[k] || {}, cambio = x[b] ? ((x[a] - x[b]) / x[b]) * 100 : null;
    return `<tr><td>${esc(nombres[k] || k)}</td><td>${num(x[b], 0)}</td><td>${num(x[a], 0)}</td><td class="${cambio > 0 ? "sube-mal" : "baja-bien"}">${cambio == null ? "—" : `${cambio > 0 ? "▲" : "▼"} ${num(Math.abs(cambio))} %`}</td></tr>`;
  };
  return `${(s.senales || []).length ? `<div class="cx-senales"><b>⚠️ Posible reclasificación (revisar):</b><ul>${s.senales.map((x) => `<li>${x.tipo === "tendencia" ? "📈 " : "🗓️ "}${esc(nombres[x.baja] || x.baja)} baja ${num(Math.abs(x.cambio_baja_pct))} % mientras ${esc(nombres[x.sube] || x.sube)} sube ${num(x.cambio_sube_pct)} % (${esc(x.periodo)}); el aumento equivale a ${num(x.absorbe_pct, 0)} % de la baja.</li>`).join("")}</ul></div>`
      : `<p class="meta">Sin señales de reclasificación en el periodo comparado.</p>`}
    ${htmlInegi(s.inegi)}
    <h4>Víctimas por año (índice: primer año = 100)</h4>${svgIndice(s.anuales, principales, nombres)}
    <h4>Mismo periodo: enero a ${esc(MES[(s.ultimo_mes || 12) - 1])} ${esc(b)} vs ${esc(a)}</h4>
    <table class="tabla-ficha cx-tabla"><tr><th>Categoría</th><th>${esc(b)}</th><th>${esc(a)}</th><th>Cambio</th></tr>${[...principales, ...otros].map(fila).join("")}</table>
    <p class="meta">Fuente: ${esc(s.fuente)} (${esc((s.archivos || []).join("; "))}). Una «señal» compara categorías vecinas: si una baja y la otra sube en el mismo periodo, conviene revisar si se registran de otra forma. También puede deberse a un cambio de metodología o de catálogo de delitos (p. ej., al iniciar un año): por eso se marca para revisar. No prueba manipulación por sí sola. 📈 = tendencia de varios años; 🗓️ = mismo periodo contra el año anterior. Próximamente: Registro Nacional de Personas Desaparecidas.</p>`;
}

export async function iniciarContrasteMx({ cont, getJSON }) {
  if (!cont) return;
  let d;
  try { d = await getJSON("data/vivos/contraste_mx.json", { bust: true }); } catch {
    cont.innerHTML = `<p class="meta">Aún no hay datos (se generan con «Datos en movimiento»).</p>`;
    return;
  }
  cont.innerHTML = `<h3>🛢️ Comercio: ONU vs Banxico y destinos sin país</h3>${htmlComercio(d.comercio)}
    <h3>🚔 Seguridad: ¿baja real o cambio de categoría?</h3>${htmlSeguridad(d.seguridad)}`;
}
