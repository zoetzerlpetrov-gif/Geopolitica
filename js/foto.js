// Herramientas → «Ubicar una foto»: muestra los metadatos (EXIF) de la foto y, si trae GPS, un botón para ir a ese
// punto en el mapa. Todo ocurre en el navegador: la foto no se sube ni se guarda.
// (El reconocimiento de lugares con CLIP que hubo aquí está documentado en docs/RECONOCIMIENTO_LUGARES.md.)
import { esc } from "./util.js";
import { leerExif, NOMBRE_FORMATO } from "./exif.js";

const $ = (id) => document.getElementById(id);
const PUNTO = "foto-exif-punto";
const ZOOM_CALLE = 17;  // a este zoom se leen los nombres de las calles y se ven varias cuadras alrededor

const ORIENTACION = { 1: "Normal", 2: "Espejo horizontal", 3: "Girada 180°", 4: "Espejo vertical", 5: "Espejo y girada 90°",
  6: "Girada 90° a la derecha", 7: "Espejo y girada 90° a la izquierda", 8: "Girada 90° a la izquierda" };
const uno = (x) => (Array.isArray(x) ? x[0] : x);
const num = (x) => (Number.isFinite(uno(x)) ? uno(x) : null);
/** «2024:05:01 13:22:10» → «2024-05-01 13:22:10». */
const fechaExif = (f) => (typeof f === "string" ? f.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3") : "");
const redondo = (x, d = 1) => Number(x.toFixed(d)).toLocaleString("es-MX");

/** Metadatos leídos → filas [etiqueta, valor] con solo los que la foto trae. */
export function filasExif(d) {
  const exp = num(d.exposicion), ap = num(d.apertura), iso = num(d.iso), focal = num(d.focal), f35 = num(d.focal_35), fl = num(d.flash);
  const gpsHora = [fechaExif(d.fecha_gps), d.hora_gps].filter(Boolean).join(" ");
  return [
    ["Cámara o teléfono", [d.marca, d.modelo].filter(Boolean).join(" · ")],
    ["Lente", [d.lente_marca, d.lente_modelo].filter(Boolean).join(" · ")],
    ["Tomada", [fechaExif(d.fecha_toma), d.zona_toma ? `(UTC${d.zona_toma})` : ""].filter(Boolean).join(" ")],
    ["Digitalizada", d.fecha_digital && d.fecha_digital !== d.fecha_toma ? fechaExif(d.fecha_digital) : ""],
    ["Última modificación", d.fecha_archivo && d.fecha_archivo !== d.fecha_toma ? fechaExif(d.fecha_archivo) : ""],
    ["Programa", d.software],
    ["Tamaño de la imagen", num(d.ancho) && num(d.alto) ? `${num(d.ancho)} × ${num(d.alto)} px` : ""],
    ["Orientación de la imagen", ORIENTACION[num(d.orientacion)] || ""],
    ["Exposición", exp ? (exp < 1 ? `1/${Math.round(1 / exp)} s` : `${redondo(exp)} s`) : ""],
    ["Apertura", ap ? `f/${redondo(ap)}` : ""],
    ["ISO", iso ? String(iso) : ""],
    ["Distancia focal", focal ? `${redondo(focal)} mm${f35 ? ` (equivale a ${f35} mm en 35 mm)` : ""}` : ""],
    ["Flash", fl != null ? (fl & 1 ? "Se disparó" : "No se disparó") : ""],
    ["Autor", d.autor], ["Derechos", d.derechos], ["Descripción", d.descripcion], ["Número de serie del equipo", d.serie],
    ["Coordenadas GPS", d.lat != null ? `${d.lat.toFixed(6)}, ${d.lon.toFixed(6)}` : ""],
    ["Altitud", d.altitud != null ? `${Math.round(d.altitud)} m sobre el nivel del mar` : ""],
    ["Hacia dónde apuntaba", d.direccion != null ? `${Math.round(d.direccion)}° (0° = norte, 90° = este)` : ""],
    ["Precisión del GPS", d.error_gps != null ? `± ${Math.round(d.error_gps)} m (según el teléfono)` : ""],
    ["Fecha y hora del GPS", gpsHora ? `${gpsHora} UTC` : ""],
  ].filter(([, v]) => v != null && String(v).trim() !== "");
}

const tamano = (b) => (b >= 1048576 ? `${redondo(b / 1048576)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export function htmlFoto(d, archivo = {}) {
  const filas = filasExif(d);
  const cab = `<p class="meta">Archivo: ${esc(archivo.name || "foto")} · ${archivo.size ? tamano(archivo.size) : ""} · ${esc(NOMBRE_FORMATO[d.formato] || "formato desconocido")}</p>`;
  if (d.error && !filas.length) return `${cab}<p class="foto-sin">${esc(d.error)}</p>`;
  if (!filas.length) {
    return `${cab}<p class="foto-sin"><b>Esta foto no cuenta con metadatos.</b></p>
      <p class="meta">Pasa con capturas de pantalla, fotos descargadas de redes sociales o mensajería (WhatsApp, Facebook, Instagram o X los borran al publicar)
      y con imágenes editadas o exportadas sin conservarlos. Sin metadatos no hay forma de saber desde el archivo dónde ni cuándo se tomó.</p>`;
  }
  const gps = d.lat != null;
  // El botón va antes de la lista: en el celular el panel es bajo y una lista larga lo dejaría fuera de vista.
  return `${cab}${gps ? `<button type="button" class="foto-ir" id="foto-ir">📍 Ir a la localización</button>`
      : `<p class="foto-sin">La foto tiene metadatos, pero <b>no trae ubicación GPS</b> (el teléfono tenía desactivada la ubicación para la cámara o se borró al compartirla).</p>`}
    <dl class="foto-meta">${filas.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(String(v))}</dd>`).join("")}</dl>
    ${gps ? `<p class="meta">Es la posición del GPS del dispositivo al tomar la foto. En exteriores suele acertar a 5–20 m; en interiores o sin señal de satélite puede errar por cientos de metros.
      Los metadatos se pueden editar: no prueban por sí solos dónde se tomó la foto.</p>` : ""}`;
}

/**
 * Herramientas → «Ubicar una foto». Se activa al abrir la página, sin esperar al mapa ni a los datos:
 * `mapa()` y `lite()` se consultan solo al pulsar «Ir a la localización».
 */
export function iniciarFoto({ mapa, lite = () => false }) {
  const entrada = $("foto-exif"), res = $("foto-exif-res"), prev = $("foto-prev");
  if (!entrada) return;
  let url = null, actual = null;

  const marcar = (map, pts) => {
    const datos = { type: "FeatureCollection", features: pts.map(([lon, lat]) => ({ type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: {} })) };
    if (map.getSource(PUNTO)) { map.getSource(PUNTO).setData(datos); return; }
    map.addSource(PUNTO, { type: "geojson", data: datos });
    map.addLayer({ id: `${PUNTO}-c`, type: "circle", source: PUNTO, paint: { "circle-radius": 9, "circle-color": "#E0A100", "circle-stroke-width": 3, "circle-stroke-color": "#fff" } });
  };

  // Tras un cambio de mapa base el estilo se reemplaza completo: se vuelve a poner el punto.
  let punto = null, conEscucha = false;
  const ponerPunto = (map) => { if (punto) try { marcar(map, [punto]); } catch (err) { /* estilo aún cargando */ } };

  // Un solo escucha para el botón (el resultado se vuelve a pintar con cada foto).
  res.addEventListener("click", (e) => {
    if (!e.target.closest("#foto-ir") || !actual) return;
    const map = mapa();
    if (!map) { res.insertAdjacentHTML("afterbegin", `<p class="meta">El mapa aún está cargando; intenta de nuevo en unos segundos.</p>`); return; }
    if (!conEscucha) { map.on("style.load", () => ponerPunto(map)); conEscucha = true; }
    punto = [actual.lon, actual.lat];
    // Sin calles en el mapa actual (modo LITE con el mapa «Temático», que solo trae países): se cambia a «Calles»
    // para que se vean cuadras y nombres. La imagen satelital ya trae calles encima.
    const sinCalles = !Object.values(map.getStyle()?.sources || {}).some((f) => f.type === "vector");
    const sel = $("sel-base");
    if (sinCalles && sel && sel.value !== "calles") {
      sel.value = "calles";
      sel.dispatchEvent(new Event("change"));
      $("foto-ir").insertAdjacentHTML("afterend", `<p class="meta" id="foto-aviso-calles">Se cambió el mapa base a «Calles» para ver los nombres de las calles (puedes volver a «Temático» arriba).</p>`);
    } else ponerPunto(map);
    const layout = document.querySelector(".layout");
    if (matchMedia("(max-width: 760px)").matches && layout && !layout.classList.contains("sin-panel")) $("btn-panel")?.click();  // en el celular el menú tapa el mapa
    map.flyTo({ center: punto, zoom: ZOOM_CALLE, duration: lite() ? 0 : 1200 });
  });

  // Lee el archivo como bytes; FileReader cubre navegadores donde File.arrayBuffer() no existe o falla.
  const bytes = (archivo) => (archivo.arrayBuffer ? archivo.arrayBuffer() : Promise.reject(new Error("sin arrayBuffer"))).catch(() => new Promise((ok, mal) => {
    const fr = new FileReader();
    fr.onload = () => ok(fr.result);
    fr.onerror = () => mal(fr.error || new Error("no se pudo leer"));
    fr.readAsArrayBuffer(archivo);
  }));

  entrada.addEventListener("change", async () => {
    const archivo = entrada.files?.[0];
    if (!archivo) return;
    actual = null;
    res.innerHTML = `<p class="meta">⏳ Leyendo los metadatos…</p>`;
    try {
      res.scrollIntoView({ block: "nearest", behavior: "smooth" });
      let d;
      try { d = leerExif(await bytes(archivo)); } catch (err) { d = { error: `No se pudo leer el archivo (${err?.message || err}).` }; }
      punto = null;
      try { const map = mapa(); if (map?.getSource(PUNTO)) marcar(map, []); } catch (err) { /* sin mapa todavía */ }
      actual = d.lat != null ? d : null;
      res.innerHTML = htmlFoto(d, archivo);
      res.scrollIntoView({ block: "start", behavior: "smooth" });
      // Vista previa debajo del resultado. HEIC fuera de Safari, TIFF y DNG no se pueden dibujar; los metadatos sí se leen.
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(archivo);
      prev.hidden = true;
      prev.onload = () => { prev.hidden = false; };
      prev.onerror = () => { prev.hidden = true; };
      prev.src = url;
    } catch (err) {
      // Nunca quedarse callado: si algo falla, se dice qué.
      res.innerHTML = `<p class="foto-sin">No se pudo mostrar el resultado: ${esc(err?.message || String(err))}. Recarga la página e intenta de nuevo.</p>`;
    } finally {
      entrada.value = ""; // se puede volver a elegir la misma foto
    }
  });
}
