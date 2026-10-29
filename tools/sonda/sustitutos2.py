"""Sonda temporal: nortes (GFS) y mar de fondo (GFS-Wave) con datos reales, como en el workflow."""
import json, os, sys, time
from datetime import datetime, timezone
sys.path.insert(0, "tools/clima")
import frentes as Fr, mar_fondo as M
for f in ("vivos/nortes.geojson", "vivos/mar_fondo.geojson"):
    if os.path.exists(f): os.remove(f)
t0 = time.time(); print(Fr.actualizar_nortes(datetime.now(timezone.utc)), round(time.time() - t0), "s")
d = json.load(open("vivos/nortes.geojson"))
print("nortes", d["fuente"], d["corrida"], d["pasos"], len(d["features"]))
for f in d["features"][:19]:
    p = f["properties"]; print("  ", p["name"], p["nivel"], p["rafaga_max_kmh"], p["horas"], p["inicio"], p["fin"])
t0 = time.time(); M.main(); print("mar_fondo", round(time.time() - t0), "s")
d = json.load(open("vivos/mar_fondo.geojson"))
print("mar", d["fuente"], d["corrida"], d["pasos"], len(d["features"]), "de", len(M.PUNTOS))
faltan = sorted(set(n for n, _, _ in M.PUNTOS) - {f["properties"]["name"] for f in d["features"]}); print(" sin dato:", faltan)
for f in d["features"][:40]:
    p = f["properties"]; print("  ", p["name"], p["nivel"], p["altura_max_m"], p["periodo_en_max_s"], p["hora_max"], p["horas_evento"])
