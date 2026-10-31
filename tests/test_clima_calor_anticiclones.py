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


def test_climatologia_del_cpc_desde_la_rejilla_mensual():
    lats = np.arange(-89.75, 90, 0.5)
    lons = np.arange(0.25, 360, 0.5)
    pedidas = []

    def leer(datos, var):
        mes = int(datos.decode())
        campo = np.full((lats.size, lons.size), (20.0 if var == "tmax" else 5.0) + mes)
        i, j = np.abs(lats - 30.25).argmin(), np.abs(lons - 220.25).argmin()
        campo[i, j] = np.nan                       # ciudad costera en celda de mar: toma la de tierra vecina
        i, j = np.abs(lats - 0.25).argmin(), np.abs(lons - 200.25).argmin()
        campo[i - 1:i + 2, j - 1:j + 2] = np.nan   # isla rodeada de mar: sin climatología
        return lats, lons, campo

    def bajar(url):
        pedidas.append(url)
        return url.split("time=0001-")[1][:2].encode()
    base = {C.clave(1, 1): {"tmax": [1] * 12, "tmin": [1] * 12}}
    n = C.completar_base([("a", 1, 1), ("CDMX", 19.43, -99.13), ("costa", 30.25, -139.75), ("isla", 0.25, -159.75)], base, bajar=bajar, leer=leer, pausa=0)
    assert n == 3 and len(pedidas) == 24 and "tmax.day.ltm.1991-2020.nc" in pedidas[0]
    assert base[C.clave(19.43, -99.13)]["tmax"][0] == 21.0 and base[C.clave(19.43, -99.13)]["tmin"][11] == 17.0
    assert base[C.clave(30.25, -139.75)]["tmax"][0] == 21.0
    assert base[C.clave(0.25, -159.75)] is None
    assert C.completar_base([("a", 1, 1)], base, bajar=bajar, leer=leer, pausa=0) == 0   # ya están todas


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


def test_normal_interpolada_y_dias_parciales():
    doce = [float(10 * m) for m in range(12)]          # ene 0, feb 10, … dic 110
    assert C.normal(doce, "2026-02-15") == 10.0
    assert abs(C.normal(doce, "2026-11-01") - (90 + 10 * 17 / 31)) < 1e-9   # entre el 15-oct y el 15-nov
    assert abs(C.normal(doce, "2026-12-31") - (110 - 110 * 16 / 31)) < 1e-9  # dic → ene del año siguiente
    clima = {"tmax": [20.0] * 12, "tmin": [10.0] * 12}
    dias = [dia(f"2026-07-0{k}", 40, 20) for k in range(1, 5)]
    for d in dias:
        d["h"] = 24
    dias[0]["h"] = 6                                   # hoy parcial: no cuenta → solo 3 días completos
    r = C.evaluar({"days": dias}, clima)
    assert r["onda_calor"] and r["calor_tramos"][0]["inicio"] == "2026-07-02"
    dias[3]["h"] = 12                                  # el último también parcial → 2 días: ya no hay onda
    assert not C.evaluar({"days": dias}, clima)["onda_calor"]
