"""Sonda temporal: formato de MET Norway (complete) y decodificación de GFS-Wave de NOAA."""
import json, time, urllib.request, urllib.error, urllib.parse, subprocess, sys, datetime
UA = "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"
def get(u, t=120):
    with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=t) as r:
        return r.read(), dict(r.headers)
for nombre, lat, lon in (("Veracruz", 19.2, -96.13), ("Madrid", 40.42, -3.70)):
    b, h = get(f"https://api.met.no/weatherapi/locationforecast/2.0/complete?lat={lat}&lon={lon}")
    d = json.loads(b); ts = d["properties"]["timeseries"]
    print(nombre, "pasos", len(ts), ts[0]["time"], ts[-1]["time"], "Expires", h.get("Expires"), "Last-Modified", h.get("Last-Modified"))
    print(" instant keys", sorted(ts[0]["data"]["instant"]["details"]))
    print(" next_1", json.dumps(ts[0]["data"].get("next_1_hours"))[:300])
    print(" next_6", json.dumps(ts[0]["data"].get("next_6_hours"))[:400])
    print(" next_12", json.dumps(ts[0]["data"].get("next_12_hours"))[:300])
    con_racha = sum(1 for x in ts if "wind_speed_of_gust" in x["data"]["instant"]["details"])
    horarios = sum(1 for x in ts if "next_1_hours" in x["data"])
    print(" con racha", con_racha, "horarios", horarios, "ultimo con racha", next((x["time"] for x in reversed(ts) if "wind_speed_of_gust" in x["data"]["instant"]["details"]), None))
    print(" paso 80", json.dumps(ts[min(80, len(ts)-1)]["data"])[:500])
    time.sleep(1)
# GFS-Wave
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "eccodes"], check=False)
hoy = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=7)
d, ciclo = hoy.strftime("%Y%m%d"), f"{hoy.hour // 6 * 6:02d}"
u = (f"https://nomads.ncep.noaa.gov/cgi-bin/filter_gfswave.pl?dir=%2Fgfs.{d}%2F{ciclo}%2Fwave%2Fgridded&file=gfswave.t{ciclo}z.global.0p25.f024.grib2"
     "&var_SWELL=on&var_SWPER=on&var_SWDIR=on&lev_1_in_sequence=on")
t0 = time.time()
try:
    b, h = get(u, 180)
    print("gfswave bytes", len(b), "seg", round(time.time() - t0, 1))
    open("/tmp/w.grib2", "wb").write(b)
    import eccodes
    with open("/tmp/w.grib2", "rb") as f:
        while True:
            g = eccodes.codes_grib_new_from_file(f)
            if g is None: break
            sn = eccodes.codes_get(g, "shortName"); nm = eccodes.codes_get(g, "name"); lv = eccodes.codes_get(g, "level")
            ni, nj = eccodes.codes_get(g, "Ni"), eccodes.codes_get(g, "Nj")
            vals = eccodes.codes_get_values(g)
            near = eccodes.codes_grib_find_nearest(g, 16.75, -99.90)[0]
            print(" ", sn, nm, "nivel", lv, ni, nj, "Acapulco", near["value"], near["lat"], near["lon"], "valid", eccodes.codes_get(g, "validityDate"), eccodes.codes_get(g, "validityTime"))
            eccodes.codes_release(g)
except Exception as e:
    print("gfswave error", type(e).__name__, e)
# OPeNDAP
try:
    b, h = get(f"https://nomads.ncep.noaa.gov/dods/wave/gfswave/{d}/gfswave.global.0p25_{ciclo}z.info", 60)
    print("dods", len(b), b[:200])
except Exception as e:
    print("dods error", e)
# cables OSM: cuántos
q = '[out:json][timeout:120];way["submarine"="yes"]["communication"="line"];out count;'
b, h = get("https://overpass-api.de/api/interpreter?data=" + urllib.parse.quote(q), 180)
print("cables OSM", json.loads(b)["elements"][0]["tags"])
q2 = '[out:json][timeout:120];(way["submarine"="yes"]["communication"="line"];way["seamark:type"="cable_submarine"];);out count;'
b, h = get("https://overpass-api.de/api/interpreter?data=" + urllib.parse.quote(q2), 180)
print("cables OSM + seamark", json.loads(b)["elements"][0]["tags"])
