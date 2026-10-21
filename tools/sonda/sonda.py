"""Sonda temporal: TEMPO NO2 por hora y años de EOX s2cloudless."""
import datetime as dt
import re
import urllib.request

def get(url, n=0):
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "DOMINUS-sonda"}), timeout=12)
        b = r.read() if n == 0 else r.read(n)
        return r.status, r.headers.get("content-type"), len(b), b
    except Exception as e:
        return getattr(e, "code", "ERR"), str(e)[:60], 0, b""

CAPA = "TEMPO_L3_NO2_Vertical_Column_Troposphere"
base = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/" + CAPA + "/default/{t}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png"
st, ct, n, b = get("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/" + CAPA + "/default/WMTSCapabilities.xml")
print("caps", st, n)
txt = b.decode("utf-8", "ignore")
for m in re.findall(r"<Dimension>.*?</Dimension>", txt, re.S)[:1]:
    vals = re.findall(r"<Value>(.*?)</Value>", m)
    print("dim default", re.findall(r"<Default>(.*?)</Default>", m), "nvals", len(vals), vals[-6:])
st, ct, n, b = get("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml")
txt = b.decode("utf-8", "ignore")
i = txt.find(CAPA)
if i > 0:
    seg = txt[i:i + 20000]
    d = re.search(r"<Dimension>.*?</Dimension>", seg, re.S)
    if d:
        vals = re.findall(r"<Value>(.*?)</Value>", d.group(0))
        print("global dim", re.findall(r"<Default>(.*?)</Default>", d.group(0)), len(vals), vals[-8:])
tiles = [(3, 3, 1), (3, 3, 2), (4, 6, 3), (4, 7, 3)]
def medir(t):
    return [get(base.format(t=t, z=z, y=y, x=x))[:3] for z, y, x in tiles]
print("default", medir("default"))
ahora = dt.datetime.now(dt.timezone.utc).replace(minute=0, second=0, microsecond=0)
for h in range(0, 36, 1):
    t = ahora - dt.timedelta(hours=h)
    for fmt in ("%Y-%m-%dT%H:%M:%SZ",):
        s = t.strftime(fmt)
        print(s, [x[2] if x[0] == 200 else x[:2] for x in medir(s)])
print("solo fecha", medir((ahora - dt.timedelta(days=1)).strftime("%Y-%m-%d")))
print("--- EOX")
for a in range(2016, 2027):
    for z, y, x in [(5, 14, 7), (10, 456, 229), (13, 3651, 1836), (14, 7303, 3672)]:
        st, ct, n, _ = get(f"https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-{a}_3857/default/g/{z}/{y}/{x}.jpg")
        print(a, z, st, ct, n)
st, ct, n, b = get("https://tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml")
print("eox caps", st, n, sorted(set(re.findall(r"s2cloudless-\d{4}_3857", b.decode('utf-8', 'ignore')))))
