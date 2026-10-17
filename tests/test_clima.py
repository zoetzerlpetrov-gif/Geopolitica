"""Capa de clima (GFS): horizontes, codificación del viento, proyección a Web Mercator y paletas."""
import os
import sys
from datetime import datetime, timezone

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "clima"))
import gfs  # noqa: E402


def test_corridas_y_horizontes():
    ahora = datetime(2026, 10, 8, 19, 40, tzinfo=timezone.utc)
    c = gfs.corridas_candidatas(ahora, 3)
    assert [x.hour for x in c] == [18, 12, 6]
    # Corrida de las 12Z vista a las 19:40: «ahora» ≈ f006 (7.7 h → múltiplo de 3 más cercano), luego +12, +24…
    assert gfs.horizontes(c[1], ahora) == [9, 21, 33, 57, 81]
    assert gfs.horizontes(c[0], ahora)[0] == 3  # nunca f000 (sin precipitación acumulada)


def test_viento_ida_y_vuelta():
    u = np.array([[-40.0, 0.0, 12.5]]); v = np.array([[40.0, -5.0, 0.0]])
    img = gfs.codificar_viento(u, v)
    assert img.shape == (1, 3, 3) and img.dtype == np.uint8
    assert np.allclose(gfs.decodificar_viento(img[..., 0].astype(float)), u, atol=0.2)
    assert np.allclose(gfs.decodificar_viento(img[..., 1].astype(float)), v, atol=0.2)
    assert gfs.codificar_viento(np.array([[99.0]]), np.array([[-99.0]]))[0, 0, :2].tolist() == [255, 0]  # se recorta


def test_rejilla_a_180():
    campo = np.tile(np.arange(360, dtype=float), (181, 1))  # valor = longitud 0…359
    r = gfs.a_180(campo)
    assert r[0, 0] == 180 and r[0, 180] == 0  # la columna 0 es −180° (= 180° E)


def test_mercator_conserva_latitudes():
    lats = np.linspace(90, -90, 181)
    campo = np.repeat(lats[:, None], 360, axis=1)  # cada celda vale su latitud
    m = gfs.a_mercator(campo, alto=256)
    assert m.shape == (256, 256)
    assert abs(m[128, 0]) < 1.0                     # el centro vertical es el Ecuador
    assert 84 < m[0, 10] <= 85.1 and -85.1 <= m[-1, 10] < -84
    assert m[64, 50] > 60                            # un cuarto de alto en Mercator ≈ 66° N, no 45°


def test_paletas():
    rgba = gfs.colorear(np.array([[-60.0, 0.0, 45.0]]), gfs.PALETA_TEMP)
    assert rgba[0, 0, 3] == 0 and rgba[0, 1, 3] > 0 and rgba[0, 2].tolist()[:3] == [192, 57, 43]
    lluvia = gfs.colorear(np.array([[0.0, 0.05, 2.0]]), gfs.PALETA_LLUVIA)
    assert lluvia[0, 0, 3] == 0 and lluvia[0, 1, 3] == 0 and lluvia[0, 2, 3] > 100


def test_isolineas_cierran_una_vuelta_por_hemisferio_y_se_cortan_en_la_linea_de_cambio_de_fecha():
    lat = np.linspace(90, -90, 181)[:, None]
    campo = 30 - 0.8 * np.abs(lat) + np.zeros((1, 360))  # 0 °C en ±37.5°
    lineas = gfs.isolineas(campo, 0)
    assert len(lineas) == 2
    for l in lineas:
        lats = {round(p[1], 1) for p in l}
        assert lats <= {37.5, -37.5}
        lons = [p[0] for p in l]
        assert min(lons) >= -180 and max(lons) <= 180 and len(l) > 300


def test_aire_polar_transparente_arriba_de_cero():
    campo = np.array([[5.0, -12.0], [0.5, -35.0]])
    arr = gfs.colorear_polar(campo)
    assert arr[0, 0, 3] == 0 and arr[1, 0, 3] == 0
    assert arr[0, 1, 3] > 100 and arr[1, 1, 3] > 150
    gj = gfs.geojson_isotermas(np.tile(np.linspace(10, -30, 181)[:, None], (1, 360)))
    assert {f["properties"]["t"] for f in gj["features"]} == {0, -10, -20}
