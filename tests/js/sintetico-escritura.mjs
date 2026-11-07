// Genera imágenes sintéticas de «escritura» para probar las mediciones: palabras hechas de trazos con inclinación,
// tamaño, dirección de renglón y grosor conocidos.
export function lienzo(w, h) { const data = new Uint8ClampedArray(w * h * 4).fill(255); return { width: w, height: h, data }; }
export function punto(img, x, y, r, tono = 20) {
  for (let yy = Math.floor(y - r); yy <= Math.ceil(y + r); yy++) for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++) {
    if (xx < 0 || yy < 0 || xx >= img.width || yy >= img.height || (xx - x) ** 2 + (yy - y) ** 2 > r * r) continue;
    const j = (yy * img.width + xx) * 4; img.data[j] = img.data[j + 1] = img.data[j + 2] = tono;
  }
}
export function trazo(img, x0, y0, x1, y1, grosor) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
  for (let i = 0; i <= n; i++) punto(img, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, grosor / 2);
}
/**
 * opciones: xh (px de zona media), incl (grados, 90 vertical, <90 a la derecha), dir (grados, + asciende),
 * grosor (px), renglones, interlineado (× xh), palabras, letras, hueco (× xh), margen (px), hampas (cada cuántas letras).
 */
export function escritura({ w = 1200, h = 900, xh = 20, incl = 90, dir = 0, grosor = 3, renglones = 6, interlineado = 3, palabras = 6, letras = 5, hueco = 1.5, margen = 80, hampas = 4 } = {}) {
  const img = lienzo(w, h), dx = xh / Math.tan((incl * Math.PI) / 180), tan = Math.tan((dir * Math.PI) / 180);
  for (let r = 0; r < renglones; r++) {
    let x = margen; const base = margen + xh * 2 + r * interlineado * xh;
    for (let p = 0; p < palabras; p++) {
      for (let l = 0; l < letras; l++) {
        const y = base - (x - margen) * tan, alto = (l % hampas === 1) ? xh * 2.2 : xh;
        trazo(img, x, y, x + (alto / xh) * dx, y - alto, grosor);       // palo inclinado
        trazo(img, x + dx, y - xh, x + dx + xh * 0.55, y - xh - xh * 0.55 * tan, grosor); // arco superior
        trazo(img, x + xh * 0.55, y - xh * 0.55 * tan, x + xh * 0.55 + dx, y - xh - xh * 0.55 * tan, grosor); // segundo palo
        trazo(img, x, y, x + xh * 0.55, y - xh * 0.55 * tan, grosor);    // base
        x += xh * 0.75;
      }
      x += hueco * xh;
    }
  }
  return img;
}
