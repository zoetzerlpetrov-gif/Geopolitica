import json, time, urllib.parse, urllib.request
UA = "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.status, r.read().decode("utf-8", "replace")
def p(nombre, url, n=1500):
    try:
        st, t = get(url); print(nombre, st, len(t), t[:n].replace("\n", " "))
    except Exception as e: print(nombre, "ERR", e)
    time.sleep(15)
p("ROBOTS", "https://api.gdeltproject.org/robots.txt", 600)
Q = '(tornado OR tornadoes OR waterspout OR "tromba d\'aria" OR "trombe d\'aria" OR "tromba marina" OR tornade OR "trompa marina" OR "manga de agua" OR landspout)'
p("DOC", "https://api.gdeltproject.org/api/v2/doc/doc?" + urllib.parse.urlencode({"query": Q, "mode": "artlist", "format": "json", "maxrecords": 75, "timespan": "72h", "sort": "datedesc"}), 6000)
p("DOC_IT", "https://api.gdeltproject.org/api/v2/doc/doc?" + urllib.parse.urlencode({"query": '("tromba d\'aria" OR tornado) sourcecountry:italy', "mode": "artlist", "format": "json", "maxrecords": 50, "timespan": "7d", "sort": "datedesc"}), 4000)
p("GEO", "https://api.gdeltproject.org/api/v2/geo/geo?" + urllib.parse.urlencode({"query": "tornado", "format": "GeoJSON", "timespan": "72h"}), 3000)
p("GEO_PD", "https://api.gdeltproject.org/api/v2/geo/geo?" + urllib.parse.urlencode({"query": "tornado", "mode": "PointData", "format": "GeoJSON", "timespan": "3d"}), 3000)
