"""Calidad del aire por ciudad (Open-Meteo) y alertas volcánicas (CENAPRED, USGS): lectura sin red."""
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "clima"))
import aire as A  # noqa: E402
import volcanes as V  # noqa: E402


def test_seleccion_de_ciudades():
    filas = [["Mexico City", "Ciudad de México", "MEX", 19.4, -99.1, "capital", 19_000_000], ["Puebla", "", "MEX", 19, -98.2, "capital_estatal", 2_000_000],
             ["Zihuatanejo", "", "MEX", 17.6, -101.5, "ciudad", 60_000], ["Lyon", "", "FRA", 45.7, 4.8, "capital_estatal", 1_400_000],
             ["Osaka", "", "JPN", 34.7, 135.5, "capital_estatal", 11_000_000], ["Paris", "París", "FRA", 48.8, 2.3, "capital", 11_000_000]]
    assert [x[0] for x in A.seleccionar(filas)] == ["Ciudad de México", "Puebla", "Osaka", "París"]


def test_bandas_y_features():
    assert A.banda(30)[1] == "Buena" and A.banda(61)[0] == 1 and A.banda(151)[1] == "Dañina" and A.banda(999)[0] == 5
    lugares = [("Ciudad de México", "MEX", 19.4, -99.1, "capital"), ("Sin dato", "XXX", 0, 0, "capital")]
    resp = [{"current": {"us_aqi": 64, "pm2_5": 23.7, "time": "2026-10-09T01:00"}}, {"current": {}}]
    out = A.features_aire(lugares, resp)
    assert len(out) == 1
    p = out[0]["properties"]
    assert p["name"] == "Ciudad de México" and p["level"] == 1 and p["level_label"] == "Moderada" and p["pais_iso3"] == "MEX"
    assert out[0]["geometry"]["coordinates"] == [-99.1, 19.4]


def test_semaforo_cenapred():
    lista = 'x href=\\"/cenapred/es/articulos/monitoreo-del-volcan-popocatepetl-hoy-8-de-octubre-de-2026?idiom=es\\" y href=\\"/cenapred/es/articulos/monitoreo-del-volcan-popocatepetl-hoy-6-de-octubre-de-2026?idiom=es\\"'
    ruta = V.ultimo_reporte_popo(lista)
    assert ruta == "/cenapred/es/articulos/monitoreo-del-volcan-popocatepetl-hoy-8-de-octubre-de-2026"
    assert V.fecha_de_ruta(ruta) == "2026-10-08"
    meta = '<meta name="description" content="&quot;El Semáforo de Alerta Volcánica del Popocatépetl se encuentra en AMARILLO FASE 2&quot;. El CENAPRED exhorta">'
    assert V.semaforo_de(meta) == ("Amarillo", 2)
    assert V.semaforo_de("Sin semáforo en el texto") is None


def test_aire_desde_sensor_community():
    import aire as A
    datos = [
        {"location": {"latitude": "48.85", "longitude": "2.35", "indoor": 0}, "sensordatavalues": [{"value_type": "P2", "value": "8.0"}, {"value_type": "P1", "value": "20"}]},
        {"location": {"latitude": "48.86", "longitude": "2.34", "indoor": 0}, "sensordatavalues": [{"value_type": "P2", "value": "10.0"}, {"value_type": "P1", "value": "30"}]},
        {"location": {"latitude": "48.86", "longitude": "2.34", "indoor": 1}, "sensordatavalues": [{"value_type": "P2", "value": "90"}]},     # interior: fuera
        {"location": {"latitude": "48.87", "longitude": "2.33", "indoor": 0}, "sensordatavalues": [{"value_type": "P2", "value": "999"}]},    # saturado: fuera
        {"location": {"latitude": "19.43", "longitude": "-99.13", "indoor": 0}, "sensordatavalues": [{"value_type": "P2", "value": "40"}]},   # solo 1 sensor
    ]
    lec = A.lecturas_sensor_community(datos)
    assert len(lec) == 3
    f = A.features_sensores([("París", "FRA", 48.856, 2.352, "capital"), ("Ciudad de México", "MEX", 19.43, -99.13, "capital")], lec)
    assert len(f) == 1 and f[0]["properties"]["pm2_5"] == 9.0 and f[0]["properties"]["sensores"] == 2
    assert f[0]["properties"]["us_aqi"] == 50 and f[0]["properties"]["level_label"] == "Buena"
    assert A.aqi_de(35.4, A.CORTES_PM25) == 100 and A.aqi_de(55.4, A.CORTES_PM25) == 150 and A.aqi_de(None, A.CORTES_PM25) is None
