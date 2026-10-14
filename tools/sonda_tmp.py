import json, os, re, sys, urllib.parse, csv, io
sys.path.insert(0, "ingest")
import fuentes as F

def p(t, url, n=600, robots=True):
    print(f"\n===== {t}: {url}")
    try:
        if robots: print("robots:", F.permitido_por_robots(url))
        b = F.get(url, timeout=90)
        print("bytes", len(b)); print(b[:n].decode("utf-8", "replace"))
        return b
    except Exception as e:
        print("ERROR", e)

for u in ["https://www.gob.mx/shf/documentos/indicadores-sociedad-hipotecaria-federal",
          "https://www.gob.mx/shf/documentos/fuente-de-datos-de-indicadores-de-shf"]:
    b = p("SHF", u, 200)
    if b:
        print([h for h in set(re.findall(r'href="([^"]+)"', b.decode('utf-8','replace'))) if re.search(r'xls|csv|zip|attachment|file|precio|indice', h, re.I)])
        txt = re.sub(r"<[^>]+>", " ", b.decode('utf-8','replace')); print(re.sub(r"\s+", " ", txt)[2000:5000])
# BIS: títulos de las series comerciales y detalladas, para clasificar por tipo de inmueble
for ds in ["WS_CPP", "WS_DPP"]:
    b = F.get(f"https://stats.bis.org/api/v1/data/{ds}/all/all?startPeriod=2025&format=csv", timeout=120)
    rows = list(csv.DictReader(io.StringIO(b.decode())))
    ser = {}
    for r in rows:
        k = (r["FREQ"], r["REF_AREA"], r["COVERED_AREA"], r["RE_TYPE"], r["RE_VINTAGE"], r["COMPILING_ORG"], r["PRICED_UNIT"], r["ADJUST_CODED"])
        ser.setdefault(k, (r["TITLE_GRP"], r["UNIT_MEASURE"], r["MEASURE_DETAIL"], r["TIME_PERIOD"]))
    print(f"\n### {ds}: {len(ser)} series")
    for k, v in sorted(ser.items()):
        if ds == "WS_DPP" and k[1] not in ("MX", "US", "ES", "CO", "AR", "CL", "BR", "PE", "DE", "GB", "CA", "FR", "JP"): continue
        print("|".join(k), "::", v[0][:150], "::", v[1], v[2][:30])
for u in ["https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=Buga%20sphere&format=json",
          "https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=esfera%20Buga&format=json",
          "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=Mukuku%20ring%20space%20debris&format=json",
          "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=Hoia%20Baciu&format=json",
          "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=Stonehenge%20Julia%20Set%20crop%20formation&format=json",
          "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=Doug%20Bower%20Dave%20Chorley&format=json"]:
    try:
        d = json.loads(F.get(u, timeout=30)); print("\nSEARCH", u.split("srsearch=")[1], [x["title"] for x in d["query"]["search"][:6]])
    except Exception as e: print("SEARCH ERR", e)
p("GEIPAN robots", "https://www.cnes-geipan.fr/robots.txt", 1500, robots=False)
p("GEIPAN cas", "https://www.cnes-geipan.fr/fr/recherche/cas", 300)
p("data.gouv ovni", "https://www.data.gouv.fr/api/1/datasets/?q=ovni&page_size=5", 1500)
p("planetsig", "https://raw.githubusercontent.com/planetsig/ufo-reports/master/csv-data/ufo-scrubbed-geocoded-time-standardized.csv", 600, robots=False)
p("planetsig readme", "https://raw.githubusercontent.com/planetsig/ufo-reports/master/README.md", 3000, robots=False)
