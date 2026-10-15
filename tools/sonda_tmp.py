import json, re, urllib.request, urllib.parse, time
UA = {"User-Agent": "geopolitica-monitor/1.0 (sonda; github.com/zoetzerlpetrov-gif/Geopolitica)"}
def get(u, n=None, t=40, data=None, h=None):
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, data=data, headers={**UA, **(h or {})}), timeout=t)
        b = r.read()
        return r.status, b
    except Exception as e:
        return str(e)[:150], b""
def show(u, n=600, grep=None):
    s, b = get(u)
    t = b.decode("utf-8", "replace")
    print(f"\n=== {u}\n status={s} len={len(b)}")
    if grep:
        for m in sorted(set(re.findall(grep, t)))[:60]: print("  ", m)
    else:
        print(t[:n])
# 1 GIBS 3857
s, b = get("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml", t=90)
ids = re.findall(r"<ows:Identifier>([^<]+)</ows:Identifier>", b.decode("utf-8", "replace"))
print("GIBS", s, len(ids)); print([i for i in ids if re.search(r"Ice|Ozone|AMSR|Snow|Sea_Ice|Brightness_Temp", i)])
# 2 NSIDC
show("https://noaadata.apps.nsidc.org/NOAA/G02135/north/daily/data/", grep=r'href="([^"]+)"')
show("https://noaadata.apps.nsidc.org/NOAA/G02135/south/daily/data/", grep=r'href="([^"]+)"')
for v in ("v3.0", "v4.0"):
    s, b = get(f"https://noaadata.apps.nsidc.org/NOAA/G02135/north/daily/data/N_seaice_extent_daily_{v}.csv")
    print(v, s, len(b)); t = b.decode("utf-8","replace").splitlines(); print(t[:3], t[-2:])
# 3 Ozono
show("https://ozonewatch.gsfc.nasa.gov/meteorology/SH.html", grep=r'href="([^"]+\.txt)"')
show("https://ozonewatch.gsfc.nasa.gov/meteorology/annual_data.html", grep=r'href="([^"]+\.txt)"')
show("https://ozonewatch.gsfc.nasa.gov/robots.txt", 400)
# 4 Groenlandia
show("https://polarportal.dk/en/greenland/surface-conditions/", grep=r'(?:href|src|data-[a-z]+)="([^"]+\.(?:csv|json|txt|dat))"')
show("https://polarportal.dk/robots.txt", 400)
show("https://nsidc.org/ice-sheets-today", grep=r'href="([^"]+\.(?:csv|json|txt))"')
# 5 USNIC
show("https://usicecenter.gov/Products/AntarcIcebergs", grep=r'href="([^"]+)"')
show("https://usicecenter.gov/robots.txt", 400)
# 6 IIP
show("https://www.navcen.uscg.gov/international-ice-patrol-iceberg-limits", grep=r'href="([^"]+\.(?:kml|kmz|zip|txt|pdf|shp|json|csv))"')
show("https://www.navcen.uscg.gov/robots.txt", 400)
# 7 OVATION
s, b = get("https://services.swpc.noaa.gov/json/ovation_aurora_latest.json"); print("\nOVATION", s, len(b), b[:300])
# 8 COMNAP PGC
show("https://overlord.pgc.umn.edu/arcgis/rest/services/reference/ant_comnap_antarctic_facilities/FeatureServer/0/query?where=1%3D1&outFields=*&f=geojson&resultRecordCount=2", 1500)
# 9 LiveATC
show("https://www.liveatc.net/robots.txt", 800)
show("https://www.liveatc.net/search/?icao=MMMX", grep=r'(archive\.php\?m=[a-z0-9_]+|hlisten\.php\?mount=[a-z0-9_]+)')
# 10 Wikidata
def sparql(q):
    s, b = get("https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(q), t=70, h={"Accept": "application/sparql-results+json"})
    try: return json.loads(b)["results"]["bindings"]
    except Exception: return f"ERR {s}"
CL = [("valle","Q39816"),("cascada","Q34038"),("montaña","Q8502"),("paso","Q133056"),("cañón","Q150784"),("meseta","Q75520"),("llanura","Q160091"),
      ("glaciar","Q35666"),("cabo","Q185113"),("lago","Q23397"),("estrecho","Q37901"),("bahía","Q39594"),("golfo","Q1322134"),("península","Q34763"),
      ("desierto","Q8514"),("isla","Q23442"),("cordillera","Q46831"),("colina","Q54050"),("géiser","Q83471"),("laguna","Q187223"),("cuenca endorreica","Q2209"),
      ("humedal","Q170321"),("cueva","Q35509"),("arrecife","Q184358"),("volcán","Q8072"),("cráter","Q1072303"),("duna","Q25391"),("archipiélago","Q33837"),("delta","Q43742"),("fiordo","Q45776"),("estratovolcán","Q169358"),("sierra","Q1437459"),("pico","Q207326"),("atolón","Q42523"),("barranca","Q166620"),("caldera","Q1060848")]
for nom, q in CL:
    r = sparql(f"SELECT ?n (COUNT(*) AS ?c) WHERE {{ ?x wdt:P31 wd:{q}; wdt:P625 ?co; wikibase:sitelinks ?s . BIND(IF(?s>=10,10,IF(?s>=5,5,IF(?s>=3,3,IF(?s>=2,2,IF(?s>=1,1,0))))) AS ?n) }} GROUP BY ?n")
    print("WD", nom, q, r if isinstance(r, str) else sorted((int(x["n"]["value"]), int(x["c"]["value"])) for x in r)); time.sleep(1)
for etiqueta in ("Valley of Mexico", "Amundsen–Scott South Pole Station", "McMurdo Station", "Pituffik Space Base", "Kvanefjeld", "Tanbreez", "Esperanza Base", "Concordia Station"):
    s, b = get("https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&limit=2&search=" + urllib.parse.quote(etiqueta))
    try:
        for e in json.loads(b)["search"]:
            s2, b2 = get(f"https://www.wikidata.org/wiki/Special:EntityData/{e['id']}.json")
            cl = json.loads(b2)["entities"][e["id"]]["claims"]
            p31 = [c["mainsnak"]["datavalue"]["value"]["id"] for c in cl.get("P31", []) if "datavalue" in c["mainsnak"]]
            co = [c["mainsnak"]["datavalue"]["value"] for c in cl.get("P625", []) if "datavalue" in c["mainsnak"]][:1]
            print("ENT", etiqueta, e["id"], e.get("description"), p31, [(round(x["latitude"],3), round(x["longitude"],3)) for x in co])
    except Exception as ex: print("ENT", etiqueta, "ERR", ex)
for q in ("Q1094424", "Q1056863"):
    r = sparql(f"SELECT (COUNT(*) AS ?c) WHERE {{ ?x wdt:P31 wd:{q}; wdt:P625 ?co }}"); print("WD estación", q, r)
r = sparql("SELECT ?cl ?clLabel (COUNT(*) AS ?c) WHERE { ?x wdt:P31 ?cl; p:P625/psv:P625/wikibase:geoLatitude ?lat . FILTER(?lat < -60) SERVICE wikibase:label { bd:serviceParam wikibase:language \"en\". } } GROUP BY ?cl ?clLabel ORDER BY DESC(?c) LIMIT 40")
print("Antártida clases", r if isinstance(r, str) else [(x["clLabel"]["value"], x["cl"]["value"].split("/")[-1], x["c"]["value"]) for x in r])
r = sparql("SELECT ?cl ?clLabel (COUNT(*) AS ?c) WHERE { ?x wdt:P31 ?cl; wdt:P17 wd:Q223 . SERVICE wikibase:label { bd:serviceParam wikibase:language \"en\". } } GROUP BY ?cl ?clLabel ORDER BY DESC(?c) LIMIT 30")
print("Groenlandia clases", r if isinstance(r, str) else [(x["clLabel"]["value"], x["cl"]["value"].split("/")[-1], x["c"]["value"]) for x in r])
# 11 cortes
show("https://poweroutage.us/robots.txt", 400)
show("https://api.ioda.inetintel.cc.gatech.edu/v2/", 200)
