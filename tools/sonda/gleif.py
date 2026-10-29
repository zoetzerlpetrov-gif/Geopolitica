import json, urllib.request, urllib.parse, io, zipfile, csv, time
UA = {"User-Agent": "Geopolitica-sonda/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"}
def get(u, t=60):
    with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=t) as r: return r.read()
g = json.loads(get("https://goldencopy.gleif.org/api/v2/golden-copies/publishes/latest"))
print(json.dumps(g, indent=1)[:3000])
r = json.loads(get("https://api.gleif.org/api/v1/lei-records?filter[entity.legalAddress.country]=MX&page[size]=1"))
print("MX legal:", r["meta"]["pagination"])
x = r["data"][0]; print(json.dumps(x, indent=1)[:2500])
r = json.loads(get("https://api.gleif.org/api/v1/lei-records?filter[entity.headquartersAddress.country]=MX&page[size]=1"))
print("MX hq:", r["meta"]["pagination"])
r = json.loads(get("https://api.gleif.org/api/v1/lei-records?" + urllib.parse.urlencode({"filter[fulltext]": "odis", "filter[entity.legalAddress.country]": "MX"})))
print("odis:", [d["attributes"]["entity"]["legalName"]["name"] for d in r["data"]])
q = 'SELECT ?e ?l WHERE { ?e rdfs:label ?l. FILTER(CONTAINS(LCASE(?l), "asversa")) } LIMIT 5'
try:
    print("wikidata asversa:", get("https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(q), 70)[:500])
except Exception as e: print("wd", e)
# Tamaño y columnas del archivo de relaciones
try:
    urls = [v for v in json.dumps(g).split('"') if v.startswith("http") and "rr" in v.lower() and "csv" in v.lower()]
    print("rr urls:", urls[:6])
    t = time.time(); b = get(urls[0], 300); print("rr bytes", len(b), round(time.time() - t, 1), "s")
    z = zipfile.ZipFile(io.BytesIO(b)); n = z.namelist()[0]; print(n)
    rd = csv.reader(io.TextIOWrapper(z.open(n), encoding="utf-8")); h = next(rd); print(h); print(next(rd)); print(sum(1 for _ in rd), "filas")
except Exception as e: print("rr", e)
