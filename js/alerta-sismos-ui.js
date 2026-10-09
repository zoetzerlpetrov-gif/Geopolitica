// Interfaz de la alerta de sismos (Herramientas → Alerta de sismos). La lógica está en alerta-sismos.js.
// Mientras la alerta está activa y la página abierta, el navegador consulta USGS y EMSC cada 60 s.
import { getJSON, esc, safeUrl, storage } from "./util.js";
import { evaluar, deUsgs, deEmsc, sinDuplicados, ciudadDeZonaHoraria, redondear, SENSIBILIDAD } from "./alerta-sismos.js";
import { candidatosZona, indicePaises, paisEn } from "./amenazas.js";

const USGS = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_hour.geojson";
const EMSC = (desde) => `https://www.seismicportal.eu/fdsnws/event/1/query?format=json&minmag=4.5&limit=60&start=${desde}`;
const CADA_MS = 60000;
const LS = "gp_alerta_sismos";          // {activa, lat, lon, nombre, sens, sonido}
const LS_VISTOS = "gp_alerta_sismos_vistos";

const leer = (k, def) => { try { return JSON.parse(storage.get(k) || "null") ?? def; } catch (e) { return def; } };
const guardar = (k, v) => storage.set(k, JSON.stringify(v));
const $ = (id) => document.getElementById(id);

let audio = null;
/** Sirena de dos tonos con Web Audio (sin archivos de sonido). Necesita un clic previo del usuario para sonar. */
function sirena(segundos = 8) {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
    const t0 = audio.currentTime, osc = audio.createOscillator(), vol = audio.createGain();
    osc.type = "square";
    for (let t = 0; t < segundos; t += 0.5) osc.frequency.setValueAtTime(t % 1 < 0.5 ? 960 : 640, t0 + t);
    vol.gain.setValueAtTime(0.0001, t0);
    vol.gain.exponentialRampToValueAtTime(0.25, t0 + 0.05);
    vol.gain.setValueAtTime(0.25, t0 + segundos - 0.2);
    vol.gain.exponentialRampToValueAtTime(0.0001, t0 + segundos);
    osc.connect(vol).connect(audio.destination);
    osc.start(t0); osc.stop(t0 + segundos);
    return osc;
  } catch (e) { return null; }
}

function pantalla(s, r, map, prueba = false) {
  document.getElementById("alerta-sismo")?.remove();
  const hace = Math.max(0, Math.round((Date.now() - s.tiempo) / 60000));
  const fuerte = r.nivel === "alarma";
  const div = document.createElement("div");
  div.id = "alerta-sismo";
  div.className = `alerta-sismo ${fuerte ? "fuerte" : "aviso"}`;
  div.setAttribute("role", "alertdialog");
  div.setAttribute("aria-labelledby", "alerta-sismo-tit");
  div.innerHTML = `<div class="as-caja">
    <h2 id="alerta-sismo-tit">${prueba ? "PRUEBA · " : ""}${fuerte ? "⚠️ SISMO FUERTE CERCA DE TI" : "Sismo que pudo sentirse en tu zona"}</h2>
    <p class="as-mag">M${Number(s.mag).toFixed(1)} · ${esc(s.lugar)}</p>
    <p>A ${r.distancia_km.toLocaleString("es-MX")} km de ${esc(leer(LS, {}).nombre || "tu ubicación")} · hace ${hace} min · profundidad ${Math.round(s.prof_km)} km · ${esc(s.fuente)}</p>
    <p><b>${esc(r.motivo[0].toUpperCase() + r.motivo.slice(1))}.</b></p>
    ${fuerte ? `<ul class="as-que-hacer"><li>Si aún tiembla: agáchate, cúbrete y sujétate; aléjate de ventanas.</li>
      <li>Cuando pare: revisa fugas de gas y daños antes de usar elevadores o encender aparatos; sal con calma si el edificio está dañado.</li>
      <li>Si estás en la costa y el sismo fue largo o muy fuerte: aléjate del mar sin esperar aviso.</li>
      <li>Sigue a Protección Civil y al servicio sismológico oficial.</li></ul>` : ""}
    <p class="meta">Este aviso llega minutos después del sismo: no es una alerta temprana. Magnitud y lugar preliminares.</p>
    <div class="as-botones"><button type="button" id="as-cerrar">Entendido</button>
      <button type="button" id="as-ver">Ver en el mapa</button> <a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">Ficha oficial ↗</a></div></div>`;
  document.body.append(div);
  const osc = fuerte && leer(LS, {}).sonido !== false ? sirena(10) : null;
  const cerrar = () => { try { osc?.stop(); } catch (e) { /* ya terminó */ } div.remove(); };
  div.querySelector("#as-cerrar").onclick = cerrar;
  div.querySelector("#as-ver").onclick = () => { cerrar(); map?.flyTo({ center: [s.lon, s.lat], zoom: 6 }); };
  div.querySelector("#as-cerrar").focus();
  if (document.hidden && "Notification" in window && Notification.permission === "granted") {
    try { new Notification(`${fuerte ? "Sismo fuerte" : "Sismo"} M${Number(s.mag).toFixed(1)} a ${r.distancia_km} km`, { body: s.lugar, tag: s.id, requireInteraction: fuerte }); } catch (e) { /* sin notificaciones */ }
  }
}

async function consultar() {
  const desde = new Date(Date.now() - 65 * 60000).toISOString().slice(0, 19);
  const [u, e] = await Promise.all([getJSON(USGS, { bust: true }).catch(() => null), getJSON(EMSC(desde), { bust: true }).catch(() => null)]);
  return sinDuplicados([...(u?.features || []).map(deUsgs), ...(e?.features || []).map(deEmsc)].sort((a, b) => a.tiempo - b.tiempo));
}

/** Herramientas → Alerta de sismos. */
export async function iniciarAlertaSismos({ map, paises = {} }) {
  const cont = $("alerta-sismos");
  if (!cont) return;
  const [cfg, ciudades] = await Promise.all([getJSON("config/alerta_sismica.json").catch(() => ({ paises: {}, global: [] })),
    getJSON("config/ciudades.json").then((c) => c.ciudades).catch(() => [])]);
  let indice = null;
  const pais = async (lat, lon) => {
    indice ??= await getJSON("data/base/countries-110m.geojson").then(indicePaises).catch(() => null);
    return indice ? paisEn(indice, lon, lat) : null;
  };
  let estado = leer(LS, { activa: false, sens: "normal", sonido: true });
  let reloj = null;

  const sistemas = async () => {
    const iso = estado.lat != null ? await pais(estado.lat, estado.lon) : null;
    const lista = [...(cfg.paises?.[iso] || []), ...(cfg.global || [])];
    $("as-oficiales").innerHTML = `<h4>Alerta temprana oficial${iso ? ` (${esc(paises[iso]?.es || iso)})` : ""}</h4>
      ${iso && !cfg.paises?.[iso] ? `<p class="meta">No tengo registrado un sistema oficial de alerta temprana para este país.</p>` : ""}
      <ul class="fuentes">${lista.map((x) => `<li><a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener noreferrer">${esc(x.nombre)}</a> · <span class="meta">${esc(x.nota)}</span></li>`).join("")}</ul>`;
  };
  const pintar = () => {
    $("as-activa").checked = Boolean(estado.activa);
    $("as-donde").textContent = estado.lat != null ? `Ubicación: ${estado.nombre || "tu ubicación"} (${estado.lat.toFixed(2)}, ${estado.lon.toFixed(2)})` : "Sin ubicación: elige una ciudad o usa tu ubicación.";
    $("as-sens").value = estado.sens || "normal";
    $("as-sonido").checked = estado.sonido !== false;
    $("as-estado").textContent = estado.activa && estado.lat != null ? "Vigilando: consulta USGS y EMSC cada minuto mientras esta página esté abierta." : "";
    sistemas();
  };
  const revisar = async () => {
    if (!estado.activa || estado.lat == null) return;
    const vistos = new Set(leer(LS_VISTOS, []));
    for (const s of await consultar()) {
      if (vistos.has(s.id)) continue;
      const r = evaluar(s, estado, { factor: SENSIBILIDAD[estado.sens] || 1 });
      if (!r) continue;
      vistos.add(s.id);
      guardar(LS_VISTOS, [...vistos].slice(-200));
      pantalla(s, r, map);
      break;  // una alerta a la vez
    }
    $("as-ultima").textContent = `Última revisión: ${new Date().toLocaleTimeString("es-MX")}`;
  };
  const arrancar = () => {
    clearInterval(reloj); reloj = null;
    if (estado.activa && estado.lat != null) { revisar(); reloj = setInterval(revisar, CADA_MS); }
  };
  const fijar = (lat, lon, nombre) => { estado = { ...estado, lat: redondear(lat), lon: redondear(lon), nombre }; guardar(LS, estado); pintar(); arrancar(); };

  // Sugerencia sin red ni IP: la ciudad de la zona horaria del navegador (p. ej. America/Mexico_City).
  const sugerida = estado.lat == null ? ciudadDeZonaHoraria(Intl.DateTimeFormat().resolvedOptions().timeZone, ciudades) : null;
  if (sugerida) $("as-q").value = sugerida.nombre;

  $("as-gps").onclick = () => {
    if (!navigator.geolocation) { $("as-donde").textContent = "Este navegador no permite pedir la ubicación."; return; }
    $("as-donde").textContent = "Pidiendo permiso de ubicación…";
    navigator.geolocation.getCurrentPosition((p) => fijar(p.coords.latitude, p.coords.longitude, "tu ubicación (GPS)"),
      (err) => { $("as-donde").textContent = `No se obtuvo la ubicación (${err.message}). Escribe tu ciudad.`; }, { maximumAge: 600000, timeout: 15000 });
  };
  const fuentesZona = { estados: [], ciudadesMx: [], ciudades, paises };
  $("as-q").addEventListener("input", () => {
    $("as-sug").innerHTML = candidatosZona($("as-q").value, fuentesZona, 10).filter((c) => c.lat != null)
      .map((c) => `<option value="${esc(c.etiqueta)}"></option>`).join("");
  });
  $("as-form").onsubmit = (e) => {
    e.preventDefault();
    const q = $("as-q").value.trim();
    const c = candidatosZona(q.split(" · ")[0], fuentesZona, 10).filter((x) => x.lat != null)
      .find((x) => x.etiqueta === q) || candidatosZona(q.split(" · ")[0], fuentesZona, 10).find((x) => x.lat != null);
    if (c) fijar(c.lat, c.lon, c.nombre); else $("as-donde").textContent = "No encontré esa ciudad; prueba con «Ciudad, País».";
  };
  $("as-activa").onchange = async (e) => {
    estado.activa = e.target.checked;
    guardar(LS, estado);
    if (estado.activa) {
      sirena(0.05);  // desbloquea el audio con este clic (los navegadores lo exigen)
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
    }
    pintar(); arrancar();
  };
  $("as-sens").onchange = (e) => { estado.sens = e.target.value; guardar(LS, estado); };
  $("as-sonido").onchange = (e) => { estado.sonido = e.target.checked; guardar(LS, estado); };
  $("as-probar").onclick = () => {
    const lat = estado.lat ?? 19.43, lon = estado.lon ?? -99.13;
    const s = { id: "prueba", mag: 7.2, lat: lat - 1.5, lon: lon + 0.5, prof_km: 20, tiempo: Date.now() - 120000, tsunami: false, lugar: "Sismo de prueba (no es real)", url: "https://earthquake.usgs.gov/", fuente: "prueba" };
    pantalla(s, evaluar(s, { lat, lon }) || { nivel: "alarma", distancia_km: 170, radio_km: 400, motivo: "prueba de la alarma" }, map, true);
  };
  pintar(); arrancar();
}
