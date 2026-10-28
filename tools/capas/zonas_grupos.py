#!/usr/bin/env python3
"""Grupos por zona de las capas de puntos (Infraestructura, Conflictos y sociedad, cámaras…).

Las familias grandes se sirven como PMTiles (mosaicos vectoriales) y MapLibre no puede agruparlas en el navegador:
solo agrupa fuentes GeoJSON. Por eso los grupos se calculan aquí, al construir las capas: tres cuadrículas, una por
rango de zoom, y en cada celda con objetos un punto (el promedio de sus coordenadas) con el total y el conteo por
subtipo («c_<subtipo>»), para que el mapa sume solo los subtipos que el usuario tenga marcados.

  banda 0: zoom 0–3, celdas de 10°   banda 1: zoom 3–5, celdas de 3°   banda 2: zoom 5–7, celdas de 0.8°
  Desde zoom 7 el mapa muestra los objetos sueltos.

Uso como programa (rellena las familias que aún no tienen grupos, sin volver a descargar nada):
  python3 tools/capas/zonas_grupos.py capas
Lee capas/<familia>.geojson y capas/<familia>.crudo.ndjson.gz, escribe capas/<familia>.grupos.json y anota
«grupos» en capas/manifest.json.
"""
import gzip
import json
import math
import os
import sys

BANDAS = [(0, 3, 10.0), (3, 5, 3.0), (5, 7, 0.8)]  # (zoom desde, zoom hasta sin incluir, tamaño de celda en grados)
MIN_PUNTOS = 50  # con menos objetos no hace falta agrupar


def puntos(feats):
    """(lon, lat, subtipo) de cada punto válido."""
    for ft in feats:
        g = ft.get("geometry") or {}
        if g.get("type") != "Point":
            continue
        try:
            lon, lat = float(g["coordinates"][0]), float(g["coordinates"][1])
        except (TypeError, ValueError, IndexError, KeyError):
            continue
        if -180 <= lon <= 180 and -90 <= lat <= 90:
            yield lon, lat, str((ft.get("properties") or {}).get("st", ""))


def grupos(feats):
    """FeatureCollection de grupos, o None si la familia tiene menos de MIN_PUNTOS puntos."""
    pts = list(puntos(feats))
    if len(pts) < MIN_PUNTOS:
        return None
    out = []
    for b, (_z0, _z1, celda) in enumerate(BANDAS):
        celdas = {}
        for lon, lat, st in pts:
            c = celdas.setdefault((math.floor(lon / celda), math.floor(lat / celda)), [0, 0.0, 0.0, {}])
            c[0] += 1
            c[1] += lon
            c[2] += lat
            c[3][st] = c[3].get(st, 0) + 1
        for n, sx, sy, por in celdas.values():
            out.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(sx / n, 3), round(sy / n, 3)]},
                        "properties": {"b": b, "n": n, **{f"c_{k}": v for k, v in por.items()}}})
    return {"type": "FeatureCollection", "bandas": [[z0, z1] for z0, z1, _ in BANDAS], "features": out}


def escribir(carpeta, fid, feats):
    """Escribe <carpeta>/<fid>.grupos.json; devuelve la ruta publicada o None."""
    fc = grupos(feats)
    if not fc:
        return None
    with open(os.path.join(carpeta, f"{fid}.grupos.json"), "w", encoding="utf-8") as f:
        json.dump(fc, f, ensure_ascii=False, separators=(",", ":"))
    return f"data/capas/{fid}.grupos.json"


def leer_familia(carpeta, fid):
    """Objetos de una familia ya construida (GeoJSON o copia cruda de OpenStreetMap), o None si no hay."""
    gj = os.path.join(carpeta, f"{fid}.geojson")
    if os.path.exists(gj):
        return json.load(open(gj, encoding="utf-8")).get("features", [])
    crudo = os.path.join(carpeta, f"{fid}.crudo.ndjson.gz")
    if os.path.exists(crudo):
        with gzip.open(crudo, "rt", encoding="utf-8") as f:
            return [json.loads(linea) for linea in f if linea.strip()]
    return None


def main(carpeta):
    ruta = os.path.join(carpeta, "manifest.json")
    if not os.path.exists(ruta):
        print("grupos: sin manifest; nada que hacer")
        return 0
    manifest = json.load(open(ruta, encoding="utf-8"))
    hechos = []
    for fid, info in manifest.get("familias", {}).items():
        if info.get("grupos") and os.path.exists(os.path.join(carpeta, f"{fid}.grupos.json")):
            continue
        feats = leer_familia(carpeta, fid)
        if feats is None:
            continue
        publicado = escribir(carpeta, fid, feats)
        if publicado:
            info["grupos"] = publicado
            hechos.append(fid)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    print(f"grupos: {len(hechos)} familias nuevas {hechos}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "capas"))
