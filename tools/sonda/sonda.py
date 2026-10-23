"""Sonda temporal: capas GIBS de hielo marino, NO2 TROPOMI y TEMPO (se borra antes del PR)."""
import re, urllib.request, datetime as dt
UA = {"User-Agent": "DOMINUS-OSINT/1.0"}
def get(u, t=60):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=t) as r:
            return r.status, r.headers.get("content-type"), r.read()
    except Exception as e:
        return getattr(e, "code", 0), "", b""
st, _, cap = get("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml", 180)
cap = cap.decode("utf-8", "ignore")
print("capabilities", st, len(cap))
for capa in ("GHRSST_L4_MUR_Sea_Ice_Concentration", "TROPOMI_L2_Nitrogen_Dioxide_Tropospheric_Column", "TEMPO_L3_NO2_Vertical_Column_Troposphere"):
    i = cap.find(f"<ows:Identifier>{capa}</ows:Identifier>")
    if i < 0:
        print(capa, "NO ESTÁ"); 
        for m in re.findall(r"<ows:Identifier>([^<]*(?:Sea_Ice|NO2|Nitrogen)[^<]*)</ows:Identifier>", cap): print("   similar:", m)
        continue
    a = cap.rfind("<Layer>", 0, i); b = cap.find("</Layer>", i)
    blk = cap[a:b]
    print(capa, re.findall(r"<TileMatrixSet>([^<]+)", blk), "formato", re.findall(r"<Format>([^<]+)", blk))
    print("   default", re.findall(r"<Default>([^<]+)", blk), "valores", [v[:120] for v in re.findall(r"<Value>([^<]+)", blk)][-3:])
hoy = dt.datetime.utcnow().date()
# TROPOMI: mosaicos z3 sobre el Pacífico oriental / México (y=3; x=0,1,2) en los últimos días
for d in range(1, 5):
    f = (hoy - dt.timedelta(days=d)).isoformat()
    s = []
    for x in (0, 1, 2, 3):
        c, t, b = get(f"https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/TROPOMI_L2_Nitrogen_Dioxide_Tropospheric_Column/default/{f}/GoogleMapsCompatible_Level6/3/3/{x}.png")
        s.append((c, len(b)))
    print("TROPOMI", f, s)
# Hielo marino: z2 Ártico (y=0) en varios días, con Level7 y otras matrices
for d in range(1, 5):
    f = (hoy - dt.timedelta(days=d)).isoformat()
    for m in ("GoogleMapsCompatible_Level7", "GoogleMapsCompatible_Level6", "GoogleMapsCompatible_Level8"):
        s = [get(f"https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GHRSST_L4_MUR_Sea_Ice_Concentration/default/{f}/{m}/2/0/{x}.png") for x in range(4)]
        print("HIELO", f, m, [(c, len(b)) for c, t, b in s])
# TEMPO: últimas horas, z4 sobre México (y=6/7, x=3)
now = dt.datetime.utcnow().replace(minute=0, second=0, microsecond=0)
for h in range(0, 30, 2):
    t = (now - dt.timedelta(hours=h)).strftime("%Y-%m-%dT%H:00:00Z")
    s = [get(f"https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/TEMPO_L3_NO2_Vertical_Column_Troposphere/default/{t}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png") for z, y, x in ((3, 3, 1), (3, 3, 2), (4, 7, 3))]
    print("TEMPO", t, [(c, len(b)) for c, _, b in s])
for tt in ("default",):
    s = [get(f"https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/TEMPO_L3_NO2_Vertical_Column_Troposphere/default/{tt}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png") for z, y, x in ((3, 3, 1), (3, 3, 2), (4, 7, 3))]
    print("TEMPO default", [(c, len(b)) for c, _, b in s])
