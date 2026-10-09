// Herramientas → «Ubicar una foto»: metadatos (EXIF) y reconocimiento experimental del lugar. Todo en el navegador.
import { getJSON, esc } from "./util.js";
import { leerExif, NOMBRE_FORMATO } from "./exif.js";

const $ = (id) => document.getElementById(id);
const PUNTO = "foto-exif-punto", LUGARES = "foto-lugares";

function capaPuntos(m, src, datos, color, etiquetas = false) {
  if (m.getSource(src)) { m.getSource(src).setData(datos); return; }
  m.addSource(src, { type: "geojson", data: datos });
  m.addLayer({ id: `${src}-c`, type: "circle", source: src, paint: { "circle-radius": 9, "circle-color": color, "circle-stroke-width": 3, "circle-stroke-color": "#fff" } });
  if (etiquetas) {
    m.addLayer({ id: `${src}-t`, type: "symbol", source: src, layout: { "text-field": ["get", "t"], "text-size": 12, "text-offset": [0, 1.3], "text-anchor": "top" },
      paint: { "text-color": "#111", "text-halo-color": "#fff", "text-halo-width": 1.6 } });
  }
}
const coleccion = (pts) => ({ type: "FeatureCollection", features: pts.map(([lon, lat, t]) => ({ type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: { t: t || "" } })) });

function htmlExif(d) {
  const filas = [["Formato", NOMBRE_FORMATO[d.formato] || ""], ["Cámara", [d.marca, d.modelo].filter(Boolean).join(" ")], ["Tomada", d.fecha_toma || d.fecha_archivo],
    ["Programa", d.software], ["Coordenadas", d.lat != null ? `${d.lat.toFixed(5)}, ${d.lon.toFixed(5)}` : ""], ["Altitud", d.altitud != null ? `${Math.round(d.altitud)} m` : ""],
    ["Orientación", d.direccion != null ? `${Math.round(d.direccion)}° (0° = norte)` : ""]].filter(([, v]) => v);
  return `${filas.length ? `<dl>${filas.map(([k, v]) => `<dt>${k}</dt><dd>${esc(String(v))}</dd>`).join("")}</dl>` : ""}
    ${d.error ? `<p class="meta">${esc(d.error)}</p>` : `<p class="meta">${d.lat != null ? "Ubicación del GPS del dispositivo al tomar la foto. Su precisión típica es de 5 a 20 m en exteriores y puede ser de cientos de metros en interiores o si el teléfono usó solo antenas o wifi. Los metadatos se pueden editar: no prueban por sí solos dónde se tomó la foto."
      : "La foto no trae coordenadas GPS. Para ubicarla habría que comparar lo que se ve (edificios, señales, montañas, sombras) con mapas e imágenes satelitales: es la geolocalización visual que usan los verificadores. Abajo puedes probar el reconocimiento automático de lugares famosos."}</p>`}`;
}

/** Texto del aviso de réplica según la probabilidad (0–1) que da el modelo. */
export function avisoReplica(p) {
  if (p >= 0.75) return { nivel: "alto", texto: `Parece una réplica, maqueta o souvenir, no el lugar real (${Math.round(p * 100)} %). Si es una figura, el lugar sugerido es el monumento que representa, no donde se tomó la foto.` };
  if (p >= 0.5) return { nivel: "medio", texto: `No está claro si es el lugar real o una réplica (${Math.round(p * 100)} % réplica). Fíjate en la escala, el fondo y si hay mesa, estante o vitrina.` };
  return null;
}

function htmlLugares(r) {
  const top = r.candidatos[0];
  const rep = avisoReplica(r.replica);
  const flojo = top.p < 0.25;
  return `<h4>Lugares parecidos (sugerencia, no prueba)</h4>
    ${rep ? `<p class="aviso-replica ${rep.nivel}">${rep.nivel === "alto" ? "🧸 " : "❓ "}${esc(rep.texto)}</p>` : ""}
    ${flojo ? `<p class="meta">Ninguna coincidencia clara: quizá el lugar no está entre los ${r.total} lugares famosos de la lista, o la foto muestra solo un detalle.</p>` : ""}
    <ol class="lugares">${r.candidatos.map((c, i) => `<li><button type="button" class="enlace" data-i="${i}">${esc(c.m[1] || c.m[0])}</button>
      <span class="meta">${c.m[7] ? `cerca de ${esc(c.m[7])} · ` : ""}${esc(c.m[2] || "")} · ${Math.round(c.p * 100)} %</span></li>`).join("")}</ol>
    <p class="meta">El porcentaje compara solo contra esta lista; un 90 % no significa 90 % de certeza de estar ahí. El modelo (CLIP) reconoce
      la forma general, no lee letreros, y puede confundir lugares parecidos o réplicas grandes al aire libre (la Estatua de la Libertad de Las Vegas o de París).
      Confirma con otras pistas: letreros, idioma, placas de autos, vegetación, sombras y vistas satelitales.</p>`;
}

/** Herramientas → «Ubicar una foto». */
export function iniciarFoto({ map, lite = false }) {
  const entrada = $("foto-exif"), res = $("foto-exif-res"), prev = $("foto-prev"), btn = $("foto-reconocer"), lug = $("foto-lugares-res");
  if (!entrada) return;
  let foto = null, url = null;

  entrada.addEventListener("change", async () => {
    const archivo = entrada.files?.[0];
    if (!archivo) return;
    entrada.value = ""; // se puede volver a elegir la misma foto
    if (url) URL.revokeObjectURL(url);
    foto = archivo; url = URL.createObjectURL(archivo);
    lug.innerHTML = ""; btn.hidden = true;
    capaPuntos(map, LUGARES, coleccion([]), "#7B2FBE", true);
    let d;
    try { d = leerExif(await archivo.arrayBuffer()); } catch (err) { d = { error: "No se pudo leer el archivo." }; }
    capaPuntos(map, PUNTO, coleccion(d.lat != null ? [[d.lon, d.lat]] : []), "#E0A100");
    res.innerHTML = htmlExif(d);
    if (d.lat != null) map.flyTo({ center: [d.lon, d.lat], zoom: 15, duration: lite ? 0 : 900 });
    // Vista previa: si el navegador no sabe dibujar el formato (HEIC fuera de Safari, DNG), tampoco se puede reconocer.
    prev.hidden = false;
    prev.onload = () => { btn.hidden = false; };
    prev.onerror = () => {
      prev.hidden = true;
      lug.innerHTML = `<p class="meta">Este navegador no puede mostrar fotos ${esc(NOMBRE_FORMATO[d.formato] || "de este formato")}, así que no puedo reconocer el lugar.
        Los metadatos sí se leyeron. ${d.formato === "heic" ? "Safari (iPhone, iPad, Mac) sí abre HEIC; en Android o Windows, exporta la foto como JPEG (en iPhone: Ajustes → Cámara → Formatos → «Más compatible»)." : "Exporta la foto como JPEG."}</p>`;
    };
    prev.src = url;
  });

  btn.addEventListener("click", async () => {
    if (!foto) return;
    btn.disabled = true;
    const avance = (t) => { lug.innerHTML = `<p class="meta">⏳ ${esc(t)}</p>`; };
    try {
      const R = await import("./reconocer.js");
      const lista = (await getJSON("config/monumentos.json")).monumentos;
      const r = await R.reconocer(foto, lista, avance);
      lug.innerHTML = htmlLugares(r);
      const pts = r.candidatos.map((c, i) => [c.m[4], c.m[3], `${i + 1}. ${c.m[1] || c.m[0]}`]);
      capaPuntos(map, LUGARES, coleccion(pts), "#7B2FBE", true);
      lug.querySelectorAll("button[data-i]").forEach((b) => {
        b.onclick = () => { const c = r.candidatos[Number(b.dataset.i)]; map.flyTo({ center: [c.m[4], c.m[3]], zoom: 15, duration: lite ? 0 : 900 }); };
      });
      map.flyTo({ center: pts[0].slice(0, 2), zoom: 12, duration: lite ? 0 : 900 });
    } catch (e) {
      lug.innerHTML = `<p class="meta">No se pudo usar el reconocimiento: ${esc(e.message || String(e))}. Necesita un navegador reciente con WebAssembly y conexión para la primera descarga.</p>`;
    } finally { btn.disabled = false; }
  });
}
