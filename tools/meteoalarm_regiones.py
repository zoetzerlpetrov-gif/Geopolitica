#!/usr/bin/env python3
"""Genera config/meteoalarm_regiones.json: contorno simplificado y punto interior de las ~2,000 regiones de aviso
de MeteoAlarm (códigos EMMA_ID). Los avisos de MeteoAlarm solo traen el código de la región, no su forma.

Fuente: archivo de geocódigos de MeteoAlarm incluido en el paquete «meteoalarm» de Niklas Jordan (licencia MIT,
github.com/NiklasJordan/meteoalarm). Se simplifica a ~2 km (tolerancia 0.02°) y 3 decimales: pasa de 31 MB a ~0.8 MB.
Uso: python3 tools/meteoalarm_regiones.py   (requiere shapely)
"""
import json
import os
import urllib.request

from shapely.geometry import mapping, shape
from shapely.ops import unary_union
from shapely.validation import make_valid

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
URL = "https://raw.githubusercontent.com/NiklasJordan/meteoalarm/main/src/meteoalarm/assets/geocodes.json"
TOLERANCIA = 0.02


def redondear(c):
    if c and isinstance(c[0], (list, tuple)):
        return [redondear(x) for x in c]
    return [round(c[0], 3), round(c[1], 3)]


def construir(fc):
    out = {}
    for f in fc["features"]:
        p = f["properties"]
        g = make_valid(shape(f["geometry"])).simplify(TOLERANCIA, preserve_topology=True)
        if g.geom_type == "GeometryCollection":
            g = unary_union([x for x in g.geoms if x.geom_type in ("Polygon", "MultiPolygon")])
        if g.is_empty:
            continue
        c = g.representative_point()
        m = mapping(g)
        out[p["code"]] = {"n": p.get("name") or p["code"], "p": p.get("country") or p["code"][:2], "c": [round(c.x, 3), round(c.y, 3)],
                          "g": {"type": m["type"], "coordinates": redondear(m["coordinates"])}}
    return {"fuente": "Geocódigos EMMA_ID de MeteoAlarm (copia en github.com/NiklasJordan/meteoalarm, MIT)", "regiones": out}


if __name__ == "__main__":
    datos = construir(json.load(urllib.request.urlopen(URL, timeout=300)))
    with open(os.path.join(ROOT, "config", "meteoalarm_regiones.json"), "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(datos['regiones'])} regiones")
