"""Sonda temporal 2 (se borra antes del PR)."""
import json, sys, urllib.request, urllib.parse
sys.path.insert(0, "ingest")
import fuentes as F
def get(url, h=None, t=40):
    r = urllib.request.Request(url, headers={"User-Agent": F.UA, **(h or {})})
    with urllib.request.urlopen(r, timeout=t) as x:
        return x.status, x.headers.get("content-type"), x.read()
def prueba(nombre, url, h=None, n=1200):
    print(f"\n===== {nombre}\n{url}")
    try:
        print("robots:", F.permitido_por_robots(url))
        st, ct, b = get(url, h)
        print("status", st, ct, "bytes", len(b)); print(b[:n].decode("utf-8", "replace")); return b
    except Exception as e:
        print("ERROR", type(e).__name__, str(e)[:300])
for u in ["https://msi.nga.mil/api/publications/asam?output=json",
          "https://msi.nga.mil/api/publications/asam?minOccurDate=2026-07-01&maxOccurDate=2026-10-14&output=json",
          "https://msi.nga.mil/api/publications/asam?sort=date&output=json&minOccurDate=2026-07-01",
          "https://msi.nga.mil/api/publications/asam"]:
    b = prueba("ASAM", u, {"Accept": "application/json"}, n=800)
NHC = "https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather_summary/MapServer"
for c in (1, 2, 3, 33):
    q = urllib.parse.urlencode({"where": "1=1", "outFields": "*", "returnGeometry": "true", "f": "geojson"})
    prueba(f"NHC {c}", f"{NHC}/{c}/query?{q}", n=1500)
    prueba(f"NHC {c} info", f"{NHC}/{c}?f=json", n=100)
for u, h in [("https://rata.digitraffic.fi/api/v1/train-locations.geojson/latest/", {"Digitraffic-User": "Geopolitica-monitor", "Accept-Encoding": "gzip"}),
             ("https://rata.digitraffic.fi/api/v1/train-locations/latest/", {"Digitraffic-User": "Geopolitica-monitor", "Accept-Encoding": "gzip"}),
             ("https://rata.digitraffic.fi/api/v1/train-locations/latest/", {"Digitraffic-User": "Geopolitica-monitor"})]:
    b = prueba("digitraffic", u, h, n=300)
    if b:
        import gzip
        try: b = gzip.decompress(b)
        except Exception: pass
        print(b[:600].decode("utf-8", "replace"))
prueba("digitraffic trains", "https://rata.digitraffic.fi/api/v1/live-trains?arrived_trains=0&arriving_trains=0&departed_trains=0&departing_trains=0&include_nonstopping=false", {"Digitraffic-User": "Geopolitica-monitor"}, n=200)
