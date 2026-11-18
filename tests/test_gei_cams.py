import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "clima"))
import gei_cams as G  # noqa: E402


def test_clasificar_variables():
    assert G.clasificar("co2") == "co2_sup"
    assert G.clasificar("ch4") == "ch4_sup"
    assert G.clasificar("xco2", "Column-mean CO2 molar fraction") == "co2_col"
    assert G.clasificar("tcch4") == "ch4_col"
    assert G.clasificar("var123", "Methane") == "ch4_sup"
    assert G.clasificar("t2m", "2 metre temperature") is None


def test_unidades():
    assert G.a_unidades("co2_sup", 6.47e-4) == 425.8      # kg/kg → ppm (6.47e-4 × 28.96 / 44.01 × 1e6)
    assert G.a_unidades("ch4_sup", 1.07e-6) == 1932      # kg/kg → ppb
    assert G.a_unidades("co2_col", 4.25e-4) == 425.0      # mol/mol → ppm
    assert G.a_unidades("co2_col", 425.3) == 425.3        # ya en ppm
    assert G.a_unidades("ch4_col", 1.92e-6) == 1920       # mol/mol → ppb
    assert G.a_unidades("ch4_col", 1.92) == 1920          # ppm → ppb
    assert G.a_unidades("co2_sup", float("nan")) is None


def test_features_y_resumen():
    lugares = [("Ciudad A", "MEX", 19.4, -99.1, "capital"), ("Ciudad B", "USA", 40.7, -74.0, "principal")]
    lats, lons = [40.0, 20.0], [260.0, 286.0]                       # malla en 0–360
    campos = {"co2_sup": [[6.5e-4, 6.6e-4], [6.4e-4, 6.3e-4]]}
    f = G.features(lugares, lats, lons, campos, "2026-11-18")
    assert [x["properties"]["name"] for x in f] == ["Ciudad A", "Ciudad B"]
    assert f[0]["properties"]["co2_sup"] == round(6.4e-4 * G.AIRE_SECO / G.M_CO2 * 1e6, 1)
    r = G.resumen(f)
    assert r["co2_sup"]["min"] <= r["co2_sup"]["promedio"] <= r["co2_sup"]["max"]
