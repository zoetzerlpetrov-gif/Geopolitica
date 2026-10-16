import json, os, time, urllib.request, urllib.parse
UA = {"User-Agent": "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"}
def get(u, h=None, n=1500, binario=False):
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers={**UA, **(h or {})}), timeout=60)
        b = r.read()
        print(f"=== {r.status} {len(b)}B {r.headers.get('Content-Type')} {u[:160]}")
        print(b[:n].decode("utf-8", "replace") if not binario else b[:60])
        return b
    except Exception as e:
        body = getattr(e, "read", lambda: b"")()[:400]
        print(f"=== ERR {u[:160]}: {e} {body}")
    time.sleep(1)
tok = os.environ.get("GFW_TOKEN", "")
print("token presente:", bool(tok), len(tok))
H = {"Authorization": f"Bearer {tok}"}
base = "https://gateway.api.globalfishingwatch.org/v3/events?"
for ds in ["public-global-gaps-events:latest", "public-global-encounters-events:latest", "public-global-loitering-events:latest"]:
    q = urllib.parse.urlencode({"datasets[0]": ds, "start-date": "2026-10-01", "end-date": "2026-10-15", "limit": 2, "offset": 0})
    get(base + q, H, 2500)
get("https://gateway.api.globalfishingwatch.org/v3/datasets", H, 600)
for u in ["http://omawww.sat.gob.mx/cifras_sat/Documents/Listado_Completo_69-B.csv",
          "https://omawww.sat.gob.mx/cifras_sat/Documents/Listado_Completo_69-B.csv",
          "http://omawww.sat.gob.mx/robots.txt"]:
    get(u, n=900)
get("https://www.fatf-gafi.org/robots.txt", n=600)
get("https://www.fatf-gafi.org/en/countries/black-and-grey-lists.html", n=300)
get("https://api.fbi.gov/wanted/v1/list?pageSize=2&page=1", n=1500)
get("https://api.fbi.gov/robots.txt", n=300)
get("https://ws-public.interpol.int/notices/v1/red?resultPerPage=2", n=1500)
get("https://ws-public.interpol.int/notices/v1/yellow?resultPerPage=2", n=800)
caps = get("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml", n=0)
if caps:
    import re
    t = caps.decode("utf-8", "replace")
    ids = re.findall(r"<ows:Identifier>([^<]+)</ows:Identifier>", t)
    print([i for i in ids if "NO2" in i.upper() or "NITROGEN" in i.upper()][:20])
    print([i for i in ids if "HLS" in i or "Landsat" in i or "WELD" in i][:20])
    print([i for i in ids if "MODIS_Terra_CorrectedReflectance" in i][:5])
get("https://versionpublicarnpdno.segob.gob.mx/robots.txt", n=300)
