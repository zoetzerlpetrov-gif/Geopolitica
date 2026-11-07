"""Línea de costa para el brillo LED del mapa a zoom bajo, derivada de data/base/countries.geojson (Natural Earth).

Un tramo que aparece en dos países es frontera terrestre y se descarta; uno que aparece una sola vez es costa.
También se descartan los cortes artificiales de los polígonos: los tramos sobre el meridiano 180° y sobre los polos.
Así el brillo no dibuja líneas rectas en el antimeridiano (el agua de los mosaicos viene partida ahí).
countries.geojson no trae la Antártida; su costa se toma de ne_50m_coastline.geojson de Natural Earth (dominio público,
https://github.com/nvkelso/natural-earth-vector, v5.1.2): solo las líneas al sur de 60° S.
Uso: python3 tools/mapa/costas.py [ruta/a/ne_50m_coastline.geojson]
"""
import sys
import json
from collections import Counter
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
ENTRADA = RAIZ / "data/base/countries.geojson"
SALIDA = RAIZ / "data/base/costas.geojson"


def anillos(geom):
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    for p in polys:
        yield from p


def punto(c):
    return (round(c[0], 5), round(c[1], 5))


def artificial(a, b):
    meridiano = abs(a[0]) >= 179.99 and abs(b[0]) >= 179.99
    polo = abs(a[1]) >= 89.9 and abs(b[1]) >= 89.9
    return meridiano or polo


def costas(datos):
    cuenta, tramos = Counter(), []
    for f in datos["features"]:
        for anillo in anillos(f["geometry"]):
            pts = [punto(c) for c in anillo]
            for a, b in zip(pts, pts[1:]):
                if a == b:
                    continue
                cuenta[frozenset((a, b))] += 1
                tramos.append((a, b))
    lineas, actual = [], []
    for a, b in tramos:
        bueno = cuenta[frozenset((a, b))] == 1 and not artificial(a, b)
        if bueno and actual and actual[-1] == a:
            actual.append(b)
        else:
            if len(actual) >= 2:
                lineas.append(actual)
            actual = [a, b] if bueno else []
    if len(actual) >= 2:
        lineas.append(actual)
    return {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {}, "geometry": {"type": "MultiLineString", "coordinates": [[list(p) for p in l] for l in lineas]}}]}


def antartida(ruta):
    lineas = []
    for f in json.loads(Path(ruta).read_text())["features"]:
        g = f["geometry"]
        for l in g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]:
            if max(c[1] for c in l) < -60:
                lineas.append([[round(c[0], 5), round(c[1], 5)] for c in l])
    return lineas


if __name__ == "__main__":
    out = costas(json.loads(ENTRADA.read_text()))
    if len(sys.argv) > 1:
        out["features"][0]["geometry"]["coordinates"] += antartida(sys.argv[1])
    SALIDA.write_text(json.dumps(out, separators=(",", ":")))
    n = sum(len(l) for l in out["features"][0]["geometry"]["coordinates"])
    print(f"{SALIDA.relative_to(RAIZ)}: {len(out['features'][0]['geometry']['coordinates'])} líneas, {n} puntos, {SALIDA.stat().st_size // 1024} KB")
