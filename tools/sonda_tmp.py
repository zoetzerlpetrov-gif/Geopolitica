import json, time, urllib.request, urllib.parse
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
A = """SELECT DISTINCT ?iso ?cargo WHERE { VALUES ?iso { %s } ?pais wdt:P298 ?iso ; wdt:P31 wd:Q3624078 . ?cargo wdt:P1001 ?pais .
 { ?cargo wdt:P31 wd:Q83307 } UNION { ?cargo wdt:P31/wdt:P279 wd:Q83307 } UNION { ?cargo wdt:P31/wdt:P279/wdt:P279 wd:Q83307 } }""" % V
print("A cargos"); ra = q(A)
cargos = sorted({f["cargo"]["value"].rsplit("/", 1)[1] for f in ra["results"]["bindings"]}) if ra else []
print(len(cargos), "cargos")
B = """SELECT ?cargo ?cargoEs ?cargoEn ?persona ?personaEs ?personaEn ?ini WHERE { VALUES ?cargo { %s }
 ?persona p:P39 ?st . ?st ps:P39 ?cargo ; pq:P580 ?ini . FILTER(?ini >= "2015-01-01T00:00:00Z"^^xsd:dateTime)
 FILTER NOT EXISTS { ?st pq:P582 ?fin } FILTER NOT EXISTS { ?st pq:P1366 ?suc } FILTER NOT EXISTS { ?persona wdt:P570 ?m }
 OPTIONAL { ?cargo rdfs:label ?cargoEs FILTER(lang(?cargoEs) = "es") } OPTIONAL { ?cargo rdfs:label ?cargoEn FILTER(lang(?cargoEn) = "en") }
 OPTIONAL { ?persona rdfs:label ?personaEs FILTER(lang(?personaEs) = "es") } OPTIONAL { ?persona rdfs:label ?personaEn FILTER(lang(?personaEn) = "en" || lang(?personaEn) = "mul") } }"""
filas = []
for i in range(0, len(cargos), 150):
    print("B lote", i); rb = q(B % " ".join(f"wd:{c}" for c in cargos[i:i + 150]))
    if rb: filas += rb["results"]["bindings"]
cargo_iso = {f["cargo"]["value"].rsplit("/", 1)[1]: f["iso"]["value"] for f in ra["results"]["bindings"]} if ra else {}
from collections import defaultdict
por = defaultdict(list)
for f in filas:
    c = f["cargo"]["value"].rsplit("/", 1)[1]
    por[cargo_iso.get(c)].append((f.get("cargoEs", f.get("cargoEn", {})).get("value"), f.get("personaEs", f.get("personaEn", {})).get("value"), f["ini"]["value"][:10]))
print({k: len(v) for k, v in por.items()})
for iso in ["MEX", "USA", "ESP", "DEU", "BRA", "JPN"]:
    print(iso, sorted(por.get(iso, []))[:40])
