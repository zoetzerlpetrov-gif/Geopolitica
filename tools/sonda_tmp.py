import json, re, urllib.request, urllib.parse, time
UA = {"User-Agent": "geopolitica-monitor/1.0 (sonda; github.com/zoetzerlpetrov-gif/Geopolitica)"}
def get(u, t=60, h=None):
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers={**UA, **(h or {})}), timeout=t)
        return r.status, r.read(), dict(r.headers)
    except Exception as e:
        return str(e)[:150], b"", {}
def show(u, n=700, tail=0, grep=None):
    s, b, hd = get(u)
    t = b.decode("utf-8", "replace")
    print(f"\n=== {u}\n status={s} len={len(b)} type={hd.get('Content-Type')}")
    if grep:
        for m in sorted(set(re.findall(grep, t)))[:80]: print("  ", m)
    else:
        print(t[:n])
        if tail: print("...", t[-tail:])
s, b, _ = get("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml", t=90)
t = b.decode("utf-8", "replace")
for capa in ("AMSRU2_Sea_Ice_Concentration_12km", "OMPS_Ozone_Total_Column", "MODIS_Terra_NDSI_Snow_Cover"):
    i = t.find(f"<ows:Identifier>{capa}</ows:Identifier>")
    blk = t[t.rfind("<Layer>", 0, i): t.find("</Layer>", i)]
    print("\nCAPA", capa, re.findall(r"<TileMatrixSet>([^<]+)", blk), re.findall(r"<Format>([^<]+)", blk), re.findall(r'xlink:href="([^"]+colormap[^"]*)"', blk), re.findall(r"<Default>([^<]+)", blk), re.findall(r"<Value>([^<]{0,60})", blk)[:2])
for cm in ("AMSRU2_Sea_Ice_Concentration_12km", "OMPS_Ozone_Total_Column"):
    s, b, _ = get(f"https://gibs.earthdata.nasa.gov/colormaps/v1.3/{cm}.xml")
    x = b.decode("utf-8", "replace")
    print("\nCOLORMAP", cm, s, len(x))
    ents = re.findall(r'<ColorMapEntry rgb="([^"]+)"[^>]*?(?:transparent="([^"]+)")?[^>]*?(?:sourceValue="([^"]+)")?[^>]*?label="([^"]*)"', x)
    print(len(ents), ents[:3], ents[len(ents)//4:len(ents)//4+2], ents[len(ents)//2:len(ents)//2+2], ents[-3:])
    print(re.findall(r"<Legend[^>]*>", x)[:3], re.findall(r'<LegendEntry rgb="([^"]+)"[^>]*tooltip="([^"]*)"', x)[::12][:20])
show("https://thredds.met.no/robots.txt", 400)
show("https://thredds.met.no/thredds/catalog/osisaf/met.no/ice/index/catalog.html", 0, grep=r"href='([^']+)'")
show("https://thredds.met.no/thredds/catalog/osisaf/met.no/ice/index/v2p3/catalog.html", 0, grep=r"href='([^']+)'")
show("https://ads.nipr.ac.jp/robots.txt", 400)
show("https://ads.nipr.ac.jp/vishop/data/graph/plot_extent_n_v2.csv", 400, 300)
show("https://climatereanalyzer.org/robots.txt", 400)
show("https://climatereanalyzer.org/clim/seaice/", 0, grep=r'(?:href|src)="([^"]+\.(?:json|csv|js))"')
show("https://download.dmi.dk/Research_Projects/polarportal/PP_GSMB/", 0, grep=r'href="([^"]+)"')
show("https://download.dmi.dk/Research_Projects/polarportal/", 0, grep=r'href="([^"]+)"')
s, b, _ = get("https://download.dmi.dk/Research_Projects/polarportal/PP_GSMB/GSMB.txt"); t = b.decode("utf-8","replace")
i = t.find("#####", 200); print("\nGSMB cabecera:", t[:2600][-1600:])
for etiqueta in ("Tanbreez", "Camp Century", "Kangerlussuaq Airport", "Nuuk", "Port of Nuuk", "Narsarsuaq Airport", "Citronen Fjord", "Malmbjerg", "Thule Air Base", "Ilulissat Icefjord", "Jakobshavn Glacier"):
    s, b, _ = get("https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&limit=3&search=" + urllib.parse.quote(etiqueta))
    try:
        for e in json.loads(b)["search"]:
            print("ENT", etiqueta, e["id"], e.get("label"), "|", e.get("description"))
    except Exception as ex: print("ENT", etiqueta, "ERR", ex)
s, b, _ = get("https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote("SELECT (COUNT(*) AS ?c) WHERE { ?x wdt:P31 wd:Q749622; wdt:P625 ?c0 }"), t=70, h={"Accept": "application/sparql-results+json"})
print("\nWDQS estaciones", s, b[:300])
