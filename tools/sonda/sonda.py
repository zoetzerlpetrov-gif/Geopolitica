"""Sonda temporal: instalaciones militares desde Wikidata (se borra antes del PR)."""
import collections, sys, time
sys.path.insert(0, "tools/capas")
import construir as C
t = time.time()
r = C.militar_wikidata()
print(f"{len(r)} instalaciones en {time.time() - t:.0f} s")
print(collections.Counter(x["st"] for x in r.values()))
print(collections.Counter(x["p"] for x in r.values()).most_common(25))
for p in ("MEX", "USA", "RUS", "CHN", "DEU"):
    print(p, [x["n"] for x in r.values() if x["p"] == p][:8])
