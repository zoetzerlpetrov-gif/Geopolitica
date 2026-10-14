"""Sonda temporal: recolector de trenes completo (se borra antes del PR)."""
import collections, json, os, subprocess, sys
os.makedirs("vivos", exist_ok=True)
print(subprocess.run([sys.executable, "tools/transporte/trenes.py"], capture_output=True, text=True, timeout=300).stdout[-2000:])
d = json.load(open("vivos/trenes.geojson"))
print(collections.Counter(f["properties"]["red"] for f in d["features"]))
for red in ("finlandia", "noruega", "irlanda", "boston", "filadelfia"):
    for f in [f for f in d["features"] if f["properties"]["red"] == red][:2]:
        print(json.dumps(f, ensure_ascii=False)[:600])
