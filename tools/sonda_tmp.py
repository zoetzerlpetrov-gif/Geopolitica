import json, time, urllib.request, urllib.parse
UA = "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
def sparql(q):
    r = urllib.request.Request("https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(q), headers={"User-Agent": UA, "Accept": "application/sparql-results+json"})
    t = time.time()
    with urllib.request.urlopen(r, timeout=120) as x:
        d = json.loads(x.read())["results"]["bindings"]
    print(f"  ({len(d)} filas, {time.time()-t:.0f} s)")
    return d
QS = {
"youtubers": """SELECT ?p ?pLabel ?seg ?yt ?paisLabel WHERE {
  ?p wdt:P106 wd:Q17125263; p:P8687 ?st. ?st ps:P8687 ?seg; pq:P2397 ?yt.
  FILTER(?seg > 30000000)
  OPTIONAL { ?p wdt:P27 ?pais. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
}""",
"tiktok": """SELECT ?p ?pLabel ?seg ?tk WHERE {
  ?st pq:P7085 ?tk; ps:P8687 ?seg. FILTER(?seg > 40000000)
  ?p p:P8687 ?st.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
}""",
"instagram": """SELECT ?p ?pLabel ?seg ?ig WHERE {
  ?st pq:P2003 ?ig; ps:P8687 ?seg. FILTER(?seg > 100000000)
  ?p p:P8687 ?st.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
}""",
}
for k, q in QS.items():
    print("==", k)
    try:
        rs = sparql(q)
        for r in sorted(rs, key=lambda r: -int(float(r["seg"]["value"])))[:15]:
            print("  ", {a: b["value"] for a, b in r.items() if a != "p"})
    except Exception as e:
        print("  error", e)
    time.sleep(5)
