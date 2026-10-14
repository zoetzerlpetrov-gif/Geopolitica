import json, sys, time, collections
sys.path.insert(0, "tools/historia")
import cronologia as C

def q(nombre, consulta):
    t0 = time.time()
    try:
        r = C.pedir(consulta, intentos=1)
        b = r["results"]["bindings"]
        print(f"== {nombre}: {len(b)} filas, {time.time()-t0:.1f} s")
        return b
    except Exception as e:
        print(f"== {nombre}: ERROR {e} ({time.time()-t0:.1f} s)")
        return []

b = q("clases de tratados con firmantes", """SELECT ?c ?l (COUNT(*) AS ?k) WHERE { ?t wdt:P1891 ?x . ?t wdt:P31 ?c . OPTIONAL { ?c rdfs:label ?l FILTER(lang(?l)="en") } } GROUP BY ?c ?l ORDER BY DESC(?k) LIMIT 25""")
for x in b: print(x["c"]["value"].rsplit("/",1)[-1], x.get("l",{}).get("value"), x["k"]["value"])

for clase in ["Q198", "Q8465", "Q180684", "Q350604", "Q21994376", "Q10931"]:
    b = q(f"participantes {clase}", f"""SELECT ?e ?iso ?n ?f WHERE {{ hint:Query hint:optimizer "None" . ?e wdt:P31 wd:{clase} . ?e wikibase:sitelinks ?n . FILTER(?n >= 8)
      ?e wdt:P710 ?pais . ?pais wdt:P298 ?iso . OPTIONAL {{ ?e wdt:P580 ?f }} }}""")
    c = collections.Counter(x["iso"]["value"] for x in b); print("  MEX", c.get("MEX"), "USA", c.get("USA"), "FRA", c.get("FRA"), "paises", len(c))

for clase in ["Q131569", "Q625298"]:
    b = q(f"firmantes {clase}", f"""SELECT ?e ?iso ?n WHERE {{ hint:Query hint:optimizer "None" . ?e wdt:P31 wd:{clase} . ?e wikibase:sitelinks ?n . FILTER(?n >= 3)
      ?e wdt:P1891 ?pais . ?pais wdt:P298 ?iso . }}""")
    c = collections.Counter(x["iso"]["value"] for x in b); print("  MEX", c.get("MEX"), "USA", c.get("USA"), "paises", len(c))

b = q("membresías", """SELECT ?iso ?org ?n ?desde WHERE { ?pais wdt:P298 ?iso ; p:P463 ?st . ?st ps:P463 ?org . OPTIONAL { ?st pq:P580 ?desde }
  ?org wikibase:sitelinks ?n . FILTER(?n >= 10) }""")
c = collections.Counter(x["iso"]["value"] for x in b); print("  MEX", c.get("MEX"), "USA", c.get("USA"), "paises", len(c))
print([x["org"]["value"].rsplit("/",1)[-1] for x in b if x["iso"]["value"]=="MEX"])
