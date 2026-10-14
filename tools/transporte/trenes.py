#!/usr/bin/env python3
"""Trenes en circulación con posición GPS en tiempo real (red ferroviaria de Finlandia).

Fuente: Digitraffic de Fintraffic (rata.digitraffic.fi), datos abiertos con licencia CC BY 4.0, sin llave. Pide el
encabezado «Digitraffic-User» y respuestas comprimidas (gzip). Es de los pocos operadores del mundo que publican la
posición de TODOS sus trenes sin registro; los de Suiza, Países Bajos, Reino Unido o EUA exigen cuenta y llave.
  1. GraphQL `currentlyRunningTrains`: número, tipo (InterCity, Pendolino, cercanías, carga…), operador, estaciones
     de origen y destino y última posición.
  2. Respaldo: `/api/v1/train-locations.geojson/latest/` (solo número, velocidad y posición).
Salida: vivos/trenes.geojson.
"""
import gzip
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F  # noqa: E402

OUT = os.path.join(ROOT, "vivos", "trenes.geojson")
BASE = "https://rata.digitraffic.fi"
CABECERAS = {"User-Agent": F.UA, "Digitraffic-User": "Geopolitica-monitor", "Accept-Encoding": "gzip"}
CATEGORIA = {"Long-distance": "Larga distancia", "Commuter": "Cercanías", "Cargo": "Carga", "Locomotive": "Locomotora sola",
             "Shunting": "Maniobras", "On-track machines": "Maquinaria de vía", "Test drive": "Prueba"}
CONSULTA = """{ currentlyRunningTrains { trainNumber departureDate cancelled
  trainType { name trainCategory { name } } operator { shortCode name }
  trainLocations(orderBy: {timestamp: DESCENDING}, take: 1) { speed timestamp location }
  timeTableRows(where: {type: {equals: "DEPARTURE"}}, take: 1) { station { name } }
} }"""


MAX_EDAD_MIN = 30   # «en circulación» incluye locomotoras detenidas desde ayer: solo posiciones de los últimos 30 min


def reciente(ts, ahora=None):
    try:
        t = datetime.strptime(ts[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return False
    return ((ahora or datetime.now(timezone.utc)) - t).total_seconds() <= MAX_EDAD_MIN * 60


def pedir(url, datos=None):
    h = dict(CABECERAS)
    if datos is not None:
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=datos, headers=h)
    with urllib.request.urlopen(req, timeout=60) as r:
        b = r.read()
        return gzip.decompress(b) if r.headers.get("Content-Encoding") == "gzip" or b[:2] == b"\x1f\x8b" else b


def de_graphql(d):
    feats = []
    for t in (d.get("data") or {}).get("currentlyRunningTrains") or []:
        loc = (t.get("trainLocations") or [{}])[0]
        coords = loc.get("location")
        if not coords or t.get("cancelled") or not reciente(loc.get("timestamp")):
            continue
        cat = ((t.get("trainType") or {}).get("trainCategory") or {}).get("name") or ""
        origen = ((t.get("timeTableRows") or [{}])[0].get("station") or {}).get("name") or ""
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(coords[0], 4), round(coords[1], 4)]},
                      "properties": {"id": f"tren-{t['trainNumber']}", "numero": t["trainNumber"], "tipo": (t.get("trainType") or {}).get("name") or "",
                                     "categoria": CATEGORIA.get(cat, cat), "operador": (t.get("operator") or {}).get("name") or "",
                                     "origen": origen, "vel_kmh": loc.get("speed"), "hora": loc.get("timestamp"), "fecha_salida": t.get("departureDate"),
                                     "url": f"https://www.digitraffic.fi/en/railway-traffic/", "fuente": "Fintraffic / Digitraffic (CC BY 4.0)"}})
    return feats


def de_ubicaciones(fc):
    return [{"type": "Feature", "geometry": f["geometry"],
             "properties": {"id": f"tren-{f['properties'].get('trainNumber')}", "numero": f["properties"].get("trainNumber"), "tipo": "", "categoria": "", "operador": "", "origen": "",
                            "vel_kmh": f["properties"].get("speed"), "hora": f["properties"].get("timestamp"),
                            "fecha_salida": f["properties"].get("departureDate"), "url": "https://www.digitraffic.fi/en/railway-traffic/",
                            "fuente": "Fintraffic / Digitraffic (CC BY 4.0)"}} for f in fc.get("features", [])
            if f.get("geometry") and reciente(f["properties"].get("timestamp"))]


def main():
    estado = {}
    feats = []
    try:
        feats = de_graphql(json.loads(pedir(f"{BASE}/api/v2/graphql/graphql", json.dumps({"query": CONSULTA}).encode())))
        estado["graphql"] = len(feats)
    except Exception as e:  # noqa: BLE001
        estado["graphql"] = f"error: {e}"[:160]
    if not feats:
        try:
            feats = de_ubicaciones(json.loads(pedir(f"{BASE}/api/v1/train-locations.geojson/latest/")))
            estado["ubicaciones"] = len(feats)
        except Exception as e:  # noqa: BLE001
            estado["ubicaciones"] = f"error: {e}"[:160]
            print(f"trenes: sin datos ({estado}); se conserva el archivo anterior")
            return 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"type": "FeatureCollection", "generado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "fuentes": estado, "features": feats},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"trenes: {len(feats)} en circulación · {estado}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
