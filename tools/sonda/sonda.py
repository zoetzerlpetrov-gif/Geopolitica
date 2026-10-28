"""Sonda temporal: qué devuelve GIBS fuera de la cobertura de TEMPO y del hielo marino (se borra antes del PR)."""
import hashlib, io, time, urllib.request
from collections import Counter
from PIL import Image
UA = "DOMINUS-OSINT/1.0"
def ver(u):
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=40)
        d = r.read(); h = dict(r.headers)
        im = Image.open(io.BytesIO(d)); modo = im.mode; im = im.convert("RGBA")
        c = Counter(p for p in im.getdata() if p[3] > 0)
        return r.status, h.get("Content-Type"), h.get("X-Cache") or h.get("x-cache"), len(d), im.size, modo, sum(c.values()), c.most_common(3), hashlib.md5(d).hexdigest()[:8]
    except Exception as e:
        return "ERR", str(e)[:100]
B = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{c}/default/{t}/{m}/{z}/{y}/{x}.png"
t = time.strftime("%Y-%m-%dT", time.gmtime(time.time())) + "15:00:00Z"
for z, y, x in ((3, 3, 1), (3, 2, 5), (3, 3, 5), (3, 3, 6), (3, 4, 5), (3, 5, 6), (3, 1, 4), (3, 6, 7)):
    print("tempo", t, (z, y, x), ver(B.format(c="TEMPO_L3_NO2_Vertical_Column_Troposphere", t=t, m="GoogleMapsCompatible_Level7", z=z, y=y, x=x)))
for z, y, x in ((3, 5, 1), (3, 5, 2), (3, 5, 5), (3, 5, 6), (3, 4, 1), (3, 3, 2)):
    print("hielo", (z, y, x), ver(B.format(c="GHRSST_L4_MUR_Sea_Ice_Concentration", t="default", m="GoogleMapsCompatible_Level7", z=z, y=y, x=x)))
