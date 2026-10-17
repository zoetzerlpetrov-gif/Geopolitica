// Foto forense: indicios de que una imagen fue generada con IA o editada, leídos del propio archivo, y análisis de
// nivel de error (ELA). Todo corre en el navegador; la imagen no se sube.
// Qué se busca en los bytes:
//  - Credenciales de contenido C2PA (estándar de Adobe, Microsoft, Google, OpenAI y otros): un manifiesto firmado que
//    dice con qué se creó o editó la imagen. Varios generadores de IA lo agregan (aunque se pierde al recortar o
//    al pasar por redes sociales).
//  - IPTC «DigitalSourceType» = trainedAlgorithmicMedia (imagen generada por IA) o compositeWithTrainedAlgorithmicMedia
//    (foto editada con IA), en el XMP.
//  - Parámetros de Stable Diffusion, ComfyUI o Automatic1111 guardados en el PNG (prompt, «Steps:», «Sampler:»).
//  - Programa de edición o generación en los metadatos (Photoshop, GIMP, Firefly, Midjourney, DALL·E…).
// No existe un porcentaje confiable de «real o IA»: los detectores automáticos fallan con frecuencia y los metadatos
// se pueden borrar o falsificar. Por eso se reportan indicios con su peso, no un veredicto.
import { esc } from "./util.js";

const IA = /dall[·\-. ]?e|openai|midjourney|stable ?diffusion|stability ai|firefly|imagen \d|gemini|bing image creator|microsoft designer|leonardo\.ai|ideogram|flux|comfyui|automatic1111|novelai|runway|krea|nightcafe|dreamstudio|grok|sora/i;
const EDICION = /photoshop|lightroom|gimp|affinity|pixelmator|capture one|snapseed|canva|picsart|facetune|photopea|paint\.net|luminar|vsco|remini|lensa|faceapp|meitu|picmonkey/i;

/** Texto ASCII aproximado de los bytes (para buscar marcas sin decodificar todo el formato). */
function texto(buffer, max = 4 * 1024 * 1024) {
  const v = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, max));
  let s = "";
  for (let i = 0; i < v.length; i += 8192) s += String.fromCharCode.apply(null, v.subarray(i, i + 8192));
  return s;
}

/**
 * Indicios del archivo → { nivel: "ia"|"ia-editada"|"editada"|"sin-indicios", indicios: [{peso, tipo, texto}] }.
 * `exif` es el resultado de leerExif (para el programa, las fechas y la cámara).
 */
export function indicios(buffer, exif = {}) {
  const t = texto(buffer), out = [];
  const add = (peso, tipo, txt) => out.push({ peso, tipo, texto: txt });
  const c2pa = /c2pa|jumb|caBX/.test(t);
  if (c2pa) {
    const gen = t.match(/claim_generator[^A-Za-z]{0,8}([\w .\-/·()]{3,60})/);
    add("alto", IA.test(gen?.[1] || "") ? "ia" : "info", `Trae credenciales de contenido C2PA${gen ? ` (creadas con «${gen[1].trim()}»)` : ""}. Verifica el manifiesto completo en contentcredentials.org/verify.`);
  }
  if (/trainedAlgorithmicMedia/.test(t) && !/compositeWithTrainedAlgorithmicMedia/.test(t)) add("alto", "ia", "El archivo declara (IPTC DigitalSourceType) que la imagen fue generada por IA.");
  if (/compositeWithTrainedAlgorithmicMedia|compositeSynthetic/.test(t)) add("alto", "ia-editada", "El archivo declara (IPTC) que la foto fue editada o combinada con IA.");
  if (/(Steps: \d+, Sampler:|"class_type"\s*:\s*"KSampler"|parameters\x00|sd-metadata|invokeai_metadata)/.test(t)) add("alto", "ia", "El PNG guarda parámetros de generación de Stable Diffusion, ComfyUI o similar (prompt, pasos, sampler).");
  const prog = [exif?.software, ...(t.match(/<xmp:CreatorTool>([^<]{2,80})<\/xmp:CreatorTool>|xmp:CreatorTool="([^"]{2,80})"/) || []).slice(1)].filter(Boolean).join(" · ");
  const progIa = prog.match(IA)?.[0] || t.slice(0, 200000).match(/(?:Software|CreatorTool|generator)[^A-Za-z]{0,6}([^\x00<"]{0,40}(?:dall[·\-. ]?e|midjourney|stable diffusion|firefly|openai|ideogram)[^\x00<"]{0,20})/i)?.[1];
  if (progIa) add("alto", "ia", `Programa de generación con IA en los metadatos: «${String(progIa).trim()}».`);
  if (prog && EDICION.test(prog)) add("medio", "editada", `Pasó por un programa de edición: «${prog.match(EDICION)[0]}» (${prog.slice(0, 80)}).`);
  const orig = exif?.fecha_toma, mod = exif?.fecha_archivo;
  if (orig && mod && String(orig) !== String(mod)) add("bajo", "editada", `La fecha de modificación (${mod}) es distinta de la de captura (${orig}).`);
  if (exif?.formato === "jpeg" && !exif?.marca && !exif?.modelo) add("bajo", "info", "JPEG sin marca ni modelo de cámara: es normal en capturas de pantalla, imágenes de redes sociales (que borran metadatos) y en imágenes generadas.");
  const ancho = exif?.ancho, alto = exif?.alto;
  if (ancho && alto && [512, 768, 1024, 1536, 2048].includes(ancho) && [512, 768, 1024, 1536, 2048].includes(alto)) add("bajo", "info", `Medidas ${ancho}×${alto}: típicas de generadores de IA (también de recortes cuadrados).`);
  const nivel = out.some((x) => x.peso === "alto" && x.tipo === "ia") ? "ia" : out.some((x) => x.tipo === "ia-editada") ? "ia-editada"
    : out.some((x) => x.tipo === "editada" && x.peso !== "bajo") ? "editada" : "sin-indicios";
  return { nivel, indicios: out };
}

export const RESUMEN = {
  ia: ["#8E1B1B", "Indicios fuertes de imagen generada con IA (declarado en el propio archivo)."],
  "ia-editada": ["#C2185B", "Indicios de foto editada o combinada con IA (declarado en el archivo)."],
  editada: ["#E2711D", "Indicios de edición con un programa (no dice qué se cambió)."],
  "sin-indicios": ["#5D6D7E", "Sin indicios en el archivo. Eso NO prueba que sea real: las redes sociales borran los metadatos y se pueden quitar a propósito."],
};

export function htmlIndicios(r) {
  const [color, txt] = RESUMEN[r.nivel];
  return `<div class="forense"><h4>🔬 Análisis forense del archivo</h4>
    <p class="forense-res" style="border-left-color:${color}"><b>${esc(txt)}</b></p>
    ${r.indicios.length ? `<ul>${r.indicios.map((x) => `<li><span class="chip">${esc(x.peso)}</span> ${esc(x.texto)}</li>`).join("")}</ul>` : ""}
    <p><button type="button" id="foto-ela">Análisis de nivel de error (ELA)</button></p>
    <div id="foto-ela-res"></div>
    <p class="meta">Para seguir: busca la imagen en Google Lens, Bing o TinEye para encontrar su primera publicación; revisa sombras, reflejos, manos, texto y orejas; y verifica credenciales en <a href="https://contentcredentials.org/verify" target="_blank" rel="noopener noreferrer">contentcredentials.org/verify</a>. No hay un porcentaje confiable de «real o IA»: los detectores automáticos se equivocan con frecuencia.</p></div>`;
}

/**
 * ELA: se vuelve a comprimir la imagen como JPEG (calidad 90 %) y se amplifica la diferencia. Las zonas pegadas o
 * retocadas suelen comprimirse distinto y brillan más que el resto; bordes y texturas finas también brillan, así
 * que se interpreta comparando zonas parecidas.
 */
export async function ela(img, { calidad = 0.9, escala = 20, maxLado = 1600 } = {}) {
  const k = Math.min(1, maxLado / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
  const lienzo = (x) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); if (x) g.drawImage(x, 0, 0, w, h); return [c, g]; };
  const [c1, g1] = lienzo(img);
  const blob = await new Promise((ok) => c1.toBlob(ok, "image/jpeg", calidad));
  const re = await createImageBitmap(blob);
  const [, g2] = lienzo(re);
  const a = g1.getImageData(0, 0, w, h), b = g2.getImageData(0, 0, w, h);
  const [c3, g3] = lienzo();
  const out = g3.createImageData(w, h);
  for (let i = 0; i < a.data.length; i += 4) {
    for (let j = 0; j < 3; j++) out.data[i + j] = Math.min(255, Math.abs(a.data[i + j] - b.data[i + j]) * escala);
    out.data[i + 3] = 255;
  }
  g3.putImageData(out, 0, 0);
  return c3;
}
