import json
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "capas"))

import operadores as OP  # noqa: E402
import sitios as S  # noqa: E402

RAIZ = os.path.join(os.path.dirname(__file__), "..")


def test_tabla_valida():
    d = json.load(open(os.path.join(RAIZ, "config", "operadores.json"), encoding="utf-8"))
    nombres = set()
    for o in d["operadores"]:
        re.compile(o["rx"])
        assert o["n"] not in nombres
        nombres.add(o["n"])
        assert (o["a2"] == o["a3"] == "") or (len(o["a2"]) == 2 and len(o["a3"]) == 3)


def test_nacional_extranjera_mixta():
    assert OP.propiedades("MEX", ["Pemex Exploración y Producción"]) == {"op": "Pemex Exploración y Producción", "o": "MX", "nac": "n", "est": "1"}
    assert OP.propiedades("MEX", ["Eni"])["nac"] == "e"
    p = OP.propiedades("MEX", ["Pemex; Talos Energy"])
    assert p["o"] == "MX,US" and p["nac"] == "m"
    assert OP.propiedades("USA", ["W&T Offshore"])["o"] == "US"


def test_sin_dato():
    assert OP.propiedades("GBR", ["Compañía local"]) == {"op": "Compañía local"}
    assert OP.propiedades("GBR", [""]) == {}
    # Consorcio sin país único en la tabla: solo el nombre.
    assert "o" not in OP.propiedades("PER", ["Antamina"])


def test_wikidata_manda_sobre_la_tabla():
    # Wikidata ya dice el país de la compañía: no se agrega otro desde la tabla.
    assert OP.propiedades("NOR", ["Equinor"], [("NO", "NOR")])["o"] == "NO"


def test_registro_de_wikidata_con_operador_y_producto():
    filas = {"results": {"bindings": [
        {"x": {"value": "http://www.wikidata.org/entity/Q1"}, "xEs": {"value": "Mina de prueba"}, "coord": {"value": "Point(-110.5 29.1)"},
         "n": {"value": "3"}, "iso": {"value": "MEX"}, "opEn": {"value": "Grupo México"}, "opA2": {"value": "MX"}, "opA3": {"value": "MEX"},
         "prodEs": {"value": "cobre"}},
        {"x": {"value": "http://www.wikidata.org/entity/Q1"}, "xEs": {"value": "Mina de prueba"}, "coord": {"value": "Point(-110.5 29.1)"},
         "n": {"value": "3"}, "iso": {"value": "MEX"}, "opEn": {"value": "Grupo México"}, "opA2": {"value": "MX"}, "opA3": {"value": "MEX"},
         "prodEs": {"value": "molibdeno"}},
    ]}}
    reg = S.leer(filas, ("Q820477", "mineria", 0, "recurso_sub", 5))
    ft = S.features(reg, lambda g, p, z: {"geometry": g, "properties": p}, lambda lon, lat: [lon, lat], con_operador=True)[0]["properties"]
    assert ft["op"] == "Grupo México" and ft["o"] == "MX" and ft["nac"] == "n"
    assert "cobre, molibdeno" in ft["x"]
