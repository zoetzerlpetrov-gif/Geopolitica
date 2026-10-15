import json, re, sys, time, urllib.parse, urllib.request
UA = "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica; sonda)"
def get(url, timeout=60):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=timeout) as r:
        return r.read()

print("===== 1) GIBS SO2")
cap = get("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml", 120).decode()
for m in re.finditer(r"<ows:Identifier>([^<]*SO2[^<]*)</ows:Identifier>", cap):
    ini = m.start(); bloque = cap[ini: cap.find("</Layer>", ini)]
    print(m.group(1), re.findall(r'xlink:href="([^"]*colormaps[^"]*)"', bloque)[:3])
for nombre in ["OMPS_NOAA20_SO2_Planetary_Boundary_Layer", "OMPS_SO2_Planetary_Boundary_Layer", "OMPS_NPP_SO2_Planetary_Boundary_Layer"]:
    for v in ("v1.3", "v1.2", "v1.0"):
        try:
            x = get(f"https://gibs.earthdata.nasa.gov/colormaps/{v}/{nombre}.xml").decode(); print("OK", v, nombre)
            ents = re.findall(r'<ColorMapEntry[^>]*>', x); print(len(ents))
            for e in ents[:: max(1, len(ents)//16)]: print("   ", e)
            print("   ", ents[-1]); break
        except Exception as e: pass

print("===== 2) webcamsdemexico: categorías")
for cat in ["cdmx", "pueblos-magicos", "playas", "volcanes", "panoramicas"]:
    x = get(f"https://webcamsdemexico.com/webcams/{cat}/").decode("utf-8", "replace")
    main = x[x.find("<main"): x.find("</main>")] if "<main" in x else x
    links = []
    for u in re.findall(r'href="(https://webcamsdemexico\.com/webcam/[^"]+)"', main):
        if u not in links: links.append(u)
    print(cat, len(x), "main", len(main), "cámaras en main:", len(links), links[:6])
    if cat == "cdmx":
        i = main.find(links[0]) if links else 0
        print("   HTML alrededor:", re.sub(r"\s+", " ", main[max(0, i-600): i+600]))
    time.sleep(2)
print("===== 3) una cámara")
for u in ["https://webcamsdemexico.com/webcam/acapulco-condesa/", "https://webcamsdemexico.com/webcam/volcan-popocatepetl/"]:
    try:
        y = get(u).decode("utf-8", "replace")
        t = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", y); t = re.sub(r"<[^>]+>", " ", t); t = re.sub(r"\s+", " ", t)
        print(u, re.findall(r'youtube\.com/embed/([\w-]+)', y)[:2], "| title:", re.findall(r"<title>([^<]+)", y)[:1])
        print("   og:", re.findall(r'<meta property="og:(title|description)" content="([^"]+)"', y)[:2])
        print("   breadcrumb/estado:", re.findall(r'(?:Estado|Ubicaci[oó]n|Municipio)[^<]{0,80}', y)[:4])
        i = t.find("Acapulco") if "acapulco" in u else t.find("Popocat")
        print("   texto:", t[i: i+500])
    except Exception as e: print(u, "ERR", e)
    time.sleep(2)
try:
    sm = get("https://webcamsdemexico.com/wp-sitemap.xml").decode(); print("sitemap:", re.findall(r"<loc>([^<]+)</loc>", sm))
except Exception as e: print("sitemap ERR", e)

print("===== 4) Wikidata")
def sparql(q):
    return json.loads(get("https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": q, "format": "json"}), 90))["results"]["bindings"]
for nombre, q in [("PM P1435", "SELECT (COUNT(?x) AS ?c) WHERE { ?x wdt:P1435 wd:Q268998 ; wdt:P625 ?k }"),
                  ("PM P31", "SELECT (COUNT(?x) AS ?c) WHERE { ?x wdt:P31 wd:Q268998 ; wdt:P625 ?k }"),
                  ("PM cualquier", "SELECT ?p (COUNT(?x) AS ?c) WHERE { ?x ?p wd:Q268998 } GROUP BY ?p"),
                  ("museo>=6", "SELECT (COUNT(?x) AS ?c) WHERE { ?x wdt:P31 wd:Q33506 ; wikibase:sitelinks ?n ; wdt:P625 ?k . FILTER(?n >= 6) }"),
                  ("centro hist>=3", "SELECT (COUNT(?x) AS ?c) WHERE { ?x wdt:P31 wd:Q676050 ; wikibase:sitelinks ?n ; wdt:P625 ?k . FILTER(?n >= 3) }"),
                  ("cenote", "SELECT (COUNT(?x) AS ?c) WHERE { ?x wdt:P31 wd:Q334743 ; wdt:P625 ?k }")]:
    try: print(nombre, [{k: v["value"] for k, v in r.items()} for r in sparql(q)][:8])
    except Exception as e: print(nombre, "ERR", e)
    time.sleep(1)
