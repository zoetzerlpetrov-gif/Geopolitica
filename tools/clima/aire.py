#!/usr/bin/env python3
"""Calidad del aire (US AQI) en ~490 ciudades: todas las capitales nacionales, las capitales estatales y
ciudades principales de México y las ciudades de más de 1.5 millones de habitantes del mundo.

Fuente principal mientras Open-Meteo siga cerrado: Sensor.Community (red de sensores ciudadanos de partículas,
datos abiertos ODbL, sin llave): promedio de 24 h de PM2.5 y PM10 de cada sensor exterior; por ciudad, la mediana de
los sensores a 15 km o menos (al menos 2) convertida al índice US AQI de la EPA (cortes de 2024). Son sensores de bajo
costo: con humedad alta suelen marcar de más; sirven para comparar, no como dato oficial. Cobertura fuerte en Europa,
escasa en América Latina y África (ahí la ciudad queda sin dato).
Open-Meteo Air Quality (modelo CAMS) quedó EN PAUSA: su robots.txt dice «Disallow: /» (2026-10-09); si lo vuelve a
permitir, se usa otra vez. Para la CDMX la fuente oficial es el SIMAT (aire.cdmx.gob.mx).
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


SENSOR_COMMUNITY = "https://data.sensor.community/static/v2/data.24h.json"
RADIO_KM, MIN_SENSORES = 15.0, 2
# Cortes del US AQI (EPA, revisión de 2024): (concentración máxima del tramo, AQI máximo del tramo).
CORTES_PM25 = [(0.0, 0), (9.0, 50), (35.4, 100), (55.4, 150), (125.4, 200), (225.4, 300), (325.4, 500)]
CORTES_PM10 = [(0.0, 0), (54.0, 50), (154.0, 100), (254.0, 150), (354.0, 200), (424.0, 300), (604.0, 500)]


def aqi_de(c, cortes):
    """Concentración (µg/m³) → AQI por interpolación lineal dentro de su tramo; None si no hay dato."""
    if c is None or c < 0:
        return None
    for (c0, a0), (c1, a1) in zip(cortes, cortes[1:]):
        if c <= c1:
            return round(a0 + (a1 - a0) * (c - c0) / (c1 - c0)) if c1 > c0 else a1
    return 500


def lecturas_sensor_community(datos):
    """JSON de data.24h.json → [(lat, lon, pm25, pm10)] solo de sensores exteriores con valores creíbles."""
    out = []
    for s in datos:
        loc = s.get("location") or {}
        if str(loc.get("indoor")) == "1":
            continue
        v = {x.get("value_type"): x.get("value") for x in s.get("sensordatavalues") or []}
        try:
            lat, lon = float(loc["latitude"]), float(loc["longitude"])
            p25 = float(v["P2"]) if "P2" in v else None
            p10 = float(v["P1"]) if "P1" in v else None
        except (KeyError, TypeError, ValueError):
            continue
        if p25 is None or not 0 <= p25 < 500 or (p10 is not None and not 0 <= p10 < 1000):
            continue  # sensor descompuesto o saturado de humedad
        out.append((lat, lon, p25, p10))
    return out


def _km(a, b, c, d):
    import math
    p = math.radians
    x = math.sin(p(c - a) / 2) ** 2 + math.cos(p(a)) * math.cos(p(c)) * math.sin(p(d - b) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(x))


def features_sensores(lugares, lecturas, hora=""):
    """Ciudades → features con la mediana de los sensores a ≤15 km (mismo esquema que con Open-Meteo)."""
    from statistics import median
    rejilla = {}
    for r in lecturas:
        rejilla.setdefault((int(r[0] * 5), int(r[1] * 5)), []).append(r)  # celdas de 0.2°
    out = []
    for nombre, iso, lat, lon, tipo in lugares:
        cerca = []
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                for r in rejilla.get((int(lat * 5) + di, int(lon * 5) + dj), []):
                    if _km(lat, lon, r[0], r[1]) <= RADIO_KM:
                        cerca.append(r)
        if len(cerca) < MIN_SENSORES:
            continue
        pm25 = round(median(r[2] for r in cerca), 1)
        p10s = [r[3] for r in cerca if r[3] is not None]
        pm10 = round(median(p10s), 1) if p10s else None
        aqi = max(x for x in (aqi_de(pm25, CORTES_PM25), aqi_de(pm10, CORTES_PM10)) if x is not None)
        nivel, etiqueta, color = banda(aqi)
        out.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]}, "properties": {
            "layer": "air", "name": nombre, "pais_iso3": iso, "tipo_ciudad": tipo, "us_aqi": aqi, "level": nivel, "level_label": etiqueta, "color": color,
            "pm2_5": pm25, "pm10": pm10, "ozone": None, "no2": None, "so2": None, "co": None, "time": hora,
            "sensores": len(cerca), "fuente": f"Sensor.Community ({len(cerca)} sensores ciudadanos a ≤15 km, promedio 24 h)"}})
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
    lugares = seleccionar(json.load(open(os.path.join(ROOT, "config", "ciudades.json"), encoding="utf-8"))["ciudades"])
    if not F.permitido_por_robots(API):
        return desde_sensor_community(lugares)
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


def desde_sensor_community(lugares):
    if not F.permitido_por_robots(SENSOR_COMMUNITY):
        print("aire: Open-Meteo y Sensor.Community no permiten la lectura; se conservan los anteriores")
        return 0
    try:
        req = urllib.request.Request(SENSOR_COMMUNITY, headers={"User-Agent": F.UA, "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=180) as r:
            lecturas = lecturas_sensor_community(json.loads(r.read()))
    except Exception as e:  # noqa: BLE001
        print(f"aire: Sensor.Community no respondió ({e}); se conservan los anteriores")
        return 0
    hora = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M")
    feats = features_sensores(lugares, lecturas, hora)
    if not feats:
        print("aire: ninguna ciudad con sensores; se conservan los anteriores")
        return 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"type": "FeatureCollection", "generado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
               "fuente": "Sensor.Community (sensores ciudadanos de partículas, ODbL; Open-Meteo en pausa por su robots.txt)",
               "ciudades": len(lugares), "errores": [], "features": feats}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"aire: Sensor.Community, {len(lecturas)} sensores, {len(feats)} de {len(lugares)} ciudades con dato")
    return 0


if __name__ == "__main__":
    sys.exit(main())
