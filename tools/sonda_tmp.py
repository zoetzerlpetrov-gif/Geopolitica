"""Sonda temporal: estructura de fuentes del bloque 2 (se borra antes del PR)."""
import json, sys, urllib.request, urllib.parse
sys.path.insert(0, "ingest")
import fuentes as F
UA = F.UA
def get(url, h=None, t=40):
    r = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json", **(h or {})})
    with urllib.request.urlopen(r, timeout=t) as x:
        return x.status, x.read()
def prueba(nombre, url, h=None, n=1500):
    print(f"\n===== {nombre}\n{url}")
    try:
        print("robots:", F.permitido_por_robots(url))
    except Exception as e:
        print("robots err", e)
    try:
        st, b = get(url, h)
        print("status", st, "bytes", len(b))
        print(b[:n].decode("utf-8", "replace"))
        return b
    except Exception as e:
        print("ERROR", type(e).__name__, str(e)[:300])
for s in ("7700", "7600", "7500"):
    prueba(f"adsb.lol sqk {s}", f"https://api.adsb.lol/v2/sqk/{s}", n=900)
b = prueba("NGA ASAM", "https://msi.nga.mil/api/publications/asam?sort=date&output=json", n=1200)
if b:
    try:
        d = json.loads(b); k = list(d.keys()); print("keys", k); a = d.get("asam") or d.get(k[0]); print(len(a)); print(json.dumps(a[:2], indent=1)[:1500])
    except Exception as e: print("json", e)
for base in ("https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather_summary/MapServer",
             "https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer"):
    b = prueba("NHC capas", base + "?f=json", n=200)
    if b:
        d = json.loads(b)
        for l in d.get("layers", [])[:80]:
            print(l.get("id"), l.get("name"), l.get("parentLayerId"))
prueba("NHC TWO xml", "https://www.nhc.noaa.gov/xml/TWOAT.xml", n=1500)
prueba("NHC gtwo shp page", "https://www.nhc.noaa.gov/gis/", n=10)
prueba("Digitraffic trenes", "https://rata.digitraffic.fi/api/v1/train-locations.geojson/latest/", {"Digitraffic-User": "Geopolitica-monitor"}, n=800)
prueba("NE railroads", "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_railroads.geojson", n=600)
prueba("JTWC abpw", "https://www.metoc.navy.mil/jtwc/products/abpwweb.txt", n=1500)
prueba("JTWC rss", "https://www.metoc.navy.mil/jtwc/rss/jtwc.rss", n=1500)
