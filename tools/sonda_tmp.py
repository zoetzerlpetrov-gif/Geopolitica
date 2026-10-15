import json, re, sys, time, urllib.parse, urllib.request
UA = "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica; sonda)"
def get(url, data=None, timeout=60, h=None):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, **(h or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

print("===== 1) GIBS colormaps")
for capa in ["OMPS_NOAA20_SO2_Planetary_Boundary_Layer", "OMPS_Aerosol_Index"]:
    for v in ("v1.3", "v1.2"):
        try:
            x = get(f"https://gibs.earthdata.nasa.gov/colormaps/{v}/{capa}.xml").decode()
            ents = re.findall(r'<ColorMapEntry[^>]*>', x)
            print(capa, v, len(ents), "entradas")
            for e in ents[:: max(1, len(ents)//14)]: print("   ", e)
            print("   ", ents[-1])
            print("   leyenda:", re.findall(r'<LegendEntry[^>]*>', x)[:20])
            break
        except Exception as e:
            print(capa, v, "ERR", e)

print("===== 2) webcamsdemexico")
for u in ["https://webcamsdemexico.com/robots.txt", "https://webcamsdemexico.com/terminos-y-condiciones/", "https://webcamsdemexico.com/aviso-legal/",
          "https://webcamsdemexico.com/terminos/", "https://webcamsdemexico.com/webcams/playas/"]:
    try:
        x = get(u).decode("utf-8", "replace")
        print("--", u, len(x))
        if "robots" in u: print(x[:1500])
        elif "webcams/" in u:
            print(re.findall(r'href="(https://webcamsdemexico\.com/webcam/[^"]+)"', x)[:15])
            print(len(set(re.findall(r'href="(https://webcamsdemexico\.com/webcam/[^"]+)"', x))), "enlaces de cámara")
        else:
            t = re.sub(r"<[^>]+>", " ", x); t = re.sub(r"\s+", " ", t)
            for kw in ["reproduc", "copi", "insert", "embed", "uso", "propiedad", "prohib", "autoriz"]:
                for m in re.finditer(kw, t, re.I):
                    print("   ...", t[max(0, m.start()-150): m.start()+200]); break
    except Exception as e:
        print("--", u, "ERR", e)
try:
    x = get("https://webcamsdemexico.com/webcams/playas/").decode("utf-8", "replace")
    cams = sorted(set(re.findall(r'href="(https://webcamsdemexico\.com/webcam/[^"]+)"', x)))
    if cams:
        y = get(cams[0]).decode("utf-8", "replace")
        print("CAM", cams[0], len(y))
        for pat in [r'<iframe[^>]+>', r'(https?://[^"\'\s]+\.m3u8[^"\'\s]*)', r'youtube\.com/embed/[^"\'\s]+', r'"latitude"[^,]+,[^,]+', r'geo\.position[^>]+>', r'ICBM[^>]+>', r'lat[^a-z][^,]{0,30}', r'<video[^>]+>', r'player[^"\']{0,80}']:
            print("  ", pat, re.findall(pat, y)[:4])
except Exception as e:
    print("cam ERR", e)

print("===== 3) Wikidata turismo")
def sparql(q):
    return json.loads(get("https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": q, "format": "json"}), timeout=90))["results"]["bindings"]
for q in ["Pueblo Mágico", "Pueblos Mágicos", "cenote", "historic centre"]:
    try:
        r = json.loads(get("https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode({"action": "wbsearchentities", "search": q, "language": "es", "format": "json", "limit": 5})))
        print(q, [(s["id"], s.get("label"), s.get("description")) for s in r["search"]])
    except Exception as e: print(q, "ERR", e)
for qid, nombre, n in [("Q33506", "museo", 5), ("Q839954", "sitio arqueológico", 3), ("Q40080", "playa", 2), ("Q34038", "cascada", 3), ("Q35509", "cueva", 4),
                       ("Q194195", "parque de diversiones", 3), ("Q43501", "zoológico", 3), ("Q2281788", "acuario", 3), ("Q23413", "castillo", 6), ("Q16560", "palacio", 6),
                       ("Q4989906", "monumento", 6), ("Q1054444", "cenote?", 1), ("Q570116", "atracción ≥2", 2), ("Q46169", "parque nacional ≥2", 2), ("Q2065736", "patrimonio cultural?", 8)]:
    t0 = time.time()
    try:
        r = sparql(f'SELECT (COUNT(?x) AS ?c) (SUM(IF(?iso="MEX",1,0)) AS ?mx) WHERE {{ ?x wdt:P31 wd:{qid} ; wikibase:sitelinks ?n ; wdt:P625 ?k . FILTER(?n >= {n}) OPTIONAL {{ ?x wdt:P17 ?p . ?p wdt:P298 ?iso }} }}')
        print(nombre, qid, f">={n}", r[0]["c"]["value"], "MX", r[0].get("mx", {}).get("value"), f"{time.time()-t0:.1f}s")
    except Exception as e: print(nombre, "ERR", e)
    time.sleep(1)

print("===== 4) Overpass por religión (out count)")
for rel in ["christian", "muslim", "buddhist", "hindu", "shinto", "jewish", "sikh", "taoist", "jain", "bahai", "satanism", "pagan", "voodoo", "spiritualist", "zoroastrian", "unitarian_universalist", "scientologist", "animist", "multifaith"]:
    t0 = time.time()
    try:
        q = f'[out:json][timeout:300];nwr["amenity"="place_of_worship"]["religion"="{rel}"];out count;'
        r = json.loads(get("https://overpass-api.de/api/interpreter", data=urllib.parse.urlencode({"data": q}).encode(), timeout=330))
        print(rel, r["elements"][0]["tags"], f"{time.time()-t0:.0f}s")
    except Exception as e: print(rel, "ERR", e, f"{time.time()-t0:.0f}s")
    time.sleep(3)
