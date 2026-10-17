import re, urllib.request, datetime
UA = {"User-Agent": "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"}
def get(u, t=90):
    r = urllib.request.Request(u, headers=UA)
    with urllib.request.urlopen(r, timeout=t) as x:
        return x.status, x.headers.get("Content-Type"), x.read()
_, _, cap = get("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi?SERVICE=WMTS&REQUEST=GetCapabilities", 180)
cap = cap.decode("utf-8", "replace")
info = {}
for c in re.findall(r"<Layer>(.*?)</Layer>", cap, re.S):
    ident = re.search(r"<ows:Identifier>([^<]+)</ows:Identifier>", c).group(1)
    if re.search(r"Sea_Ice_Conc|TROPOMI_L2_Nitrogen|DayNight|Black_Marble|GOES-East_ABI_(GeoColor|Band13|Air)|GOES-West_ABI_(GeoColor|Band13)|Himawari_AHI_Band13|IMERG", ident):
        tms = re.findall(r"<TileMatrixSet>([^<]+)</TileMatrixSet>", c)
        vals = re.findall(r"<Value>([^<]+)</Value>", c)
        dflt = re.search(r"<Default>([^<]+)</Default>", c)
        info[ident] = (tms[0] if tms else "", dflt.group(1) if dflt else "")
        print(f"{ident} | {tms} | default={dflt.group(1) if dflt else ''} | valores={vals[-1:] }")
hoy = datetime.datetime.now(datetime.UTC).date()
def prueba(capa, fecha, ext="png"):
    mat = info.get(capa, ("GoogleMapsCompatible_Level6",))[0]
    tot = 0
    for z, y, x in ((2, 1, 0), (2, 1, 1), (2, 1, 2), (2, 1, 3)):
        try:
            s, t, b = get(f"https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{capa}/default/{fecha}/{mat}/{z}/{y}/{x}.{ext}", 30); tot += len(b)
        except Exception as e:
            return f"error {e}"
    return tot
for capa in ["TROPOMI_L2_Nitrogen_Dioxide_Tropospheric_Column", "VIIRS_SNPP_DayNightBand_At_Sensor_Radiance", "VIIRS_NOAA20_DayNightBand_At_Sensor_Radiance",
             "VIIRS_SNPP_GapFilled_BRDF_Corrected_DayNightBand_Radiance", "VIIRS_NOAA20_GapFilled_BRDF_Corrected_DayNightBand_Radiance", "GHRSST_L4_MUR_Sea_Ice_Concentration",
             "GHRSST_L4_MUR25_Sea_Ice_Concentration", "AMSRU2_Sea_Ice_Concentration_12km"]:
    if capa not in info:
        print(capa, "NO está en epsg3857"); continue
    print(capa, {d: prueba(capa, (hoy - datetime.timedelta(days=d)).isoformat()) for d in (1, 2, 3, 4)})
for capa in ["GOES-East_ABI_GeoColor", "GOES-East_ABI_Band13_Clean_Infrared", "GOES-West_ABI_Band13_Clean_Infrared", "Himawari_AHI_Band13_Clean_Infrared", "IMERG_Precipitation_Rate_30min"]:
    if capa in info:
        print(capa, info[capa], "bytes con default:", prueba(capa, info[capa][1]))
