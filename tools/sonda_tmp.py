import json, re, urllib.request, urllib.parse
UA = {"User-Agent": "geopolitica-monitor/1.0 (sonda; github.com/zoetzerlpetrov-gif/Geopolitica)"}
def get(u, t=60):
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=t)
        return r.status, r.read(), dict(r.headers)
    except Exception as e:
        return str(e)[:150], b"", {}
def show(u, n=600, tail=0, grep=None):
    s, b, hd = get(u)
    t = b.decode("utf-8", "replace")
    print(f"\n=== {u}\n status={s} len={len(b)} type={hd.get('Content-Type')} disp={hd.get('Content-Disposition')}")
    if grep:
        for m in sorted(set(re.findall(grep, t)))[:80]: print("  ", m)
    else:
        print(t[:n])
        if tail: print("...", t[-tail:])
s, b, _ = get("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml", t=90)
t = b.decode("utf-8", "replace")
for capa in ("GHRSST_L4_MUR_Sea_Ice_Concentration", "GHRSST_L4_MUR25_Sea_Ice_Concentration", "MODIS_Terra_Sea_Ice", "VIIRS_SNPP_Sea_Ice", "MODIS_Terra_L3_Sea_Ice_Daily", "GHRSST_L4_GAMSSA_GDS2_Sea_Ice_Concentration", "VIIRS_SNPP_L3_Sea_Ice_Daily"):
    i = t.find(f"<ows:Identifier>{capa}</ows:Identifier>")
    blk = t[t.rfind("<Layer>", 0, i): t.find("</Layer>", i)]
    vals = re.findall(r"<Value>([^<]{0,60})", blk)
    print("CAPA", capa, re.findall(r"<TileMatrixSet>([^<]+)", blk), re.findall(r"<Default>([^<]+)", blk), vals[-1:] if vals else None, re.findall(r'href="([^"]*colormaps[^"]*)"', blk)[:2])
for cm in ("GHRSST_L4_MUR_Sea_Ice_Concentration", "MODIS_Terra_Sea_Ice", "GHRSST_Sea_Ice_Concentration"):
    for v in ("v1.3", "v1.2"):
        s, b, _ = get(f"https://gibs.earthdata.nasa.gov/colormaps/{v}/{cm}.xml")
        x = b.decode("utf-8", "replace")
        print("COLORMAP", v, cm, s, len(x), re.findall(r"<Legend[^>]*>", x)[:3], re.findall(r'<LegendEntry rgb="([^"]+)"[^>]*tooltip="([^"]*)"', x)[::8][:16])
show("https://masie_web.apps.nsidc.org/robots.txt", 300)
show("https://nsidc.org/robots.txt", 1200)
show("https://usicecenter.gov/Products/ArcticTrendGraph", 0, grep=r'(?:href|src)="([^"]+)"')
show("https://usicecenter.gov/Products/ArcticData", 0, grep=r'href="(/File[^"]+|[^"]+\.(?:csv|txt|json))"')
show("https://usicecenter.gov/Products/ImsData", 0, grep=r'href="(/File[^"]+|[^"]+\.(?:csv|txt|json))"')
show("https://www.ncei.noaa.gov/robots.txt", 600)
show("https://www.ncei.noaa.gov/access/monitoring/snow-and-ice-extent/sea-ice/G/0", 0, grep=r'(?:href|src)="([^"]+\.(?:csv|json|txt))"')
show("https://www.ncei.noaa.gov/access/monitoring/snow-and-ice-extent/sea-ice/N/9.csv", 500, 200)
show("https://download.dmi.dk/Research_Projects/polarportal/PP_GSMB/GSMB_MELTA.txt", 0, 600)
s, b, _ = get("https://download.dmi.dk/Research_Projects/polarportal/PP_GSMB/GSMB.txt"); t = b.decode("utf-8","replace")
i = t.find("Please acknowledge"); print("\nGSMB tras acknowledge:", t[i:i+1500])
show("https://download.dmi.dk/Research_Projects/polarportal/README.txt", 1500)
show("https://ozonewatch.gsfc.nasa.gov/meteorology/figures/ozone/to3areas_2026_toms+omi+omps.txt", 0, 0, grep=r"(2026-10-1\d.*)")
