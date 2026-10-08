// Resume los reportes JSON de Lighthouse en una tabla Markdown.
// Uso: node resumen_lighthouse.mjs resultados/lh-*.json
import { readFileSync, appendFileSync } from "node:fs";
const filas = process.argv.slice(2).map((f) => {
  const r = JSON.parse(readFileSync(f, "utf8"));
  const a = r.audits;
  const ms = (id) => Math.round(a[id]?.numericValue ?? NaN);
  return `| ${f.replace(/^.*lh-|\.json$/g, "")} | ${Math.round(r.categories.performance.score * 100)} | ${ms("first-contentful-paint")} | ${ms("largest-contentful-paint")} | ${ms("total-blocking-time")} | ${(a["cumulative-layout-shift"].numericValue).toFixed(3)} | ${ms("speed-index")} | ${ms("interactive")} | ${Math.round(a["total-byte-weight"].numericValue / 1024)} | ${ms("bootup-time")} |`;
});
const md = ["", "### Lighthouse (laboratorio)", "", "| Corrida | Puntaje | FCP ms | LCP ms | TBT ms | CLS | Speed Index ms | TTI ms | Peso total KB | Tiempo de ejecución JS ms |", "|---|---|---|---|---|---|---|---|---|---|", ...filas].join("\n");
console.log(md);
appendFileSync("resultados/medicion.md", md + "\n");
