"""Áreas aproximadas de fenómenos para el mapa (tools/clima/zonas.py y sus usos)."""
import os
import sys

import numpy as np

AQUI = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(AQUI, "..", "tools", "clima"))
sys.path.insert(0, os.path.join(AQUI, "..", "tools", "radiacion"))
import anticiclones as A  # noqa: E402
import calor as CA  # noqa: E402
import gfs as G  # noqa: E402
import humedad as H  # noqa: E402
import zonas as Z  # noqa: E402


def test_region_contorno_y_circulo():
    m = np.zeros((20, 20))
    m[5:10, 5:12] = 1
    m[15, 15] = 1  # aislada: no está conectada
    celdas = Z.region_conectada(lambda i, j: m[i, j] > 0, 7, 7, 25)
    assert len(celdas) == 35 and (15, 15) not in celdas
    [(anillo, grupo)] = Z.poligonos(celdas, origen=(0, 20))
    assert anillo[0] == anillo[-1] and len(grupo) == 35
    xs, ys = [p[0] for p in anillo], [p[1] for p in anillo]
    assert 5 <= min(xs) and max(xs) <= 12 and 10 <= min(ys) and max(ys) <= 15
    c = Z.circulo(30.1, 51.4, 30)
    assert c[0] == c[-1] and abs(Z.km_entre(30.1, 51.4, *c[0]) - 30) < 1
    assert Z.region_conectada(lambda i, j: False, 0, 0) == set()


def test_mascara_de_puntos_no_invade_zonas_normales():
    pts = [(0.0, 0.0, {"ok": True}), (1.0, 0.0, {"ok": True}), (6.0, 0.0, {"ok": False})]
    celdas = Z.mascara_de_puntos(pts, lambda p: p["ok"], paso=1.0, radio_km=250)
    centros = [(-180 + c + 0.5) for f, c in celdas]
    assert min(centros) < 0 < max(centros) and max(centros) < 4.5   # no llega a la estación normal de 6°
    assert [len(g) for _, g in Z.poligonos(celdas)] and Z.poligonos(set()) == []


def test_calor_humedad_y_anticiclones_traen_areas():
    def f(lon, lat, **p):
        return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]}, "properties": {"name": f"c{lon}", **p}}
    feats = [f(-100, 20, onda_calor=True, calor_nivel=3), f(-99, 20.5, onda_calor=True, calor_nivel=2), f(-90, 20, onda_calor=False, frio_nivel=0)]
    z = CA.zonas_calor_frio(feats)
    assert len(z) == 1 and z[0]["properties"]["zona"] and z[0]["properties"]["calor_nivel"] == 3
    assert z[0]["properties"]["ciudades"] == ["c-100", "c-99"] and z[0]["geometry"]["type"] == "Polygon"
    hs = [f(10 + k * 0.5, 45, hr=90, rocio_c=10, nivel=3, generador_ml_m3=1) for k in range(4)]
    zh = H.zonas_humedad(hs)
    assert {x["properties"]["zona_modo"] for x in zh} == {"hr", "condensacion"}
    hgt = np.full((181, 360), 5500.0)
    for i in range(50, 61):
        for j in range(190, 201):
            hgt[i, j] = 5800.0 - 10 * (abs(i - 55) + abs(j - 195))
    a = {"lon": 15.0, "lat": 35.0, "anomalia_dam": 25.0, "domo_calor": False, "subtropical": False}
    [area] = A.areas([a], hgt)
    xs = [p[0] for p in area["geometry"]["coordinates"][0]]
    assert area["properties"]["zona"] and 9 < min(xs) < 15 < max(xs) < 21
    [b] = A.areas_bloqueo({"norte": [(-10, 100, 5)], "sur": []}, 6)[:1]
    assert b["properties"]["kind"] == "bloqueo" and b["geometry"]["coordinates"][0][1][0] - b["geometry"]["coordinates"][0][0][0] <= 80


def test_bolsa_fria_con_area():
    t500 = np.full((181, 360), -20.0)
    t500[40:47, 100:108] = -32.0
    b = {"lon": -76.0, "lat": 47.0, "anomalia_c": -11.0, "t500_c": -32.0, "altura500_dam": 540.0}
    fc = G.geojson_bolsas([b], t500)
    tipos = [x["geometry"]["type"] for x in fc["features"]]
    assert tipos == ["Polygon", "Point"] and fc["features"][0]["properties"]["zona"]


def test_radiacion_zona_de_exclusion_y_sensores_altos():
    import radiacion as R
    cfg = {"sitios": [{"id": "chernobil", "nombre": "Chernóbil", "lat": 51.389, "lon": 30.099, "tipo": "accidente", "radio_km": 30}, {"id": "otro", "lat": 0, "lon": 0}]}
    sens = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [141.0, 37.4]}, "properties": {"k": "sensor", "nivel": "alto", "usv_h": 2.1}},
            {"type": "Feature", "geometry": {"type": "Point", "coordinates": [2.0, 41.0]}, "properties": {"k": "sensor", "nivel": "normal", "usv_h": 0.1}}]
    zs = R.areas(cfg, sens)
    assert [z["properties"]["k"] for z in zs] == ["sitio", "sensor"]
    assert zs[1]["properties"]["usv_h"] == 2.1
