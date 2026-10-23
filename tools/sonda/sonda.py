"""Sonda temporal: clases de Wikidata para instalaciones militares (se borra antes del PR)."""
import json, urllib.parse, urllib.request
UA = "DOMINUS-OSINT/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
def q(s):
    u = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": s, "format": "json"})
    return json.loads(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=120).read())["results"]["bindings"]
etiquetas = ["military base", "air base", "naval base", "military airfield", "barracks", "military installation", "military facility",
             "army base", "air force base", "military headquarters", "nuclear weapons test site", "missile base", "military academy", "fortification"]
for e in etiquetas:
    try:
        for f in q(f'SELECT ?c WHERE {{ ?c rdfs:label "{e}"@en . }} LIMIT 5'):
            c = f["c"]["value"].rsplit("/", 1)[-1]
            n1 = q(f"SELECT (COUNT(*) AS ?n) WHERE {{ ?x wdt:P31 wd:{c} ; wdt:P625 ?p . }}")[0]["n"]["value"]
            n2 = q(f"SELECT (COUNT(DISTINCT ?x) AS ?n) WHERE {{ ?x wdt:P31/wdt:P279* wd:{c} ; wdt:P625 ?p . }}")[0]["n"]["value"]
            print(f"{e!r:32} {c:12} directos={n1:>6} con_subclases={n2:>6}")
    except Exception as ex:
        print(e, "ERROR", ex)
