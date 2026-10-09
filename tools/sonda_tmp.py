import urllib.request, json, time
UA = {"User-Agent": "geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"}
def get(u, n=1500, bin=False):
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60)
        b = r.read()
        print(f"--- {u} -> {r.status} {r.headers.get('content-type')} {len(b)} bytes")
        if not bin: print(b[:n].decode("utf-8", "replace"))
        return b
    except Exception as e:
        print(f"--- {u} -> ERROR {e}")
ROBOTS = ["https://api.ioda.inetintel.cc.gatech.edu", "https://ioda.inetintel.cc.gatech.edu", "https://feodotracker.abuse.ch", "https://www.cisa.gov",
  "https://feeds.meteoalarm.org", "https://www.meteoalarm.org", "https://www.nhc.noaa.gov", "https://mapservices.weather.noaa.gov",
  "https://www.consilium.europa.eu", "https://data.bis.org", "https://stats.bis.org", "https://bitnodes.io", "https://ll.thespacedevs.com",
  "https://eur-lex.europa.eu", "https://taxation-customs.ec.europa.eu"]
for b in ROBOTS: get(b + "/robots.txt", 1200)
now = int(time.time())
get(f"https://api.ioda.inetintel.cc.gatech.edu/v2/outages/alerts?from={now-86400}&until={now}&entityType=country&limit=5", 2500)
get(f"https://api.ioda.inetintel.cc.gatech.edu/v2/outages/summary?from={now-7*86400}&until={now}&entityType=country&limit=5", 2500)
get(f"https://api.ioda.inetintel.cc.gatech.edu/v2/outages/events?from={now-7*86400}&until={now}&entityType=country&limit=3&format=codf", 2500)
b = get("https://feodotracker.abuse.ch/downloads/ipblocklist.json", 800)
if b:
    d = json.loads(b); print(len(d), d[:2])
get("https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.json", 300)
get("https://www.cisa.gov/cybersecurity-advisories/ics-advisories.xml", 3000)
get("https://api.github.com/repos/cisagov/CSAF/contents/csaf_files/OT/white/2026", 1500)
get("https://feeds.meteoalarm.org/api/v1/warnings/feeds-spain", 2500)
get("https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-spain", 2500)
get("https://feeds.meteoalarm.org/api/v1/geocodes", 500)
get("https://www.nhc.noaa.gov/CurrentStorms.json", 2000)
get("https://www.nhc.noaa.gov/gis/", 300)
get("https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer?f=json", 4000)
get("https://www.consilium.europa.eu/en/policies/eu-list-of-non-cooperative-jurisdictions/", 200)
get("https://stats.bis.org/api/v1/data/WS_CBPOL/M.MX+US/all?startPeriod=2026-01&format=csv", 2500)
get("https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/M.MX?startPeriod=2026-01&format=csvfile", 2500)
get("https://data.bis.org/static/bulk/WS_CBPOL_csv_flat.zip", 0, bin=True)
b = get("https://bitnodes.io/api/v1/snapshots/latest/", 600)
if b:
    d = json.loads(b); print(d.keys(), d.get("total_nodes")); k = list(d["nodes"].items())[:2]; print(k)
get("https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=1&mode=list", 1500)
