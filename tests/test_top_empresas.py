"""Top 10 de empresas por país: orden por notoriedad, cifras de Wikidata y si cotiza."""
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "capas"))
import top_empresas as T  # noqa: E402

feat = lambda g, p, z: {"geometry": g, "properties": {**p, "z": z}}  # noqa: E731
punto = lambda lon, lat: {"type": "Point", "coordinates": [lon, lat]}  # noqa: E731


def test_top_por_pais_y_cifras():
    reg = {f"Q{i}": {"qid": f"Q{i}", "nombre": f"E{i}", "iso": "MEX" if i < 13 else "", "n": i, "lon": -99, "lat": 19, "sede": "CDMX", "industrias": []} for i in range(1, 15)}
    top = T.top_por_pais(reg)
    assert list(top) == ["MEX"] and len(top["MEX"]) == 10 and top["MEX"][0]["qid"] == "Q12"
    res = {"results": {"bindings": [
        {"x": {"value": "http://www.wikidata.org/entity/Q12"}, "emp": {"value": "1000"}, "ing": {"value": "5e9"}, "ingMon": {"value": "MXN"}, "ingAnio": {"value": "2022"},
         "bolsaEs": {"value": "Bolsa Mexicana de Valores"}},
        {"x": {"value": "http://www.wikidata.org/entity/Q12"}, "emp": {"value": "1200"}, "ing": {"value": "6e9"}, "ingMon": {"value": "MXN"}, "ingAnio": {"value": "2024"}},
    ]}}
    det = T.leer_detalle(res, {})
    assert det["Q12"]["empleados"] == 1200 and det["Q12"]["ingresos_anio"] == 2024 and det["Q12"]["bolsas"] == ["Bolsa Mexicana de Valores"]
    fs = T.features(top, det, feat, punto)
    p0 = fs[0]["properties"]
    assert p0["n"] == "1. E12" and p0["st"] == "top_cotiza" and "6.0 mil millones MXN (2024)" in p0["x"]
    assert fs[1]["properties"]["st"] == "top_privada" and "no cotiza" in fs[1]["properties"]["x"]
    assert T.cifra(2.5e12, "USD") == "2.5 billones USD"


def test_excluye_no_empresas_ordena_por_empleados_y_separa_puntos():
    reg = {"Q1": {"qid": "Q1", "nombre": "Banco de México", "iso": "MEX", "n": 90, "lon": -99.13, "lat": 19.43, "industrias": []},
           "Q2": {"qid": "Q2", "nombre": "Bolsa Mexicana de Valores", "iso": "MEX", "n": 80, "lon": -99.13, "lat": 19.43, "industrias": []},
           "Q3": {"qid": "Q3", "nombre": "Grupo A", "iso": "MEX", "n": 70, "lon": -99.13, "lat": 19.43, "industrias": []},
           "Q4": {"qid": "Q4", "nombre": "Grupo B", "iso": "MEX", "n": 20, "lon": -99.13, "lat": 19.43, "industrias": []},
           "Q5": {"qid": "Q5", "nombre": "Filial", "iso": "MEX", "n": 60, "lon": -87.6, "lat": 41.9, "industrias": []}}
    top = T.top_por_pais(reg, n=30, pais_de=lambda lon, lat: "USA" if lon > -90 else "MEX")
    assert [r["nombre"] for r in top["MEX"]] == ["Grupo A", "Grupo B"]   # sin banco central ni bolsa
    assert top["USA"][0]["nombre"] == "Filial"                           # país por la sede
    top = T.ordenar(top, {"Q4": {"empleados": 50000}, "Q3": {"empleados": 100}})
    assert [r["nombre"] for r in top["MEX"]] == ["Grupo B", "Grupo A"]
    fs = T.features(top, {"Q4": {"empleados": 50000}}, feat, punto)
    mx = [f for f in fs if f["properties"]["p"] == "MEX"]
    assert mx[0]["geometry"]["coordinates"] != mx[1]["geometry"]["coordinates"]   # ya no se enciman
    assert "misma ciudad sede: 2. Grupo A" in mx[0]["properties"]["x"] and "por empleados" in mx[0]["properties"]["x"]
