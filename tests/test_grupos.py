"""Grupos criminales y terroristas (Wikidata): lectura y puntos de sede y presencia, sin red."""
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "capas"))
import grupos as G  # noqa: E402


def b(**kw):
    return {k: {"value": v} for k, v in kw.items()}


def test_grupos_sede_y_paises():
    W = "http://www.wikidata.org/entity/"
    res = {"results": {"bindings": [
        b(x=W + "Q1", xEs="'Ndrangheta", n="45", clase=W + "Q4335775", coord="Point(16.3 38.9)", sedeIso="ITA", areaIso="DEU"),
        b(x=W + "Q1", xEs="'Ndrangheta", n="45", clase=W + "Q4335775", coord="Point(16.3 38.9)", sedeIso="ITA", areaIso="AUS"),
        b(x=W + "Q2", xEn="Islamic State", n="200", clase=W + "Q17149090", areaIso="SYR"),
        b(x=W + "Q2", xEn="Islamic State", n="200", clase=W + "Q1788992", areaIso="IRQ"),
    ]}}
    grupos = G.leer_grupos(res, dict(G.CLASES))
    assert grupos["Q1"]["paises"] == {"DEU", "AUS"} and grupos["Q1"]["sede"] == (16.3, 38.9)
    assert G.tipo_principal(grupos["Q2"]["tipos"]) == "terrorismo"
    centro = {"DEU": (10.0, 51.0), "AUS": (134.0, -25.0), "SYR": (38.5, 35.0), "IRQ": (43.7, 33.2), "ITA": (12.5, 42.5)}
    feat = lambda g, p, z: {"geometry": g, "properties": {**p, "z": z}}  # noqa: E731
    punto = lambda lon, lat: {"type": "Point", "coordinates": [lon, lat]}  # noqa: E731
    out = G.features_grupos(grupos, centro, lambda i: i, feat, punto)
    roles = [(f["properties"]["n"], f["properties"]["rol"], f["properties"]["p"]) for f in out]
    assert ("'Ndrangheta", "sede", "ITA") in roles and ("'Ndrangheta", "presencia", "DEU") in roles
    assert ("Islamic State", "presencia", "SYR") in roles and not any(r == ("Islamic State", "sede", "") for r in roles)  # sin sede: solo presencia
    assert all(f["properties"]["st"].startswith("grupo_") for f in out)
    # Dos grupos en el mismo país no quedan en el mismo punto.
    g2 = {"A": {"qid": "A", "nombre": "A", "n": 5, "tipos": {"mafia"}, "sede": None, "sede_iso": None, "paises": {"DEU"}},
          "B": {"qid": "B", "nombre": "B", "n": 4, "tipos": {"mafia"}, "sede": None, "sede_iso": None, "paises": {"DEU"}}}
    c = [f["geometry"]["coordinates"] for f in G.features_grupos(g2, centro, lambda i: i, feat, punto)]
    assert c[0] != c[1]
