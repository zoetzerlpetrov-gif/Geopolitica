// Precalcula los vectores de texto de config/monumentos.json con el mismo modelo que usa el navegador.
// Así el navegador no descarga la mitad «texto» del modelo (~60 MB) ni hace ~1,200 cálculos.
// Uso (necesita red y el paquete @huggingface/transformers@3.0.2):  node tools/monumentos/vectores.mjs
// Salida: config/monumentos_vec.json  {modelo, huella, n (lugares), dim, escalas, b64}; tras los n lugares van réplica y real.
import { readFileSync, writeFileSync } from "node:fs";
import * as T from "@huggingface/transformers";
import { MODELO, frasesDe, huella, empacar, norma, agrupar } from "../../js/reconocer.js";

const raiz = new URL("../../", import.meta.url);
const lista = JSON.parse(readFileSync(new URL("config/monumentos.json", raiz), "utf8")).monumentos;
const frases = frasesDe(lista);
const tok = await T.AutoTokenizer.from_pretrained(MODELO);
const modelo = await T.CLIPTextModelWithProjection.from_pretrained(MODELO, { dtype: "q8" });
const vecs = [];
for (let i = 0; i < frases.length; i += 64) {
  const { text_embeds: e } = await modelo(tok(frases.slice(i, i + 64), { padding: true, truncation: true }));
  const [n, d] = e.dims;
  for (let k = 0; k < n; k++) vecs.push(norma(Array.from(e.data.slice(k * d, (k + 1) * d))));
}
// Se guarda ya el promedio por lugar (403 + frases de réplica y real) y no las ~1,200 frases sueltas.
const g = agrupar(vecs, lista.length);
const out = { modelo: MODELO, huella: huella(frases), n: lista.length, ...empacar([...g.lugares, ...g.replica, ...g.real]) };
writeFileSync(new URL("config/monumentos_vec.json", raiz), JSON.stringify(out) + "\n");
console.log(`vectores: ${vecs.length} frases de ${lista.length} lugares, huella ${out.huella}`);
