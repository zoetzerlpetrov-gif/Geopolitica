import json, urllib.request, urllib.parse, io, zipfile, csv, time
UA = {"User-Agent": "Geopolitica-sonda/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"}
def get(u, t=60):
    with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=t) as r: return r.read()
g = json.loads(get("https://goldencopy.gleif.org/api/v2/golden-copies/publishes/latest"))
def ruta(o, p=""):
    if isinstance(o, dict):
        for k, v in o.items(): ruta(v, p + "/" + k)
    elif isinstance(o, str) and o.startswith("http"): print(p, o)
ruta(g)
r = json.loads(get("https://api.gleif.org/api/v1/lei-records?filter[entity.legalAddress.country]=MX&page[size]=1"))
print("MX legal:", r["meta"]["pagination"])
x = r["data"][0]; print(json.dumps(x.get("relationships"), indent=1)[:1500])
try:
    r = json.loads(get("https://api.gleif.org/api/v1/lei-records?filter[lei]=" + ",".join(["5493001KJTIIGC8Y1R12", "4469000001F2HU1FGR33"]) + "&page[size]=200")); print("filtro lei:", [d["id"] for d in r["data"]])
except Exception as e: print("filtro lei", e)
r = json.loads(get("https://api.gleif.org/api/v1/lei-records?" + urllib.parse.urlencode({"filter[fulltext]": "odis", "filter[entity.legalAddress.country]": "MX"})))
print("odis:", [d["attributes"]["entity"]["legalName"]["name"] for d in r["data"]])
q = 'SELECT ?e ?l WHERE { ?e rdfs:label ?l. FILTER(CONTAINS(LCASE(?l), "asversa")) } LIMIT 5'
try:
    print("wikidata asversa:", get("https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(q), 70)[:500])
except Exception as e: print("wd", e)
# Tamaño y columnas del archivo de relaciones
try:
    urls = [v for v in json.dumps(g).split('"') if v.startswith("http") and "-rr-" in v.lower() and "csv" in v.lower() and "golden-copy.csv" in v.lower()] or [v for v in json.dumps(g).split('"') if v.startswith("http") and "-rr" in v.lower() and "csv" in v.lower()]
    print("rr urls:", urls[:6])
    t = time.time(); b = get(urls[0], 300); print("rr bytes", len(b), round(time.time() - t, 1), "s")
    z = zipfile.ZipFile(io.BytesIO(b)); n = z.namelist()[0]; print(n)
    rd = csv.reader(io.TextIOWrapper(z.open(n), encoding="utf-8")); h = next(rd); print(h); print(next(rd)); print(sum(1 for _ in rd), "filas")
except Exception as e: print("rr", e)
