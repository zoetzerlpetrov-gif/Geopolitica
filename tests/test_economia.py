"""Capas de economía: lista fiscal de la UE, tasas del BIS y nodos de Bitcoin por país."""
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "capas"))
sys.path.insert(0, os.path.join(ROOT, "tools", "red"))
import economia as E  # noqa: E402
import red as R  # noqa: E402

PAISES = json.load(open(os.path.join(ROOT, "data", "base", "countries.geojson"), encoding="utf-8"))
I23 = {k.upper(): v for k, v in json.load(open(os.path.join(ROOT, "config", "gazetteer.json"), encoding="utf-8"))["iso2_a_iso3"].items()}


def test_lista_ue_todas_las_jurisdicciones_tienen_forma_y_punto():
    fs = E.features_lista_ue(PAISES)
    isos = {f["properties"]["p"] for f in fs}
    assert isos == set(E.ANEXO_I) | set(E.ANEXO_II)  # ninguna se pierde por no estar en el mapa base
    rus = [f for f in fs if f["properties"]["p"] == "RUS"]
    assert {f["geometry"]["type"] for f in rus} >= {"Point"} and rus[0]["properties"]["st"] == "ue_no_cooperativa"
    assert all(f["properties"]["st"] == "ue_compromisos" for f in fs if f["properties"]["p"] == "PAN")


def test_tasas_bis_con_zona_euro_y_cambio_anual():
    csv = """FREQ,REF_AREA,SOURCE_REF,TIME_PERIOD,OBS_VALUE
M,MX,Bank of Mexico,2025-09,7.75
M,MX,Bank of Mexico,2026-08,6.75
M,MX,Bank of Mexico,2026-09,6.5
M,XM,European Central Bank,2026-09,2
M,XM,European Central Bank,2025-09,2
M,US,US Federal Reserve System,2026-09,
M,US,US Federal Reserve System,2026-08,3.625"""
    t = E.tasas_por_pais(E.leer_bis(csv), I23)
    assert t["MEX"] == (6.5, "2026-09", -1.25, "Bank of Mexico")
    assert t["DEU"][0] == 2 and t["DEU"][2] == 0 and t["BGR"][3].startswith("Banco Central Europeo")
    assert t["USA"][:2] == (3.625, "2026-08")  # el mes sin dato no borra el último valor
    mx = next(f for f in E.features_tasas(PAISES, t) if f["properties"]["p"] == "MEX")["properties"]
    assert mx["st"] == "tasa_4" and "bajó 1.25 puntos" in mx["x"]


def test_nodos_bitcoin_por_pais_sin_ip():
    geo = R.GeoIP([("8.8.8.0", "8.8.8.255", "US"), ("2001::", "2001::ffff", "DE")])
    nodos = {"8.8.8.1:8333": [], "8.8.8.2:8333": [], "[2001::5]:8333": [], "abc.onion:8333": [], "9.9.9.9:8333": []}
    por, tor, sin = E.nodos_por_pais(nodos, geo, I23)
    assert por == {"USA": 2, "DEU": 1} and tor == 1 and sin == 1
    fs = E.features_nodos(PAISES, por, 5, tor, "2026-10-09")
    assert {f["properties"]["p"] for f in fs} == {"USA", "DEU"} and "8.8.8" not in json.dumps(fs)
