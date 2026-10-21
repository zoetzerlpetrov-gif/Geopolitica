#!/usr/bin/env python3
"""Polígonos de estados y provincias para las fichas de las capas de seguridad, emergencias, salud, criminología y
carreteras: al abrir la ficha de un punto, el mapa resalta el estado donde cae.

Solo se incluyen las divisiones donde hoy cae algún punto con ubicación de ciudad o de estado (no las de puntos
ubicados solo por el país: ahí la ficha resalta el país). Así el archivo pesa poco en vez de los varios MB del
mapa mundial de estados. Polígonos: Natural Earth 1:10m admin-1 (dominio público), la misma caché simplificada que
usa tools/zonas_afectadas.py (~/.cache/admin1/poligonos.json).
Salida: vivos/zonas_eventos.geojson.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import zonas_afectadas as Z  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
VIVOS = os.path.join(ROOT, "vivos")
OUT = os.path.join(VIVOS, "zonas_eventos.geojson")
CAPAS = ["crimen.geojson", "ataques.geojson", "vial.geojson", "deslaves.geojson"]
PRECISAS = {"ciudad", "estado"}


def puntos(rutas):
    """[(lon, lat)] de los puntos con ubicación de ciudad o estado."""
    out = []
    for ruta in rutas:
        try:
            fc = json.load(open(ruta, encoding="utf-8"))
        except (OSError, ValueError):
            continue
        for f in fc.get("features", []):
            g, p = f.get("geometry") or {}, f.get("properties") or {}
            if g.get("type") == "Point" and p.get("precision") in PRECISAS:
                out.append(tuple(g["coordinates"][:2]))
    return out


def division_de(polis, x, y):
    for i, p in enumerate(polis):
        b = p["bbox"]
        if b[0] <= x <= b[2] and b[1] <= y <= b[3] and Z.contiene(p["geometry"], x, y):
            return i
    return None


def zonas(polis, pts):
    """FeatureCollection con las divisiones que contienen algún punto y cuántos puntos tienen."""
    cuenta = {}
    for x, y in set(pts):
        i = division_de(polis, x, y)
        if i is not None:
            cuenta[i] = cuenta.get(i, 0) + 1
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": polis[i]["geometry"],
         "properties": {"nombre": polis[i]["nombres"][0], "iso3": polis[i]["iso3"], "tipo": polis[i].get("tipo") or "estado o provincia", "n": n}}
        for i, n in sorted(cuenta.items())]}


def main():
    polis = json.load(open(Z.CACHE, encoding="utf-8")) if os.path.exists(Z.CACHE) else Z.construir_cache()
    fc = zonas(polis, puntos([os.path.join(VIVOS, c) for c in CAPAS]))
    os.makedirs(VIVOS, exist_ok=True)
    json.dump(fc, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"zonas de eventos: {len(fc['features'])} estados o provincias ({os.path.getsize(OUT) // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
