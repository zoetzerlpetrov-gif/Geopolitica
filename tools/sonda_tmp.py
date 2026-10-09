import json, subprocess, sys, time
from collections import Counter
r = subprocess.run([sys.executable, "tools/clima/meteoalarm.py"], capture_output=True, text=True, timeout=600)
print(r.stdout[-3000:], r.stderr[-2000:])
d = json.load(open("vivos/meteoalarm.geojson"))
pts = [f["properties"] for f in d["features"] if f["properties"]["k"] == "region"]
print("sin_region", d["sin_region"], Counter(p["pais_iso2"] for p in pts), Counter(f["properties"]["codigo"][:0] or ("emma" if f["properties"]["codigo"] else "otro") for f in d["features"] if f["properties"]["k"] == "region"))
import os; print("tamaño KB", os.path.getsize("vivos/meteoalarm.geojson") // 1024)
sys.path.insert(0, "tools/capas"); import gobiernos as G, urllib.request, urllib.parse
isos = ["MEX", "USA", "ESP", "FRA", "DEU", "BRA", "ARG", "COL", "CHN", "IND", "JPN", "GBR", "ITA", "CAN", "RUS", "ZAF", "NGA", "EGY", "TUR", "IRN"]
q = G.Q_GABINETE % " ".join(f'"{x}"' for x in isos)
t = time.time()
req = urllib.request.Request("https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": q, "format": "json"}), headers={"User-Agent": "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)", "Accept": "application/sparql-results+json"})
res = json.load(urllib.request.urlopen(req, timeout=120))
g = G.leer_gabinete(res)
print("gabinete", round(time.time() - t, 1), "s", {k: len(v) for k, v in g.items()})
for iso in ["MEX", "USA", "ESP", "DEU", "BRA"]:
    print(iso, [(m["cargo"], m["nombre"], m["desde"]) for m in g.get(iso, [])][:30])
