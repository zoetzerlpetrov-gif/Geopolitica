"""Sonda temporal: trenes en vivo sin llave (se borra antes del PR)."""
import gzip, json, sys, urllib.request
sys.path.insert(0, "ingest")
import fuentes as F
def get(url, h=None, data=None, t=60):
    r = urllib.request.Request(url, data=data, headers={"User-Agent": F.UA, **(h or {})})
    with urllib.request.urlopen(r, timeout=t) as x:
        b = x.read()
        return x.status, x.headers.get("content-type"), (gzip.decompress(b) if b[:2] == b"\x1f\x8b" else b)
def prueba(nombre, url, h=None, data=None, n=1500):
    print(f"\n===== {nombre}\n{url}")
    try:
        print("robots:", F.permitido_por_robots(url))
    except Exception as e:
        print("robots err", e)
    try:
        st, ct, b = get(url, h, data)
        print("status", st, ct, "bytes", len(b)); print(b[:n].decode("utf-8", "replace"))
    except Exception as e:
        print("ERROR", type(e).__name__, str(e)[:400])
        if hasattr(e, "read"):
            print(e.read()[:600])
q = '{ vehicles(mode: RAIL) { vehicleId lastUpdated location { latitude longitude } speed bearing line { lineRef publicCode lineName } operator { operatorRef } destinationName originName delay } }'
prueba("Entur Noruega", "https://api.entur.io/realtime/v1/vehicles/graphql", {"ET-Client-Name": "geopolitica-monitor", "Content-Type": "application/json"}, json.dumps({"query": q}).encode())
q2 = '{ vehicles(codespaceId: "VYG") { vehicleId lastUpdated location { latitude longitude } mode line { publicCode lineName } } }'
prueba("Entur VYG", "https://api.entur.io/realtime/v1/vehicles/graphql", {"ET-Client-Name": "geopolitica-monitor", "Content-Type": "application/json"}, json.dumps({"query": q2}).encode(), n=800)
prueba("Irish Rail", "https://api.irishrail.ie/realtime/realtime.asmx/getCurrentTrainsXML")
prueba("Irish Rail http", "http://api.irishrail.ie/realtime/realtime.asmx/getCurrentTrainsXML", n=600)
prueba("MBTA", "https://api-v3.mbta.com/vehicles?filter[route_type]=2&include=route", n=1500)
prueba("SEPTA", "https://www3.septa.org/api/TrainView/index.php", n=1200)
prueba("SEPTA robots", "https://www3.septa.org/robots.txt", n=400)
prueba("VIA Rail", "https://tsimobile.viarail.ca/data/allData.json", n=400)
prueba("iRail BE", "https://api.irail.be/vehicle/?id=BE.NMBS.IC1832&format=json", n=400)
