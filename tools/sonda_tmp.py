import json, time, urllib.parse, urllib.request
UA = "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
def get(url, data=None):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=200) as r:
        return json.load(r)
def sparql(q):
    return get("https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": q, "format": "json"}))["results"]["bindings"]
for t in ["nuclear power plant", "research reactor", "uranium enrichment plant", "nuclear reprocessing plant", "research institute",
          "national laboratory", "pharmaceutical company", "oil field", "gas field", "oil platform", "spaceport", "rocket launch site",
          "biosafety level 4", "vaccine manufacturer", "desalination plant", "border crossing", "satellite ground station", "internet exchange point",
          "oil refinery", "LNG terminal", "particle accelerator", "nuclear weapons laboratory"]:
    try:
        r = get("https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({"action": "wbsearchentities", "search": t, "language": "en", "format": "json", "limit": 4}))
        print("BUSCA", t, [(x["id"], x.get("description", "")[:50]) for x in r["search"]])
    except Exception as e: print("BUSCA", t, e)
    time.sleep(1)

QS = """SELECT (COUNT(DISTINCT ?x) AS ?t) (SUM(IF(?n>=3,1,0)) AS ?n3) (SUM(IF(?n>=10,1,0)) AS ?n10) WHERE {
  { SELECT DISTINCT ?x ?n WHERE { ?x wdt:P31 wd:%s ; wdt:P625 ?c ; wikibase:sitelinks ?n . } } }"""
QH = """SELECT (COUNT(DISTINCT ?x) AS ?t) (SUM(IF(?n>=3,1,0)) AS ?n3) (SUM(IF(?n>=10,1,0)) AS ?n10) WHERE {
  { SELECT DISTINCT ?x ?n WHERE { ?x wdt:P31 wd:%s ; wdt:P159 ?h ; wikibase:sitelinks ?n . ?h wdt:P625 ?c . } } }"""
for q in ["Q134447", "Q31855", "Q19644607", "Q211748", "Q1129743", "Q689497", "Q194188", "Q1068111", "Q12323", "Q1146180", "Q2385804", "Q1371849", "Q6881511"]:
    for nom, plantilla in (("coord", QS), ("sede", QH)):
        try:
            r = sparql(plantilla % q)[0]
            print("CUENTA", q, nom, {k: v["value"] for k, v in r.items()})
        except Exception as e: print("CUENTA", q, nom, e)
        time.sleep(2)
    try:
        r = sparql('SELECT ?l WHERE { wd:%s rdfs:label ?l FILTER(lang(?l)="en") }' % q)
        print("ETIQ", q, r[0]["l"]["value"] if r else "")
    except Exception as e: print("ETIQ", q, e)

OV = "https://overpass-api.de/api/interpreter"
for sel in ['nwr["man_made"="offshore_platform"]', 'nwr["man_made"="petroleum_well"]', 'nwr["man_made"="petroleum_well"]["name"]',
            'nwr["man_made"="works"]["product"~"pharma|vaccin|medic|drug",i]', 'nwr["industrial"="pharmaceutical"]',
            'nwr["barrier"="border_control"]', 'nwr["barrier"="border_control"]["name"]', 'nwr["water_works"="desalination"]',
            'nwr["man_made"="water_works"]["name"~"desal",i]', 'nwr["amenity"="research_institute"]', 'nwr["amenity"="research_institute"]["wikidata"]',
            'nwr["plant:source"="nuclear"]', 'nwr["generator:source"="nuclear"]', 'way["railway"="rail"]["usage"="main"]',
            'nwr["man_made"="satellite_dish"]["wikidata"]', 'nwr["telecom"="exchange"]']:
    try:
        r = get(OV, urllib.parse.urlencode({"data": f"[out:json][timeout:300];{sel};out count;"}).encode())
        print("OSM", sel, r["elements"][0]["tags"])
    except Exception as e: print("OSM", sel, e)
    time.sleep(20)
for u in ["https://www.peeringdb.com/robots.txt", "https://www.peeringdb.com/api/ix?limit=2", "https://pris.iaea.org/robots.txt"]:
    try:
        req = urllib.request.Request(u, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as r: print("URL", u, r.status, r.read(600))
    except Exception as e: print("URL", u, e)
