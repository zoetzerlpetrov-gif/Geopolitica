import json, subprocess, sys
from collections import Counter
for s in ["tools/clima/meteoalarm.py", "tools/clima/nhc_conos.py"]:
    r = subprocess.run([sys.executable, s], capture_output=True, text=True, timeout=600)
    print(s, r.stdout[-2500:], r.stderr[-2500:])
d = json.load(open("vivos/meteoalarm.geojson"))
print({k: v for k, v in d.items() if k != "features"})
pts = [f["properties"] for f in d["features"] if f["properties"]["k"] == "region"]
print(Counter(p["pais_iso2"] for p in pts), Counter(p["nivel"] for p in pts), Counter(t for p in pts for t in p["tipos"]))
for p in pts[:4]: print(json.dumps(p, ensure_ascii=False)[:500])
d = json.load(open("vivos/nhc_conos.geojson"))
print({k: v for k, v in d.items() if k != "features"})
for f in d["features"][:6]: print(f["geometry"]["type"], json.dumps(f["properties"], ensure_ascii=False)[:400])
import urllib.request
r = urllib.request.urlopen("https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer/87/query?where=1%3D1&outFields=*&returnGeometry=false&f=json", timeout=60).read()
print(r[:1500])
