import subprocess, sys, time, urllib.request
for u in ["http://data.gdeltproject.org/robots.txt", "https://www.gdeltproject.org/robots.txt"]:
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Geopolitica-monitor/1.0"}), timeout=30) as r: print("ROBOTS", u, r.status, r.read(500))
    except Exception as e: print("ROBOTS", u, e)
t = time.time()
subprocess.run([sys.executable, "-u", "tools/clima/tornados.py", "96"], check=False)
print("segundos", round(time.time() - t))
import json
d = json.load(open("vivos/tornados.geojson"))
print("errores", d["errores"])
for f in d["features"]:
    p = f["properties"]; print("T", p["date"], p["kind"], p["severe"], p["state"], f["geometry"]["coordinates"], p["source"], "|", p["title"][:120])
