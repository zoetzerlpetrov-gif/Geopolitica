"""Calidad del aire con CAMS de Copernicus: petición, punto de malla, promedio de 24 h y US AQI (sin red)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "clima"))
import aire_cams as C  # noqa: E402


def test_peticion_pm_superficie_24h():
    p = C.peticion("2026-11-11")
    assert p["variable"] == ["particulate_matter_2.5um", "particulate_matter_10um"]
    assert p["leadtime_hour"][0] == "0" and p["leadtime_hour"][-1] == "24" and p["time"] == ["00:00"]


def test_longitud_en_malla_0_360_y_mas_menos_180():
    assert C.lon_en_malla(-99.1, [0.0, 0.4, 359.6]) == (-99.1) % 360
    assert C.lon_en_malla(-99.1, [-180.0, 0.0, 179.6]) == -99.1


def test_promedio_y_aqi_por_ciudad():
    lats, lons = [20.0, 19.6, 19.2], [260.4, 260.8, 261.2]  # malla 0–360, latitud descendente como CAMS
    nan = float("nan")
    # 2 tiempos; CDMX (19.43, -99.13 → 260.87) cae en [1][1]; PM2.5 35 y 37 µg/m³ (en kg/m³), PM10 50
    def malla(v):
        return [[[v if (i, j) == (1, 1) else 0 for j in range(3)] for i in range(3)]]
    pm25 = malla(35e-9) + malla(37e-9) + [[[nan] * 3] * 3]
    pm10 = malla(50e-9) + malla(50e-9)
    lugares = [("Ciudad de México", "MEX", 19.43, -99.13, "capital")]
    prom = C.promedios_ciudad(lugares, lats, lons, pm25, pm10)
    assert prom == {0: (36.0, 50.0)}
    f = C.features_cams(lugares, prom, "2026-11-11")[0]["properties"]
    assert f["us_aqi"] == 102 and f["level_label"] == "Dañina para grupos sensibles"
    assert "CAMS" in f["fuente"]


def test_sin_llave_no_hace_nada(monkeypatch, capsys):
    monkeypatch.delenv("ADS_API_KEY", raising=False)
    assert C.main() == 0 and "sin ADS_API_KEY" in capsys.readouterr().out
