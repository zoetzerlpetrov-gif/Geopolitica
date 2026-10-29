#!/usr/bin/env python3
"""Trenes en circulación con posición en tiempo real, de las redes que la publican abiertamente y SIN llave.

Redes (cada una con su licencia; todas permiten consulta automática según su robots.txt):
  - Finlandia: Fintraffic Digitraffic (CC BY 4.0). Todos los trenes del país, GPS. Pide el encabezado
    «Digitraffic-User» y gzip. GraphQL `currentlyRunningTrains` (tipo, operador, origen).
  - Noruega: Entur (NLOD, licencia abierta noruega). API de vehículos en tiempo real, modo RAIL. Pide «ET-Client-Name».
  - Irlanda: Irish Rail / Iarnród Éireann, API pública `getCurrentTrainsXML` (todos los trenes en marcha).
  - EUA, Boston: MBTA V3 API (licencia de datos de la MBTA), trenes de cercanías (route_type 2).
  - EUA, Filadelfia: SEPTA TrainView (trenes regionales, con retraso en minutos).
No incluidas: las que exigen registro y llave (Países Bajos NS, Suecia Trafikverket, Reino Unido Network Rail, Australia
NSW, Japón ODPT, Taiwán TDX; ver README de la capa) y las que no publican una API (VIA Rail, Amtrak, Tren Maya).
Salida: vivos/trenes.geojson (propiedad «red» para separar por país).
"""
import gzip
import json
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F  # noqa: E402

OUT = os.path.join(ROOT, "vivos", "trenes.geojson")
MAX_EDAD_MIN = 30   # «en circulación» incluye locomotoras detenidas desde ayer: solo posiciones de los últimos 30 min
CATEGORIA_FI = {"Long-distance": "Larga distancia", "Commuter": "Cercanías", "Cargo": "Carga", "Locomotive": "Locomotora sola",
                "Shunting": "Maniobras", "On-track machines": "Maquinaria de vía", "Test drive": "Prueba"}
CONSULTA_FI = """{ currentlyRunningTrains { trainNumber departureDate cancelled
  trainType { name trainCategory { name } } operator { shortCode name }
  trainLocations(orderBy: {timestamp: DESCENDING}, take: 1) { speed timestamp location }
  timeTableRows(where: {type: {equals: "DEPARTURE"}}, take: 1) { station { name } }
} }"""
CONSULTA_NO = "{ vehicles(mode: RAIL) { vehicleId lastUpdated location { latitude longitude } speed line { publicCode lineName } operator { operatorRef } } }"
OPERADOR_NO = {"VYG": "Vy", "GOA": "Go-Ahead Nordic", "SJN": "SJ Norge", "FLT": "Flytoget"}


def reciente(ts, ahora=None):
    try:
        t = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
        if t.tzinfo is None:
            t = t.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return False
    edad = ((ahora or datetime.now(timezone.utc)) - t).total_seconds()
    return -120 <= edad <= MAX_EDAD_MIN * 60


def pedir(url, datos=None, cabeceras=None):
    h = {"User-Agent": F.UA, "Accept-Encoding": "gzip", **(cabeceras or {})}
    if datos is not None:
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=datos, headers=h)
    with urllib.request.urlopen(req, timeout=60) as r:
        b = r.read()
        return gzip.decompress(b) if b[:2] == b"\x1f\x8b" else b


def tren(red, pais, ident, lon, lat, **p):
    base = {"id": f"{red}-{ident}", "red": red, "pais": pais, "numero": str(ident), "tipo": "", "categoria": "", "operador": "", "origen": "",
            "destino": "", "linea": "", "vel_kmh": None, "retraso_min": None, "hora": None, "url": "", "fuente": ""}
    base.update({k: v for k, v in p.items() if v not in (None, "")})
    base["recibido_utc"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    base["observado_utc"] = base["hora"]
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(float(lon), 4), round(float(lat), 4)]}, "properties": base}


# ---------------------------------------------------------------- redes
def finlandia_graphql(d):
    out = []
    for t in (d.get("data") or {}).get("currentlyRunningTrains") or []:
        loc = (t.get("trainLocations") or [{}])[0]
        c = loc.get("location")
        if not c or t.get("cancelled") or not reciente(loc.get("timestamp")):
            continue
        cat = ((t.get("trainType") or {}).get("trainCategory") or {}).get("name") or ""
        out.append(tren("finlandia", "FIN", t["trainNumber"], c[0], c[1], tipo=(t.get("trainType") or {}).get("name"),
                        categoria=CATEGORIA_FI.get(cat, cat), operador=(t.get("operator") or {}).get("name"),
                        origen=((t.get("timeTableRows") or [{}])[0].get("station") or {}).get("name"), vel_kmh=loc.get("speed"),
                        hora=loc.get("timestamp"), url="https://www.digitraffic.fi/en/railway-traffic/", fuente="Fintraffic / Digitraffic (CC BY 4.0)"))
    return out


def finlandia():
    cab = {"Digitraffic-User": "Geopolitica-monitor"}
    return finlandia_graphql(json.loads(pedir("https://rata.digitraffic.fi/api/v2/graphql/graphql", json.dumps({"query": CONSULTA_FI}).encode(), cab)))


def noruega_graphql(d):
    out = []
    for v in (d.get("data") or {}).get("vehicles") or []:
        loc = v.get("location") or {}
        if loc.get("latitude") is None or not reciente(v.get("lastUpdated")):
            continue
        linea = v.get("line") or {}
        op = (v.get("operator") or {}).get("operatorRef") or ""
        num = re.sub(r"-\d{4}-\d{2}-\d{2}$", "", str(v.get("vehicleId") or ""))   # «525-2026-10-14» → tren 525
        out.append(tren("noruega", "NOR", num, loc["longitude"], loc["latitude"], tipo=linea.get("publicCode"),
                        categoria="Pasajeros", operador=OPERADOR_NO.get(op.split(":")[0], op), linea=linea.get("lineName"),
                        vel_kmh=round(v["speed"] * 3.6) if v.get("speed") is not None else None, hora=v.get("lastUpdated"),
                        url="https://entur.no/", fuente="Entur (NLOD)"))
    return out


def noruega():
    cab = {"ET-Client-Name": "geopolitica-monitor"}
    return noruega_graphql(json.loads(pedir("https://api.entur.io/realtime/v1/vehicles/graphql", json.dumps({"query": CONSULTA_NO}).encode(), cab)))


def irlanda_xml(b):
    ns = {"r": "http://api.irishrail.ie/realtime/"}
    out = []
    for t in ET.fromstring(b).findall("r:objTrainPositions", ns):
        g = lambda k: (t.findtext(f"r:{k}", default="", namespaces=ns) or "").strip()  # noqa: E731
        lat, lon = g("TrainLatitude"), g("TrainLongitude")
        if not lat or not lon or float(lat) == 0 or g("TrainStatus") != "R":   # R = en marcha; N = aún no sale
            continue
        msg = g("PublicMessage").replace("\\n", "\n").split("\n")
        ruta = msg[1] if len(msg) > 1 else ""
        # «17:30 - Dublin Connolly to Sligo (2 mins late)» → salida, origen, destino y retraso.
        m = re.search(r"\((-?\d+) mins? (late|early)\)", ruta)
        retraso = (int(m.group(1)) * (1 if m.group(2) == "late" else -1)) if m else None
        ruta = re.sub(r"^\d{1,2}:\d{2}\s*-\s*|\s*\(.*?\)\s*$", "", ruta)
        origen, _, destino = ruta.partition(" to ")
        out.append(tren("irlanda", "IRL", g("TrainCode"), lon, lat, categoria="Pasajeros", operador="Iarnród Éireann", origen=origen,
                        destino=destino or g("Direction").replace("To ", ""), linea=ruta, retraso_min=retraso, url="https://www.irishrail.ie/en-ie/train-timetables/live-departure-times",
                        fuente="Irish Rail, API de tiempo real", hora=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                        estado=" · ".join(msg[2:])[:120]))
    return out


def irlanda():
    return irlanda_xml(pedir("https://api.irishrail.ie/realtime/realtime.asmx/getCurrentTrainsXML"))


def boston_json(d):
    out = []
    for v in d.get("data") or []:
        a = v.get("attributes") or {}
        if a.get("latitude") is None or not reciente(a.get("updated_at")):
            continue
        ruta = (((v.get("relationships") or {}).get("route") or {}).get("data") or {}).get("id") or ""
        out.append(tren("boston", "USA", a.get("label") or v.get("id"), a["longitude"], a["latitude"], categoria="Cercanías",
                        operador="MBTA (Keolis)", linea=ruta.replace("CR-", "Línea "), vel_kmh=round(a["speed"] * 3.6) if a.get("speed") is not None else None,
                        hora=a.get("updated_at"), url="https://www.mbta.com/schedules/commuter-rail", fuente="MBTA V3 API"))
    return out


def boston():
    return boston_json(json.loads(pedir("https://api-v3.mbta.com/vehicles?filter[route_type]=2")))


def filadelfia_json(d):
    out = []
    for t in d or []:
        if not t.get("lat") or not t.get("lon"):
            continue
        out.append(tren("filadelfia", "USA", t.get("trainno"), t["lon"], t["lat"], categoria="Cercanías", operador="SEPTA Regional Rail",
                        origen=t.get("SOURCE"), destino=t.get("dest"), linea=t.get("line"), retraso_min=t.get("late"),
                        hora_tipo="desconocida", url="https://www.septa.org/schedules/rail/", fuente="SEPTA TrainView"))
    return out


def filadelfia():
    return filadelfia_json(json.loads(pedir("https://www3.septa.org/api/TrainView/index.php")))


REDES = {"finlandia": finlandia, "noruega": noruega, "irlanda": irlanda, "boston": boston, "filadelfia": filadelfia}


def main():
    try:
        previo = json.load(open(OUT, encoding="utf-8"))
    except (OSError, ValueError):
        previo = {"features": []}
    feats, estado = [], {}
    for red, fn in REDES.items():
        try:
            nuevos = fn()
            estado[red] = len(nuevos)
        except Exception as e:  # noqa: BLE001
            # Si una red falla, se conservan sus trenes anteriores (marcados por la hora de su posición).
            nuevos = [f for f in previo.get("features", []) if f["properties"].get("red") == red and reciente(f["properties"].get("hora"))]
            estado[red] = f"error: {e}"[:140]
        feats += nuevos
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"type": "FeatureCollection", "generado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "fuentes": estado, "features": feats},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"trenes: {len(feats)} en circulación · {estado}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
