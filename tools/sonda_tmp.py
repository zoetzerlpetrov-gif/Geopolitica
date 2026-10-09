import json, time, urllib.parse, urllib.request, gzip
UA = "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
def raw(url, n=500, data=None, acc="*/*"):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, "Accept": acc})
    with urllib.request.urlopen(req, timeout=120) as r:
        b = r.read()
        if b[:2] == b"\x1f\x8b": b = gzip.decompress(b)
        return r.status, r.headers.get("Content-Type"), len(b), b[:n]
def p(url, n=400, **k):
    try: print("URL", url, *raw(url, n, **k))
    except Exception as e: print("URL", url, "ERR", e)
    time.sleep(1.5)
for u in ["https://celestrak.org/robots.txt", "https://celestrak.org/pub/satcat.csv",
          "https://celestrak.org/NORAD/elements/gp.php?GROUP=last-30-days&FORMAT=tle",
          "https://celestrak.org/NORAD/elements/gp.php?GROUP=cosmos-1408-debris&FORMAT=tle",
          "https://celestrak.org/NORAD/elements/gp.php?GROUP=fengyun-1c-debris&FORMAT=tle",
          "https://celestrak.org/NORAD/elements/gp.php?GROUP=iridium-33-debris&FORMAT=tle",
          "https://celestrak.org/NORAD/elements/gp.php?GROUP=cosmos-2251-debris&FORMAT=tle",
          "https://celestrak.org/NORAD/elements/table.php?tleFile=last-30-days",
          "https://api.worldbank.org/robots.txt",
          "https://api.worldbank.org/v2/country/all/indicator/EN.POP.DNST?format=json&mrnev=1&per_page=3",
          "https://api.weather.gov/robots.txt",
          "https://api.weather.gov/alerts/active?status=actual&severity=Extreme,Severe&limit=2",
          "https://feeds.meteoalarm.org/robots.txt", "https://feeds.meteoalarm.org/api/v1/warnings/feeds-spain",
          "https://nowcoast.noaa.gov/robots.txt",
          "https://api.ioda.inetintel.cc.gatech.edu/robots.txt",
          "https://api.ioda.inetintel.cc.gatech.edu/v2/outages/summary?from=%d&until=%d&entityType=country" % (time.time() - 86400, time.time()),
          "https://feodotracker.abuse.ch/robots.txt", "https://feodotracker.abuse.ch/downloads/ipblocklist.json",
          "https://threatfox.abuse.ch/robots.txt", "https://urlhaus.abuse.ch/robots.txt",
          "https://ll.thespacedevs.com/robots.txt", "https://ll.thespacedevs.com/2.3.0/launches/previous/?limit=1&mode=list",
          "https://sdmx.oecd.org/robots.txt",
          "https://sdmx.oecd.org/public/rest/data/OECD.CTP.TPS,DSD_TAX_CIT@DF_CIT,/..?lastNObservations=1&format=csvfile",
          "https://www.smn.gob.mx/robots.txt", "https://smn.conagua.gob.mx/robots.txt",
          "https://bitnodes.io/robots.txt", "https://bitnodes.io/api/v1/snapshots/latest/?field=coordinates",
          "https://www.cisa.gov/robots.txt", "https://www.cisa.gov/cybersecurity-advisories/ics-advisories.xml",
          "https://radar.cloudflare.com/robots.txt"]:
    p(u)
def sparql(q):
    return json.load(urllib.request.urlopen(urllib.request.Request("https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": q, "format": "json"}), headers={"User-Agent": UA}), timeout=120))["results"]["bindings"]
for nom, q in [("unesco", 'SELECT (COUNT(DISTINCT ?x) AS ?t) WHERE { ?x wdt:P1435 wd:Q9259 ; wdt:P625 ?c }'),
               ("atracc10", 'SELECT (COUNT(DISTINCT ?x) AS ?t) WHERE { ?x wdt:P31 wd:Q570116 ; wdt:P625 ?c ; wikibase:sitelinks ?n FILTER(?n>=10) }'),
               ("ministros_mx", 'SELECT ?p ?pLabel ?h ?hLabel WHERE { ?p wdt:P1001 wd:Q96 ; wdt:P31/wdt:P279* wd:Q83307 . ?h p:P39 ?st . ?st ps:P39 ?p . FILTER NOT EXISTS { ?st pq:P582 ?f } SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en" } } LIMIT 40')]:
    try: r = sparql(q); print("WD", nom, len(r), json.dumps(r[:40], ensure_ascii=False)[:2500])
    except Exception as e: print("WD", nom, e)
    time.sleep(2)
