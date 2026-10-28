#!/usr/bin/env python3
"""Interferencia de GPS (jamming o spoofing) vista desde los aviones: datos diarios de GPSJam.org.

Cada avión con ADS-B reporta qué tan precisa es su navegación por satélite (NIC/NACp). GPSJam (John Wiseman) junta los
reportes de un día en hexágonos H3 de resolución 4 (~1,770 km²) y cuenta aviones con navegación buena y mala; mucha
navegación mala en una zona suele indicar interferencia (bloqueo o suplantación de la señal), aunque también puede
deberse a fallas del equipo. Datos de ADS-B Exchange y otros agregadores, publicados por GPSJam con un día o más de
retraso. Se baja un archivo al día. Salida: vivos/gps_interferencia.geojson.

Niveles (los de GPSJam): bajo < 2 % de aviones con navegación mala, medio 2–10 %, alto > 10 %. Solo se guardan
hexágonos con al menos MIN_AVIONES aviones y 2 % o más.
"""
import csv
import io
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "vivos", "gps_interferencia.geojson")
BASE = "https://gpsjam.org/data/"
UA = "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
MIN_AVIONES = 5
UMBRAL_MEDIO, UMBRAL_ALTO = 0.02, 0.10


def get(url, timeout=60):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=timeout) as r:
        return r.read().decode("utf-8")


def ultima_fecha(manifest_csv):
    """Fecha más reciente del índice (columna «date»), preferentemente una no marcada como sospechosa."""
    filas = list(csv.DictReader(io.StringIO(manifest_csv)))
    buenas = [f["date"] for f in filas if f.get("suspect", "false") != "true"]
    return (buenas or [f["date"] for f in filas] or [None])[-1]


def nivel(pct):
    return "alto" if pct > UMBRAL_ALTO else "medio" if pct >= UMBRAL_MEDIO else "bajo"


def poligono(hexid):
    """Contorno del hexágono [[lon, lat], …] cerrado; sin saltos en el antimeridiano."""
    import h3  # dependencia solo del workflow
    pts = [(lng, lat) for lat, lng in h3.cell_to_boundary(hexid)]
    lons = [p[0] for p in pts]
    if max(lons) - min(lons) > 180:
        pts = [(lng + 360 if lng < 0 else lng, lat) for lng, lat in pts]
    anillo = [[round(lng, 4), round(lat, 4)] for lng, lat in pts]
    return anillo + [anillo[0]]


def features(datos_csv, fecha, contorno=poligono):
    out = []
    for f in csv.DictReader(io.StringIO(datos_csv)):
        try:
            buenos, malos = int(f["count_good_aircraft"]), int(f["count_bad_aircraft"])
        except (KeyError, ValueError):
            continue
        total = buenos + malos
        if total < MIN_AVIONES:
            continue
        pct = malos / total
        if pct < UMBRAL_MEDIO:
            continue
        out.append({"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [contorno(f["hex"])]},
                    "properties": {"hex": f["hex"], "malos": malos, "buenos": buenos, "pct": round(pct * 100, 1), "nivel": nivel(pct), "fecha": fecha}})
    return out


def main():
    fecha = ultima_fecha(get(BASE + "manifest.csv"))
    if not fecha:
        print("gps: índice vacío; se conserva el anterior")
        return 0
    if os.path.exists(OUT) and json.load(open(OUT, encoding="utf-8")).get("fecha") == fecha:
        print(f"gps: el día {fecha} ya está procesado")
        return 0
    feats = features(get(BASE + f"{fecha}-h3_4.csv"), fecha)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"type": "FeatureCollection", "generado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "fecha": fecha,
               "fuente": "GPSJam.org (reportes de navegación de aviones con ADS-B; datos de ADS-B Exchange y otros)", "features": feats},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"gps: {fecha}: {len(feats)} hexágonos con 2 % o más de aviones con navegación mala ({sum(f['properties']['nivel'] == 'alto' for f in feats)} altos)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
