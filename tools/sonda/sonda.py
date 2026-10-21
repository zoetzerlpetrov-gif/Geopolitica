"""Sonda temporal del Lote F: conteos en Wikidata y OSM (se borra antes del PR)."""
import json, time, urllib.parse, urllib.request
UA = "DOMINUS-OSINT/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"

def sparql(q):
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": q, "format": "json"})
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/sparql-results+json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)["results"]["bindings"]
    except Exception as e:
        print("  ERROR", e); return []

def tabla(t, q):
    print("==", t); t0 = time.time()
    for f in sparql(q):
        print("  ", {k: v["value"].rsplit("/", 1)[-1] for k, v in f.items()})
    print(f"   ({time.time()-t0:.0f} s)"); time.sleep(5)

tabla("subclases de mina con coord", """SELECT ?c ?cl (COUNT(DISTINCT ?x) AS ?n) WHERE { ?c wdt:P279* wd:Q820477 . ?x wdt:P31 ?c ; wdt:P625 [] .
 OPTIONAL { ?c rdfs:label ?cl FILTER(lang(?cl)="en") } } GROUP BY ?c ?cl ORDER BY DESC(?n) LIMIT 40""")
tabla("minas (P31 mina directa) por sitelinks>=1, con operador/dueño y producto", """SELECT (COUNT(DISTINCT ?x) AS ?n) (COUNT(DISTINCT ?o) AS ?conop) (COUNT(DISTINCT ?p) AS ?conprod) WHERE {
 ?x wdt:P31/wdt:P279* wd:Q820477 ; wdt:P625 [] ; wikibase:sitelinks ?s . FILTER(?s >= 1)
 OPTIONAL { ?x wdt:P137|wdt:P127 ?op . BIND(?x AS ?o) } OPTIONAL { ?x wdt:P1056 ?pr . BIND(?x AS ?p) } }""")
tabla("minas sitelinks>=0", """SELECT (COUNT(DISTINCT ?x) AS ?n) WHERE { ?x wdt:P31/wdt:P279* wd:Q820477 ; wdt:P625 [] . }""")
tabla("productos más comunes de minas", """SELECT ?p ?pl (COUNT(DISTINCT ?x) AS ?n) WHERE { ?x wdt:P31/wdt:P279* wd:Q820477 ; wdt:P625 [] ; wdt:P1056 ?p .
 OPTIONAL { ?p rdfs:label ?pl FILTER(lang(?pl)="es") } } GROUP BY ?p ?pl ORDER BY DESC(?n) LIMIT 30""")
for clase, nom in (("Q211748", "campo petrolero"), ("Q1349255", "campo de gas"), ("Q689880", "plataforma")):
    tabla(f"{nom}: total, con operador, operador con país", f"""SELECT (COUNT(DISTINCT ?x) AS ?n) (COUNT(DISTINCT ?a) AS ?op) (COUNT(DISTINCT ?b) AS ?oppais) WHERE {{
 ?x wdt:P31 wd:{clase} ; wdt:P625 [] ; wikibase:sitelinks ?s . FILTER(?s >= 1)
 OPTIONAL {{ ?x wdt:P137|wdt:P127 ?op . BIND(?x AS ?a) OPTIONAL {{ ?op wdt:P17 ?pp . BIND(?x AS ?b) }} }} }}""")
tabla("ejemplos campos en México", """SELECT ?x ?xl ?opl ?ppl WHERE { ?x wdt:P31 wd:Q211748 ; wdt:P17 wd:Q96 . OPTIONAL { ?x rdfs:label ?xl FILTER(lang(?xl)="es") }
 OPTIONAL { ?x wdt:P137|wdt:P127 ?op . ?op rdfs:label ?opl FILTER(lang(?opl)="en") OPTIONAL { ?op wdt:P17 ?pp . ?pp wdt:P297 ?ppl } } } LIMIT 30""")

def overpass(q):
    for url in ("https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"):
        try:
            req = urllib.request.Request(url, data=urllib.parse.urlencode({"data": q}).encode(), headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=200) as r:
                return json.loads(r.read())["elements"]
        except Exception as e:
            print("  overpass", url, e)
    return []
for t, sel in (("canteras con más minerales y nombre", 'nwr["landuse"="quarry"]["resource"~"gold|silver|iron_ore|coal|zinc|lead|bauxite|potash|phosphate|manganese|platinum|molybdenum|diamond"]["name"]'),
               ("industrial=mine con nombre", 'nwr["industrial"="mine"]["name"]'),
               ("plataformas marinas con operador", 'nwr["man_made"="offshore_platform"]["operator"]'),
               ("minas (man_made=mineshaft|adit) con nombre y recurso", 'nwr["man_made"~"^(mineshaft|adit)$"]["resource"]["name"]')):
    els = overpass(f"[out:json][timeout:180];{sel};out count;")
    print("==", t, els[0].get("tags") if els else None); time.sleep(10)
els = overpass('[out:json][timeout:180];nwr["man_made"="offshore_platform"]["operator"];out tags;')
from collections import Counter
print("== operadores de plataformas (top 60)", Counter(e["tags"].get("operator") for e in els).most_common(60))
els = overpass('[out:json][timeout:180];nwr["landuse"="quarry"]["resource"~"lithium|copper|cobalt|nickel|rare_earth|graphite|uranium|gold|silver|iron_ore|coal|zinc"]["operator"];out tags;')
print("== operadores de minas (top 80)", Counter(e["tags"].get("operator") for e in els).most_common(80))
