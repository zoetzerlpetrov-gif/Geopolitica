import urllib.request
UA = {"User-Agent": "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)", "Origin": "https://zoetzerlpetrov-gif.github.io"}
def get(u, n=1200):
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=40)
        b = r.read()
        print(f"--- {u} -> {r.status} {r.headers.get('content-type')} {len(b)} B | CORS={r.headers.get('access-control-allow-origin')} | cache={r.headers.get('cache-control')}")
        print(b[:n].decode("utf-8", "replace"))
    except Exception as e:
        print(f"--- {u} -> ERROR {e}")
for u in ["http://www.ssn.unam.mx/robots.txt", "https://www.ssn.unam.mx/robots.txt", "http://www.ssn.unam.mx/rss/ultimos-sismos.xml", "https://www.ssn.unam.mx/rss/ultimos-sismos.xml",
          "https://rss.sasmex.net/robots.txt", "https://rss.sasmex.net/api/v1/alerts/latest/cap/", "https://rss.sasmex.net/api/v1/alerts/latest/",
          "https://www.cires.org.mx/robots.txt",
          "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_hour.geojson",
          "https://www.emsc-csem.org/robots.txt", "https://www.seismicportal.eu/fdsnws/event/1/query?limit=2&format=json&minmag=4"]:
    get(u)
