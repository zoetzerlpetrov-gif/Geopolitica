// Lector mínimo de libros .xlsx en el navegador (y en Node 18+): abre el ZIP, descomprime con DecompressionStream y
// devuelve cada hoja como filas de valores. Lee los valores guardados (texto, números, fechas como número de serie y el
// último resultado de cada fórmula). No ejecuta macros ni fórmulas. Límites para no colgar la página con archivos raros.
const MAX_BYTES = 30 * 1024 * 1024, MAX_ENTRADAS = 400, MAX_DESCOMP = 120 * 1024 * 1024;

async function inflar(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** ZIP → {nombre: Uint8Array} (solo las partes XML del libro). */
export async function abrirZip(datos) {
  const b = datos instanceof Uint8Array ? datos : new Uint8Array(datos);
  if (b.length < 22 || b.length > MAX_BYTES) throw new Error("El archivo no parece un Excel válido (o pesa más de 30 MB).");
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), u16 = (i) => dv.getUint16(i, true), u32 = (i) => dv.getUint32(i, true);
  let fin = -1;
  for (let p = b.length - 22; p >= Math.max(0, b.length - 65557); p--) if (u32(p) === 0x06054b50) { fin = p; break; }
  if (fin < 0) throw new Error("No es un archivo .xlsx (ZIP) válido.");
  const n = u16(fin + 10), dec = new TextDecoder();
  if (n > MAX_ENTRADAS) throw new Error("El libro tiene demasiadas partes.");
  let p = u32(fin + 16), total = 0;
  const out = {};
  for (let i = 0; i < n; i++) {
    if (u32(p) !== 0x02014b50) throw new Error("Directorio del ZIP dañado.");
    const metodo = u16(p + 10), comp = u32(p + 20), tam = u32(p + 24), ln = u16(p + 28), le = u16(p + 30), lc = u16(p + 32), local = u32(p + 42);
    const nombre = dec.decode(b.subarray(p + 46, p + 46 + ln));
    p += 46 + ln + le + lc;
    if (!/^(xl\/|\[Content_Types\])/.test(nombre) || !/\.(xml|rels)$/.test(nombre)) continue;
    total += tam;
    if (total > MAX_DESCOMP) throw new Error("El libro descomprimido es demasiado grande.");
    const ini = local + 30 + u16(local + 26) + u16(local + 28), crudo = b.subarray(ini, ini + comp);
    out[nombre] = metodo === 0 ? crudo : metodo === 8 ? await inflar(crudo) : null;
  }
  return out;
}

const xmlTexto = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, "&");
const textoDe = (frag) => [...frag.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => xmlTexto(m[1])).join("");

/** Número de columna (0 = A) de una referencia «AB12». */
export function numCol(ref) {
  let n = 0;
  for (const c of ref.replace(/\d+$/, "")) n = n * 26 + c.charCodeAt(0) - 64;
  return n - 1;
}

/** Libro → { nombreHoja: [[valor]] } con los valores guardados. */
export async function leerXLSX(datos) {
  const z = await abrirZip(datos), dec = new TextDecoder();
  const txt = (k) => (z[k] ? dec.decode(z[k]) : "");
  const compartidos = [...txt("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textoDe(m[1]));
  const rels = Object.fromEntries([...txt("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)].map((m) => {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1], t = /Target="([^"]+)"/.exec(m[0])?.[1] || "";
    return [id, t.replace(/^\/?(xl\/)?/, "xl/")];
  }));
  const hojas = {};
  for (const m of txt("xl/workbook.xml").matchAll(/<sheet\b[^>]*>/g)) {
    const nombre = xmlTexto(/name="([^"]*)"/.exec(m[0])?.[1] || ""), rid = /r:id="([^"]+)"/.exec(m[0])?.[1];
    const x = txt(rels[rid] || "");
    const filas = [];
    for (const f of x.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const r = +(/\br="(\d+)"/.exec(f[1])?.[1] || filas.length + 1) - 1;
      const fila = (filas[r] = []);
      for (const c of f[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = /\br="([A-Z]+\d+)"/.exec(c[1])?.[1], tipo = /\bt="([^"]+)"/.exec(c[1])?.[1] || "n", cuerpo = c[2] || "";
        if (!ref) continue;
        const v = /<v>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1];
        let val = null;
        if (tipo === "inlineStr") val = textoDe(cuerpo);
        else if (v == null) val = null;
        else if (tipo === "s") val = compartidos[+v] ?? "";
        else if (tipo === "str" || tipo === "e") val = xmlTexto(v);
        else if (tipo === "b") val = v === "1";
        else val = Number(v);
        fila[numCol(ref)] = val;
      }
    }
    hojas[nombre] = Array.from({ length: filas.length }, (_, i) => filas[i] || []);
  }
  return hojas;
}

/** Número de serie de Excel → «AAAA-MM-DD». */
export const fechaDeSerie = (n) => (typeof n === "number" && n > 20000 && n < 80000 ? new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10) : null);
