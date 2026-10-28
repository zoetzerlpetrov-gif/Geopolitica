"""Sonda 2: mosaicos de TEMPO (tamaño y tipo de PNG por hora) y licencia de C2IntelFeeds."""
import re, sys, time, urllib.request
UA = "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
def pedir(u, t=40):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=t) as r:
            return r.status, r.headers.get("content-type"), r.read()
    except urllib.error.HTTPError as e:
        return e.code, "", b""
    except Exception as e:
        return str(e)[:60], "", b""
import subprocess, os, tempfile
t0 = time.time()
r = subprocess.run([sys.executable, "tools/investigacion/extranjeras_mx.py"], capture_output=True, text=True, timeout=400)
print(f"EXTRANJERAS: {time.time() - t0:.0f} s", r.stdout[-600:], r.stderr[-600:])
fin = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()); ini = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - 30 * 3600))
s, _, b = pedir(f"https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/TEMPO_L3_NO2_Vertical_Column_Troposphere/default/GoogleMapsCompatible_Level7/all/{ini}--{fin}.xml")
dom = re.search(rb"<Domain>([^<]*)</Domain>", b)
print("DOMINIO TEMPO 30 h:", dom.group(1)[:3000] if dom else b[:300])
horas = re.findall(rb"(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ)/\1", dom.group(1)) if dom else []
for t in [h.decode() for h in horas][-2:]:
    fila = []
    for z, y, x in [(2, 0, 0), (2, 1, 0), (2, 0, 1), (2, 1, 1), (1, 0, 0), (3, 3, 1), (3, 3, 2)]:
        u = f"https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/TEMPO_L3_NO2_Vertical_Column_Troposphere/default/{t}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png"
        s, ct, b = pedir(u)
        tipo = b[25] if len(b) > 25 and b[:4] == b"\x89PNG" else "-"
        fila.append(f"{z}/{y}/{x}:{s}/{len(b)}B/t{tipo}")
    print("TEMPO", t, " ".join(fila))
