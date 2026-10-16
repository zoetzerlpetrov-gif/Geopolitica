import urllib.request
for anio in range(2015, 2027):
    for capa in (f"s2cloudless-{anio}_3857", f"s2cloudless-{anio}"):
        u = f"https://tiles.maps.eox.at/wmts/1.0.0/{capa}/default/g/6/28/14.jpg"
        try:
            r = urllib.request.urlopen(urllib.request.Request(u, headers={"Origin": "https://zoetzerlpetrov-gif.github.io", "User-Agent": "Geopolitica-monitor/1.0"}), timeout=30)
            print(r.status, len(r.read()), r.headers.get("Access-Control-Allow-Origin"), r.headers.get("Content-Type"), u)
        except Exception as e:
            print("ERR", e, u)
for u in ["https://tiles.maps.eox.at/robots.txt", "https://s2maps-tiles.eu/robots.txt"]:
    try: print(urllib.request.urlopen(u, timeout=20).read()[:400])
    except Exception as e: print("ERR", e, u)
