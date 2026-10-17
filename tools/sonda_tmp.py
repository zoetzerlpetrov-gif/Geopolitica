import json, subprocess
r = subprocess.run(["python3", "tools/camaras/oficiales.py"], capture_output=True, text=True, timeout=500)
print(r.stdout, r.stderr[-1500:])
d = json.load(open("vivos/camaras_oficiales.geojson"))
for k in ("fi", "ca", "ny"):
    x = [f for f in d["features"] if f["properties"]["kind"] == k][:2]
    print(k, json.dumps(x, ensure_ascii=False)[:700])
