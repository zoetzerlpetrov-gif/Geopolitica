import json, time, urllib.request, re
UA = "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
def get(u, n=1500):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=60) as r:
            b = r.read(); print("URL", u, r.status, r.headers.get("Content-Type"), len(b)); return b
    except Exception as e: print("URL", u, "ERR", e); return b""
    finally: time.sleep(1.5)
d = json.loads(get("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson") or b"{}")
for f in d.get("features", []):
    p = f["properties"]
    if re.search(r"Panama|Panamá|Costa Rica|Colombia", p.get("place") or "") or p.get("tsunami"):
        print("USGS", p["place"], p["mag"], p["tsunami"], p.get("alert"), time.strftime("%Y-%m-%d %H:%M", time.gmtime(p["time"] / 1000)), p["url"])
for u in ["https://www.tsunami.gov/robots.txt", "https://www.tsunami.gov/events/xml/PHEBAtom.xml", "https://www.tsunami.gov/events/xml/PAAQAtom.xml"]:
    b = get(u); print(b[:3000].decode("utf-8", "replace"))
m = re.findall(rb"<link[^>]+href=\"([^\"]+)\"", get("https://www.tsunami.gov/events/xml/PHEBAtom.xml"))
print("LINKS", m[:10])
for u in [x.decode() for x in m if b".txt" in x or b"/events/" in x][:3]:
    print(get(u)[:6000].decode("utf-8", "replace"))
for u in ["https://tiles.maps.eox.at/robots.txt", "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2016_3857/default/g/3/3/2.jpg",
          "https://s2maps.eu/robots.txt", "https://gibs.earthdata.nasa.gov/robots.txt",
          "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/3/3/2.jpeg",
          "https://tiles.openfreemap.org/styles/liberty", "https://tiles.openfreemap.org/styles/bright"]:
    b = get(u, 300); print(b[:400])
