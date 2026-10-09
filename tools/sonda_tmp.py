import json, time, urllib.request, urllib.parse
from collections import defaultdict
UA = {"User-Agent": "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)", "Accept": "application/sparql-results+json"}
def q(s):
    t = time.time()
    try:
        r = json.load(urllib.request.urlopen(urllib.request.Request("https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": s, "format": "json"}), headers=UA), timeout=120))
        print(f"  {time.time() - t:.1f}s {len(r['results']['bindings'])} filas"); return r
    except Exception as e:
        print(f"  {time.time() - t:.1f}s ERROR {e}"); return None
isos = ["MEX", "USA", "ESP", "FRA", "DEU", "BRA", "ARG", "COL", "CHN", "IND", "JPN", "GBR", "ITA", "CAN", "RUS", "ZAF", "NGA", "EGY", "TUR", "IRN"]
V = " ".join(f'"{x}"' for x in isos)
G = """SELECT ?iso ?gab ?gabEn ?ini ?persona ?personaEs ?personaEn ?cargo ?cargoEs ?cargoEn WHERE { VALUES ?iso { %s }
 ?pais wdt:P298 ?iso ; wdt:P31 wd:Q3624078 .
 ?gab wdt:P31/wdt:P279? wd:Q640506 ; wdt:P17 ?pais ; wdt:P571|wdt:P580 ?ini . FILTER NOT EXISTS { ?gab wdt:P576|wdt:P582 ?f } FILTER(?ini >= "2014-01-01T00:00:00Z"^^xsd:dateTime)
 OPTIONAL { ?gab rdfs:label ?gabEn FILTER(lang(?gabEn) = "en") }
 ?persona p:P39 ?st . ?st pq:P5054 ?gab ; ps:P39 ?cargo . FILTER NOT EXISTS { ?st pq:P582 ?fin }
 OPTIONAL { ?cargo rdfs:label ?cargoEs FILTER(lang(?cargoEs) = "es") } OPTIONAL { ?cargo rdfs:label ?cargoEn FILTER(lang(?cargoEn) = "en") }
 OPTIONAL { ?persona rdfs:label ?personaEs FILTER(lang(?personaEs) = "es") } OPTIONAL { ?persona rdfs:label ?personaEn FILTER(lang(?personaEn) = "en" || lang(?personaEn) = "mul") } }""" % V
print("gabinetes"); r = q(G)
por = defaultdict(list)
for f in (r or {}).get("results", {}).get("bindings", []):
    g = lambda k: f.get(k, {}).get("value", "")
    por[g("iso")].append((g("gabEn")[:40], (g("cargoEs") or g("cargoEn"))[:50], g("personaEs") or g("personaEn")))
print({k: len(v) for k, v in por.items()})
for iso in ["MEX", "USA", "ESP", "DEU", "BRA", "JPN", "GBR", "FRA", "ARG"]:
    print(iso, sorted(set(por.get(iso, [])), key=str)[:30])
