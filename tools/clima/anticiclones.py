#!/usr/bin/env python3
"""Anticiclones en altura, domos de calor y bloqueos (modelo GFS de NOAA, 1°, dominio público).

Un anticiclón en altura es una «loma» de aire caliente a ~5.5 km (500 hPa): el aire baja, se calienta, despeja el cielo
y frena la lluvia. Si se queda quieto varios días, el calor se acumula abajo: es el «domo de calor» detrás de casi todas
las ondas de calor. Un «bloqueo» es cuando esa alta se instala en latitudes medias-altas y desvía la corriente en chorro:
el tiempo (calor, sequía, lluvia o frío) se queda igual en la misma zona por una semana o más.

Cada 6 h descarga del filtro GRIB de NOMADS solo la altura a 500 hPa y la temperatura a 850 hPa en 6 horizontes
(≈ ahora y cada 24 h hasta +120 h): ~6 archivos de ~250 KB.

Reglas propias (ESTIMACIÓN, no aviso oficial):
- Anticiclón en altura: máximo local de altura a 500 hPa (ventana de ±5°) entre 15° y 70° de latitud, al menos 3 dam
  arriba del punto más bajo de la ventana. Anomalía = altura menos el promedio de su latitud (dam).
- Alta subtropical (p. ej. la de México): entre 10° y 35°, máximo en ±8° con 588 dam o más (criterio operativo de la
  línea de 5880 m) y al menos 1 dam de relieve; es ancha y plana, por eso no la detecta la regla anterior.
- Domo de calor: anticiclón con anomalía ≥ +10 dam y aire a ~1.5 km (850 hPa) de 20 °C o más.
- Persistencia: en cuántos de los 6 horizontes hay un anticiclón a menos de 6° del mismo lugar.
- Bloqueo: índice de Tibaldi y Molteni (1990) en cada longitud: gradiente de altura entre 40° y 60° invertido y caída
  fuerte entre 60° y 80° (hemisferio norte; espejo en el sur). Bloqueo = 12° de longitud o más bloqueados en 4 o más
  horizontes diarios seguidos.
Salida: vivos/anticiclones.geojson (anticiclones de ≈ ahora con su persistencia y franjas de bloqueo).
"""
import json
import math
import os
import sys
import time
import urllib.error
from datetime import datetime, timezone

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gfs as G  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "vivos", "anticiclones.geojson")
FILTRO = ("https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_1p00.pl?dir=%2Fgfs.{fecha}%2F{hh}%2Fatmos&file=gfs.t{hh}z.pgrb2.1p00.f{f:03d}"
          "&var_HGT=on&var_TMP=on&lev_500_mb=on&lev_850_mb=on")
OBJETIVOS = [0, 24, 48, 72, 96, 120]
RADIO, MIN_RELIEVE_M, UNIR = 5, 30.0, 10.0
# Alta subtropical (la que el SMN llama «anticiclón en niveles medios» sobre México): ancha y casi plana, así que se
# busca aparte con el criterio operativo de la línea de 588 dam (5880 m) a 500 hPa.
SUB_LAT, SUB_RADIO, SUB_MIN_M, SUB_RELIEVE_M = (10, 35), 8, 5880.0, 10.0
DOMO_ANOM_DAM, DOMO_T850 = 10.0, 20.0
PERSISTE_GRADOS = 6.0
BLOQUEO_ANCHO, BLOQUEO_DIAS = 12, 4
CADA_H = 6
VERSION = 2  # 2: altas subtropicales; un archivo de otra versión se rehace sin esperar las 6 h


def anomalia(hgt):
    """Altura menos el promedio de su latitud (m)."""
    return hgt - np.nanmean(hgt, axis=1, keepdims=True)


def anticiclones(hgt500, t850):
    """Máximos locales de altura a 500 hPa (rejilla 1°, fila 0 = 90°N, columna 0 = 180°O) → lista de dicts."""
    filas, _ = hgt500.shape
    anom = anomalia(hgt500)
    cand = []
    for i in range(filas):
        lat = 90 - i
        latitud_media = 15 <= abs(lat) <= 70
        subtropical = SUB_LAT[0] <= abs(lat) <= SUB_LAT[1]
        if not (latitud_media or subtropical):
            continue
        for j in range(hgt500.shape[1]):
            if anom[i, j] <= 0:  # una alta en altura queda por encima del promedio de su latitud
                continue
            v = hgt500[i, j]
            es_sub = subtropical and v >= SUB_MIN_M and _maximo(hgt500, i, j, SUB_RADIO, SUB_RELIEVE_M)
            if not (es_sub or (latitud_media and _maximo(hgt500, i, j, RADIO, MIN_RELIEVE_M))):
                continue
            a = float(anom[i, j]) / 10
            t = float(t850[i, j]) if t850 is not None else None
            cand.append({"lon": float(-180 + j), "lat": float(lat), "altura500_dam": round(float(v) / 10, 1), "anomalia_dam": round(a, 1),
                         "t850_c": round(t, 1) if t is not None else None,
                         "domo_calor": bool(a >= DOMO_ANOM_DAM and t is not None and t >= DOMO_T850),
                         "subtropical": bool(es_sub)})
    cand.sort(key=lambda c: -c["anomalia_dam"])
    elegidos = []
    for c in cand:
        if all(_dist(c, e) > UNIR for e in elegidos):
            elegidos.append(c)
    return elegidos


def _maximo(hgt, i, j, radio, relieve):
    """¿(i, j) es el punto más alto de su ventana de ±radio celdas y sobresale al menos `relieve` m del más bajo?"""
    ventana = np.take(hgt[max(0, i - radio):i + radio + 1], range(j - radio, j + radio + 1), axis=1, mode="wrap")
    return hgt[i, j] >= np.nanmax(ventana) and hgt[i, j] - np.nanmin(ventana) >= relieve


def _dist(a, b):
    return math.hypot(((a["lon"] - b["lon"] + 180) % 360 - 180) * math.cos(math.radians((a["lat"] + b["lat"]) / 2)), a["lat"] - b["lat"])


def bloqueadas(hgt500, hemisferio=1):
    """Índice de Tibaldi-Molteni: lista de booleanos por longitud (360) con bloqueo en ese horizonte."""
    out = np.zeros(hgt500.shape[1], dtype=bool)
    for delta in (-4, 0, 4):
        f = lambda lat: G.fila_de_lat(hemisferio * lat)  # noqa: E731
        p0, ps, pn = 60 + delta, 40 + delta, 80 + delta
        z0, zs, zn = hgt500[f(p0)], hgt500[f(ps)], hgt500[f(pn)]
        ghgs = (z0 - zs) / (p0 - ps)
        ghgn = (zn - z0) / (pn - p0)
        out |= (ghgs > 0) & (ghgn < -10)
    return out


def franjas_bloqueo(series, ancho=BLOQUEO_ANCHO, dias=BLOQUEO_DIAS):
    """series: [bool por longitud] por horizonte diario → [(lon inicio, lon fin, horizontes seguidos)] (lon −180…179)."""
    n = len(series[0])
    racha = np.zeros(n, dtype=int)
    mejor = np.zeros(n, dtype=int)
    for s in series:
        racha = np.where(s, racha + 1, 0)
        mejor = np.maximum(mejor, racha)
    ok = mejor >= dias
    out, j = [], 0
    while j < n:
        if ok[j]:
            k = j
            while k + 1 < n and ok[k + 1]:
                k += 1
            if k - j + 1 >= ancho:
                out.append((-180 + j, -180 + k, int(mejor[j:k + 1].max())))
            j = k + 1
        else:
            j += 1
    return out


def persistencia(actuales, por_horizonte):
    for a in actuales:
        a["horizontes"] = sum(1 for lista in por_horizonte if any(_dist(a, b) <= PERSISTE_GRADOS for b in lista))
    return actuales


def geojson(actuales, bloqueos, n_horizontes, corrida):
    feats = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [a["lon"], a["lat"]]},
              "properties": {"kind": "domo" if a["domo_calor"] else "alta", **{k: v for k, v in a.items() if k not in ("lon", "lat")},
                             "de_horizontes": n_horizontes}} for a in actuales]
    for hemi, lista in bloqueos.items():
        lat = 60 if hemi == "norte" else -60
        for l0, l1, dias in lista:
            feats.append({"type": "Feature", "geometry": {"type": "LineString", "coordinates": [[x, lat] for x in range(l0, l1 + 1, 2)] + [[l1, lat]]},
                          "properties": {"kind": "bloqueo", "hemisferio": hemi, "lon_ini": l0, "lon_fin": l1, "dias": dias, "de_horizontes": n_horizontes}})
    return {"type": "FeatureCollection", "version": VERSION, "generado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "corrida": corrida.strftime("%Y-%m-%dT%H:%MZ") if corrida else "", "fuente": "Modelo GFS de NOAA (estimación propia)", "features": feats}


def leer(datos):
    import pygrib
    tmp = os.path.join(os.environ.get("RUNNER_TEMP", "/tmp"), "gfs_anticiclones.grib2")
    with open(tmp, "wb") as f:
        f.write(datos)
    hgt, t850 = None, None
    with pygrib.open(tmp) as g:
        for m in g:
            if m.typeOfLevel != "isobaricInhPa":
                continue
            if m.shortName == "gh" and m.level == 500:
                hgt = G.a_180(np.array(m.values, dtype=float))
            elif m.shortName == "t" and m.level == 850:
                t850 = G.a_180(np.array(m.values, dtype=float)) - 273.15
    return hgt, t850


def main():
    ahora = datetime.now(timezone.utc)
    try:
        previo = json.load(open(OUT, encoding="utf-8"))
        gen = previo.get("generado_utc", "")
        if previo.get("version") == VERSION and (ahora - datetime.strptime(gen, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)).total_seconds() < CADA_H * 3600:
            print("anticiclones: datos recientes")
            return 0
    except (OSError, ValueError):
        pass
    for corrida in G.corridas_candidatas(ahora):
        campos = []
        for f in G.horizontes(corrida, ahora, OBJETIVOS):
            url = FILTRO.format(fecha=corrida.strftime("%Y%m%d"), hh=corrida.strftime("%H"), f=f)
            try:
                campos.append(leer(G.get(url)))
            except urllib.error.HTTPError:
                break
            except Exception as e:  # noqa: BLE001
                print(f"anticiclones: NOAA no respondió ({e}); se conserva el anterior")
                return 0
            time.sleep(1)
        campos = [c for c in campos if c[0] is not None]
        if len(campos) >= 2:
            break
    else:
        print("anticiclones: sin corrida disponible; se conserva el anterior")
        return 0
    por_h = [anticiclones(h, t) for h, t in campos]
    actuales = persistencia(por_h[0], por_h)
    bloqueos = {"norte": franjas_bloqueo([bloqueadas(h, 1) for h, _ in campos]),
                "sur": franjas_bloqueo([bloqueadas(h, -1) for h, _ in campos])}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(geojson(actuales, bloqueos, len(campos), corrida), open(OUT, "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    domos = sum(1 for a in actuales if a["domo_calor"])
    print(f"anticiclones: {len(actuales)} altas en altura ({domos} domos de calor), bloqueos: "
          f"{len(bloqueos['norte'])} norte / {len(bloqueos['sur'])} sur; corrida {corrida:%Y-%m-%d %H} UTC, {len(campos)} horizontes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
