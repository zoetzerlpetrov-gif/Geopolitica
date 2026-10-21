"""Sonda temporal: prueba DENUE, Banxico, GLEIF, Wikidata y YouTube en vivo. No imprime llaves."""
import json, os, sys, time, urllib.parse, urllib.request
sys.path.insert(0, "tools/capas")
UA = "Geopolitica-monitor (sonda)"

def get(url, headers=None, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, dict(r.headers), r.read()

def tapa(s, llave):
    return s.replace(llave, "***") if llave else s

def probar(nombre, f):
    t = time.time()
    try:
        f()
    except Exception as e:  # noqa: BLE001
        print(f"[{nombre}] ERROR {type(e).__name__}: {tapa(str(e), os.environ.get('INEGI_DENUE_API_KEY',''))[:300]}")
    print(f"[{nombre}] {time.time()-t:.1f}s\n")

def denue():
    k = os.environ.get("INEGI_DENUE_API_KEY", "")
    print("llave denue presente:", bool(k), len(k))
    for estr in ("7", "6"):
        u = f"https://www.inegi.org.mx/app/api/denue/v1/consulta/BuscarAreaActEstr/09/0/0/0/0/0/0/0/0/0/1/5/0/{estr}/{k}"
        st, h, b = get(u)
        d = json.loads(b)
        print("estrato", estr, st, type(d), len(d) if isinstance(d, list) else str(d)[:200])
        if isinstance(d, list) and d:
            print(json.dumps(d[0], ensure_ascii=False)[:700])
    # cuántos hay en total (registro final grande)
    u = f"https://www.inegi.org.mx/app/api/denue/v1/consulta/BuscarAreaActEstr/09/0/0/0/0/0/0/0/0/0/1/5000/0/7/{k}"
    st, h, b = get(u, timeout=120); d = json.loads(b)
    print("CDMX estrato 7 (hasta 5000):", len(d) if isinstance(d, list) else str(d)[:200])
    u = f"https://www.inegi.org.mx/app/api/denue/v1/consulta/BuscarAreaActEstr/00/0/0/0/0/0/0/0/0/0/1/10/0/7/{k}"
    try:
        st, h, b = get(u, timeout=120); d = json.loads(b); print("nacional 00:", len(d) if isinstance(d, list) else str(d)[:200])
    except Exception as e:
        print("nacional 00 falla:", tapa(str(e), k)[:200])

def banxico():
    k = os.environ.get("BANXICO_API_KEY", "")
    print("llave banxico presente:", bool(k), len(k))
    for serie in ("SF43718", "SF43936", "SP1", "SF61745", "SF60648"):
        st, h, b = get(f"https://www.banxico.org.mx/SieAPIRest/service/v1/series/{serie}/datos/oportuno", headers={"Bmx-Token": k, "Accept": "application/json"})
        d = json.loads(b)
        s = d["bmx"]["series"][0]
        print(serie, s.get("titulo", "")[:90], s.get("datos", [])[-1:])

def gleif():
    st, h, b = get("https://api.gleif.org/api/v1/lei-records?filter%5Bfulltext%5D=CEMEX&page%5Bsize%5D=2", headers={"Origin": "https://example.org"})
    print(st, "CORS:", h.get("Access-Control-Allow-Origin"))
    d = json.loads(b)
    for r in d["data"]:
        a = r["attributes"]; print(r["id"], a["entity"]["legalName"]["name"], a["entity"]["jurisdiction"], a["entity"]["legalAddress"].get("city"))
    print("relaciones:", list(d["data"][0].get("relationships", {}).keys()))

def wikidata():
    q = """SELECT ?x ?n ?emp ?ing ?ingU ?cap ?bolsa WHERE { VALUES ?x { wd:Q312 wd:Q2283 wd:Q131317 } ?x wikibase:sitelinks ?n .
      OPTIONAL { ?x wdt:P1128 ?emp } OPTIONAL { ?x p:P2139/psv:P2139 [wikibase:quantityAmount ?ing; wikibase:quantityUnit ?ingU] }
      OPTIONAL { ?x wdt:P2226 ?cap } OPTIONAL { ?x wdt:P414 ?bolsa } }"""
    st, h, b = get("https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(q), headers={"Accept": "application/sparql-results+json"})
    d = json.loads(b)
    print(len(d["results"]["bindings"]), json.dumps(d["results"]["bindings"][:2])[:600])

def youtube():
    k = os.environ.get("YOUTUBE_API_KEY", "")
    import youtube_vivo as Y
    ciudades = Y.Ciudades(json.load(open("config/ciudades.json", encoding="utf-8"))["ciudades"])
    cams = Y.camaras(k, ciudades, busquedas=["live cam", "webcam en vivo"])
    print("cámaras:", len(cams), "con ubicación del canal:", sum(1 for c in cams if not c["aprox"]))
    from collections import Counter
    print(Counter(c["st"] for c in cams), Counter(c["pais"] for c in cams).most_common(10))
    for c in cams[:8]:
        print(" ", c["titulo"][:70], c["lat"], c["lon"], c["aprox"], c["lugar"])

for n, f in [("denue", denue), ("banxico", banxico), ("gleif", gleif), ("wikidata", wikidata), ("youtube", youtube)]:
    probar(n, f)
