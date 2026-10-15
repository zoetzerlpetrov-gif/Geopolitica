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
    print(f"\n=== {u}\n status={s} len={len(b)} type={hd.get('Content-Type')} disp={hd.get('Content-Disposition')}")
    if grep:
        for m in sorted(set(re.findall(grep, t)))[:80]: print("  ", m)
    else:
        print(t[:n]);
        if tail: print("...", t[-tail:])
show("https://ozonewatch.gsfc.nasa.gov/meteorology/figures/ozone/to3areas_2026_toms+omi+omps.txt", 900, 500)
show("https://ozonewatch.gsfc.nasa.gov/meteorology/figures/ozone/to3areas_10_toms+omi+omps.txt", 900, 300)
show("https://ozonewatch.gsfc.nasa.gov/meteorology/figures/ozone/to3area_0907-1013_toms+omi+omps.txt", 900, 600)
show("https://noaadata.apps.nsidc.org/NOAA/G02135/north/daily/data/N_seaice_extent_climatology_1981-2010_v4.0.csv", 500)
show("https://noaadata.apps.nsidc.org/robots.txt", 300)
for p in (134, 135, 228):
    s, b, hd = get(f"https://usicecenter.gov/File/DownloadCurrent?pId={p}")
    print(f"\n=== USNIC pId={p} status={s} len={len(b)} type={hd.get('Content-Type')} disp={hd.get('Content-Disposition')}")
    print(b[:1500].decode("utf-8", "replace") if b[:1] not in (b"P", b"%") else b[:40])
show("https://usicecenter.gov/Products/AntarcIcebergs", 0, 0, grep=r'(?i)(iceberg[^<"]{0,80})')
show("https://download.dmi.dk/robots.txt", 300)
show("https://download.dmi.dk/Research_Projects/polarportal/PP_GSMB/GSMB.txt", 800, 400)
show("https://www.navcen.uscg.gov/sitemap.xml", 0, grep=r'<loc>([^<]*(?:ice|iip|IIP|Ice)[^<]*)</loc>')
show("https://www.navcen.uscg.gov/international-ice-patrol-products", 0, grep=r'href="([^"]+)"')
show("https://www.navcen.uscg.gov/iip-products", 0, grep=r'href="([^"]+)"')
gvp = ("https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows?service=WFS&version=2.0.0&request=GetFeature"
       "&typeName=GVP-VOTW:Smithsonian_VOTW_Pleistocene_Volcanoes&outputFormat=application%2Fjson&count=2")
show(gvp, 2500)
show("https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows?service=WFS&version=2.0.0&request=GetFeature&typeName=GVP-VOTW:Smithsonian_VOTW_Holocene_Volcanoes&outputFormat=application%2Fjson&count=1", 2500)
show("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_antarctic_ice_shelves_polys.geojson", 300)
show("https://services.swpc.noaa.gov/json/ovation_aurora_latest.json", 200)
def sparql(q):
    s, b, _ = get("https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(q), t=70, h={"Accept": "application/sparql-results+json"})
    try: return json.loads(b)["results"]["bindings"]
    except Exception: return f"ERR {s}"
for q in [
  "SELECT (COUNT(*) AS ?c) WHERE { ?x wdt:P31 wd:Q749622; p:P625/psv:P625/wikibase:geoLatitude ?lat . FILTER(?lat < -60) }",
  "SELECT (COUNT(*) AS ?c) WHERE { ?x wdt:P31 wd:Q39816; wdt:P625 ?c0; wikibase:sitelinks ?s . FILTER(?s >= 2) }",
  "SELECT (COUNT(*) AS ?c) WHERE { ?x wdt:P31 wd:Q8502; wdt:P625 ?c0; wikibase:sitelinks ?s . FILTER(?s >= 4) }",
  "SELECT (COUNT(*) AS ?c) WHERE { ?x wdt:P31 wd:Q34038; wdt:P625 ?c0; wikibase:sitelinks ?s . FILTER(?s >= 1) }",
  "SELECT (COUNT(*) AS ?c) WHERE { ?x wdt:P31 wd:Q133056; wdt:P625 ?c0; wikibase:sitelinks ?s . FILTER(?s >= 2) }"]:
    print("WD", q[40:110], sparql(q)); time.sleep(65)
