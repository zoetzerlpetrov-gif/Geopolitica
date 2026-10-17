import json, subprocess
r = subprocess.run(["python3", "tools/humanitario/acnur.py"], capture_output=True, text=True, timeout=500)
print(r.stdout, r.stderr[-1500:])
for n in ("origen", "acogida"):
    d = json.load(open(f"vivos/desplazamiento_{n}.geojson"))
    print(n, d["anio"], [(f["properties"]["pais"], f["properties"]["total"]) for f in d["features"][:10]])
    print(json.dumps([f for f in d["features"] if f["properties"]["iso3"] in ("MEX", "VEN")], ensure_ascii=False)[:600])
