import json, sys, time
sys.path.insert(0, "tools/historia")
import cronologia as C
t0 = time.time()
C.main("/tmp/hist")
print(f"total {time.time()-t0:.0f} s")
for iso in ("MEX", "USA", "FRA", "COL"):
    d = json.load(open(f"/tmp/hist/{iso}.json"))
    print("=====", iso, {k: len(v) for k, v in d.items() if isinstance(v, list)})
    for k in ("conflictos", "tratados", "organismos"):
        print(" --", k, [x[1] + " " + (x[2] or "")[:5] + f" n={x[-1]}" for x in d.get(k, [])[:12]])
    print(" -- hechos guerra", [h[1] for h in d["hechos"] if h[4] in ("guerra", "revolución", "guerra civil")][:15])
import os
print("tamaño medio KB", sum(os.path.getsize("/tmp/hist/" + f) for f in os.listdir("/tmp/hist")) / len(os.listdir("/tmp/hist")) / 1024)
