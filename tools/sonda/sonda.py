"""Sonda temporal del Lote F2: conteos en OSM, robots y respuesta de FAOSTAT y Banco Mundial (se borra antes del PR)."""
import json, time, urllib.parse, urllib.request, urllib.robotparser
UA = "DOMINUS-OSINT/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"

def get(url, t=60):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=t) as r:
        return r.status, r.read()

for base in ("https://fenixservices.fao.org", "https://www.fao.org", "https://api.worldbank.org"):
    rp = urllib.robotparser.RobotFileParser(base + "/robots.txt")
    try:
        rp.read(); print("robots", base, rp.can_fetch(UA, base + "/faostat/api/v1/en/data/QCL"))
    except Exception as e:
        print("robots", base, e)
for url in ("https://fenixservices.fao.org/faostat/api/v1/en/data/QCL?area=138&element=2510&item=56&year=2023&format=json",
            "https://fenixservices.fao.org/faostat/api/v1/en/definitions/domain/QCL/item?format=json",
            "https://bulks-faostat.fao.org/production/Production_Crops_Livestock_E_All_Data_(Normalized).zip",
            "https://api.worldbank.org/v2/country/all/indicator/NV.AGR.TOTL.ZS?format=json&mrnev=1&per_page=400",
            "https://api.worldbank.org/v2/country/all/indicator/SL.AGR.EMPL.ZS?format=json&mrnev=1&per_page=400"):
    try:
        t0 = time.time(); st, b = get(url, 90)
        print("==", url[:100], st, len(b), f"{time.time()-t0:.0f}s", b[:300])
    except Exception as e:
        print("==", url[:100], "ERROR", e)

def count(sel):
    q = f"[out:json][timeout:170];{sel};out count;"
    for url in ("https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"):
        try:
            req = urllib.request.Request(url, data=urllib.parse.urlencode({"data": q}).encode(), headers={"User-Agent": UA})
            t0 = time.time()
            with urllib.request.urlopen(req, timeout=190) as r:
                return json.loads(r.read())["elements"][0]["tags"], f"{time.time()-t0:.0f}s"
        except Exception as e:
            print("   ", url, e)
    return None
for t, sel in (("acuicultura", 'nwr["landuse"="aquaculture"]'),
               ("granja marina (seamark)", 'nwr["seamark:type"="marine_farm"]'),
               ("viñedos con nombre", 'nwr["landuse"="vineyard"]["name"]'),
               ("huertos con nombre", 'nwr["landuse"="orchard"]["name"]'),
               ("invernaderos con nombre", 'nwr["landuse"="greenhouse_horticulture"]["name"]'),
               ("plantaciones con nombre", 'nwr["landuse"="plantation"]["name"]'),
               ("zonas industriales con nombre", 'nwr["landuse"="industrial"]["name"]'),
               ("centros comerciales", 'nwr["shop"="mall"]'),
               ("parques industriales (industrial=park/estate)", 'nwr["landuse"="industrial"]["industrial"~"^(park|estate|industrial_park)$"]')):
    print("==", t, count(sel)); time.sleep(10)
