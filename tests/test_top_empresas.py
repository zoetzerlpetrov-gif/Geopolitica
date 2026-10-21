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
