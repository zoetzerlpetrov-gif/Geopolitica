"""Pronóstico de 7 días con MET Norway (CC BY 4.0) y ráfagas del GFS de NOAA (sustituto comercial de Open-Meteo)."""
import importlib.util
import os
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
spec = importlib.util.spec_from_file_location("fd", os.path.join(ROOT, "tools", "clima_tactico", "fetch_data.py"))
FD = importlib.util.module_from_spec(spec)
spec.loader.exec_module(FD)


def paso(t, temp, viento, uno=None, seis=None):
    d = {"instant": {"details": {"air_temperature": temp, "wind_speed": viento}}}
    if uno is not None:
        d["next_1_hours"] = {"summary": {"symbol_code": uno[0]}, "details": {"precipitation_amount": uno[1]}}
    if seis is not None:
        d["next_6_hours"] = {"summary": {"symbol_code": seis[0]}, "details": {"precipitation_amount": seis[1], "air_temperature_max": seis[2], "air_temperature_min": seis[3]}}
    return {"time": t, "data": d}


def test_simbolos_a_codigos_wmo():
    assert FD.simbolo_a_wmo("clearsky_day") == 0 and FD.simbolo_a_wmo("partlycloudy_night") == 2
    assert FD.simbolo_a_wmo("heavyrainshowersandthunder_day") == 95 and FD.simbolo_a_wmo("lightrain") == 61
    assert FD.simbolo_a_wmo("rainshowers_day") == 81 and FD.simbolo_a_wmo("") is None


def test_resumen_diario_sin_contar_dos_veces_la_lluvia():
    # Veracruz (lon −96 → UTC−6): 06 UTC del 29 = 00 h del 29 local.
    ts = [paso("2026-10-29T06:00:00Z", 22, 3, uno=("fair_night", 0.5), seis=("rain", 9.0, 30, 20)),
          paso("2026-10-29T07:00:00Z", 24, 5, uno=("rain", 1.5), seis=("rain", 9.0, 30, 20)),
          paso("2026-10-29T12:00:00Z", 28, 2, seis=("heavyrain", 12.0, 31, 21)),   # parte cada 6 h: usa next_6_hours
          paso("2026-10-30T12:00:00Z", 26, 10, seis=("cloudy", 0.0, 27, 18))]
    d = FD.diarios_metno({"properties": {"timeseries": ts}}, -96.1)
    assert d["time"] == ["2026-10-29", "2026-10-30"]
    assert d["precipitation_sum"] == [14.0, 0.0]          # 0.5 + 1.5 + 12, sin sumar el next_6 de las horarias
    assert d["temperature_2m_max"] == [31, 27] and d["temperature_2m_min"] == [21, 18]
    assert d["wind_speed_10m_max"] == [18.0, 36.0] and d["weather_code"] == [65, 3]
    assert d["precipitation_probability_max"] == [None, None]


def test_rafagas_diarias_y_ficha_sin_ráfaga():
    pasos = [(datetime(2026, 10, 29, 9, tzinfo=timezone.utc), {"gust": [20.0]}), (datetime(2026, 10, 29, 21, tzinfo=timezone.utc), {"gust": [10.0]}),
             (datetime(2026, 10, 30, 9, tzinfo=timezone.utc), {"gust": [None]})]
    r = FD.rafagas_diarias(pasos, [("Veracruz", 19.2, -96.1)])
    assert r == [{"2026-10-29": 72.0}]
    daily = {"time": ["2026-10-29", "2026-10-30"], "precipitation_sum": [14.0, 0.0], "precipitation_probability_max": [None, None],
             "wind_speed_10m_max": [18.0, 36.0], "temperature_2m_max": [31, 27], "temperature_2m_min": [21, 18], "weather_code": [65, 3],
             "wind_gusts_10m_max": [72.0, None]}
    p = FD._features_pronostico([("Veracruz", 19.2, -96.1)], [{"daily": daily}])[0]["properties"]
    assert p["max_gust_kmh"] == 72.0 and p["level"] == 2 and p["days"][1]["gust"] is None
