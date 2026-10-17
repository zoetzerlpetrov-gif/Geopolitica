import json, time, urllib.request, urllib.parse
UA = "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"
def get(u, t=90):
    r = urllib.request.Request(u, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(r, timeout=t) as x:
        return json.loads(x.read())
def sparql(q):
    return get("https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(q), 120)["results"]["bindings"]
TERMS = ["embassy", "consulate", "consulate general", "diplomatic mission", "high commission", "permanent mission",
         "research institute", "medical research institute", "laboratory", "research center", "astronomical observatory",
         "research station", "scientific organization", "national laboratory", "biomedical research institute",
         "desalination plant", "pharmaceutical company", "biotechnology company", "pharmaceutical manufacturing plant",
         "intergovernmental organization", "international organization", "international non-governmental organization",
         "specialized agency of the United Nations", "regional organization"]
qids = {}
for t in TERMS:
    try:
        d = get("https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=3&search=" + urllib.parse.quote(t))
        qids[t] = [(x["id"], x.get("label"), (x.get("description") or "")[:60]) for x in d.get("search", [])]
        print(t, "→", qids[t])
    except Exception as e:
        print(t, e)
    time.sleep(0.5)
print("--- conteos (P31 directo, con coordenada P625 | con sede P159 con coordenada)")
for t, lst in qids.items():
    for q, lab, _ in lst[:2]:
        try:
            a = sparql(f"SELECT (COUNT(DISTINCT ?x) AS ?n) WHERE {{ ?x wdt:P31 wd:{q}; wdt:P625 ?c. }}")[0]["n"]["value"]
            b = sparql(f"SELECT (COUNT(DISTINCT ?x) AS ?n) WHERE {{ ?x wdt:P31 wd:{q}; wdt:P159/wdt:P625 ?c. }}")[0]["n"]["value"]
            mx = sparql(f"SELECT (COUNT(DISTINCT ?x) AS ?n) WHERE {{ ?x wdt:P31 wd:{q}; wdt:P17 wd:Q96. }}")[0]["n"]["value"]
            print(f"{t:45s} {q:12s} {lab[:35]:35s} coord={a:>6} sede={b:>6} México={mx:>5}")
        except Exception as e:
            print(t, q, "error", e)
        time.sleep(1)
print("--- empresas de México (P17 Q96 o sede en México) con sede con coordenada, por sitelinks")
for n in (1, 2, 4):
    try:
        r = sparql(f"SELECT (COUNT(DISTINCT ?x) AS ?n) WHERE {{ ?x wdt:P31/wdt:P279* wd:Q4830453; wdt:P17 wd:Q96; wikibase:sitelinks ?s; wdt:P159/wdt:P625 ?c. FILTER(?s >= {n}) }}")
        print("empresas MX sitelinks>=", n, r[0]["n"]["value"])
    except Exception as e:
        print("empresas MX", n, e)
