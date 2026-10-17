import json, os, subprocess, glob
print(subprocess.run(["python3", "tools/maritimo/gfw.py"], capture_output=True, text=True, timeout=900).stdout[-3000:])
for f in sorted(glob.glob("vivos/gfw_*")):
    d = json.load(open(f))
    print("==", f, os.path.getsize(f), "bytes")
    if "features" in d:
        fs = d["features"]; print("  n", len(fs))
        con = [x for x in fs if x["properties"].get("alerta") or x["properties"].get("con_alerta")]
        print("  con alerta", len(con))
        for x in (con[:2] or fs[:1]):
            print("  ", json.dumps(x["properties"], ensure_ascii=False)[:1500])
    else:
        b = d["barcos"]; print("  barcos", len(b))
        for k, v in list(b.items())[:2]: print("  ", k, json.dumps(v, ensure_ascii=False)[:900])
        print("  con dueños", sum(1 for v in b.values() if v.get("duenos")), "| iuu", sum(1 for v in b.values() if v.get("iuu_veces") or v.get("iuu_registro")))
