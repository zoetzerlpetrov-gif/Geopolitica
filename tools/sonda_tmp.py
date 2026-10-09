import json, subprocess, sys
r = subprocess.run([sys.executable, "tools/espacio/lanzamientos.py"], capture_output=True, text=True, timeout=120); print(r.stdout, r.stderr[-1500:])
d = json.load(open("vivos/lanzamientos.geojson"))
for f in d["features"][:6]: print(json.dumps(f["properties"], ensure_ascii=False)[:400])
sys.path.insert(0, "tools/capas")
import gobiernos as G, construir as C
d = G.leer_instituciones(C._sparql(G.Q_INSTITUCIONES))
print("instituciones", len(d), sum(1 for v in d.values() if v.get("ejecutivo", [0, 0, ""])[2]), "con sitio")
for k in ["MEX", "USA", "ESP", "BRA", "DEU", "JPN", "IND"]: print(k, d.get(k))
