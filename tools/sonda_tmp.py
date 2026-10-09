import base64, gzip, json, subprocess, sys
r = subprocess.run([sys.executable, "tools/red/red.py"], capture_output=True, text=True, timeout=900)
print(r.stdout[-3000:], r.stderr[-3000:])
for n in ["red_cortes", "red_c2", "red_ics"]:
    b = open(f"vivos/{n}.geojson", "rb").read()
    print(f"@@{n}@@" + base64.b64encode(gzip.compress(b)).decode() + "@@fin@@")
d = json.load(open("vivos/red_ics.geojson"))
for f in d["features"][:5]: print(f["properties"]["pais"], f["properties"]["n"], f["properties"]["fabricantes"][:4], f["properties"]["avisos"][0]["fecha"])
