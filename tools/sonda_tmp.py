import json, time, urllib.request
U = "https://geopolitica-vuelos.zoetzerl-petrov.workers.dev"
O = "https://zoetzerlpetrov-gif.github.io"
def pedir(path, origen=O):
    r = urllib.request.Request(U + path, headers={"Origin": origen, "User-Agent": "sonda-geopolitica"})
    try:
        with urllib.request.urlopen(r, timeout=40) as x:
            return x.status, dict(x.headers), x.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()
for path in ["/punto/19.5/-99.25/50", "/punto/40.75/-73.75/100", "/punto/51.5/0/25"]:
    s, h, b = pedir(path)
    try:
        d = json.loads(b)
    except ValueError:
        d = {"crudo": b[:200]}
    print(path, s, h.get("Access-Control-Allow-Origin"), len(d.get("ac", [])), "aviones; restantes:", d.get("restantes"), d.get("error", ""))
    if d.get("ac"):
        print("  ejemplo:", json.dumps(d["ac"][0]))
    time.sleep(2)
print("otro origen:", pedir("/punto/19.5/-99.25/50", "https://otro.com")[0])
