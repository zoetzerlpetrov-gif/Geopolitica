#!/usr/bin/env python3
"""Capa de clima tipo Windy: viento, temperatura y lluvia del modelo GFS de NOAA (1°, sin llave).

Cada 6 h (el modelo corre a las 00, 06, 12 y 18 UTC y tarda ~4 h en publicarse) descarga del filtro
GRIB de NOMADS solo 4 variables: viento a 10 m (U y V), temperatura a 2 m y tasa de precipitación, más la temperatura
a 850 hPa (aire polar: polar_fXXX.png e isotermas_fXXX.geojson de 0, −10 y −20 °C).
Para cada horizonte de pronóstico (≈ ahora, +12 h, +24 h, +48 h, +72 h) genera en vivos/clima/:
  viento_fXXX.png  360 × 181 px, rejilla lat/lon de 1°: canal R = U, canal G = V (m/s, escala en meta.json).
                   El navegador la lee para animar partículas.
  temp_fXXX.png    imagen de color ya proyectada a Web Mercator (encaja con el mapa plano).
  lluvia_fXXX.png  idem; transparente donde no llueve.
  meta.json        corrida, horizontes, hora válida de cada uno y escalas.
Uso: python3 tools/clima/gfs.py   (lo llama el workflow «Datos en movimiento»)
"""
import json
import math
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "vivos", "clima")
UA = "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
FILTRO = ("https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_1p00.pl?dir=%2Fgfs.{fecha}%2F{hh}%2Fatmos&file=gfs.t{hh}z.pgrb2.1p00.f{f:03d}"
          "&var_UGRD=on&var_VGRD=on&var_TMP=on&var_PRATE=on&var_SNOD=on&lev_10_m_above_ground=on&lev_2_m_above_ground=on&lev_surface=on&lev_850_mb=on")
# Viento en altura (para estimar hacia dónde va la ceniza volcánica): 500, 300 y 200 hPa ≈ 5.5, 9 y 12 km.
FILTRO_ALTURA = ("https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_1p00.pl?dir=%2Fgfs.{fecha}%2F{hh}%2Fatmos&file=gfs.t{hh}z.pgrb2.1p00.f{f:03d}"
                 "&var_UGRD=on&var_VGRD=on&var_TMP=on&var_HGT=on&lev_500_mb=on&lev_300_mb=on&lev_200_mb=on")
# Vórtice polar: altura geopotencial, temperatura y viento a 10 hPa (~31 km, estratosfera).
FILTRO_VORTICE = ("https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_1p00.pl?dir=%2Fgfs.{fecha}%2F{hh}%2Fatmos&file=gfs.t{hh}z.pgrb2.1p00.f{f:03d}"
                  "&var_HGT=on&var_TMP=on&var_UGRD=on&var_VGRD=on&lev_10_mb=on")
NIVELES_ALTURA = {500: 5.5, 300: 9.2, 200: 11.8}   # hPa → km aproximados en atmósfera estándar
VIENTO_ALTURA_MAX = 90.0             # m/s (las corrientes en chorro superan los 70 m/s)
HORIZONTES_ALTURA = 2                # solo ≈ ahora y +12 h (la ceniza se estima a pocas horas)
OBJETIVOS_H = [0, 12, 24, 48, 72]   # horas desde ahora
VIENTO_MAX = 40.0                    # m/s representables en la textura (±40 m/s = ±144 km/h)
ALTO_MERCATOR = 720                  # px de las imágenes proyectadas (mundo completo, cuadrado)
LAT_MAX = 85.05112878

# Paletas: (valor, (r, g, b, a)). Entre paradas se interpola linealmente.
PALETA_TEMP = [(-40, (110, 64, 170, 170)), (-20, (59, 76, 192, 170)), (0, (111, 168, 220, 160)), (10, (124, 207, 138, 150)),
               (20, (242, 210, 75, 150)), (30, (240, 140, 58, 165)), (40, (192, 57, 43, 180))]
# Aire polar: temperatura a 850 hPa (~1.5 km), el indicador que usan los meteorólogos para seguir masas de aire frío
# (no le afecta el calentamiento del suelo durante el día). Arriba de 0 °C queda transparente.
PALETA_POLAR = [(-60, (110, 30, 160, 200)), (-30, (110, 30, 160, 190)), (-20, (60, 50, 200, 175)), (-10, (40, 110, 225, 150)),
                (-5, (90, 165, 235, 120)), (0, (150, 205, 245, 70))]
ISOTERMAS_850 = (0, -10, -20)
# Nieve en el suelo pronosticada (profundidad, cm); transparente por debajo de 1 cm.
PALETA_NIEVE = [(1, (225, 240, 255, 110)), (5, (190, 220, 255, 160)), (20, (140, 180, 245, 190)), (50, (100, 120, 220, 210)), (100, (150, 80, 200, 220))]
# Vórtice polar: altura a 10 hPa relativa al mínimo de cada hemisferio (dam). El núcleo (0) en morado intenso; a
# más de 80 dam del mínimo ya queda transparente.
PALETA_VORTICE = [(0, (90, 20, 140, 200)), (20, (60, 60, 200, 170)), (45, (60, 140, 220, 120)), (80, (120, 200, 240, 0))]
# Bolsas de aire frío (DANA o gota fría): bajas cerradas a 500 hPa con el núcleo al menos 4 °C más frío que el promedio
# de su latitud, entre 20° y 75° de latitud.
BOLSA_ANOMALIA_C = -4.0
BOLSA_RADIO = 4          # celdas de 1° a cada lado para decidir si es un mínimo local
BOLSA_UNIR_GRADOS = 8.0
PALETA_LLUVIA = [(0.1, (120, 190, 255, 0)), (0.3, (120, 190, 255, 120)), (1, (60, 120, 230, 170)), (4, (50, 180, 90, 190)),
                 (10, (240, 210, 60, 200)), (25, (220, 60, 40, 210)), (50, (160, 40, 160, 220))]


def get(url, timeout=90):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


# ------------------------------------------------------------------ funciones puras (probadas)
def corridas_candidatas(ahora, n=4):
    """Corridas de GFS de la más reciente hacia atrás (00/06/12/18 UTC)."""
    base = ahora.replace(minute=0, second=0, microsecond=0, hour=(ahora.hour // 6) * 6)
    return [base - timedelta(hours=6 * k) for k in range(n)]


def horizontes(corrida, ahora, objetivos=OBJETIVOS_H):
    """Horas de pronóstico (múltiplos de 3, ≥ 3) más cercanas a ahora + cada objetivo, sin repetir."""
    out = []
    for h in objetivos:
        f = round(((ahora - corrida).total_seconds() / 3600 + h) / 3) * 3
        f = max(3, min(240, f))
        if f not in out:
            out.append(f)
    return out


def a_180(campo):
    """Rejilla de GFS (lon 0…359) → lon −180…179 (la columna 0 queda en −180°)."""
    return np.roll(campo, campo.shape[1] // 2, axis=1)


def codificar_viento(u, v, maximo=VIENTO_MAX):
    """U y V (m/s) → imagen RGB uint8: R = U, G = V, mapeados de [−max, max] a [0, 255]."""
    esc = lambda x: np.clip(np.round((x + maximo) / (2 * maximo) * 255), 0, 255).astype(np.uint8)  # noqa: E731
    return np.dstack([esc(u), esc(v), np.zeros_like(u, dtype=np.uint8)])


def decodificar_viento(px, maximo=VIENTO_MAX):
    """Inversa de codificar_viento para un valor de canal (0–255)."""
    return px / 255 * 2 * maximo - maximo


def a_mercator(campo, alto=ALTO_MERCATOR):
    """Rejilla lat/lon de 1° (fila 0 = 90° N, columna 0 = −180°) → rejilla Web Mercator alto × alto,
    con interpolación bilineal. Así la imagen encaja con el mapa plano sin estirarse en latitud."""
    filas, cols = campo.shape
    ancho = alto  # imagen cuadrada: Web Mercator del mundo completo es cuadrado
    y = (np.arange(alto) + 0.5) / alto                    # 0 arriba … 1 abajo
    lat = np.degrees(np.arctan(np.sinh(math.pi * (1 - 2 * y))))
    x = (np.arange(ancho) + 0.5) / ancho
    lon = -180 + 360 * x
    fi = (90 - lat) / 180 * (filas - 1)                   # índice fraccional de fila
    ci = (lon + 180) / 360 * cols                         # índice fraccional de columna (con vuelta)
    f0 = np.floor(fi).astype(int)
    f1 = np.minimum(f0 + 1, filas - 1)
    tf = (fi - f0)[:, None]
    c0 = np.floor(ci).astype(int) % cols
    c1 = (c0 + 1) % cols
    tc = (ci - np.floor(ci))[None, :]
    a = campo[f0][:, c0] * (1 - tc) + campo[f0][:, c1] * tc
    b = campo[f1][:, c0] * (1 - tc) + campo[f1][:, c1] * tc
    return a * (1 - tf) + b * tf


def isolineas(campo, nivel, lat0=90.0, lon0=-180.0, paso=1.0, dec=2):
    """Líneas donde `campo` (fila 0 = lat0, columna 0 = lon0, da la vuelta en longitud) vale `nivel`: cuadrados
    marchantes con interpolación lineal y segmentos unidos en polilíneas. → lista de listas [[lon, lat], …]."""
    filas, cols = campo.shape
    segs = []
    for i in range(filas - 1):
        for j in range(cols):
            j1 = (j + 1) % cols
            a, b, c, d = campo[i, j], campo[i, j1], campo[i + 1, j1], campo[i + 1, j]
            if np.isnan([a, b, c, d]).any():
                continue
            s = [a >= nivel, b >= nivel, c >= nivel, d >= nivel]
            if all(s) or not any(s):
                continue
            lat_a, lat_b = lat0 - i * paso, lat0 - (i + 1) * paso
            lon_a, lon_b = lon0 + j * paso, lon0 + (j + 1) * paso

            def cruce(v1, v2, p1, p2):
                t = (nivel - v1) / (v2 - v1)
                return (round(p1[0] + t * (p2[0] - p1[0]), dec), round(p1[1] + t * (p2[1] - p1[1]), dec))
            esquinas = [(lon_a, lat_a), (lon_b, lat_a), (lon_b, lat_b), (lon_a, lat_b)]
            vals = [a, b, c, d]
            pts = [cruce(vals[k], vals[(k + 1) % 4], esquinas[k], esquinas[(k + 1) % 4]) for k in range(4) if s[k] != s[(k + 1) % 4]]
            if len(pts) == 2:
                segs.append((pts[0], pts[1]))
            elif len(pts) == 4:  # punto de silla: se decide con el valor del centro
                centro = (a + b + c + d) / 4 >= nivel
                segs += [(pts[0], pts[1]), (pts[2], pts[3])] if centro == s[0] else [(pts[0], pts[3]), (pts[1], pts[2])]
    # Unir segmentos que comparten extremo.
    vecinos = {}
    for k, (p, q) in enumerate(segs):
        vecinos.setdefault(p, []).append(k)
        vecinos.setdefault(q, []).append(k)
    usado = [False] * len(segs)
    lineas = []
    for k in range(len(segs)):
        if usado[k]:
            continue
        usado[k] = True
        linea = list(segs[k])
        for extremo in (1, 0):  # crecer hacia adelante y luego hacia atrás
            while True:
                punta = linea[-1] if extremo else linea[0]
                sig = next((m for m in vecinos.get(punta, []) if not usado[m]), None)
                if sig is None:
                    break
                usado[sig] = True
                p, q = segs[sig]
                nuevo = q if p == punta else p
                linea.append(nuevo) if extremo else linea.insert(0, nuevo)
        if len(linea) >= 3:
            lineas.append([list(pt) for pt in linea])
    return lineas


def geojson_isotermas(campo, niveles=ISOTERMAS_850):
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"t": n}, "geometry": {"type": "LineString", "coordinates": l}}
        for n in niveles for l in isolineas(campo, n)]}


def colorear_polar(campo_merc):
    arr = colorear(campo_merc, PALETA_POLAR)
    arr[campo_merc > 0] = 0
    return arr


def colorear(campo, paleta):
    """Valores → RGBA uint8 interpolando la paleta; por debajo del primer valor queda transparente."""
    vals = np.array([p[0] for p in paleta], dtype=float)
    cols = np.array([p[1] for p in paleta], dtype=float)
    out = np.zeros(campo.shape + (4,), dtype=float)
    for k in range(4):
        out[..., k] = np.interp(campo, vals, cols[:, k])
    out[campo < vals[0]] = 0
    return np.clip(np.round(out), 0, 255).astype(np.uint8)


def fila_de_lat(lat, lat0=90.0, paso=1.0):
    return int(round((lat0 - lat) / paso))


def estado_vortice(u60):
    """Clasificación del vórtice por el viento zonal medio a 60° y 10 hPa (indicador habitual en la literatura)."""
    if u60 < 0:
        return "invertido: calentamiento estratosférico súbito (el vórtice se rompió o se desplazó)"
    if u60 < 10:
        return "débil (más probabilidad de irrupciones de aire ártico en latitudes medias)"
    if u60 < 35:
        return "normal"
    return "fuerte (el aire ártico tiende a quedar encerrado en el polo)"


def resumen_vortice(hgt10, t10, u10):
    """Por hemisferio: centro (mínimo de altura a 10 hPa al norte/sur de 45°), viento zonal medio a 60°, temperatura
    media al norte/sur de 80° y estado. Alturas en dam, temperaturas en °C."""
    out = {}
    for nombre, signo in (("norte", 1), ("sur", -1)):
        filas = range(fila_de_lat(90 * signo if signo > 0 else -45), fila_de_lat(45 if signo > 0 else -90) + 1)
        sub = hgt10[min(filas):max(filas) + 1]
        i, j = np.unravel_index(np.nanargmin(sub), sub.shape)
        lat = 90 - (min(filas) + i)
        u60 = float(np.nanmean(u10[fila_de_lat(60 * signo)]))
        polo = t10[: fila_de_lat(80) + 1] if signo > 0 else t10[fila_de_lat(-80):]
        out[nombre] = {"centro": [float(-180 + j), float(lat)], "altura_min_dam": round(float(sub[i, j]) / 10, 1),
                       "u60_ms": round(u60, 1), "t_polo_c": round(float(np.nanmean(polo)), 1), "estado": estado_vortice(u60)}
    return out


def campo_vortice(hgt10):
    """Altura a 10 hPa menos el mínimo de su hemisferio (dam); el ecuador y los trópicos quedan fuera (NaN)."""
    rel = np.full(hgt10.shape, np.nan)
    for a, b in ((0, fila_de_lat(20)), (fila_de_lat(-20), hgt10.shape[0] - 1)):
        bloque = hgt10[a:b + 1] / 10
        rel[a:b + 1] = bloque - np.nanmin(bloque)
    return rel


def bolsas_frias(t500, hgt500, t850=None):
    """Bolsas de aire frío (DANA): mínimos locales de altura a 500 hPa entre 20° y 75° de latitud con la temperatura
    al menos BOLSA_ANOMALIA_C más baja que el promedio de su latitud. → lista de dicts ordenada por anomalía."""
    filas, cols = t500.shape
    media = np.nanmean(t500, axis=1)
    cand = []
    for i in range(filas):
        lat = 90 - i
        if not (20 <= abs(lat) <= 75):
            continue
        for j in range(cols):
            anom = t500[i, j] - media[i]
            if anom > BOLSA_ANOMALIA_C:
                continue
            i0, i1 = max(0, i - BOLSA_RADIO), min(filas, i + BOLSA_RADIO + 1)
            ventana = np.take(hgt500[i0:i1], range(j - BOLSA_RADIO, j + BOLSA_RADIO + 1), axis=1, mode="wrap")
            # Mínimo de la ventana y al menos 3 dam por debajo de su borde más alto (una baja de verdad, no un campo plano).
            if hgt500[i, j] > np.nanmin(ventana) or np.nanmax(ventana) - hgt500[i, j] < 30:
                continue
            cand.append({"lon": float(-180 + j), "lat": float(lat), "t500_c": round(float(t500[i, j]), 1), "anomalia_c": round(float(anom), 1),
                         "altura500_dam": round(float(hgt500[i, j]) / 10, 1), **({"t850_c": round(float(t850[i, j]), 1)} if t850 is not None else {})})
    cand.sort(key=lambda c: c["anomalia_c"])
    elegidas = []
    for c in cand:
        if all(math.hypot((c["lon"] - e["lon"] + 180) % 360 - 180, c["lat"] - e["lat"]) > BOLSA_UNIR_GRADOS for e in elegidas):
            elegidas.append(c)
    return elegidas


def geojson_bolsas(bolsas):
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": {"type": "Point", "coordinates": [b["lon"], b["lat"]]}, "properties": {k: v for k, v in b.items() if k not in ("lon", "lat")}}
        for b in bolsas]}


# ------------------------------------------------------------------ descarga y escritura
def leer_grib(datos):
    """Bytes GRIB2 → dict con u, v (m/s), temp (°C) y lluvia (mm/h) en rejilla −180…179."""
    import pygrib  # dependencia solo del workflow
    tmp = os.path.join(os.environ.get("RUNNER_TEMP", "/tmp"), "gfs.grib2")
    with open(tmp, "wb") as f:
        f.write(datos)
    claves = {"10u": "u", "10v": "v", "2t": "temp", "prate": "lluvia", "sde": "nieve"}
    campos = {}
    with pygrib.open(tmp) as g:
        for m in g:
            if m.shortName == "t" and m.typeOfLevel == "isobaricInhPa" and m.level == 850 and "t850" not in campos:
                campos["t850"] = a_180(np.array(m.values, dtype=float)) - 273.15  # opcional: sin él no hay capa de aire polar
                continue
            clave = claves.get(m.shortName) if m.typeOfLevel != "isobaricInhPa" else None
            if clave and clave not in campos:
                campos[clave] = a_180(np.array(m.values, dtype=float))
    faltan = {"u", "v", "temp", "lluvia"} - set(campos)
    if faltan:
        raise RuntimeError(f"faltan variables en el GRIB: {sorted(faltan)}")
    campos["temp"] = campos["temp"] - 273.15
    campos["lluvia"] = campos["lluvia"] * 3600
    if "nieve" in campos:
        campos["nieve"] = campos["nieve"] * 100  # m → cm (opcional: sin él no hay capa de nieve)
    return campos


def leer_grib_altura(datos):
    """Bytes GRIB2 con U y V en niveles de presión → {hPa: (u, v)} en rejilla −180…179."""
    import pygrib
    tmp = os.path.join(os.environ.get("RUNNER_TEMP", "/tmp"), "gfs_altura.grib2")
    with open(tmp, "wb") as f:
        f.write(datos)
    campos = {}
    with pygrib.open(tmp) as g:
        for m in g:
            if m.typeOfLevel == "isobaricInhPa" and m.level in NIVELES_ALTURA and m.shortName in ("u", "v", "t", "gh"):
                campos.setdefault(m.level, {})[m.shortName] = a_180(np.array(m.values, dtype=float))
    viento = {lev: (c["u"], c["v"]) for lev, c in campos.items() if "u" in c and "v" in c}
    c500 = campos.get(500, {})
    if "t" in c500 and "gh" in c500:
        viento["t500"] = c500["t"] - 273.15
        viento["hgt500"] = c500["gh"]
    return viento


def leer_grib_vortice(datos):
    """Bytes GRIB2 a 10 hPa → (altura m, temperatura °C, viento zonal m/s) en rejilla −180…179."""
    import pygrib
    tmp = os.path.join(os.environ.get("RUNNER_TEMP", "/tmp"), "gfs_vortice.grib2")
    with open(tmp, "wb") as f:
        f.write(datos)
    c = {}
    with pygrib.open(tmp) as g:
        for m in g:
            if m.typeOfLevel == "isobaricInhPa" and m.level == 10 and m.shortName in ("gh", "t", "u"):
                c[m.shortName] = a_180(np.array(m.values, dtype=float))
    if not {"gh", "t", "u"} <= set(c):
        raise RuntimeError("faltan variables a 10 hPa")
    return c["gh"], c["t"] - 273.15, c["u"]


def guardar_png(arr, ruta):
    from PIL import Image
    Image.fromarray(arr).save(ruta, optimize=True)


CAMPOS_META = ("nieve", "vortice")  # leyendas que debe traer meta.json de la versión actual


def main():
    os.makedirs(OUT, exist_ok=True)
    ruta_meta = os.path.join(OUT, "meta.json")
    previo = json.load(open(ruta_meta, encoding="utf-8")) if os.path.exists(ruta_meta) else {}
    ahora = datetime.now(timezone.utc)
    # Un meta.json de una versión anterior (sin vórtice ni nieve) se recalcula aunque sea reciente o de la misma corrida.
    if not all(k in previo.get("leyendas", {}) for k in CAMPOS_META):
        previo = {}
    if previo.get("generado_utc"):
        edad = ahora - datetime.strptime(previo["generado_utc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        if edad < timedelta(hours=3):
            print(f"clima: datos de hace {edad.total_seconds() / 3600:.1f} h; se conservan")
            return 0
    for corrida in corridas_candidatas(ahora):
        etiqueta = corrida.strftime("%Y-%m-%dT%HZ")
        if previo.get("corrida") == etiqueta:
            print(f"clima: la corrida {etiqueta} ya está procesada")
            return 0
        pasos = []
        try:
            for f in horizontes(corrida, ahora):
                url = FILTRO.format(fecha=corrida.strftime("%Y%m%d"), hh=corrida.strftime("%H"), f=f)
                datos = get(url)
                if not datos.startswith(b"GRIB"):
                    raise FileNotFoundError(f"f{f:03d} aún no publicado")
                c = leer_grib(datos)
                nombre = f"f{f:03d}"
                guardar_png(codificar_viento(c["u"], c["v"]), os.path.join(OUT, f"viento_{nombre}.png"))
                guardar_png(colorear(a_mercator(c["temp"]), PALETA_TEMP), os.path.join(OUT, f"temp_{nombre}.png"))
                guardar_png(colorear(a_mercator(c["lluvia"]), PALETA_LLUVIA), os.path.join(OUT, f"lluvia_{nombre}.png"))
                pasos.append({"f": f, "valido_utc": (corrida + timedelta(hours=f)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                              "viento": f"viento_{nombre}.png", "temp": f"temp_{nombre}.png", "lluvia": f"lluvia_{nombre}.png",
                              "viento_max_ms": round(float(np.max(np.hypot(c["u"], c["v"]))), 1)})
                if "nieve" in c:
                    guardar_png(colorear(a_mercator(c["nieve"]), PALETA_NIEVE), os.path.join(OUT, f"nieve_{nombre}.png"))
                    pasos[-1]["nieve"] = f"nieve_{nombre}.png"
                try:  # vórtice polar a 10 hPa (opcional)
                    time.sleep(2)
                    h10, t10, u10 = leer_grib_vortice(get(FILTRO_VORTICE.format(fecha=corrida.strftime("%Y%m%d"), hh=corrida.strftime("%H"), f=f)))
                    guardar_png(colorear(a_mercator(np.nan_to_num(campo_vortice(h10), nan=999.0)), PALETA_VORTICE), os.path.join(OUT, f"vortice_{nombre}.png"))
                    pasos[-1].update(vortice=f"vortice_{nombre}.png", vortice_resumen=resumen_vortice(h10, t10, u10))
                except Exception as e:  # noqa: BLE001  sin vórtice la capa de clima sigue igual
                    print(f"clima: vórtice polar f{f:03d} no disponible ({e})")
                if "t850" in c:
                    guardar_png(colorear_polar(a_mercator(c["t850"])), os.path.join(OUT, f"polar_{nombre}.png"))
                    with open(os.path.join(OUT, f"isotermas_{nombre}.geojson"), "w", encoding="utf-8") as fh:
                        json.dump(geojson_isotermas(c["t850"]), fh, separators=(",", ":"))
                    pasos[-1].update(polar=f"polar_{nombre}.png", isotermas=f"isotermas_{nombre}.geojson",
                                     t850_min=round(float(np.min(c["t850"])), 1))
                if len(pasos) <= HORIZONTES_ALTURA:
                    try:
                        time.sleep(2)
                        alt = leer_grib_altura(get(FILTRO_ALTURA.format(fecha=corrida.strftime("%Y%m%d"), hh=corrida.strftime("%H"), f=f)))
                        t500, hgt500 = alt.pop("t500", None), alt.pop("hgt500", None)
                        if t500 is not None:
                            bolsas = bolsas_frias(t500, hgt500, c.get("t850"))
                            with open(os.path.join(OUT, f"bolsas_{nombre}.geojson"), "w", encoding="utf-8") as fh:
                                json.dump(geojson_bolsas(bolsas), fh, separators=(",", ":"))
                            pasos[-1]["bolsas"] = f"bolsas_{nombre}.geojson"
                        pasos[-1]["alturas"] = {}
                        for lev, (u, v) in sorted(alt.items(), reverse=True):
                            archivo = f"viento{lev}_{nombre}.png"
                            guardar_png(codificar_viento(u, v, VIENTO_ALTURA_MAX), os.path.join(OUT, archivo))
                            pasos[-1]["alturas"][str(lev)] = {"archivo": archivo, "km": NIVELES_ALTURA[lev]}
                    except Exception as e:  # noqa: BLE001  sin viento en altura la capa de clima sigue igual
                        print(f"clima: viento en altura f{f:03d} no disponible ({e})")
                print(f"clima: {etiqueta} f{f:03d} listo")
                time.sleep(2)  # cortesía con NOMADS
        except (urllib.error.URLError, FileNotFoundError) as e:
            print(f"clima: corrida {etiqueta} no disponible ({e}); se prueba la anterior")
            continue
        # Se borran los PNG de corridas anteriores que ya no se usan.
        vigentes = {p[k] for p in pasos for k in ("viento", "temp", "lluvia", "polar", "isotermas", "nieve", "vortice", "bolsas") if k in p} | {a["archivo"] for p in pasos for a in p.get("alturas", {}).values()}
        for a in os.listdir(OUT):
            if a.endswith((".png", ".geojson")) and a not in vigentes:
                os.remove(os.path.join(OUT, a))
        json.dump({"generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "corrida": etiqueta, "fuente": "NOAA GFS 1° vía NOMADS",
                   "viento_escala_ms": VIENTO_MAX, "viento_altura_escala_ms": VIENTO_ALTURA_MAX, "rejilla_viento": {"lon0": -180, "lat0": 90, "paso": 1, "ancho": 360, "alto": 181},
                   "mercator_lat_max": LAT_MAX, "pasos": pasos,
                   "leyendas": {"temp": [[v, "#%02x%02x%02x" % c[:3]] for v, c in PALETA_TEMP],
                                "polar": [[v, "#%02x%02x%02x" % c[:3]] for v, c in PALETA_POLAR[1:]],
                                "lluvia": [[v, "#%02x%02x%02x" % c[:3]] for v, c in PALETA_LLUVIA[1:]],
                                "nieve": [[v, "#%02x%02x%02x" % c[:3]] for v, c in PALETA_NIEVE],
                                "vortice": [[v, "#%02x%02x%02x" % c[:3]] for v, c in PALETA_VORTICE]}},
                  open(ruta_meta, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        return 0
    print("clima: ninguna corrida reciente disponible; se conservan los datos anteriores")
    return 0


if __name__ == "__main__":
    sys.exit(main())
