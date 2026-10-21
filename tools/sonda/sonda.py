"""Sonda temporal del Lote E (4): dof.py y leyes.py completos."""
import json, os, re, subprocess, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F
t = F.get("https://dof.gob.mx/index.php?year=2026&month=10&day=20", timeout=40).decode("latin-1", "replace")
i = t.find("nota_detalle")
print(repr(t[i - 1500:i + 1200]))
for s in ["tools/investigacion/dof.py", "tools/investigacion/leyes.py"]:
    subprocess.run([sys.executable, os.path.join(ROOT, s)])
r = json.load(open(os.path.join(ROOT, "vivos/dof_resumen.json")))
print("meses:", {k: sum(v.values()) for k, v in r["por_mes"].items()})
print("tipos del último mes:", list(r["por_mes"].items())[-1])
for x in r["leyes"][:12]: print("  LEY", x["f"], x["t"], "|", x["d"][:40], "|", x["x"][:140])
for x in r["recientes"][:15]: print("  REC", x["f"], x["t"], "|", x["d"][:40], "|", x["x"][:100])
l = json.load(open(os.path.join(ROOT, "vivos/leyes_federales.json")))
print(len(l["leyes"]), l["por_anio"])
for x in l["leyes"][:8]: print("  ", x)
