"""Sonda temporal: ingesta completa + reportes con panorama de IA, en carpeta temporal (no publica)."""
import json, os, shutil, subprocess, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "ingest"))
os.makedirs("/tmp/x", exist_ok=True)
subprocess.run("git fetch -q --depth 1 origin datos-eventos && git archive FETCH_HEAD eventos | tar -x -C /tmp/x", shell=True)
import run as R
R.main(["--salida", "/tmp/x/eventos"])
log = json.load(open("/tmp/x/eventos/run-log.json"))
print("REPORTES:", log.get("reportes")); print("RESUMEN_IA:", log.get("resumen_ia"))
os.makedirs("sonda", exist_ok=True)
for tipo in ("mexico", "global"):
    for ruta in sorted(os.listdir(f"/tmp/x/eventos/reportes/{tipo}")):
        shutil.copy(f"/tmp/x/eventos/reportes/{tipo}/{ruta}", f"sonda/{tipo}-{ruta}")
    r = json.load(open(sorted(f"/tmp/x/eventos/reportes/{tipo}/{x}" for x in os.listdir(f"/tmp/x/eventos/reportes/{tipo}") if x.endswith(".json"))[-1]))
    print(f"\n===== {r['titulo']} {r['fecha']} · {r['cifras']}")
    print(r["panorama_reglas"])
    for s in r["secciones"]:
        print(f" - {s['nombre']}: {s['total']} (notas {s['notas']}) · " + " | ".join(e["titulo"][:60] for e in s["eventos"][:3]))
    ia = r.get("panorama_ia")
    print("IA:", json.dumps(ia, ensure_ascii=False, indent=1)[:6000] if ia else None)
# corrida 3
