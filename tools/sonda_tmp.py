import re, urllib.request
UA = {"User-Agent": "geopolitica-monitor/1.0 (sonda)"}
def get(u, t=90):
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=t); return r.status, r.read()
    except Exception as e:
        return str(e)[:120], b""
s, b = get("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml")
t = b.decode("utf-8", "replace")
for capa in ("GHRSST_L4_MUR_Sea_Ice_Concentration", "GHRSST_L4_MUR25_Sea_Ice_Concentration", "MODIS_Terra_Sea_Ice", "VIIRS_SNPP_Sea_Ice", "MODIS_Terra_L3_Sea_Ice_Daily", "GHRSST_L4_GAMSSA_GDS2_Sea_Ice_Concentration", "VIIRS_SNPP_L3_Sea_Ice_Daily", "OMPS_Ozone_Total_Column"):
    i = t.find(f"<ows:Identifier>{capa}</ows:Identifier>")
    blk = t[t.rfind("<Layer>", 0, i): t.find("</Layer>", i)]
    vals = re.findall(r"<Value>([^<]{0,60})", blk)
    print("CAPA", capa, re.findall(r"<TileMatrixSet>([^<]+)", blk), re.findall(r"<Default>([^<]+)", blk), vals[-1:], re.findall(r'href="([^"]*colormaps[^"]*)"', blk)[:2])
for cm in ("GHRSST_Sea_Ice_Concentration", "GHRSST_L4_MUR_Sea_Ice_Concentration", "MODIS_Sea_Ice", "MODIS_Terra_Sea_Ice"):
    s, b = get(f"https://gibs.earthdata.nasa.gov/colormaps/v1.3/{cm}.xml")
    x = b.decode("utf-8", "replace")
    print("COLORMAP", cm, s, len(x), re.findall(r"<Legend[^>]*>", x)[:3], re.findall(r'<LegendEntry rgb="([^"]+)"[^>]*tooltip="([^"]*)"', x)[::6][:20])
for u in ("https://www.ncei.noaa.gov/access/monitoring/snow-and-ice-extent/sea-ice/S/9.csv", "https://www.ncei.noaa.gov/access/monitoring/snow-and-ice-extent/sea-ice/N/10.csv"):
    s, b = get(u); print(u, s, b[:160], b[-60:])
