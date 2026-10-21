"""Sonda temporal (se borra antes del PR): corre noticiero.py e indicadores.py completos."""
import json, os, subprocess, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
subprocess.run([sys.executable, os.path.join(ROOT, "tools/noticiero/indicadores.py")])
subprocess.run([sys.executable, os.path.join(ROOT, "tools/noticiero/noticiero.py")])
d = json.load(open(os.path.join(ROOT, "vivos/noticiero.json")))
print(len(d["notas"]), "notas", os.path.getsize(os.path.join(ROOT, "vivos/noticiero.json")), "bytes")
for s in d["secciones"]:
    ns = [n for n in d["notas"] if s["id"] in n["s"]]
    g = [n for n in ns if n["via"] == "gdelt"]
    print(f"## {s['id']} {len(ns)} (gdelt {len(g)})")
    for n in g[:6]:
        print("    ", n["m"], "|", n["t"][:110])
