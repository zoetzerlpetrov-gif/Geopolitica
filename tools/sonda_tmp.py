import json, time, urllib.request, urllib.parse
UA = "Geopolitica-monitor (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
O = {"Origin": "https://zoetzerlpetrov-gif.github.io"}
def pedir(u, h=None):
    r = urllib.request.Request(u, headers={"User-Agent": UA, **(h or {})})
    with urllib.request.urlopen(r, timeout=60) as x:
        return x.status, dict(x.headers), x.read()
for u in ["https://opensky-network.org/api/states/all?lamin=19&lomin=-100&lamax=20&lomax=-98",
          "https://opendata.adsb.fi/api/v2/lat/19.43/lon/-99.13/dist/60",
          "https://api.airplanes.live/v2/point/19.43/-99.13/60",
          "https://opensky-network.org/robots.txt", "https://opendata.adsb.fi/robots.txt", "https://api.airplanes.live/robots.txt", "https://airplanes.live/robots.txt"]:
    try:
        s, h, b = pedir(u, O)
        print("==", u, s, {k: v for k, v in h.items() if k.lower().startswith(("access-control", "x-rate", "ratelimit"))})
        print(b[:300].decode("utf-8", "replace").replace("\n", " | "))
    except Exception as e: print("==", u, e)
    time.sleep(1.5)
Q = """SELECT ?p ?pLabel ?seg ?yt WHERE {
  ?p p:P8687 ?st. ?st ps:P8687 ?seg; pq:P2397 ?yt.
  FILTER(?seg > 50000000)
  ?p wdt:P31 wd:Q5.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
} LIMIT 60"""
for i in range(3):
    try:
        s, h, b = pedir("https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(Q), {"Accept": "application/sparql-results+json"})
        rs = json.loads(b)["results"]["bindings"]
        print("wikidata", len(rs))
        for r in sorted(rs, key=lambda r: -int(float(r["seg"]["value"])))[:25]:
            print(r["pLabel"]["value"], r["seg"]["value"], r["yt"]["value"])
        break
    except Exception as e:
        print("wikidata", e); time.sleep(10)
