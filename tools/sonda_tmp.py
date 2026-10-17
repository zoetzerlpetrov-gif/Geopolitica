import json, urllib.request
U = "https://geopolitica-vuelos.zoetzerl-petrov.workers.dev"
def pedir(path, origen, metodo="GET"):
    r = urllib.request.Request(U + path, headers={"Origin": origen, "User-Agent": "sonda-geopolitica"}, method=metodo)
    try:
        with urllib.request.urlopen(r, timeout=30) as x:
            return x.status, dict(x.headers), x.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()
O = "https://zoetzerlpetrov-gif.github.io"
s, h, b = pedir("/punto/19.5/-99.25/50", O)
d = json.loads(b) if s == 200 else {}
print("CDMX:", s, h.get("Access-Control-Allow-Origin"), len(d.get("ac", [])), "aviones")
print("campos:", sorted({k for a in d.get("ac", []) for k in a}))
print("ejemplo:", json.dumps(d.get("ac", [{}])[:2])[:400])
print("otro origen:", pedir("/punto/19.5/-99.25/50", "https://otro.com")[0])
print("ruta mala:", pedir("/v2/mil", O)[0])
print("preflight:", pedir("/punto/19.5/-99.25/50", O, "OPTIONS")[0])
