"""Sonda temporal: empresas, SO2 y radiación (se borra antes del PR)."""
import collections, json, re, sys, time, urllib.request
sys.path.insert(0, "tools/capas"); sys.path.insert(0, "ingest")
import construir as C
import fuentes as F
def get(url, t=60):
    r = urllib.request.Request(url, headers={"User-Agent": F.UA})
    with urllib.request.urlopen(r, timeout=t) as x:
        return x.status, x.headers.get("content-type"), x.read()
t = time.time()
e = C.empresas()
print("empresas", len(e), round(time.time() - t), "s", collections.Counter(f["properties"]["st"] for f in e).most_common())
for st in ("emp_energia", "emp_alimentos", "emp_hospitalidad", "emp_automotriz", "emp_otros"):
    print(st, [(f["properties"]["n"], f["properties"]["x"][:70]) for f in e if f["properties"]["st"] == st][:8])
print("MEX", [f["properties"]["n"] for f in e if f["properties"]["p"] == "MEX"][:40])
try:
    st, ct, b = get("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml", 120)
    capas = re.findall(rb"<ows:Identifier>([^<]*(?:SO2|Sulfur|Aerosol|AOD|Dust|Ash)[^<]*)</ows:Identifier>", b, re.I)
    print("GIBS", len(b), sorted(set(x.decode() for x in capas))[:80])
    for nombre in ["OMPS_SO2_Lower_Troposphere", "OMPS_NPP_SO2_PBL"]:
        i = b.find(nombre.encode())
        print(nombre, i, b[i:i+1500].decode("utf-8", "replace") if i > 0 else "")
except Exception as ex:
    print("GIBS err", ex)
for nombre, u in [("safecast tile", "https://s3.amazonaws.com/te512.safecast.org/5/28/12.png"), ("safecast api", "https://api.safecast.org/measurements.json?distance=50000&latitude=35.68&longitude=139.76&per_page=5"),
                  ("safecast robots", "https://api.safecast.org/robots.txt"),
                  ("radnet", "https://www.epa.gov/radnet/radnet-csv-file-downloads"), ("radnet json", "https://radnet.epa.gov/cdx-radnet-rest/api/rest/csv/2026/fixed/AK/ANCHORAGE"),
                  ("eurdep", "https://remap.jrc.ec.europa.eu/robots.txt")]:
    try:
        print("robots", F.permitido_por_robots(u))
        st, ct, b = get(u)
        print(nombre, st, ct, len(b), b[:500])
    except Exception as ex:
        print(nombre, "ERR", ex)
