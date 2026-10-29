import gzip, json, math, os, sys, urllib.request, urllib.parse
sys.path.insert(0, "tools/capas")
import construir as C
UA = C.UA
def km(c):
    t = 0
    for (a, b), (x, y) in zip(c, c[1:]):
        p1, p2 = math.radians(b), math.radians(y); dl = math.radians(x - a)
        t += 6371 * math.acos(min(1, max(-1, math.sin(p1)*math.sin(p2) + math.cos(p1)*math.cos(p2)*math.cos(dl))))
    return t
def region(lon, lat):
    if lon < -100 or lon > 120: return "Pacífico"
    if -100 <= lon < 20 and lat > -60: return "Atlántico/Caribe/Mediterráneo-oeste"
    if 20 <= lon <= 120: return "Índico/Mediterráneo-este/Asia"
    return "otra"
fs = [json.loads(x) for x in gzip.open(C.ruta_crudo("cables_osm"), "rt") if x.strip()]
res = {}
for f in fs:
    c = f["geometry"]["coordinates"]; lon, lat = c[len(c)//2]
    r = res.setdefault(region(lon, lat), [0, 0.0, 0]); r[0] += 1; L = km(c); r[1] += L; r[2] += L > 500
print("OSM por región: tramos, km totales, tramos >500 km")
for k, v in res.items(): print(f"  {k}: {v[0]} tramos, {v[1]:,.0f} km, {v[2]} largos")
print("OSM total km:", round(sum(km(f["geometry"]["coordinates"]) for f in fs)))
# TeleGeography (lo que ya tenemos, solo para comparar): crudo si existe
tg = C.ruta_crudo("cables")
print("crudo TeleGeography:", os.path.exists(tg))
# Wikidata: clase «submarine communications cable»
def sparql(q):
    req = urllib.request.Request("https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(q), headers={"User-Agent": UA})
    return json.loads(urllib.request.urlopen(req, timeout=120).read())["results"]["bindings"]
try:
    cl = sparql('SELECT ?c ?l WHERE { ?c rdfs:label "submarine communications cable"@en . OPTIONAL{?c rdfs:label ?l FILTER(lang(?l)="es")} }')
    print("clase:", [(x["c"]["value"], x.get("l", {}).get("value")) for x in cl])
    for x in cl[:1]:
        q = x["c"]["value"].rsplit("/", 1)[1]
        r = sparql(f'''SELECT (COUNT(DISTINCT ?x) AS ?n) (COUNT(DISTINCT ?conTerm) AS ?t) (COUNT(DISTINCT ?conCoord) AS ?k) (COUNT(DISTINCT ?conPais) AS ?p) WHERE {{
          ?x wdt:P31/wdt:P279* wd:{q} .
          OPTIONAL {{ ?x wdt:P559|wdt:P1427|wdt:P1444 ?term . BIND(?x AS ?conTerm) }}
          OPTIONAL {{ ?x wdt:P625 ?co . BIND(?x AS ?conCoord) }}
          OPTIONAL {{ ?x wdt:P17 ?pa . BIND(?x AS ?conPais) }} }}''')
        print("cables en Wikidata:", r[0]["n"]["value"], "con extremos (P559/P1427/P1444):", r[0]["t"]["value"], "con coordenada:", r[0]["k"]["value"], "con país:", r[0]["p"]["value"])
        r = sparql(f'''SELECT ?x ?xLabel (COUNT(?term) AS ?n) WHERE {{ ?x wdt:P31/wdt:P279* wd:{q} . ?x wdt:P559|wdt:P1427|wdt:P1444 ?term .
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }} }} GROUP BY ?x ?xLabel ORDER BY DESC(?n) LIMIT 15''')
        print("ejemplos con extremos:", [(y["xLabel"]["value"], y["n"]["value"]) for y in r])
        r = sparql(f'''SELECT ?p (COUNT(DISTINCT ?x) AS ?n) WHERE {{ ?x wdt:P31/wdt:P279* wd:{q} . ?x ?p ?v . FILTER(STRSTARTS(STR(?p), "http://www.wikidata.org/prop/direct/")) }} GROUP BY ?p ORDER BY DESC(?n) LIMIT 25''')
        print("propiedades más usadas:", [(y["p"]["value"].rsplit("/",1)[1], y["n"]["value"]) for y in r])
except Exception as e:
    print("wikidata ERR", e)
