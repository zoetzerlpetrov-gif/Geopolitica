#!/usr/bin/env python3
"""Capa de clima tipo Windy: viento, temperatura y lluvia del modelo GFS de NOAA (1°, sin llave).

Cada 6 h (el modelo corre a las 00, 06, 12 y 18 UTC y tarda ~4 h en publicarse) descarga del filtro
GRIB de NOMADS solo 4 variables: viento a 10 m (U y V), temperatura a 2 m y tasa de precipitación.
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
          "&var_UGRD=on&var_VGRD=on&var_TMP=on&var_PRATE=on&lev_10_m_above_ground=on&lev_2_m_above_ground=on&lev_surface=on")
# Viento en altura (para estimar hacia dónde va la ceniza volcánica): 500, 300 y 200 hPa ≈ 5.5, 9 y 12 km.
FILTRO_ALTURA = ("https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_1p00.pl?dir=%2Fgfs.{fecha}%2F{hh}%2Fatmos&file=gfs.t{hh}z.pgrb2.1p00.f{f:03d}"
                 "&var_UGRD=on&var_VGRD=on&lev_500_mb=on&lev_300_mb=on&lev_200_mb=on")
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


def colorear(campo, paleta):
    """Valores → RGBA uint8 interpolando la paleta; por debajo del primer valor queda transparente."""
    vals = np.array([p[0] for p in paleta], dtype=float)
    cols = np.array([p[1] for p in paleta], dtype=float)
    out = np.zeros(campo.shape + (4,), dtype=float)
    for k in range(4):
        out[..., k] = np.interp(campo, vals, cols[:, k])
    out[campo < vals[0]] = 0
    return np.clip(np.round(out), 0, 255).astype(np.uint8)


# ------------------------------------------------------------------ descarga y escritura
def leer_grib(datos):
    """Bytes GRIB2 → dict con u, v (m/s), temp (°C) y lluvia (mm/h) en rejilla −180…179."""
    import pygrib  # dependencia solo del workflow
    tmp = os.path.join(os.environ.get("RUNNER_TEMP", "/tmp"), "gfs.grib2")
    with open(tmp, "wb") as f:
        f.write(datos)
    claves = {"10u": "u", "10v": "v", "2t": "temp", "prate": "lluvia"}
    campos = {}
    with pygrib.open(tmp) as g:
        for m in g:
            clave = claves.get(m.shortName)
            if clave and clave not in campos:
                campos[clave] = a_180(np.array(m.values, dtype=float))
    faltan = {"u", "v", "temp", "lluvia"} - set(campos)
    if faltan:
        raise RuntimeError(f"faltan variables en el GRIB: {sorted(faltan)}")
    campos["temp"] = campos["temp"] - 273.15
    campos["lluvia"] = campos["lluvia"] * 3600
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
            if m.typeOfLevel == "isobaricInhPa" and m.level in NIVELES_ALTURA and m.shortName in ("u", "v"):
                campos.setdefault(m.level, {})[m.shortName] = a_180(np.array(m.values, dtype=float))
    return {lev: (c["u"], c["v"]) for lev, c in campos.items() if "u" in c and "v" in c}


def guardar_png(arr, ruta):
    from PIL import Image
    Image.fromarray(arr).save(ruta, optimize=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    ruta_meta = os.path.join(OUT, "meta.json")
    previo = json.load(open(ruta_meta, encoding="utf-8")) if os.path.exists(ruta_meta) else {}
    ahora = datetime.now(timezone.utc)
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
                if len(pasos) <= HORIZONTES_ALTURA:
                    try:
                        time.sleep(2)
                        alt = leer_grib_altura(get(FILTRO_ALTURA.format(fecha=corrida.strftime("%Y%m%d"), hh=corrida.strftime("%H"), f=f)))
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
        vigentes = {p[k] for p in pasos for k in ("viento", "temp", "lluvia")} | {a["archivo"] for p in pasos for a in p.get("alturas", {}).values()}
        for a in os.listdir(OUT):
            if a.endswith(".png") and a not in vigentes:
                os.remove(os.path.join(OUT, a))
        json.dump({"generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "corrida": etiqueta, "fuente": "NOAA GFS 1° vía NOMADS",
                   "viento_escala_ms": VIENTO_MAX, "viento_altura_escala_ms": VIENTO_ALTURA_MAX, "rejilla_viento": {"lon0": -180, "lat0": 90, "paso": 1, "ancho": 360, "alto": 181},
                   "mercator_lat_max": LAT_MAX, "pasos": pasos,
                   "leyendas": {"temp": [[v, "#%02x%02x%02x" % c[:3]] for v, c in PALETA_TEMP],
                                "lluvia": [[v, "#%02x%02x%02x" % c[:3]] for v, c in PALETA_LLUVIA[1:]]}},
                  open(ruta_meta, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        return 0
    print("clima: ninguna corrida reciente disponible; se conservan los datos anteriores")
    return 0


if __name__ == "__main__":
    sys.exit(main())
