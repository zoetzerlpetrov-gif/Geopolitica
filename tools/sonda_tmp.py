import json, subprocess
r = subprocess.run(["python3", "tools/creadores/creadores.py"], capture_output=True, text=True, timeout=500)
print(r.stdout, r.stderr[-1500:])
d = json.load(open("vivos/creadores.geojson"))
for f in d["features"][:6]:
    p = f["properties"]
    print(p["pais"], p["n"], json.dumps(p["creadores"][:2], ensure_ascii=False)[:600])
