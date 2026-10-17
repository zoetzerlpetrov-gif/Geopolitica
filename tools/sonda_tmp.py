import json, subprocess, collections
r = subprocess.run(["python3", "tools/salud/salud.py", "4"], capture_output=True, text=True, timeout=600)
print(r.stdout[-2500:], r.stderr[-1500:])
for f in ("vivos/salud_oficial.geojson", "vivos/salud_noticias.geojson"):
    try:
        d = json.load(open(f))
    except Exception as e:
        print(f, e); continue
    fs = d["features"]
    print("==", f, len(fs), d.get("detalle"))
    print("  ", collections.Counter(x["properties"].get("enfermedad") for x in fs).most_common(15))
    for x in fs[:12]:
        p = x["properties"]; print("   ", p.get("date"), "|", p.get("enfermedad"), "|", p.get("lugar") or p.get("state"), "|", (p.get("title") or "")[:110], "|", p.get("notas"))
