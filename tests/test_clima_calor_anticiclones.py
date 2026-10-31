"""Ondas de calor / olas de frío (tools/clima/calor.py) y anticiclones en altura / bloqueos (tools/clima/anticiclones.py)."""
import json
import os
import sys

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "clima"))
sys.path.insert(0, os.path.join(ROOT, "tools", "clima_tactico"))
import anticiclones as A  # noqa: E402
import calor as C  # noqa: E402
import fetch_data as FD  # noqa: E402


def dia(fecha, tmax, tmin, hi=None, uv=None, fog=None):
    return {"date": fecha, "tmax": tmax, "tmin": tmin, "hi": hi, "uv": uv, "fog": fog}


def test_indice_de_calor_como_la_tabla_del_nws():
    assert FD.indice_calor(35, 60) == 45.1          # tabla del NWS: ~45 °C
    assert FD.indice_calor(25, 90) == 25            # abajo de 27 °C no aplica
    assert FD.indice_calor(None, 50) is None


def test_onda_de_calor_relativa_a_la_climatologia():
    clima = {"tmax": [25.0] * 12, "tmin": [10.0] * 12}
    dias = [dia("2026-06-01", 29, 15), dia("2026-06-02", 31, 18, hi=33), dia("2026-06-03", 32, 19, hi=40),
            dia("2026-06-04", 30.5, 18, hi=35), dia("2026-06-05", 26, 14)]
    r = C.evaluar({"days": dias}, clima)
    # Umbral = max(30, 25 + 5) = 30 °C: días 2-4 → onda de 3 días, índice de calor máximo 40 °C → «peligro».
    assert r["onda_calor"] and r["calor_tramos"] == [{"inicio": "2026-06-02", "fin": "2026-06-04", "dias": 3}]
    assert r["calor_nivel"] == 3
    # Sin climatología el umbral fijo es 35 °C: no hay onda.
    assert not C.evaluar({"days": dias}, None)["onda_calor"]


def test_ola_de_frio_heladas_uv_y_niebla():
    clima = {"tmax": [20.0] * 12, "tmin": [6.0] * 12}
    dias = [dia("2026-01-01", 10, 1, uv=3.2, fog=10), dia("2026-01-02", 8, 0.5, uv=6.5, fog=70), dia("2026-01-03", 9, -1),
            dia("2026-01-04", 12, 4)]
    r = C.evaluar({"days": dias}, clima)
    assert r["ola_frio"] and r["frio_tramos"][0]["dias"] == 3 and r["heladas"] == ["2026-01-03"] and r["frio_nivel"] == 3
    assert r["uv_max"] == 6.5 and r["uv_cat"] == "Alto" and r["niebla"] and r["niebla_pct"] == 70


def test_climatologia_del_cpc_y_descarga_por_lotes():
    filas = ["time,station,latitude,longitude,tmax"]
    for d in range(365):
        mes = min(12, d // 30 + 1)
        filas.append(f"0001-{mes:02d}-{(d % 28) + 1:02d}T00:00:00Z,P,19.25,-99.25,{20.0 + mes}")
    texto = "\n".join(filas)
    meses = C.leer_cpc(texto)
    assert meses[0] == 21.0 and meses[11] == 32.0 and len(meses) == 12
    assert C.leer_cpc("time,station,lat,lon,tmax\n0001-01-01T00:00:00Z,P,0,0,NaN") is None   # celda de mar
    assert "longitude=260.87" in C.url_cpc("tmax", 19.43, -99.13)
    pedidas = []
    base = {C.clave(1, 1): {"tmax": [1] * 12, "tmin": [1] * 12}}
    n = C.completar_base([("a", 1, 1), ("b", 2, 2), ("c", 3, 3), ("d", 4, 4)], base, bajar=lambda u: pedidas.append(u) or texto, lote=2, pausa=0)
    assert n == 2 and len(pedidas) == 4 and base[C.clave(2, 2)]["tmax"][0] == 21.0 and C.clave(4, 4) not in base


def campo_base():
    lat = np.arange(90, -91, -1.0)[:, None]
    return np.repeat(5500 + 0 * lat, 360, axis=1).astype(float) + (90 - np.abs(lat)) * 2


def test_anticiclon_en_altura_y_domo_de_calor():
    h = campo_base()
    t850 = np.full(h.shape, 10.0)
    # Loma de 150 m centrada en 35°N, 100°O (fila 55, columna 80) y aire caliente debajo.
    ii, jj = np.meshgrid(np.arange(h.shape[0]), np.arange(h.shape[1]), indexing="ij")
    h += 150 * np.exp(-(((ii - 55) ** 2 + (jj - 80) ** 2) / 18.0))
    t850[50:60, 75:85] = 24
    altas = A.anticiclones(h, t850)
    assert altas and altas[0]["lat"] == 35 and altas[0]["lon"] == -100 and altas[0]["domo_calor"]
    assert A.persistencia(altas[:1], [altas, altas, []])[0]["horizontes"] == 2


def test_bloqueo_de_tibaldi_molteni():
    h = campo_base()
    for lat in range(30, 90):
        h[A.G.fila_de_lat(lat)] = 5800 - (lat - 30) * 10  # gradiente normal: baja hacia el polo, sin bloqueo
    normal = A.bloqueadas(h)
    assert not normal.any()
    hb = h.copy()
    col = slice(170, 190)  # 10°O a 9°E
    for lat in range(30, 90):
        f = A.G.fila_de_lat(lat)
        hb[f, col] = 5500 + 300 * np.exp(-((lat - 62) ** 2) / 40)  # alta centrada en 62°N: gradiente invertido al sur
    serie = [A.bloqueadas(hb)] * 4 + [normal] * 2
    franjas = A.franjas_bloqueo(serie, ancho=12, dias=4)
    assert franjas and franjas[0][0] == -10 and franjas[0][1] == 9 and franjas[0][2] == 4
    gj = A.geojson([], {"norte": franjas, "sur": []}, 6, None)
    assert gj["features"][0]["properties"]["kind"] == "bloqueo" and gj["features"][0]["geometry"]["coordinates"][0] == [-10, 60]
