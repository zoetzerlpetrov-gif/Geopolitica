// Ventana flotante de elecciones nacionales: desde 14 días antes de la votación, durante el conteo y hasta 24 horas
// después de que Wikidata registra al ganador (tope: 21 días después de la fecha). Sale de data/vivos/elecciones.json
// (tools/elecciones/elecciones.py). Se mueve arrastrando su barra azul, se pliega y no tapa el mapa: va abajo a la
// derecha y cada elección se abre con un clic para ver qué necesita un candidato para ganar.
import { esc, safeUrl } from "./util.js";
import { hacerArrastrable, mantenerVisible } from "./alerta_cisne.js";

const URL_DATOS = "data/vivos/elecciones.json";
const REFRESCO_MS = 30 * 60 * 1000;
const CLAVE_POS = "gp_elecciones_pos";
const CLAVE_ABIERTA = "gp_elecciones_abierta";
const TIPO = { presidencial: "Presidencial", legislativa: "Legislativa", referendum: "Referéndum", otra: "Elección" };
const ESTADO = { conteo: "🗳️ Votación y conteo", resultado: "✅ Resultado", proxima: "📅 Próxima" };

/** Elecciones que se muestran ahora (`ahora` en ISO UTC). Primero las de conteo, luego resultados, luego próximas. */
export function eleccionesVisibles(datos, ahora = new Date().toISOString()) {
  const hoy = ahora.slice(0, 10);
  const orden = { conteo: 0, resultado: 1, proxima: 2 };
  return (datos?.elecciones || [])
    // Si los datos llegan atrasados, una «próxima» cuya fecha ya pasó se trata como votación y conteo.
    .map((e) => (e.estado === "proxima" && e.fecha <= hoy ? { ...e, estado: "conteo" } : e))
    .filter((e) => {
      if (e.tope && hoy > e.tope) return false;
      if (e.estado === "proxima") return !e.mostrar_desde || hoy >= e.mostrar_desde;
      if (e.estado === "resultado") return !e.mostrar_hasta_utc || ahora <= e.mostrar_hasta_utc;
      return true;
    })
    .sort((a, b) => orden[a.estado] - orden[b.estado] || (a.fecha < b.fecha ? -1 : 1));
}

const dias = (fecha, hoy) => Math.round((Date.parse(fecha) - Date.parse(hoy)) / 86400000);

function cuando(e, hoy) {
  const d = dias(e.fecha, hoy);
  if (e.estado === "proxima") return d === 1 ? "mañana" : `en ${d} días (${e.fecha})`;
  if (e.estado === "resultado") return `votó el ${e.fecha}`;
  return d === 0 ? "hoy" : `votó el ${e.fecha}`;
}

export function htmlElecciones(lista, abierta = "", hoy = new Date().toISOString().slice(0, 10)) {
  if (!lista.length) return "";
  const enConteo = lista.filter((e) => e.estado === "conteo").length;
  const items = lista.map((e, i) => `<li><details data-id="${esc(e.id)}"${abierta === e.id ? " open" : ""}>
    <summary><span class="el-est el-${esc(e.estado)}">${ESTADO[e.estado] || ""}</span> <b>${esc(e.pais)}</b> · ${esc(TIPO[e.tipo] || "Elección")} · ${esc(cuando(e, hoy))}</summary>
    <div class="el-det">
      <p class="el-nom">${esc(e.nombre)}</p>
      ${e.ganador ? `<p><b>Ganador registrado:</b> ${esc(e.ganador)} <span class="meta">(Wikidata; confirma con el órgano electoral)</span></p>` : ""}
      <p><b>Qué se necesita para ganar:</b> ${esc(e.regla)}</p>
      ${e.candidatos?.length ? `<p><b>Candidaturas registradas en Wikidata:</b> ${e.candidatos.map(esc).join(" · ")}</p>` : ""}
      <p class="meta">Conteo por región: no hay una fuente abierta común; consulta el sitio del órgano electoral del país.</p>
      <p><button type="button" class="el-ir" data-i="${i}">📍 Ver en el mapa</button> <a href="${esc(safeUrl(e.url))}" target="_blank" rel="noopener noreferrer">Más información</a></p>
    </div></details></li>`).join("");
  return `<div class="el-cab"><b title="Arrastra esta barra para mover la ventana; doble clic la regresa a su lugar">🗳️ ${lista.length === 1 ? "1 elección" : `${lista.length} elecciones`}${enConteo ? ` · ${enConteo} en conteo` : ""}</b>
    <button type="button" class="el-plegar" aria-expanded="true" title="Plegar o desplegar">▾</button></div>
    <ul class="el-lista">${items}</ul>
    <p class="el-pie meta">Fuente: Wikidata (CC0), editada por voluntarios. Un resultado se quita 24 h después de registrarse.</p>`;
}

/** Monta la ventana dentro del contenedor del mapa. `irA(lon, lat)` centra el mapa en el país. */
export function iniciarElecciones(contenedor, irA) {
  if (!contenedor) return;
  const caja = document.createElement("div");
  caja.id = "ventana-elecciones";
  caja.className = "ventana-elecciones plegado";  // empieza plegada: solo la barra azul, para no tapar el mapa
  caja.setAttribute("role", "region");
  caja.setAttribute("aria-label", "Elecciones en curso y próximas");
  caja.hidden = true;
  contenedor.appendChild(caja);
  const reubicar = hacerArrastrable(caja, CLAVE_POS, ".el-cab");
  let lista = [];
  let abierta = "";
  try { abierta = localStorage.getItem(CLAVE_ABIERTA) || ""; } catch { /* sin almacenamiento */ }
  const pintar = async () => {
    try {
      const r = await fetch(URL_DATOS, { cache: "no-cache" });
      lista = eleccionesVisibles(r.ok ? await r.json() : null);
    } catch { lista = []; }
    const plegado = caja.classList.contains("plegado");
    caja.innerHTML = htmlElecciones(lista, abierta);
    caja.hidden = !lista.length;
    const pl = caja.querySelector(".el-plegar");
    if (pl && plegado) { pl.setAttribute("aria-expanded", "false"); pl.textContent = "▸"; }
    reubicar();
  };
  caja.addEventListener("toggle", (e) => {
    const d = e.target;
    if (!d.dataset?.id) return;
    if (d.open) { abierta = d.dataset.id; for (const o of caja.querySelectorAll("details[open]")) if (o !== d) o.open = false; }
    else if (abierta === d.dataset.id) abierta = "";
    mantenerVisible(caja); // si se desplegó cerca del borde de abajo, sube para que se lea
    try { localStorage.setItem(CLAVE_ABIERTA, abierta); } catch { /* nada */ }
  }, true);
  caja.addEventListener("click", (e) => {
    const pl = e.target.closest(".el-plegar");
    if (pl) { const p = caja.classList.toggle("plegado"); pl.setAttribute("aria-expanded", String(!p)); pl.textContent = p ? "▸" : "▾"; mantenerVisible(caja); return; }
    const ir = e.target.closest(".el-ir");
    if (ir && irA) { const x = lista[Number(ir.dataset.i)]; if (x) irA(x.lon, x.lat); }
  });
  pintar();
  setInterval(pintar, REFRESCO_MS);
}
