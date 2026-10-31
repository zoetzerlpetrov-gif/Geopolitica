"""Series en puntos con modelos de NOAA (sustituto comercial de Open-Meteo): nortes y mar de fondo."""
import math
import os
import sys
import urllib.error
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "clima"))
import gfs_puntos as G  # noqa: E402
import frentes as Fr  # noqa: E402
import mar_fondo as M  # noqa: E402

NAN = float("nan")


def test_direccion_meteorologica():
    assert round(G.direccion_desde(0, -10)) == 0      # sopla hacia el sur: viene del norte
    assert round(G.direccion_desde(-10, 0)) == 90     # hacia el oeste: viene del este
    assert round(G.direccion_desde(0, 10)) == 180
    assert round(G.direccion_desde(10, 0)) == 270


def test_celda_con_dato_salta_tierra_y_cruza_el_meridiano():
    lats, lons = [21.0, 20.75, 20.5], [0.0, 0.25, 0.5, 359.5, 359.75]
    v = [[NAN, NAN, NAN, NAN, 7.0], [NAN, NAN, NAN, NAN, NAN], [NAN, NAN, 3.0, NAN, NAN]]
    assert G.celda_con_dato(lats, lons, v, 21.0, -0.25) == (0, 4)   # −0.25° = 359.75°
    assert G.celda_con_dato(lats, lons, v, 20.6, 0.4) == (2, 2)
    assert G.celda_con_dato(lats, lons, [[NAN] * 5] * 3, 21, 0) is None


def test_urls_de_nomads():
    c = datetime(2026, 10, 29, 6, tzinfo=timezone.utc)
    u = G.url_gfs(c, 9, ["GUST"], ["surface"], (27, -99, -86, 13))
    assert "gfs.20261029%2F06%2Fatmos" in u and "pgrb2.0p25.f009" in u and "leftlon=261" in u and "rightlon=274" in u
    assert "gfswave.t06z.global.0p25.f012.grib2" in G.url_olas(c, 12) and "var_SWELL=on" in G.url_olas(c, 12)
    assert G.corridas(datetime(2026, 10, 29, 5, tzinfo=timezone.utc))[0] == datetime(2026, 10, 29, 0, tzinfo=timezone.utc)


def test_series_usa_la_corrida_publicada_y_se_detiene_en_el_primer_hueco():
    pedidas = []

    def get(url):
        pedidas.append(url)
        if "t06z" in url or url.endswith("f009"):
            raise urllib.error.HTTPError(url, 404, "no", {}, None)
        return url.encode()

    def leer(datos, nombres):
        f = int(datos.decode()[-3:])
        return {"gust": ([20.0, 19.0], [263.0, 264.0], [[float(f), 1.0], [2.0, 3.0]])}, datetime(2026, 10, 29, f % 24, tzinfo=timezone.utc)

    url = lambda c, f: f"x/t{c:%H}z/f{f:03d}"  # noqa: E731
    pasos, corrida = G.series([("A", 20.0, -97.0)], url, [3, 6, 9, 12], {"gust"}, datetime(2026, 10, 29, 11, tzinfo=timezone.utc), pausa=0, get=get, leer=leer)
    assert corrida.hour == 0 and [p[1]["gust"][0] for p in pasos] == [3.0, 6.0]   # f009 falta: se usa lo que hay


def test_nortes_con_gfs_cada_3_horas():
    t = [datetime(2026, 10, 30, h, tzinfo=timezone.utc) for h in (0, 3, 6)]
    pasos = [(t[0], {"10u": [0.0], "10v": [-10.0], "gust": [16.0]}),   # del norte, ráfaga 57.6 km/h
             (t[1], {"10u": [0.0], "10v": [10.0], "gust": [30.0]}),    # del sur: no cuenta
             (t[2], {"10u": [-3.0], "10v": [-9.0], "gust": [21.0]})]   # del NNE, 75.6 km/h
    datos = G.a_horario(Fr.viento_gfs(pasos), [("Veracruz, Ver.", 19.2, -96.1)], {"dir": "wind_direction_10m", "vel": "wind_speed_10m", "raf": "wind_gusts_10m"})
    p = Fr.nortes_de(datos, [("Veracruz, Ver.", 19.2, -96.1)], paso_h=3)[0]["properties"]
    assert p["horas"] == 6 and p["rafaga_max_kmh"] == 76 and p["nivel"] == 2
    assert p["inicio"] == "2026-10-30T00:00" and p["fin"] == "2026-10-30T06:00"


def test_mar_de_fondo_con_gfs_wave():
    t = [datetime(2026, 10, 30, h, tzinfo=timezone.utc) for h in (0, 6, 12)]
    pasos = [(t[0], {"shts": [1.0, None], "mpts": [9.0, None], "swdir": [200.0, None]}),
             (t[1], {"shts": [2.4, None], "mpts": [14.0, None], "swdir": [210.0, None]}),
             (t[2], {"shts": [3.1, None], "mpts": [15.0, None], "swdir": [215.0, None]})]
    puntos = [("Acapulco, Gro.", 16.75, -99.9), ("Tierra", 19.4, -99.1)]
    datos = G.a_horario(pasos, puntos, {"shts": "swell_wave_height", "mpts": "swell_wave_period", "swdir": "swell_wave_direction"})
    f = M.feature(*puntos[0], datos[0], True, paso_h=6)["properties"]
    assert f["nivel"] == 2 and f["altura_max_m"] == 3.1 and f["horas_evento"] == 12 and f["inicio"] == "2026-10-30T06:00"
    assert M.feature(*puntos[1], datos[1], False, paso_h=6) is None   # celda de tierra: sin oleaje
    assert not math.isnan(f["periodo_en_max_s"])


def test_series_convierte_nan_en_none():
    nan = float("nan")

    def leer(datos, nombres):
        f = int(datos.decode()[-3:])
        # El punto tiene dato en f000 (se elige la celda) y queda vacío (NaN) en f006.
        return {"shts": ([20.0], [263.0], [[2.5 if f == 0 else nan]])}, datetime(2026, 10, 29, f % 24, tzinfo=timezone.utc)

    url = lambda c, f: f"x/t{c:%H}z/f{f:03d}"  # noqa: E731
    pasos, _ = G.series([("A", 20.0, -97.0)], url, [0, 6], {"shts"}, datetime(2026, 10, 29, 11, tzinfo=timezone.utc), pausa=0,
                        get=lambda u: u.encode(), leer=leer)
    assert [p[1]["shts"][0] for p in pasos] == [2.5, None]
    datos = G.a_horario(pasos, [("A", 20.0, -97.0)], {"shts": "swell_wave_height", "mpts": "swell_wave_period", "swdir": "swell_wave_direction"})
    f = M.feature("A", 20.0, -97.0, datos[0], True, 6)
    import json
    json.dumps(f, allow_nan=False)  # sin NaN: el navegador puede leerlo
