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


def test_peticion_lleva_fecha():
    from datetime import datetime
    for _, cuerpo, _claves in G.PETICIONES:
        c = G.con_fecha(cuerpo, datetime(2026, 11, 17))
        assert c["date"] == ["2026-11-17/2026-11-17"]
        assert "date" not in cuerpo


def test_co_y_flujos():
    assert G.clasificar("co", "Carbon monoxide") == "co_sup"
    assert G.clasificar("tcco", "Total column Carbon monoxide") is None
    assert G.clasificar("anee", "Accumulated Carbon Dioxide Net Ecosystem Exchange") == "nee"
    assert G.clasificar("agpp", "Accumulated Carbon Dioxide Gross Primary Production") == "gpp"
    assert G.clasificar("arec", "Accumulated Carbon Dioxide Ecosystem Respiration") == "reco"
    assert G.a_unidades("co_sup", 1.0e-7) == round(1.0e-7 * G.AIRE_SECO / G.M_CO * 1e9)   # ≈103 ppb
    assert G.a_unidades("nee", -0.004) == -4.0      # kg/m² en 24 h → g/m² al día, conserva el signo (absorbe)
    assert G.a_unidades("gpp", -0.01) == 10.0       # la fotosíntesis se muestra como cantidad positiva


def test_malla_flujo():
    import numpy as np
    lats = [1.5, 0.5, -0.5, -1.5]
    lons = [0.5, 1.5, 2.5, 3.5]             # 4×4 celdas de 1° → 2×2 celdas de 2°
    nee = np.array([[-0.002, -0.004, 0, 0], [-0.002, -0.004, 0, 0], [0.001, 0.001, np.nan, np.nan], [0.001, 0.001, np.nan, np.nan]])
    f = G.malla_flujo(lats, lons, {"nee": nee, "gpp": nee * 3}, paso=2.0)
    assert len(f) == 2                       # las celdas sin vegetación (0 o NaN) no salen
    norte = [x for x in f if x["geometry"]["coordinates"][1] > 0][0]["properties"]
    assert norte["nee"] == -3.0 and norte["gpp"] == 9.0


def test_vigente_exige_todas_las_variables(tmp_path):
    import json
    from datetime import datetime, timezone
    ahora = datetime(2026, 11, 19, 12, tzinfo=timezone.utc)
    out, flujo = tmp_path / "g.json", tmp_path / "f.json"
    out.write_text(json.dumps({"generado_utc": "2026-11-19T10:00:00Z", "variables": ["co2_sup", "ch4_sup", "co2_col", "ch4_col"]}))
    assert not G.vigente(str(out), str(flujo), ahora)            # faltan CO y flujos: se vuelve a descargar
    out.write_text(json.dumps({"generado_utc": "2026-11-19T10:00:00Z", "variables": list(G.CLAVES)}))
    flujo.write_text("{}")
    assert G.vigente(str(out), str(flujo), ahora)
    assert not G.vigente(str(out), str(flujo), datetime(2026, 11, 20, 12, tzinfo=timezone.utc))
    assert not G.vigente(str(tmp_path / "no.json"), str(flujo), ahora)
