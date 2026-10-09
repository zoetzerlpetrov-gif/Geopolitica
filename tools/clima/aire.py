#!/usr/bin/env python3
"""Calidad del aire (US AQI) en ~490 ciudades: todas las capitales nacionales, las capitales estatales y
ciudades principales de México y las ciudades de más de 1.5 millones de habitantes del mundo.

Fuente: Open-Meteo Air Quality API (modelo CAMS de Copernicus; sin llave, uso no comercial). Es un modelo
numérico, no una estación de medición: para la CDMX la fuente oficial es el SIMAT (aire.cdmx.gob.mx).
Una consulta trae muchas coordenadas a la vez; se piden en bloques de 100 con una pausa entre bloques.
Salida: vivos/aire_ciudades.geojson (cada 3 h como máximo; lo llama «Datos en movimiento»).
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F  # noqa: E402

OUT = os.path.join(ROOT, "vivos", "aire_ciudades.geojson")
API = "https://air-quality-api.open-meteo.com/v1/air-quality"
VARIABLES = "us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide"
CADA_H = 3
BLOQUE = 100
# Bandas del índice US AQI de la EPA: (máximo, nivel 0–5, etiqueta, color). Mismo esquema que Clima Táctico.
BANDAS = [(50, 0, "Buena", "#00e400"), (100, 1, "Moderada", "#ffd23f"), (150, 2, "Dañina para grupos sensibles", "#ff7e00"),
          (200, 3, "Dañina", "#ff0000"), (300, 4, "Muy dañina", "#8f3f97"), (10 ** 6, 5, "Peligrosa", "#7e0023")]


def seleccionar(ciudades, min_mundo=1_500_000):
    """Filas de config/ciudades.json → [(nombre, iso3, lat, lon, tipo)] sin repetir."""
    out, vistos = [], set()
    for n, es, iso, lat, lon, tipo, pob in ciudades:
        entra = tipo == "capital" or (iso == "MEX" and tipo in ("capital_estatal", "principal")) or (iso != "MEX" and pob >= min_mundo)
        clave = (es or n, iso)
        if entra and clave not in vistos:
            vistos.add(clave)
            out.append((es or n, iso, lat, lon, tipo))
    return out


def banda(aqi):
    for maximo, nivel, etiqueta, color in BANDAS:
        if aqi <= maximo:
            return nivel, etiqueta, color
    return BANDAS[-1][1:]


def features_aire(lugares, respuestas):
    """Une cada ciudad con su respuesta (misma posición) → features con el esquema de airquality.geojson."""
    out = []
    for (nombre, iso, lat, lon, tipo), r in zip(lugares, respuestas):
        cur = (r or {}).get("current") or {}
        aqi = cur.get("us_aqi")
        if aqi is None:
            continue
        nivel, etiqueta, color = banda(aqi)
        out.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]}, "properties": {
            "layer": "air", "name": nombre, "pais_iso3": iso, "tipo_ciudad": tipo, "us_aqi": aqi, "level": nivel, "level_label": etiqueta, "color": color,
            "pm2_5": cur.get("pm2_5"), "pm10": cur.get("pm10"), "ozone": cur.get("ozone"), "no2": cur.get("nitrogen_dioxide"),
            "so2": cur.get("sulphur_dioxide"), "co": cur.get("carbon_monoxide"), "time": cur.get("time"), "fuente": "Open-Meteo (CAMS)"}})
    return out


def consultar(bloque):
    q = {"latitude": ",".join(str(x[2]) for x in bloque), "longitude": ",".join(str(x[3]) for x in bloque), "current": VARIABLES, "timezone": "UTC"}
    url = API + "?" + urllib.parse.urlencode(q)
    req = urllib.request.Request(url, headers={"User-Agent": F.UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.loads(r.read())
    return d if isinstance(d, list) else [d]


def main():
    if os.path.exists(OUT):
        gen = json.load(open(OUT, encoding="utf-8")).get("generado_utc", "")
        if gen and datetime.now(timezone.utc) - datetime.strptime(gen, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) < timedelta(hours=CADA_H):
            print("aire: datos recientes; se conservan")
            return 0
    if not F.permitido_por_robots(API):
        print("aire: robots.txt no lo permite")
        return 0
    lugares = seleccionar(json.load(open(os.path.join(ROOT, "config", "ciudades.json"), encoding="utf-8"))["ciudades"])
    feats, errores = [], []
    for i in range(0, len(lugares), BLOQUE):
        bloque = lugares[i:i + BLOQUE]
        try:
            feats += features_aire(bloque, consultar(bloque))
        except Exception as e:  # noqa: BLE001
            errores.append(f"bloque {i // BLOQUE + 1}: {e}"[:160])
        time.sleep(3)
    if not feats:
        print(f"aire: sin respuesta ({errores}); se conservan los anteriores")
        return 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"type": "FeatureCollection", "generado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "fuente": "Open-Meteo Air Quality (CAMS)",
               "ciudades": len(lugares), "errores": errores, "features": feats}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"aire: {len(feats)} de {len(lugares)} ciudades; errores: {errores}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
