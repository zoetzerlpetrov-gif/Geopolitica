#!/usr/bin/env python3
"""Ciudades del mundo para la consola de zona (radio de 200 km).

Fuente: Natural Earth 1:10m «populated places» (dominio público). Se conservan capitales nacionales,
capitales de estado o provincia y demás ciudades pobladas; se descartan estaciones científicas.
Tipos: capital (país), capital_estatal, principal (≥ 250 mil hab., «world city» o megaciudad) y ciudad.
Natural Earth no clasifica destinos turísticos: para lugares que no estén aquí la consola consulta el
geocodificador de Open-Meteo (GeoNames).

Uso: python3 tools/capas/ciudades.py [ruta_local_del_geojson]  → config/ciudades.json
"""
import json
import os
import sys
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places.geojson"
OUT = os.path.join(ROOT, "config", "ciudades.json")
FUERA = {"Scientific station", "Meteorological Station", "Historic place"}


def tipo_de(p):
    cla = p.get("FEATURECLA") or ""
    if cla.startswith("Admin-0 capital") or p.get("ADM0CAP") == 1:
        return "capital"
    if cla.startswith("Admin-1"):
        return "capital_estatal"
    if (p.get("POP_MAX") or 0) >= 250000 or p.get("WORLDCITY") == 1 or p.get("MEGACITY") == 1:
        return "principal"
    return "ciudad"


def ciudades(fc):
    out, vistos = [], set()
    for f in fc["features"]:
        p = f["properties"]
        if (p.get("FEATURECLA") or "") in FUERA:
            continue
        nombre = p.get("NAME") or p.get("NAMEASCII")
        es = p.get("NAME_ES") or ""
        iso3 = p.get("ADM0_A3") or p.get("SOV_A3") or ""
        clave = (nombre, iso3, round(p["LATITUDE"], 1))
        if not nombre or clave in vistos:
            continue
        vistos.add(clave)
        out.append([nombre, es if es and es != nombre else "", iso3, round(p["LATITUDE"], 3), round(p["LONGITUDE"], 3), tipo_de(p), int(p.get("POP_MAX") or 0)])
    orden = {"capital": 0, "capital_estatal": 1, "principal": 2, "ciudad": 3}
    out.sort(key=lambda c: (orden[c[5]], -c[6]))
    return out


def main():
    if len(sys.argv) > 1:
        fc = json.load(open(sys.argv[1], encoding="utf-8"))
    else:
        req = urllib.request.Request(URL, headers={"User-Agent": "Geopolitica/1.0 (monitor geopolitico)"})
        with urllib.request.urlopen(req, timeout=120) as r:
            fc = json.loads(r.read())
    lista = ciudades(fc)
    json.dump({"fuente": "Natural Earth 1:10m populated places (dominio público)", "url": "https://www.naturalearthdata.com/",
               "campos": ["nombre", "nombre_es", "iso3", "lat", "lon", "tipo", "poblacion"], "ciudades": lista},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"ciudades: {len(lista)} → {OUT}")


if __name__ == "__main__":
    main()
