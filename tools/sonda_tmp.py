import urllib.request, json, time, re, io, gzip
UA = {"User-Agent": "geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"}
def get(u, n=1500, bin=False, quiet=False):
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=90)
        b = r.read()
        print(f"--- {u} -> {r.status} {r.headers.get('content-type')} {len(b)} bytes")
        if not bin and not quiet: print(b[:n].decode("utf-8", "replace"))
        return b
    except Exception as e:
        print(f"--- {u} -> ERROR {e}")
for b in ["https://threatfox.abuse.ch", "https://download.db-ip.com", "https://db-ip.com", "https://data.consilium.europa.eu", "https://api.ioda.inetintel.cc.gatech.edu"]:
    get(b + "/robots.txt", 800)
b = get("https://threatfox.abuse.ch/export/json/recent/", 600)
if b:
    d = json.loads(b); vals = [x for v in d.values() for x in v]
    print(len(vals)); from collections import Counter
    print(Counter(x.get("ioc_type") for x in vals)); print(Counter(x.get("threat_type") for x in vals)); print(vals[:2])
get("https://threatfox.abuse.ch/export/", 100, quiet=True)
mes = time.strftime("%Y-%m")
b = get(f"https://download.db-ip.com/free/dbip-country-lite-{mes}.csv.gz", bin=True)
if b: print(gzip.decompress(b)[:300])
get("https://db-ip.com/db/download/ip-to-country-lite", 0, quiet=True)
# NHC capas
b = get("https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer?f=json", quiet=True)
if b:
    d = json.loads(b)
    for l in d.get("layers", []): print(l["id"], l["name"], l.get("parentLayerId"))
# Bitnodes
for q in ["?field=coordinates", "?field=user_agents"]:
    b = get("https://bitnodes.io/api/v1/snapshots/latest/" + q, 300)
get("https://bitnodes.io/api/", 100, quiet=True)
# Lista UE
for u in ["https://taxation-customs.ec.europa.eu/tax-common-eu-list_en",
          "https://taxation-customs.ec.europa.eu/taxation/tax-transparency-cooperation/tax-good-governance-world-tax-transparency-cooperation/eu-list-non-cooperative-jurisdictions_en"]:
    b = get(u, quiet=True)
    if b:
        t = re.sub(r"<[^>]+>", " ", b.decode("utf-8", "replace")); t = re.sub(r"\s+", " ", t)
        i = t.find("Annex I"); print(t[max(0, i-1500):i+3000])
for doc in ["ST-5822-2026-INIT", "ST-5821-2026-INIT"]:
    get(f"https://data.consilium.europa.eu/doc/document/{doc}/en/pdf", bin=True)
# MeteoAlarm: ¿trae polígonos algún país?
for pais in ["germany", "france", "italy", "austria", "netherlands", "norway"]:
    b = get(f"https://feeds.meteoalarm.org/api/v1/warnings/feeds-{pais}", quiet=True)
    if b:
        d = json.loads(b); n = len(d.get("warnings", []))
        areas = [a for w in d["warnings"] for i in w["alert"].get("info", [])[:1] for a in i.get("area", [])]
        print(pais, n, "con polígono:", sum(1 for a in areas if a.get("polygon")), "geocodes:", [g for a in areas[:2] for g in a.get("geocode", [])])
