"""Sonda temporal: identificadores y tamaños de consultas de Wikidata para empresas, bolsas y organismos."""
import json, time, urllib.parse, urllib.request
UA = "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
def q(s, t=90):
    t0 = time.time()
    try:
        u = "https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(s)
        r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA, "Accept": "application/sparql-results+json"}), timeout=t)
        d = json.loads(r.read())["results"]["bindings"]
        return d, round(time.time() - t0, 1)
    except Exception as e:
        return str(e)[:100], round(time.time() - t0, 1)
v = lambda b, k: b.get(k, {}).get("value", "")
ids = "Q786820 Q507619 Q22687 Q46970 Q1145276 Q18388277 Q1058914 Q2401749 Q11396180 Q1410560 Q15911738 Q5225895 Q1416704 Q7210356 Q2659904 Q1497649 Q1072491 Q4387609 Q163740 Q2385804"
d, s = q("SELECT ?x ?l WHERE { VALUES ?x { %s } ?x rdfs:label ?l FILTER(lang(?l)='en') }" % " ".join("wd:" + i for i in ids.split()))
print("etiquetas", s, [(v(b, "x").rsplit("/", 1)[-1], v(b, "l")) for b in d] if isinstance(d, list) else d)
# subclases de organismo internacional con más instancias con sede ubicada
d, s = q("""SELECT ?c ?cl (COUNT(DISTINCT ?o) AS ?n) WHERE { ?c wdt:P279 wd:Q484652 . ?o wdt:P31 ?c ; wdt:P159 ?h . ?h wdt:P625 ?co .
  FILTER NOT EXISTS { ?o wdt:P576 ?f } ?c rdfs:label ?cl FILTER(lang(?cl)='en') } GROUP BY ?c ?cl ORDER BY DESC(?n) LIMIT 40""")
print("subclases organismo", s, [(v(b, "c").rsplit("/", 1)[-1], v(b, "cl"), v(b, "n")) for b in d] if isinstance(d, list) else d)
d, s = q("""SELECT ?c ?cl (COUNT(DISTINCT ?o) AS ?n) WHERE { VALUES ?r { wd:Q11691 } ?c wdt:P279* ?r . ?o wdt:P31 ?c .
  FILTER NOT EXISTS { ?o wdt:P576 ?f } ?c rdfs:label ?cl FILTER(lang(?cl)='en') } GROUP BY ?c ?cl ORDER BY DESC(?n) LIMIT 20""")
print("clases bolsa", s, [(v(b, "c").rsplit("/", 1)[-1], v(b, "cl"), v(b, "n")) for b in d] if isinstance(d, list) else d)
d, s = q("""SELECT (COUNT(DISTINCT ?o) AS ?n) WHERE { ?o wdt:P31/wdt:P279* wd:Q11691 . FILTER NOT EXISTS { ?o wdt:P576 ?f }
  { ?o wdt:P625 ?c } UNION { ?o wdt:P159 ?h . ?h wdt:P625 ?c } }""")
print("bolsas con ubicación", s, d if not isinstance(d, list) else v(d[0], "n"))
d, s = q("""SELECT (COUNT(DISTINCT ?x) AS ?n) WHERE { ?x wdt:P414 ?b ; wdt:P159 ?h . ?h wdt:P625 ?c . FILTER NOT EXISTS { ?x wdt:P576 ?f } }""")
print("empresas que cotizan con sede ubicada", s, d if not isinstance(d, list) else v(d[0], "n"))
d, s = q("""SELECT ?x ?coord ?n WHERE { ?x wdt:P414 ?b ; wikibase:sitelinks ?n ; wdt:P159 ?h . ?h wdt:P625 ?coord . FILTER NOT EXISTS { ?x wdt:P576 ?f } } LIMIT 30000""", 120)
print("consulta completa cotizan", s, len(d) if isinstance(d, list) else d)
for pais in ["Q30", "Q148", "Q17", "Q183", "Q145", "Q142", "Q668", "Q155", "Q16", "Q29", "Q38", "Q884", "Q414", "Q739", "Q298", "Q419"]:
    d, s = q("""SELECT (COUNT(DISTINCT ?x) AS ?n) WHERE { VALUES ?c { wd:Q891723 wd:Q4830453 wd:Q783794 wd:Q6881511 wd:Q270791 wd:Q778575 wd:Q19644607 wd:Q1589009 wd:Q22687 wd:Q46970 }
      ?x wdt:P31 ?c ; wdt:P17 wd:%s ; wikibase:sitelinks ?n2 ; wdt:P159 ?h . ?h wdt:P625 ?co . FILTER(?n2 >= 3) }""" % pais)
    print("país", pais, s, d if not isinstance(d, list) else v(d[0], "n"))
    time.sleep(1)
