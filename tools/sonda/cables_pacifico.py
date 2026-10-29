import gzip, json, os, sys, urllib.request, urllib.parse
sys.path.insert(0, "tools/capas")
import construir as C
UA = C.UA
# 1) Lo que publicamos: archivo crudo de la familia en la rama datos-capas.
ruta = C.ruta_crudo("cables_osm")
print("crudo:", ruta, os.path.exists(ruta))
if os.path.exists(ruta):
    fs = [json.loads(x) for x in gzip.open(ruta, "rt") if x.strip()]
    def lons(f):
        c = f["geometry"]["coordinates"]; return [p[0] for p in c]
    pac = [f for f in fs if any(l > 150 or l < -120 for l in lons(f))]
    largos = sorted(fs, key=lambda f: -len(f["geometry"]["coordinates"]))[:5]
    print("total", len(fs), "con puntos en el Pacífico", len(pac))
    for f in pac[:25]: print("  ", f["properties"]["n"][:60], len(f["geometry"]["coordinates"]), min(lons(f)), max(lons(f)))
    cruza = [f for f in fs if max(lons(f)) - min(lons(f)) > 180]
    print("cruzan el antimeridiano:", len(cruza))
# 2) Overpass directo en cajas del Pacífico.
for caja in [(-60, 150, 60, 180), (-60, -180, 60, -120), (0, 120, 50, 150)]:
    s, w, n, e = caja
    q = ("[out:json][timeout:120];(" + "".join(f"{sel}({s},{w},{n},{e});" for sel in C.CABLES_OSM) + ");out tags;")
    try:
        req = urllib.request.Request(C.OVERPASS[0], data=urllib.parse.urlencode({"data": q}).encode(), headers={"User-Agent": UA})
        els = json.loads(urllib.request.urlopen(req, timeout=180).read())["elements"]
        nombres = sorted({e.get("tags", {}).get("name", "(sin nombre)") for e in els})
        print("caja", caja, len(els), "ways;", len(nombres), "nombres:", nombres[:40])
    except Exception as ex:
        print("caja", caja, "ERR", ex)
