// Sonda temporal: compara frases de CLIP con fotos de Wikimedia Commons y baja 2 fotos para la prueba en navegador.
import { readFileSync, writeFileSync } from "node:fs";
import * as T from "@huggingface/transformers";
import * as R from "../js/reconocer.js";

const UA = { "User-Agent": "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)" };
for (const u of [R.TRANSFORMERS + "/+esm"]) { const t = await (await fetch(u, { headers: UA })).text(); console.log("CDN +esm export{:", t.includes("export{"), "import.meta:", t.includes("import.meta")); }
const lista = JSON.parse(readFileSync("config/monumentos.json", "utf8")).monumentos;
const proc = await T.AutoProcessor.from_pretrained(R.MODELO);
const vision = await T.CLIPVisionModelWithProjection.from_pretrained(R.MODELO, { dtype: "q8" });
const tok = await T.AutoTokenizer.from_pretrained(R.MODELO);
const texto = await T.CLIPTextModelWithProjection.from_pretrained(R.MODELO, { dtype: "q8" });
async function vecs(frases) {
  const out = [];
  for (let i = 0; i < frases.length; i += 64) {
    const e = (await texto(tok(frases.slice(i, i + 64), { padding: true, truncation: true }))).text_embeds;
    const [n, d] = e.dims;
    for (let k = 0; k < n; k++) out.push(R.norma(Array.from(e.data.slice(k * d, (k + 1) * d))));
  }
  return out;
}
const E = R.agrupar(await vecs(R.frasesDe(lista)), lista.length);
const A = await vecs(lista.map((m) => `a photo of the ${m[0]}`));
const viejoRep = await vecs(R.FRASES_REPLICA.slice(0, 3)), viejoReal = await vecs(R.FRASES_REAL.slice(0, 2));

async function commons(q, n = 3) {
  const u = "https://commons.wikimedia.org/w/api.php?" + new URLSearchParams({ action: "query", format: "json", generator: "search", gsrsearch: `${q} filetype:bitmap`,
    gsrnamespace: "6", gsrlimit: String(n), prop: "imageinfo", iiprop: "url", iiurlwidth: "512" });
  const j = await (await fetch(u, { headers: UA })).json();
  return Object.values(j.query?.pages || {}).map((p) => [p.title, p.imageinfo?.[0]?.thumburl]).filter((x) => x[1]);
}
const casos = [["Statue of Liberty", "Statue of Liberty"], ["Eiffel Tower Paris", "Eiffel Tower"], ["Chichen Itza El Castillo", "Chichen Itza"],
  ["Angel de la Independencia", "Angel of Independence in Mexico City"], ["Taj Mahal", "Taj Mahal"], ["Colosseum Rome exterior", "Colosseum"],
  ["Palacio de Bellas Artes Mexico", "Palacio de Bellas Artes in Mexico City"], ["Christ the Redeemer Rio", "Christ the Redeemer"],
  ["Sydney Opera House", "Sydney Opera House"], ["Golden Gate Bridge", "Golden Gate Bridge"], ["Big Ben London", "Big Ben"],
  ["Teotihuacan Pyramid of the Sun", "Pyramid of the Sun"], ["Machu Picchu", "Machu Picchu"], ["Sagrada Familia", "Sagrada Família"],
  ["Statue of Liberty souvenir", "RÉPLICA"], ["Eiffel Tower souvenir miniature", "RÉPLICA"], ["souvenir figurine monument", "RÉPLICA"], ["miniature Eiffel Tower model", "RÉPLICA"]];
const ac = { A: 0, E: 0 }; let total = 0; const rep = { viejo: [], nuevo: [] };
for (const [q, esperado] of (process.argv.includes("--solo-fotos") ? [] : casos)) {
  for (const [titulo, url] of await commons(q, 3)) {
    await new Promise((r) => setTimeout(r, 300));
    let img;
    try { img = (await vision(await proc(await T.RawImage.fromBlob(await (await fetch(url, { headers: UA })).blob())))).image_embeds.data; }
    catch (e) { console.log("ERR", titulo, e.message); continue; }
    const a = R.clasificar(img, A, lista, viejoRep, viejoReal), e = R.clasificar(img, E.lugares, lista, E.replica, E.real);
    const esRep = esperado === "RÉPLICA";
    if (!esRep) { total++; if (a.candidatos[0].m[0] === esperado) ac.A++; if (e.candidatos[0].m[0] === esperado) ac.E++; }
    rep.viejo.push([esRep, a.replica]); rep.nuevo.push([esRep, e.replica]);
    const f = (r) => r.candidatos.slice(0, 2).map((c) => `${c.m[0]} ${(c.p * 100).toFixed(0)}%`).join(" | ") + ` · rép ${(r.replica * 100).toFixed(0)}%`;
    console.log(`[${esperado}] ${titulo.slice(5, 60)}\n  A ${f(a)}\n  E ${f(e)}`);
  }
}
console.log("\nACIERTOS top-1 sobre", total, ac);
for (const k of (total ? ["viejo", "nuevo"] : [])) {
  const r = rep[k], real = r.filter((x) => !x[0]).map((x) => x[1]).sort((a, b) => a - b), sv = r.filter((x) => x[0]).map((x) => x[1]).sort((a, b) => a - b);
  console.log(`réplica ${k}: reales máx ${(real.at(-1) * 100).toFixed(0)} p90 ${(real[Math.floor(real.length * 0.9)] * 100).toFixed(0)} · souvenirs ${sv.map((x) => (x * 100).toFixed(0)).join(",")}`);
}
// Fotos para la prueba en navegador
const [[, u1]] = await commons("Statue of Liberty, NY", 1), [[, u2]] = await commons("Statue of Liberty souvenir", 1);
writeFileSync("/tmp/real.jpg", Buffer.from(await (await fetch(u1, { headers: UA })).arrayBuffer()));
writeFileSync("/tmp/souvenir.jpg", Buffer.from(await (await fetch(u2, { headers: UA })).arrayBuffer()));

