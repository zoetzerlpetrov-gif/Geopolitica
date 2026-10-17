import json, urllib.request, urllib.parse
UA = "Geopolitica-monitor (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
def pedir(u, h=None, metodo="GET"):
    r = urllib.request.Request(u, headers={"User-Agent": UA, **(h or {})}, method=metodo)
    with urllib.request.urlopen(r, timeout=60) as x:
        return x.status, dict(x.headers), x.read()
for u in ["https://api.adsb.lol/robots.txt", "https://adsb.lol/robots.txt"]:
    try:
        s, h, b = pedir(u); print(u, s, b[:600].decode("utf-8", "replace"))
    except Exception as e: print(u, e)
try:
    s, h, b = pedir("https://api.adsb.lol/v2/point/19.43/-99.13/60", {"Origin": "https://zoetzerlpetrov-gif.github.io"})
    d = json.loads(b); print("point", s, {k: v for k, v in h.items() if k.lower().startswith(("access-control", "x-rate", "ratelimit", "cache"))}, len(d.get("ac") or []), list(d.keys()))
    print(json.dumps((d.get("ac") or [{}])[0])[:500])
except Exception as e: print("point", e)
try:
    s, h, b = pedir("https://api.adsb.lol/v2/point/19.43/-99.13/60", {"Origin": "https://zoetzerlpetrov-gif.github.io", "Access-Control-Request-Method": "GET"}, "OPTIONS")
    print("options", s, {k: v for k, v in h.items() if k.lower().startswith("access-control")})
except Exception as e: print("options", e)
Q = """SELECT ?p ?pLabel ?seg ?yt WHERE {
  ?p wdt:P31 wd:Q5; p:P8687 ?st. ?st ps:P8687 ?seg; pq:P2397 ?yt.
  FILTER(?seg > 20000000)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
} ORDER BY DESC(?seg) LIMIT 30"""
try:
    s, h, b = pedir("https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(Q), {"Accept": "application/sparql-results+json"})
    for r in json.loads(b)["results"]["bindings"]:
        print(r["pLabel"]["value"], r["seg"]["value"], r["yt"]["value"])
except Exception as e: print("wikidata", e)
