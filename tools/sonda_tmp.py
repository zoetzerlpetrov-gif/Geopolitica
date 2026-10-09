import json, time, urllib.request, urllib.parse
UA = {"User-Agent": "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)", "Accept": "application/sparql-results+json"}
Q = """SELECT ?item ?en ?es ?coord ?iso ?sl WHERE {
  VALUES ?clase { wd:Q4989906 wd:Q179700 wd:Q12518 wd:Q12280 wd:Q2977 wd:Q32815 wd:Q44539 wd:Q23413 wd:Q16560 wd:Q11303 wd:Q839954
                  wd:Q57821 wd:Q54831 wd:Q174782 wd:Q16970 wd:Q2319498 wd:Q160742 wd:Q1440476 wd:Q11707 wd:Q1497375 wd:Q2111088 wd:Q1060829 wd:Q35509 wd:Q12570 }
  ?item wdt:P31 ?clase ; wdt:P625 ?coord ; wikibase:sitelinks ?sl . FILTER(?sl >= %d)
  OPTIONAL { ?item rdfs:label ?en FILTER(lang(?en) = "en") }
  OPTIONAL { ?item rdfs:label ?es FILTER(lang(?es) = "es") }
  OPTIONAL { ?item wdt:P17 ?p . ?p wdt:P298 ?iso }
}"""
for umbral in (45,):
    t = time.time()
    try:
        r = json.load(urllib.request.urlopen(urllib.request.Request("https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": Q % umbral, "format": "json"}), headers=UA), timeout=120))
        b = r["results"]["bindings"]
        print(umbral, f"{time.time() - t:.1f}s", len(b))
        vistos = {}
        for f in b:
            q = f["item"]["value"].rsplit("/", 1)[1]
            if q in vistos: continue
            c = f["coord"]["value"].replace("Point(", "").replace(")", "").split()
            vistos[q] = [f.get("en", {}).get("value", ""), f.get("es", {}).get("value", ""), f.get("iso", {}).get("value", ""), round(float(c[1]), 4), round(float(c[0]), 4), int(f["sl"]["value"]), q]
        lst = sorted(vistos.values(), key=lambda x: -x[5])
        print(len(lst)); print(json.dumps(lst, ensure_ascii=False))
    except Exception as e:
        print(umbral, "ERROR", e)
