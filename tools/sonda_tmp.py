"""Sonda temporal 3 (se borra antes del PR)."""
import json, re, sys, urllib.request, urllib.parse
sys.path.insert(0, "ingest")
import fuentes as F
def get(url, h=None, t=40):
    r = urllib.request.Request(url, headers={"User-Agent": F.UA, **(h or {})})
    with urllib.request.urlopen(r, timeout=t) as x:
        return x.status, x.headers.get("content-type"), x.read()
def prueba(nombre, url, h=None, n=800):
    print(f"\n===== {nombre}\n{url}")
    try:
        print("robots:", F.permitido_por_robots(url))
        st, ct, b = get(url, h)
        print("status", st, ct, "bytes", len(b)); print(b[:n].decode("utf-8", "replace")); return b
    except Exception as e:
        print("ERROR", type(e).__name__, str(e)[:300])
NHC = "https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather_summary/MapServer"
for c in (2, 3, 33):
    st, ct, b = get(f"{NHC}/{c}?f=json")
    d = json.loads(b); print(c, d.get("name"), d.get("geometryType"), [(f["name"], f.get("alias")) for f in d.get("fields", [])])
b = prueba("NGA piracy page", "https://msi.nga.mil/Piracy", n=300)
if b:
    print(set(re.findall(rb"(?:api|assets)/[A-Za-z0-9_./?=&-]{3,80}", b)))
for u in ["https://msi.nga.mil/api/publications/asam?sort=date&output=json&maxOccurDate=2026-10-14",
          "https://msi.nga.mil/api/publications/asam/?output=json",
          "https://msi.nga.mil/api/publications/asams?output=json",
          "https://msi.nga.mil/api/publications/world-wide-navigational-warnings?output=json",
          "https://msi.nga.mil/api/publications/broadcast-warn?output=json&status=A"]:
    prueba("NGA", u, {"Accept": "application/json"}, n=400)
prueba("UKMTO robots", "https://www.ukmto.org/robots.txt", n=600)
prueba("UKMTO incidents", "https://www.ukmto.org/recent-incidents", n=300)
prueba("ICC IMB robots", "https://icc-ccs.org/robots.txt", n=600)
prueba("ReCAAP robots", "https://www.recaap.org/robots.txt", n=400)
prueba("MSCHOA? GDACS", "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC&alertlevel=Green;Orange;Red&fromdate=2026-10-07", n=400)
