"""Sonda temporal: pronóstico de 7 días con MET Norway + ráfagas de GFS, como en el workflow."""
import json, os, sys, time, importlib.util, tempfile
d = tempfile.mkdtemp(); os.environ["CLIMA_TACTICO_DIR"] = d
spec = importlib.util.spec_from_file_location("fd", "tools/clima_tactico/fetch_data.py"); FD = importlib.util.module_from_spec(spec); spec.loader.exec_module(FD)
t0 = time.time(); FD.fetch_forecast(); print("segundos", round(time.time() - t0))
fc = json.load(open(os.path.join(d, "forecast.geojson")))
print("meta", fc["metadata"], "puntos", len(fc["features"]), "de", len(FD.GRID))
import collections
print("niveles", collections.Counter(f["properties"]["level"] for f in fc["features"]))
sin_raf = sum(1 for f in fc["features"] if not f["properties"]["max_gust_kmh"]); print("sin ráfaga", sin_raf)
for f in fc["features"][:6] + [x for x in fc["features"] if x["properties"]["name"] in ("Madrid", "Tokio", "Merida")]:
    p = f["properties"]; print(" ", p["name"], p["level_label"], p["max_rain_mm"], p["max_gust_kmh"], p["min_tmin_c"], p["max_tmax_c"], [(x["date"], x["code"], x["rain"], x["gust"]) for x in p["days"][:3]])
