"""Sonda temporal: GIBS (hielo marino, ozono, TEMPO) y EUMETView (Meteosat). Se borra antes del PR."""
import io, re, time, urllib.request
from collections import Counter
from PIL import Image
UA = "DOMINUS-OSINT/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"

def get(u, t=60):
    r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA, "Origin": "https://zoetzerlpetrov-gif.github.io"}), timeout=t)
    return r.read(), dict(r.headers)

caps, _ = get("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml", 120)
caps = caps.decode()
for capa in ["GHRSST_L4_MUR_Sea_Ice_Concentration", "OMPS_Ozone_Total_Column", "OMPS_NPP_Ozone_Total_Column", "TEMPO_L3_NO2_Vertical_Column_Troposphere",
             "AMSR2_Sea_Ice_Concentration_12km", "AMSRU2_Sea_Ice_Concentration_12km", "AMSR2_Sea_Ice_Concentration_25km", "MODIS_Terra_Sea_Ice", "MODIS_Aqua_Sea_Ice"]:
    m = re.search(rf"<ows:Identifier>{capa}</ows:Identifier>(.*?)</Layer>", caps, re.S)
    if not m:
        print("NO EXISTE", capa); continue
    b = m.group(1)
    print("==", capa, re.findall(r"<TileMatrixSet>([^<]+)", b), "default", re.findall(r"<Default>([^<]+)", b), "dom", [d[:60] + "…" + d[-60:] for d in re.findall(r"<Value>([^<]+)", b)][-2:])
others = sorted(set(re.findall(r"<ows:Identifier>([^<]*(?:Ozone|Sea_Ice|Meteosat|MSG|SEVIRI|GeoColor|Clean_Infrared|Band13)[^<]*)</ows:Identifier>", caps)))
print("relacionadas:", others)

def colores(url):
    try:
        d, h = get(url, 40)
        im = Image.open(io.BytesIO(d)).convert("RGBA")
        c = Counter(p for p in im.getdata() if p[3] > 0)
        return len(d), sum(c.values()), c.most_common(4)
    except Exception as e:
        return str(e)[:80]

B = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{c}/default/{t}/{m}/{z}/{y}/{x}.png"
for t in ("default", "2026-10-20", "2026-10-21"):
    for z, y, x in ((2, 1, 0), (2, 2, 1), (2, 2, 2), (3, 3, 2), (3, 4, 5), (3, 0, 3), (3, 7, 3)):
        print("hielo", t, (z, y, x), colores(B.format(c="GHRSST_L4_MUR_Sea_Ice_Concentration", t=t, m="GoogleMapsCompatible_Level7", z=z, y=y, x=x)))
for t in ("default", "2026-10-21", "2026-10-22"):
    for z, y, x in ((2, 1, 0), (2, 2, 0), (2, 1, 3), (2, 2, 3), (2, 1, 1), (2, 2, 2)):
        print("ozono", t, (z, y, x), colores(B.format(c="OMPS_Ozone_Total_Column", t=t, m="GoogleMapsCompatible_Level6", z=z, y=y, x=x)))
for h in (14, 16, 18, 20, 22):
    t = time.strftime("%Y-%m-%dT", time.gmtime(time.time() - 86400)) + f"{h:02d}:00:00Z"
    for z, y, x in ((3, 3, 1), (3, 3, 2), (4, 6, 3), (4, 7, 3), (4, 6, 4)):
        print("tempo", t, (z, y, x), colores(B.format(c="TEMPO_L3_NO2_Vertical_Column_Troposphere", t=t, m="GoogleMapsCompatible_Level7", z=z, y=y, x=x)))

print("== EUMETView")
for u in ["https://view.eumetsat.int/geoserver/ows?service=WMS&version=1.3.0&request=GetCapabilities"]:
    try:
        d, h = get(u, 120); txt = d.decode("utf-8", "replace")
        print("CORS:", h.get("Access-Control-Allow-Origin"), "bytes", len(d))
        for nombre in re.findall(r"<Layer[^>]*>\s*<Name>([^<]+)</Name>", txt):
            if re.search(r"ir108|ir_108|worldcloud|wideareacoverage|natural|geocolor|rgb_|dust|airmass", nombre, re.I):
                bloque = txt[txt.find(f"<Name>{nombre}</Name>"):][:3000]
                dim = re.search(r'<Dimension name="time"[^>]*default="([^"]*)"[^>]*>([^<]{0,200})', bloque)
                print("  ", nombre, "| default:", dim.group(1) if dim else None, "|", (dim.group(2)[-90:] if dim else ""))
    except Exception as e:
        print("ERROR", e)
for capa in ("mumi:worldcloudmap_ir108", "msg_fes:ir108", "msg_iodc:ir108", "mumi:wideareacoverage_rgb_natural"):
    u = ("https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&layers=" + capa +
         "&styles=&crs=EPSG:3857&bbox=-20037508,-20037508,20037508,20037508&width=256&height=256&format=image/png&transparent=true")
    try:
        d, h = get(u, 60)
        print(capa, h.get("Content-Type"), len(d), "CORS", h.get("Access-Control-Allow-Origin"), colores(u) if "image" in (h.get("Content-Type") or "") else d[:200])
    except Exception as e:
        print(capa, "ERROR", e)
