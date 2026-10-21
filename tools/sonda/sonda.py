"""Sonda temporal: construir las capas de la FAO con los archivos reales (se borra antes del PR)."""
import collections, os, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "capas"))
import construir as C
for fn in (C.cultivos_pais, C.acuicultura_pais):
    t0 = time.time(); fs = fn(); p = [f["properties"] for f in fs]
    print(f"== {fn.__name__}: {len(p)} países en {time.time()-t0:.0f} s; subtipos {collections.Counter(x['st'] for x in p)}")
    for iso in ("MEX", "USA", "CHN", "BRA", "ESP", "NOR", "CHL"):
        x = next((q for q in p if q["p"] == iso), None)
        print("  ", iso, x and x["x"][:330])
