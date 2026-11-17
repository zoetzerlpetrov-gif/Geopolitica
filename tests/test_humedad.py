import gzip  # noqa: F401
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "clima"))
import co2  # noqa: E402
import humedad as H  # noqa: E402

AHORA = datetime(2026, 11, 17, 14, 20, tzinfo=timezone.utc)
CSV = """No errors
raw_text,station_id,observation_time,latitude,longitude,temp_c,dewpoint_c,wind_dir_degrees,wind_speed_kt,wind_gust_kt,visibility_statute_mi,altim_in_hg,sea_level_pressure_mb,corrected,auto,auto_station,maintenance_indicator_on,no_signal,lightning_sensor_off,freezing_rain_sensor_off,present_weather_sensor_off,wx_string,sky_cover,cloud_base_ft_agl,sky_cover,cloud_base_ft_agl,sky_cover,cloud_base_ft_agl,sky_cover,cloud_base_ft_agl,flight_category,three_hr_pressure_tendency_mb,maxT_c,minT_c,maxT24hr_c,minT24hr_c,precip_in,pcp3hr_in,pcp6hr_in,pcp24hr_in,snow_in,vert_vis_ft,metar_type,elevation_m
"METAR MMCT",MMCT,2026-11-17T14:11:00.000Z,20.6410,-88.4460,24,21,0,0,,6,30.06,,,,,,,,,,,FEW,1500,SCT,25000,,,,,VFR,,,,,,,,,,,,METAR,29
"METAR KQEQ",KQEQ,2026-11-17T14:10:00.000Z,-99.9900,-99.9900,10,7,320,1,,6,30.11,,,,,,,,,,,SCT,3600,,,,,,,VFR,,,,,,,,,,,,METAR,9999
"METAR VIEJO",VIEJ,2026-11-17T08:00:00.000Z,10,10,20,10,0,0,,6,30,,,,,,,,,,,,,,,,,,,VFR,,,,,,,,,,,,METAR,10
"METAR MMCT",MMCT,2026-11-17T13:11:00.000Z,20.6410,-88.4460,22,21,0,0,,6,30.06,,,,,,,,,,,,,,,,,,,VFR,,,,,,,,,,,,METAR,29
"""


def test_formulas_basicas():
    assert abs(H.humedad_relativa(20, 20) - 100) < 1e-9
    assert abs(H.humedad_relativa(25, 13.9) - 50) < 1.5          # 25 °C y 50 % ≈ rocío 13.9 °C
    assert abs(H.humedad_absoluta(30, 30) - 30.3) < 0.5          # aire saturado a 30 °C ≈ 30 g/m³
    assert abs(H.punto_rocio(25, 50) - 13.9) < 0.2


def test_condensacion_y_agua():
    seco = H.agua_del_aire(35, 5, viento_ms=1, nubosidad=0)       # desierto: 30 °C de diferencia
    assert seco["condensacion"] == "muy baja" and seco["rocio_ml_m2_noche"] == 0 and seco["generador_ml_m3"] == 0
    humedo = H.agua_del_aire(20, 19, viento_ms=0.5, nubosidad=0)  # noche húmeda despejada y en calma
    assert humedo["condensacion"] == "alta" and 300 < humedo["rocio_ml_m2_noche"] < 900   # bajo el límite físico ~880 mL/m²
    assert humedo["generador_ml_m3"] > 9 and humedo["generador_l_dia"] > 30
    nublado = H.agua_del_aire(20, 19, viento_ms=0.5, nubosidad=1)
    assert nublado["rocio_ml_m2_noche"] < humedo["rocio_ml_m2_noche"]


def test_leer_metar_filtra_sin_coordenadas_viejos_y_repetidos():
    obs = H.leer_metar(CSV, AHORA)
    assert [o["id"] for o in obs] == ["MMCT"]
    assert obs[0]["nubes"] == 0.45 and obs[0]["elev_m"] == 29
    f = H.features(obs)[0]
    assert f["geometry"]["coordinates"] == [-88.446, 20.641] and f["properties"]["noche"] is False


def test_main_conserva_anteriores_si_hay_pocas_estaciones(tmp_path, monkeypatch):
    monkeypatch.setattr(H, "OUT", str(tmp_path / "h.geojson"))
    assert H.main(AHORA, descargar=lambda: CSV) == 0
    assert not os.path.exists(tmp_path / "h.geojson")


HTML = """<h3>Monthly Average Mauna Loa CO<sub>2</sub></h3><table><tr><td> September 2026: &nbsp; &nbsp; </td><td> 426.07 ppm </td></tr>
<tr><td> September 2025: &nbsp; &nbsp; </td><td> 424.37 ppm </td></tr></table><p>Last updated: Oct 09, 2026</p>"""


def test_co2_lee_ultimo_mes_y_anio_anterior(tmp_path, monkeypatch):
    d = co2.leer_pagina(HTML)
    assert d["mes"] == "2026-09" and d["ppm"] == 426.07 and d["aumento_ppm"] == 1.7 and d["actualizado"] == "2026-Oct-09"
    assert co2.leer_pagina("<p>sin datos</p>") is None
    monkeypatch.setattr(co2, "OUT", str(tmp_path / "co2.json"))
    co2.main(AHORA, pedir=lambda url: HTML)
    out = json.load(open(tmp_path / "co2.json"))
    assert set(out["series"]) == {"mauna_loa", "global"} and out["errores"] == []


def test_historial_suma_una_vez_por_hora_y_separa_noches():
    f = lambda hora, noche: {"properties": {"id": "MMCT", "hora_utc": hora, "generador_ml_m3": 10.0, "rocio_ml_m2_noche": 200, "noche": noche}}  # noqa: E731
    hist = {}
    assert H.acumular(hist, [f("2026-11-17T14:11:00Z", False)], AHORA) == 1
    assert H.acumular(hist, [f("2026-11-17T14:11:00Z", False)], AHORA) == 0          # misma observación repetida
    assert H.acumular(hist, [f("2026-11-18T03:00:00Z", True)], AHORA) == 1
    assert hist["estaciones"]["MMCT"]["m"]["2026-11"] == [2, 20.0, 1, 200]
    assert hist["desde"] == "2026-11-17"
