import time, urllib.request, re
UA = "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
def get(u):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=60) as r:
            b = r.read(); print("URL", u, r.status, len(b)); return b.decode("utf-8", "replace")
    except Exception as e: print("URL", u, "ERR", e); return ""
    finally: time.sleep(1.5)
for feed in ["https://www.tsunami.gov/events/xml/PHEBAtom.xml", "https://www.tsunami.gov/events/xml/PAAQAtom.xml"]:
    x = get(feed)
    for u in sorted(set(re.findall(r'href="(https://www\.tsunami\.gov/events/[^"]+?\.(?:txt|json))"', x))):
        print(get(u)[:9000])
for u in ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/3/3/2.jpg", "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/3/3/2.jpg",
          "https://tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml", "https://s2maps.eu/"]:
    t = get(u); print(re.findall(r"(?i)(licen[cs]e[^<]{0,200}|CC[- ]BY[^<]{0,80}|non-?commercial[^<]{0,120}|terms[^<]{0,150})", t)[:8])
