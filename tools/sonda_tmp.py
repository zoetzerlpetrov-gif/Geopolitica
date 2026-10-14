import json, os, re, sys, urllib.parse
sys.path.insert(0, "ingest")
import fuentes as F

def p(t, url, n=1500, robots=True):
    print(f"\n===== {t}: {url}")
    try:
        if robots: print("robots:", F.permitido_por_robots(url))
        b = F.get(url, timeout=90)
        print("bytes", len(b))
        print(b[:n].decode("utf-8", "replace"))
        return b
    except Exception as e:
        print("ERROR", e)

b = p("BIS SPP yoy real", "https://stats.bis.org/api/v1/data/WS_SPP/Q..R.771/all?startPeriod=2025-Q1&format=csv", 800)
if b:
    t = b.decode(); print("areas", sorted(set(re.findall(r"\n(?:[^,]*,){1}([A-Z0-9]{2}),", t)))[:80])
    import csv, io
    rows = list(csv.DictReader(io.StringIO(t))); print(rows[0].keys()); print(len(rows), sorted({r['REF_AREA'] for r in rows}), max(r['TIME_PERIOD'] for r in rows))
b = p("BIS CPP", "https://stats.bis.org/api/v1/data/WS_CPP/all/all?startPeriod=2025&format=csv", 1500)
if b:
    import csv, io
    rows = list(csv.DictReader(io.StringIO(b.decode()))); print(len(rows), sorted({r.get('REF_AREA') for r in rows}))
    for k in rows[0]:
        vals = {r[k] for r in rows}
        if len(vals) < 30: print(k, vals)
b = p("BIS DPP detailed", "https://stats.bis.org/api/v1/data/WS_DPP/all/all?startPeriod=2025&format=csv", 1200)
if b:
    import csv, io
    rows = list(csv.DictReader(io.StringIO(b.decode()))); print(len(rows), sorted({r.get('REF_AREA') for r in rows}))
    for k in rows[0]:
        vals = {r[k] for r in rows}
        if len(vals) < 40: print(k, sorted(vals))
b = p("GEIPAN data.gouv", "https://www.data.gouv.fr/api/1/datasets/?q=geipan&page_size=5", 200)
if b:
    for d in json.loads(b)["data"]:
        print("DS", d["title"], d["page"])
        for r in d["resources"]: print("   ", r["title"], r["format"], r["url"], r.get("filesize"))
for u in ["https://www.gob.mx/shf/documentos/indice-shf-de-precios-de-la-vivienda-en-mexico",
          "https://www.gob.mx/shf/es/archivo/documentos",
          "https://www.gob.mx/shf"]:
    b = p("SHF", u, 300)
    if b:
        print(sorted(set(re.findall(r'href="([^"]+)"', b.decode('utf-8','replace'))))[:200])
b = p("datos.gob.mx", "https://www.datos.gob.mx/busca/api/3/action/package_search?q=precios%20vivienda%20shf&rows=10", 300)
if b:
    try:
        for d in json.loads(b)["result"]["results"]:
            print("DS", d["title"]); [print("   ", r.get("name"), r.get("format"), r.get("url")) for r in d["resources"]]
    except Exception as e: print(e)
TIT = {"en": ["Hessdalen_lights", "Marfa_lights", "Brown_Mountain_lights", "Min_Min_light", "Naga_fireballs", "Paulding_Light",
       "Skinwalker_Ranch", "Area_51", "Wycliffe_Well", "Bonnybridge", "San_Luis_Valley", "Bermuda_Triangle", "Dragon's_Triangle",
       "Betz_mystery_sphere", "Buga_sphere", "Chilbolton_Observatory", "Milk_Hill", "Alton_Barnes", "Crop_circle", "Mount_Shasta",
       "Sedona,_Arizona", "Earthquake_light", "Bennington_Triangle", "Hoia_Baciu_Forest", "Bridgewater_Triangle", "Pine_Bush,_New_York",
       "Rachel,_Nevada", "Extraterrestrial_Highway", "GEIPAN", "All-domain_Anomaly_Resolution_Office", "Lake_Michigan_Triangle", "Kenya_space_debris_ring"],
       "es": ["Zona_del_Silencio", "Cerro_Uritorco", "San_Clemente_(Chile)", "Tepoztlán", "Esfera_de_Buga", "Capilla_del_Monte", "Valle_del_Elqui",
              "Ruta_del_OVNI", "Montaña_de_Tlaloc", "Marcahuasi", "Cerro_Pachacamac"]}
for lang, ts in TIT.items():
    for t in ts:
        u = f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(t)}"
        try:
            d = json.loads(F.get(u, timeout=30))
            print("WIKI", lang, t, "->", d.get("titles", {}).get("canonical"), d.get("coordinates"), d.get("content_urls", {}).get("desktop", {}).get("page"), "|", (d.get("description") or "")[:80])
        except Exception as e:
            print("WIKI", lang, t, "ERROR", e)
