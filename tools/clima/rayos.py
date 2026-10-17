#!/usr/bin/env python3
"""Rayos reales de los últimos 20 minutos: Geostationary Lightning Mapper (GLM) de los satélites GOES-Este (GOES-19) y
GOES-Oeste (GOES-18) de NOAA, datos abiertos en AWS (buckets públicos noaa-goes19 y noaa-goes18, producto GLM-L2-LCFA,
un archivo cada 20 s). Cubren América, el Atlántico y el Pacífico oriental (Europa, África y Asia no: sus satélites
—Meteosat MTG-LI, FY-4 LMI— no publican datos abiertos sin registro).

Cada destello (flash) se suma a una celda de 0.1° (~11 km). Las dos vistas se reparten en la longitud −106.2° (punto
medio entre los dos satélites) para no contar dos veces el mismo rayo.
Salida: vivos/rayos.json {generado_utc, ventana_min, celdas: [[lon, lat, destellos, minutos desde el último]]}.
"""
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SALIDA = os.path.join(ROOT, "vivos", "rayos.json")
UA = "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"
VENTANA_MIN = 20
CELDA = 0.1
CORTE_LON = -106.2  # al oeste manda GOES-Oeste, al este GOES-Este
SATELITES = [("noaa-goes19", "este"), ("noaa-goes18", "oeste")]


def get(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def inicio_de(clave):
    """OR_GLM-L2-LCFA_G19_s20262901600000_e…nc → datetime del inicio (año, día juliano, hora, min, s, décimas)."""
    m = re.search(r"_s(\d{4})(\d{3})(\d{2})(\d{2})(\d{2})\d_", clave)
    if not m:
        return None
    a, d, h, mi, s = map(int, m.groups())
    return datetime(a, 1, 1, h, mi, s, tzinfo=timezone.utc) + timedelta(days=d - 1)


def claves_recientes(bucket, ahora, minutos=VENTANA_MIN):
    """Archivos GLM que empezaron en los últimos `minutos` (se listan la hora actual y la anterior)."""
    desde = ahora - timedelta(minutes=minutos)
    out = []
    for t in sorted({desde.replace(minute=0, second=0, microsecond=0), ahora.replace(minute=0, second=0, microsecond=0)}):
        prefijo = f"GLM-L2-LCFA/{t:%Y}/{t.timetuple().tm_yday:03d}/{t:%H}/"
        token = ""
        while True:
            xml = get(f"https://{bucket}.s3.amazonaws.com/?list-type=2&prefix={prefijo}" + (f"&continuation-token={urllib.request.quote(token)}" if token else "")).decode()
            for k in re.findall(r"<Key>([^<]+\.nc)</Key>", xml):
                i = inicio_de(k)
                if i and desde <= i <= ahora:
                    out.append((i, k))
            m = re.search(r"<NextContinuationToken>([^<]+)</NextContinuationToken>", xml)
            if not m:
                break
            token = m.group(1)
    return sorted(out)


def destellos(contenido):
    """Archivo netCDF4 de GLM → [(lon, lat)] de cada destello de buena calidad (requiere h5py).
    Se descartan los marcados como degradados (flash_quality_flag ≠ 0): en oct 2026 una celda del Atlántico con 928
    «destellos» resultó ser todo bandera 3 (duración fuera de rango), un artefacto y no una tormenta."""
    import io
    import h5py
    with h5py.File(io.BytesIO(contenido), "r") as f:
        if "flash_lat" not in f or f["flash_lat"].shape[0] == 0:
            return []
        q = f["flash_quality_flag"][()].tolist() if "flash_quality_flag" in f else [0] * f["flash_lat"].shape[0]
        return [(lon, lat) for lon, lat, qq in zip(f["flash_lon"][()].tolist(), f["flash_lat"][()].tolist(), q) if qq == 0]


def acumular(celdas, puntos, minutos_atras, lado):
    """Suma destellos por celda; solo los del lado del corte que le toca a ese satélite."""
    for lon, lat in puntos:
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            continue
        if (lado == "este") != (lon > CORTE_LON):
            continue
        k = (round(round(lon / CELDA) * CELDA, 1), round(round(lat / CELDA) * CELDA, 1))
        n, edad = celdas.get(k, (0, 999))
        celdas[k] = (n + 1, min(edad, minutos_atras))
    return celdas


def main():
    ahora = datetime.now(timezone.utc)
    celdas, archivos, errores = {}, 0, []
    for bucket, lado in SATELITES:
        try:
            lista = claves_recientes(bucket, ahora)
        except Exception as e:  # noqa: BLE001
            errores.append(f"{bucket}: {e}"[:120])
            continue
        for inicio, clave in lista:
            try:
                acumular(celdas, destellos(get(f"https://{bucket}.s3.amazonaws.com/{clave}")), int((ahora - inicio).total_seconds() // 60), lado)
                archivos += 1
            except Exception as e:  # noqa: BLE001
                errores.append(f"{clave[-40:]}: {e}"[:120])
    if not archivos:
        print(f"rayos: sin archivos ({'; '.join(errores[:3])}); se conserva el anterior")
        return 0
    filas = sorted(([lon, lat, n, edad] for (lon, lat), (n, edad) in celdas.items()), key=lambda f: -f[2])
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w", encoding="utf-8") as f:
        json.dump({"generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "ventana_min": VENTANA_MIN, "fuente": "NOAA GOES-19/GOES-18 GLM (AWS Open Data)",
                   "destellos": sum(c[2] for c in filas), "celdas": filas}, f, separators=(",", ":"))
    print(f"rayos: {sum(c[2] for c in filas)} destellos en {len(filas)} celdas ({archivos} archivos; {len(errores)} errores)")
    return 0


if __name__ == "__main__":
    t0 = time.time()
    sys.exit(main())
