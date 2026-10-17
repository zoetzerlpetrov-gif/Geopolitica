import re, urllib.request, datetime
UA = {"User-Agent": "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"}
def get(u, t=90):
    r = urllib.request.Request(u, headers=UA)
    with urllib.request.urlopen(r, timeout=t) as x:
        return x.status, x.headers.get("Content-Type"), x.read()
for proj in ("epsg3857", "epsg4326"):
    _, _, cap = get(f"https://gibs.earthdata.nasa.gov/wmts/{proj}/best/wmts.cgi?SERVICE=WMTS&REQUEST=GetCapabilities", 180)
    cap = cap.decode("utf-8", "replace")
    capas = re.findall(r"<Layer>(.*?)</Layer>", cap, re.S)
    print(f"== {proj}: {len(capas)} capas")
    for c in capas:
        ident = re.search(r"<ows:Identifier>([^<]+)</ows:Identifier>", c).group(1)
        if re.search(r"Sea_Ice|Nitrogen|NO2|DayNight|Black_Marble|GOES-East|GOES-West|Himawari|IMERG|GeoColor|Lightning|GLM", ident, re.I):
            tms = re.findall(r"<TileMatrixSet>([^<]+)</TileMatrixSet>", c)
            fmt = re.findall(r"<Format>([^<]+)</Format>", c)
            dims = re.search(r"<Default>([^<]+)</Default>", c)
            print(f"  {ident} | {tms} | {fmt} | default={dims.group(1) if dims else ''}")
hoy = datetime.datetime.utcnow().date()
for capa, mat, ext, dias in [("GHRSST_L4_MUR_Sea_Ice_Concentration", "GoogleMapsCompatible_Level7", "png", 2), ("TROPOMI_L2_Nitrogen_Dioxide_Tropospheric_Column", "GoogleMapsCompatible_Level6", "png", 1),
                             ("VIIRS_SNPP_DayNightBand_ENCC", "GoogleMapsCompatible_Level8", "png", 1), ("VIIRS_NOAA20_DayNightBand_ENCC", "GoogleMapsCompatible_Level8", "png", 1),
                             ("VIIRS_SNPP_DayNightBand_At_Sensor_Radiance", "GoogleMapsCompatible_Level8", "png", 1)]:
    for d in (dias, dias + 1, dias + 3):
        f = (hoy - datetime.timedelta(days=d)).isoformat()
        for z, y, x in ((2, 1, 1), (1, 0, 0)):
            u = f"https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{capa}/default/{f}/{mat}/{z}/{y}/{x}.{ext}"
            try:
                s, t, b = get(u, 30); print(capa, f, z, s, t, len(b))
            except Exception as e:
                print(capa, f, z, "error", e)
