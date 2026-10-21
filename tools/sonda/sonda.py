"""Sonda temporal (se borra antes del PR): crimen.py con la capa de carreteras y zonas_eventos.py."""
import json, os, subprocess, sys, time
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
t = time.time()
subprocess.run([sys.executable, os.path.join(ROOT, "tools/crimen/crimen.py")])
print(f"crimen.py: {time.time() - t:.0f} s")
fc = json.load(open(os.path.join(ROOT, "vivos/vial.geojson")))
por = {}
for f in fc["features"]:
    por.setdefault(f["properties"]["st"], []).append(f["properties"])
for st, ps in por.items():
    print(f"## {st} {len(ps)}")
    for p in ps[:8]:
        print(f"    [{p['severidad']}] {p['lugar']} ({p['precision']}, {p['pais_iso3']}) | {p['source']} | {p['title'][:100]}")
t = time.time()
subprocess.run([sys.executable, os.path.join(ROOT, "tools/zonas_eventos.py")])
print(f"zonas_eventos.py: {time.time() - t:.0f} s")
z = json.load(open(os.path.join(ROOT, "vivos/zonas_eventos.geojson")))
print([(f["properties"]["nombre"], f["properties"]["iso3"], f["properties"]["n"]) for f in z["features"]][:40])
