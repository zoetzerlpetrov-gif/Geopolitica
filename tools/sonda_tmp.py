import json, time, urllib.request, gzip
UA = "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
def raw(url, n=600):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=120) as r:
        b = r.read()
        if b[:2] == b"\x1f\x8b": b = gzip.decompress(b)
        return r.status, r.headers.get("Content-Type"), len(b), b[:n]
def p(url, n=600):
    try: print("URL", url, *raw(url, n))
    except Exception as e: print("URL", url, "ERR", e)
    time.sleep(1.5)
p("https://celestrak.org/robots.txt", 5000)
for u in ["https://db.satnogs.org/robots.txt", "https://db.satnogs.org/api/tle/?format=json&norad_cat_id=25544",
          "https://db.satnogs.org/api/satellites/?format=json&norad_cat_id=25544",
          "https://network.satnogs.org/robots.txt",
          "https://tle.ivanstanojevic.me/robots.txt", "https://tle.ivanstanojevic.me/api/tle/25544",
          "https://www.space-track.org/robots.txt",
          "https://planet4589.org/robots.txt", "https://planet4589.org/space/gcat/tsv/cat/satcat.tsv",
          "https://api.weather.gov/alerts/active?status=actual&severity=Extreme",
          "https://www.ncei.noaa.gov/robots.txt", "https://www.spc.noaa.gov/robots.txt", "https://www.spc.noaa.gov/products/outlook/day1otlk_cat.lyr.geojson",
          "https://www.nhc.noaa.gov/robots.txt", "https://www.nhc.noaa.gov/CurrentStorms.json",
          "https://firms.modaps.eosdis.nasa.gov/robots.txt",
          "https://hazards.fema.gov/robots.txt"]:
    p(u)
