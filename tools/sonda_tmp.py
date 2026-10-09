import urllib.request
H = {"User-Agent": "Geopolitica-monitor/1.0", "Origin": "https://zoetzerlpetrov-gif.github.io"}
for u in ["https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-spain", "https://feeds.meteoalarm.org/api/v1/warnings/feeds-spain",
          "https://api.ioda.inetintel.cc.gatech.edu/v2/outages/events?from=1791500000&until=1791580000&entityType=country&format=codf&limit=2"]:
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=40)
        print(u, r.status, "CORS=", r.headers.get("access-control-allow-origin"), "cache=", r.headers.get("cache-control"))
    except Exception as e:
        print(u, "ERROR", e)
