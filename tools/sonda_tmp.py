import json, sys, time, urllib.parse, urllib.request
UA = "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
def get(u, origin=True):
    r = urllib.request.Request(u, headers={"User-Agent": UA, "Origin": "https://zoetzerlpetrov-gif.github.io", "Accept": "application/json"})
    with urllib.request.urlopen(r, timeout=90) as x:
        return x.headers.get("Access-Control-Allow-Origin"), json.loads(x.read())
q = open("tools/q.txt").read()
for iso, nombre in [("USA", "Estados Unidos"), ("MEX", "México"), ("CHN", "China"), ("FRA", "Francia")]:
    cors, os_ = get(f"https://es.wikipedia.org/w/api.php?action=opensearch&search={urllib.parse.quote('Historia de ' + nombre)}&limit=8&namespace=0&format=json&origin=*")
    print("\n##", iso, "opensearch CORS", cors, os_[1])
    t = next((x for x in os_[1] if x.lower().startswith("historia de")), None)
    if t:
        tt = urllib.parse.quote(t.replace(" ", "_"))
        cors, s = get(f"https://es.wikipedia.org/api/rest_v1/page/summary/{tt}"); print("summary CORS", cors, s.get("extract", "")[:200])
        cors, p = get(f"https://es.wikipedia.org/w/api.php?action=parse&page={tt}&prop=sections&redirects=1&format=json&origin=*")
        print("parse CORS", cors, [(x["toclevel"], x["line"]) for x in p["parse"]["sections"] if x["toclevel"] == 1])
    t0 = time.time()
    try:
      cors, r = get("https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(q.replace('"MEX"', f'"{iso}"')))
    except Exception as e:
      print("WIKIDATA ERROR", e, f"{time.time()-t0:.1f}s"); continue
    b = r["results"]["bindings"]
    print("wikidata CORS", cors, len(b), f"{time.time()-t0:.1f}s")
    for x in b[:: max(1, len(b)//40)]: print("  ", x["fecha"]["value"][:11], x.get("prec", {}).get("value"), x["eLabel"]["value"], "|", x.get("tipo", {}).get("value", ""), x["wikis"]["value"])
    time.sleep(2)
