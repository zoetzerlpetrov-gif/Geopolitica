"""Frentes (CODSUS de NOAA WPC), nortes, El Niño/La Niña (NOAA CPC), mar de fondo y cielo (lluvias, cometas, asteroides).
Los textos de ejemplo son fragmentos reales de cada fuente (octubre de 2026)."""
import os
import sys
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "clima"))
sys.path.insert(0, os.path.join(ROOT, "tools", "espacio"))
import cielo as K  # noqa: E402
import enso as E  # noqa: E402
import frentes as Fr  # noqa: E402
import mar_fondo as M  # noqa: E402

CODSUS = """CODED SURFACE FRONTAL POSITIONS
NWS WEATHER PREDICTION CENTER COLLEGE PARK MD
928 PM EDT THU OCT 15 2026

VALID 101600Z
HIGHS 1041 4771097 1039 5301069
LOWS 997 6840773 1015 3380952
COLD 3380953 3270964 3180981 3150985 3051001 2911030 2911062
WARM 4231769 4061737 3751710
OCFNT 5501531 5451525 5381528 5351539 5381552 5471558 5581556 5821535 5851530
6031496 6051450 5821396
TROF 2361087 2801103
"""


def test_codsus_frentes_y_centros():
    feats, valido = Fr.frentes_de(CODSUS, datetime(2026, 10, 16, 2, tzinfo=timezone.utc))
    assert valido == "2026-10-16T00:00:00Z"
    altas = [f for f in feats if f["properties"]["kind"] == "alta"]
    assert altas[0]["geometry"]["coordinates"] == [-109.7, 47.7] and altas[0]["properties"]["presion_hpa"] == 1041
    frio = next(f for f in feats if f["properties"]["kind"] == "frio")
    assert frio["geometry"]["coordinates"][0] == [-95.3, 33.8] and frio["geometry"]["coordinates"][-1] == [-106.2, 29.1]
    assert frio["properties"]["toca_mexico"]
    ocluido = next(f for f in feats if f["properties"]["kind"] == "ocluido")
    assert len(ocluido["geometry"]["coordinates"]) == 12  # la línea de continuación se une a la anterior
    calido = next(f for f in feats if f["properties"]["kind"] == "calido")
    assert calido["geometry"]["coordinates"][0] == [-176.9, 42.3]


def test_punto_codsus_al_este_del_antimeridiano():
    assert Fr.punto("5001850") == [175.0, 50.0]  # 185° O = 175° E
    assert Fr.punto("2511") == [-11, 25]


def test_nortes_cuenta_solo_viento_del_norte_con_rafagas():
    r = {"hourly": {"time": ["2026-10-17T00:00", "2026-10-17T01:00", "2026-10-17T02:00", "2026-10-17T03:00"],
                    "wind_direction_10m": [350, 20, 180, 340], "wind_speed_10m": [30, 35, 40, 50], "wind_gusts_10m": [55, 72, 90, 40]}}
    f = Fr.nortes_de([r], [("Veracruz, Ver.", 19.2, -96.1)])[0]["properties"]
    assert f["horas"] == 2 and f["rafaga_max_kmh"] == 72 and f["nivel"] == 2  # la ráfaga de 90 km/h es del sur
    assert f["inicio"] == "2026-10-17T00:00" and f["fin"] == "2026-10-17T01:00"


SEMANAL = """ Weekly SST data starts week centered on 2Sept1981

                Nino1+2      Nino3        Nino34        Nino4
 Week          SST SSTA     SST SSTA     SST SSTA     SST SSTA
 30SEP2026     24.6 5.0     28.9 4.0     30.1 3.2     30.4 1.4
 07OCT2026     24.9 5.2     29.0 4.1     30.2 3.3     30.5 1.5
 23DEC1981     23.2 0.0     25.3 0.1     26.3-0.3     28.3-0.1
"""


def test_enso_semanal_signo_pegado_y_oni():
    s = E.semanal_de(SEMANAL)
    assert (s["semana"], s["nino34"], s["nino4"]) == ("23DEC1981", -0.3, -0.1)
    s2 = E.semanal_de(SEMANAL.rsplit("\n", 2)[0])
    assert (s2["semana"], s2["nino12"], s2["nino34"]) == ("07OCT2026", 5.2, 3.3)
    oni = E.oni_de(" SEAS  YR   TOTAL   ANOM\n  JJA 2026  28.60   1.80\n  JAS 2026  28.83   2.16\n")
    assert oni == [["JJA 2026", 1.8], ["JAS 2026", 2.16]] and E.fase(2.16) == "nino" and E.fase(-0.5) == "nina"


def test_enso_discusion_estado_y_sinopsis():
    d = E.discusion_de("<b>ENSO Alert System Status:</b> El Ni&ntilde;o Advisory</p><p><b>Synopsis:</b> El Niño continues to strengthen, "
                       "with a strong El Niño likely through January-March 2027. More.</p>")
    assert d["estado_en"] == "El Nino Advisory" and d["estado"].startswith("Aviso de El Niño")
    assert d["sinopsis_en"].startswith("El Niño continues") and d["sinopsis_en"].endswith("2027.")


def test_mar_de_fondo_umbral_y_celda_de_tierra():
    r = {"hourly": {"time": ["t0", "t1", "t2"], "swell_wave_height": [1.5, 2.4, 3.2], "swell_wave_period": [14, 13, 9], "swell_wave_direction": [200, 210, 220]}}
    p = M.feature("Acapulco", 16.75, -99.9, r, True)["properties"]
    assert p["nivel"] == 1 and p["altura_max_m"] == 3.2 and p["horas_evento"] == 1  # 3.2 m con 9 s no cuenta
    assert M.feature("Tierra", 0, 0, {"hourly": {"time": ["t0"], "swell_wave_height": [None]}}, False) is None


def test_lluvias_activas_y_proximas():
    ll = K.lluvias(datetime(2026, 10, 16, tzinfo=timezone.utc))
    cods = [f["properties"]["codigo"] for f in ll]
    assert cods == ["STA", "ORI", "NTA"]
    ori = ll[1]["properties"]
    assert ori["activa"] and ori["maximo"] == "2026-10-21" and (ori["lat_desde"], ori["lat_hasta"]) == (-54, 86)
    # Cuadrántidas: la actividad empieza en diciembre del año anterior al máximo.
    qua = [f for f in K.lluvias(datetime(2026, 12, 30, tzinfo=timezone.utc)) if f["properties"]["codigo"] == "QUA"][0]["properties"]
    assert qua["inicio"] == "2026-12-28" and qua["maximo"] == "2027-01-03" and qua["activa"]


def test_astronomia_basica():
    assert abs(K.gmst_grados(datetime(2000, 1, 1, 12, tzinfo=timezone.utc)) - 280.46) < 0.01
    lon, lat = K.punto_subyacente(1.0, 0.0, 0.0, datetime(2000, 1, 1, 12, tzinfo=timezone.utc))
    assert lat == 0 and abs(lon - 79.54) < 0.01  # 0° − 280.46° = 79.54° E
    assert K.iluminacion_luna(datetime(2000, 1, 6, 18, 14, tzinfo=timezone.utc)) == 0
    assert K.iluminacion_luna(datetime(2000, 1, 21, 12, tzinfo=timezone.utc)) > 0.98
    a, b = K.diametro_m(24.0)
    assert 40 < a < 45 and 90 < b < 95
    assert K.banda_visible(58) == (-12, 90)
