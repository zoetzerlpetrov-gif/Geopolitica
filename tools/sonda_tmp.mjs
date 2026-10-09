// Sonda temporal: valida CLIP (Transformers.js 3.0.2, q8) con fotos de Wikimedia Commons.
import { readFileSync } from "node:fs";
import * as T from "@huggingface/transformers";
import { clasificar, frase, FRASES_REPLICA, FRASES_REAL, MODELO, TRANSFORMERS } from "../js/reconocer.js";

const UA = { "User-Agent": "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)" };
for (const u of [TRANSFORMERS, `${TRANSFORMERS}/dist/transformers.min.js`, `${TRANSFORMERS}/+esm`]) {
  const r = await fetch(u, { headers: UA }); const t = await r.text();
  console.log("CDN", u, r.status, r.headers.get("content-type"), t.length, /\bexport\b/.test(t.slice(-3000)) ? "ESM" : "no-ESM", t.slice(0, 80).replace(/\n/g, " "));
}
const lista = JSON.parse(readFileSync("config/monumentos.json", "utf8")).monumentos;
const proc = await T.AutoProcessor.from_pretrained(MODELO);
const vision = await T.CLIPVisionModelWithProjection.from_pretrained(MODELO, { dtype: "q8" });
const tok = await T.AutoTokenizer.from_pretrained(MODELO);
const texto = await T.CLIPTextModelWithProjection.from_pretrained(MODELO, { dtype: "q8" });
const norma = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
async function vecs(frases) {
  const out = [];
  for (let i = 0; i < frases.length; i += 64) {
    const e = (await texto(tok(frases.slice(i, i + 64), { padding: true, truncation: true }))).text_embeds;
    const [n, d] = e.dims;
    for (let k = 0; k < n; k++) out.push(norma(Array.from(e.data.slice(k * d, (k + 1) * d))));
  }
  return out;
}
const variantes = {
  A: lista.map(frase),
  B: lista.map((m) => `a photo of the ${m[0]}${m[8] ? `, ${m[8]}` : ""}`),
};
const V = {}; for (const [k, f] of Object.entries(variantes)) V[k] = await vecs(f);
const vRep = await vecs(FRASES_REPLICA), vReal = await vecs(FRASES_REAL);

async function commons(q, n = 3) {
  const u = "https://commons.wikimedia.org/w/api.php?" + new URLSearchParams({ action: "query", format: "json", generator: "search", gsrsearch: `${q} filetype:bitmap`,
    gsrnamespace: "6", gsrlimit: String(n), prop: "imageinfo", iiprop: "url", iiurlwidth: "512" });
  const j = await (await fetch(u, { headers: UA })).json();
  return Object.values(j.query?.pages || {}).map((p) => [p.title, p.imageinfo?.[0]?.thumburl]).filter((x) => x[1]);
}
const casos = [["Statue of Liberty", "Statue of Liberty"], ["Eiffel Tower Paris", "Eiffel Tower"], ["Chichen Itza El Castillo", "Chichen Itza"],
  ["Angel de la Independencia", "Angel of Independence in Mexico City"], ["Taj Mahal", "Taj Mahal"], ["Colosseum Rome exterior", "Colosseum"],
  ["Palacio de Bellas Artes Mexico", "Palacio de Bellas Artes in Mexico City"], ["Christ the Redeemer Rio", "Christ the Redeemer"],
  ["Sydney Opera House", "Sydney Opera House"], ["Golden Gate Bridge", "Golden Gate Bridge"],
  ["Statue of Liberty souvenir", "RÉPLICA"], ["Eiffel Tower souvenir miniature", "RÉPLICA"], ["souvenir figurine monument", "RÉPLICA"],
  ["New York-New York Hotel Las Vegas Statue of Liberty", "Las Vegas"], ["Statue of Liberty replica Paris Ile aux Cygnes", "réplica París"]];
const aciertos = { A: 0, B: 0 }; let total = 0;
for (const [q, esperado] of casos) {
  for (const [titulo, url] of await commons(q, 3)) {
    await new Promise((r) => setTimeout(r, 300));
    let img;
    try { const raw = await T.RawImage.fromBlob(await (await fetch(url, { headers: UA })).blob()); img = (await vision(await proc(raw))).image_embeds.data; }
    catch (e) { console.log("ERR", titulo, e.message); continue; }
    const linea = [];
    for (const k of Object.keys(V)) {
      const r = clasificar(img, V[k], lista, vRep, vReal);
      linea.push(`${k}: ${r.candidatos.slice(0, 3).map((c) => `${c.m[0]} ${(c.p * 100).toFixed(0)}%`).join(" | ")} · réplica ${(r.replica * 100).toFixed(0)}%`);
      if (r.candidatos[0].m[0] === esperado) aciertos[k]++;
    }
    if (!/RÉPLICA|Vegas|París/i.test(esperado)) total++;
    console.log(`\n[${esperado}] ${titulo}\n  ${linea.join("\n  ")}`);
  }
}
console.log("\nACIERTOS top-1 sobre", total, aciertos);
