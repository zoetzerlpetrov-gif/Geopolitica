#!/usr/bin/env python3
"""Series de pronóstico en puntos con los modelos de NOAA (dominio público, uso comercial permitido).

Sustituye a Open-Meteo (gratis solo para uso no comercial) en los nortes y el mar de fondo:
  - GFS 0.25° (atmósfera): ráfaga en superficie y viento a 10 m, por el filtro GRIB de NOMADS con recorte de región.
  - GFS-Wave 0.25° (oleaje global): altura, periodo y dirección del oleaje de fondo total («swell»).
Cada horizonte es una descarga pequeña (solo las variables pedidas). Se lee la celda más cercana a cada punto; si es
tierra (sin dato), la celda con dato más cercana a menos de RADIO_CELDAS celdas.
La salida imita la forma de Open-Meteo ({"hourly": {"time": [...], <variable>: [...]}}) para reutilizar el cálculo que
ya existía (nortes_de en frentes.py y feature en mar_fondo.py).
"""
import math
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

UA = "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"
NOMADS = "https://nomads.ncep.noaa.gov/cgi-bin"
RADIO_CELDAS = 4          # 4 celdas de 0.25° ≈ 45 km
PAUSA_S = 0.6             # NOMADS bloquea por un rato a quien pide más de ~120 veces por minuto


def url_gfs(corrida, f, variables, niveles, region=None):
    """Filtro GRIB de GFS 0.25°: variables y niveles («10_m_above_ground», «surface») con recorte opcional (N, O, E, S)."""
    hh, fecha = corrida.strftime("%H"), corrida.strftime("%Y%m%d")
    q = f"dir=%2Fgfs.{fecha}%2F{hh}%2Fatmos&file=gfs.t{hh}z.pgrb2.0p25.f{f:03d}"
    q += "".join(f"&var_{v}=on" for v in variables) + "".join(f"&lev_{n}=on" for n in niveles)
    if region:
        n, o, e, s = region
        q += f"&subregion=&toplat={n}&leftlon={o % 360}&rightlon={e % 360}&bottomlat={s}"
    return f"{NOMADS}/filter_gfs_0p25.pl?{q}"


def url_olas(corrida, f):
    """Filtro GRIB de GFS-Wave global 0.25°: oleaje de fondo total (altura, periodo medio y dirección)."""
    hh, fecha = corrida.strftime("%H"), corrida.strftime("%Y%m%d")
    return (f"{NOMADS}/filter_gfswave.pl?dir=%2Fgfs.{fecha}%2F{hh}%2Fwave%2Fgridded&file=gfswave.t{hh}z.global.0p25.f{f:03d}.grib2"
            "&var_SWELL=on&var_SWPER=on&var_SWDIR=on&lev_1_in_sequence=on")


def corridas(ahora, n=4, retraso_h=4):
    """Corridas de 00/06/12/18 UTC de la más reciente que ya debería estar publicada (≈4 h después) hacia atrás."""
    t = ahora - timedelta(hours=retraso_h)
    base = t.replace(minute=0, second=0, microsecond=0, hour=(t.hour // 6) * 6)
    return [base - timedelta(hours=6 * k) for k in range(n)]


def direccion_desde(u, v):
    """Componentes U y V (hacia donde sopla) → dirección meteorológica DE donde viene, 0–360°."""
    return (270 - math.degrees(math.atan2(v, u))) % 360


def celda_con_dato(lats, lons, valores, lat, lon, radio=RADIO_CELDAS):
    """Índices (i, j) de la celda más cercana a (lat, lon) con dato, buscando hasta `radio` celdas alrededor; o None.
    lats/lons: listas 1D ordenadas de la rejilla; valores[i][j] es None (o NaN) en tierra."""
    i0 = min(range(len(lats)), key=lambda i: abs(lats[i] - lat))
    lon_n = lon % 360 if min(lons) >= 0 else lon
    j0 = min(range(len(lons)), key=lambda j: abs(((lons[j] - lon_n) + 180) % 360 - 180))
    mejor, dmin = None, None
    for di in range(-radio, radio + 1):
        for dj in range(-radio, radio + 1):
            i, j = i0 + di, (j0 + dj) % len(lons)
            if not 0 <= i < len(lats):
                continue
            x = valores[i][j]
            if x is None or (isinstance(x, float) and math.isnan(x)):
                continue
            d = di * di + dj * dj
            if dmin is None or d < dmin:
                mejor, dmin = (i, j), d
    return mejor


def a_horario(pasos, puntos, campos):
    """pasos: [(valido datetime, {variable: [valor por punto]})] → una respuesta por punto con forma de Open-Meteo.
    campos: {variable del paso: nombre de salida}."""
    pasos = sorted(pasos, key=lambda p: p[0])
    out = []
    for k in range(len(puntos)):
        h = {"time": [p[0].strftime("%Y-%m-%dT%H:%M") for p in pasos]}
        for var, nombre in campos.items():
            h[nombre] = [p[1].get(var, [None] * len(puntos))[k] for p in pasos]
        out.append({"hourly": h})
    return out


def _get(url, timeout=120):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=timeout) as r:
        return r.read()


def _leer(datos, nombres):
    """Bytes GRIB2 → {shortName: (lats 1D, lons 1D, matriz con None en celdas sin dato), ...} y la hora válida."""
    import pygrib  # dependencia del workflow «Datos en movimiento»
    tmp = os.path.join(os.environ.get("RUNNER_TEMP", "/tmp"), "gfs_puntos.grib2")
    with open(tmp, "wb") as f:
        f.write(datos)
    campos, valido = {}, None
    with pygrib.open(tmp) as g:
        for m in g:
            if m.shortName not in nombres or m.shortName in campos:
                continue
            import numpy as np
            lat2, lon2 = m.latlons()
            # Celdas sin dato (tierra en el oleaje) → NaN; se deja como matriz de numpy (rápido con rejillas globales).
            matriz = np.ma.filled(np.ma.asarray(m.values, dtype=float), np.nan)
            campos[m.shortName] = ([float(x) for x in lat2[:, 0]], [float(x) for x in lon2[0, :]], matriz)
            valido = m.validDate.replace(tzinfo=timezone.utc)
    return campos, valido


def series(puntos, url_de, horas, nombres, ahora=None, pausa=PAUSA_S, get=_get, leer=_leer):
    """Descarga cada horizonte de la corrida más reciente disponible y devuelve (pasos, corrida) con el valor de cada
    variable en cada punto. `url_de(corrida, f)` arma la URL; `nombres`: shortName de pygrib que se leen."""
    ahora = ahora or datetime.now(timezone.utc)
    for corrida in corridas(ahora):
        try:
            primero = get(url_de(corrida, horas[0]))
        except urllib.error.HTTPError:
            continue  # aún no se publica esta corrida: la anterior
        pasos, indices = [], {}
        for n, f in enumerate(horas):
            try:
                datos = primero if n == 0 else get(url_de(corrida, f))
            except urllib.error.HTTPError:
                break  # horizonte aún no publicado: se usa lo que haya
            campos, valido = leer(datos, nombres)
            fila = {}
            for nombre, (lats, lons, matriz) in campos.items():
                if nombre not in indices:
                    indices[nombre] = [celda_con_dato(lats, lons, matriz, la, lo) for _, la, lo in puntos]
                fila[nombre] = [None if ij is None else float(matriz[ij[0]][ij[1]]) for ij in indices[nombre]]
            pasos.append((valido, fila))
            if n:
                time.sleep(pausa)
        if pasos:
            return pasos, corrida
    raise RuntimeError("ninguna corrida reciente de NOAA respondió")
