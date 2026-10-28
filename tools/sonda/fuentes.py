"""Sonda 2: mosaicos de TEMPO (tamaño y tipo de PNG por hora) y licencia de C2IntelFeeds."""
import re, time, urllib.request
UA = "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
def pedir(u, t=40):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=t) as r:
            return r.status, r.headers.get("content-type"), r.read()
    except urllib.error.HTTPError as e:
        return e.code, "", b""
    except Exception as e:
        return str(e)[:60], "", b""
s, _, b = pedir("https://raw.githubusercontent.com/drb-ra/C2IntelFeeds/master/License.md")
print("LICENCIA C2IntelFeeds:", s, b[:600])
s, _, b = pedir("https://raw.githubusercontent.com/drb-ra/C2IntelFeeds/master/README.md")
print("README C2IntelFeeds:", s, b[:1500])
fin = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()); ini = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - 30 * 3600))
s, _, b = pedir(f"https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/TEMPO_L3_NO2_Vertical_Column_Troposphere/default/GoogleMapsCompatible_Level6/all/{ini}--{fin}.xml")
dom = re.search(rb"<Domain>([^<]*)</Domain>", b)
print("DOMINIO TEMPO 30 h:", dom.group(1)[:3000] if dom else b[:300])
horas = re.findall(rb"(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ)/\1", dom.group(1)) if dom else []
for t in [h.decode() for h in horas][-8:]:
    fila = []
    for z, y, x in [(3, 2, 1), (3, 2, 2), (3, 3, 1), (3, 3, 2), (4, 6, 3), (4, 6, 4), (4, 7, 3)]:
        u = f"https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/TEMPO_L3_NO2_Vertical_Column_Troposphere/default/{t}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png"
        s, ct, b = pedir(u)
        tipo = b[25] if len(b) > 25 and b[:4] == b"\x89PNG" else "-"
        fila.append(f"{z}/{y}/{x}:{s}/{len(b)}B/t{tipo}")
    print("TEMPO", t, " ".join(fila))
