// Verifica las metas de rendimiento sobre la medición de la rama. Sale con código 1 si alguna falla.
// Uso: node metas.mjs resultados/rama.json resultados/lh-rama-movil.json
import { readFileSync, appendFileSync } from "node:fs";

const [archivo, lhMovil] = process.argv.slice(2);
const r = JSON.parse(readFileSync(archivo, "utf8"));
const movil = r.find((x) => x.escenario === "movil-4g" && !x.carga);
const lh = lhMovil ? JSON.parse(readFileSync(lhMovil, "utf8")) : null;

const kbSinMosaicos = Object.entries(movil.bytes_por_categoria)
  .filter(([k]) => k !== "mosaicos base")
  .reduce((s, [, v]) => s + v.kb, 0);

// [descripción, valor, meta, cumple, obligatoria]
const metas = [
  ["Mapa usable en móvil 4G (ms)", movil.mapa_usable_ms, "< 3000", movil.mapa_usable_ms != null && movil.mapa_usable_ms < 3000, true],
  ["Interacción con filtros, peor caso de todos los escenarios (ms)", Math.max(...r.map((x) => x.interaccion_max_ms)), "< 200", r.every((x) => x.interaccion_max_ms < 200), true],
  ["Carga inicial sin mosaicos base, móvil (KB)", kbSinMosaicos, "< 1536", kbSinMosaicos < 1536, true],
  ["Long task máxima al navegar, sin carga sintética (ms)", Math.max(...r.filter((x) => !x.carga).map((x) => x.long_task_max_nav_ms)), "< 200", r.filter((x) => !x.carga).every((x) => x.long_task_max_nav_ms < 200), false],
  ["JS heap tras la espera, peor caso (MB)", Math.max(...r.map((x) => x.heap_mb_2min)), "< 350", r.every((x) => x.heap_mb_2min < 350), true],
  ["FPS en paneo, escritorio sin carga", r.find((x) => x.escenario === "escritorio" && !x.carga).fps_paneo, "≥ 50", r.find((x) => x.escenario === "escritorio" && !x.carga).fps_paneo >= 50, false],
];
if (lh) metas.push(["Lighthouse móvil: CLS", lh.audits["cumulative-layout-shift"].numericValue.toFixed(3), "< 0.1", lh.audits["cumulative-layout-shift"].numericValue < 0.1, true]);

const md = ["", "### Metas de rendimiento (rama)", "", "| Meta | Valor | Objetivo | Resultado |", "|---|---|---|---|",
  ...metas.map(([d, v, m, ok, obl]) => `| ${d} | ${v} | ${m} | ${ok ? "✅ cumple" : obl ? "❌ NO cumple" : "⚠️ informativa (no bloquea)"} |`),
  "", "Las metas informativas no bloquean porque el runner de GitHub no tiene GPU: dibuja con SwiftShader (CPU) y sus FPS y tareas de dibujo no representan un equipo real.",
].join("\n");
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
const fallas = metas.filter(([, , , ok, obl]) => obl && !ok);
if (fallas.length) { console.error(`\n${fallas.length} meta(s) obligatoria(s) sin cumplir.`); process.exit(1); }
