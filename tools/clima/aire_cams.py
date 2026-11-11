#!/usr/bin/env python3
"""Calidad del aire con CAMS de Copernicus (pronóstico global de composición atmosférica), para todas las ciudades.

Por qué: es un modelo que cubre todo el planeta (los sensores ciudadanos casi no hay en América Latina y África) y su
licencia (licencia de datos de Copernicus/CAMS) permite el uso comercial citando la fuente.
Qué hace: pide al Atmosphere Data Store (ADS) el pronóstico de PM2.5 y PM10 en superficie de la corrida de las 00 UTC,
de 0 a 24 h cada 3 h; promedia las 24 h en cada ciudad (punto de malla más cercano, 0.4°) y lo convierte al US AQI
de la EPA con los mismos cortes de tools/clima/aire.py.
Requisitos: secreto ADS_API_KEY (token personal de ads.atmosphere.copernicus.eu → tu perfil) y haber aceptado la
licencia del conjunto «CAMS global atmospheric composition forecasts» en su página. Sin llave termina sin error.
Salida: vivos/aire_cams.geojson (una vez al día basta: el pronóstico se publica una vez por corrida).
"""
import json
import os
import sys
import tempfile
import zipfile
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.dirname(__file__))
from aire import CORTES_PM10, CORTES_PM25, aqi_de, banda, seleccionar  # noqa: E402

OUT = os.path.join(ROOT, "vivos", "aire_cams.geojson")
ADS_URL = "https://ads.atmosphere.copernicus.eu/api"
CONJUNTO = "cams-global-atmospheric-composition-forecasts"
CADA_H = 20
ATRIBUCION = "Generado con información del Copernicus Atmosphere Monitoring Service (CAMS) [2026]"


def peticion(dia):
    """Cuerpo de la petición al ADS para la corrida de las 00 UTC de `dia` (AAAA-MM-DD)."""
    return {"variable": ["particulate_matter_2.5um", "particulate_matter_10um"], "date": [f"{dia}/{dia}"], "time": ["00:00"],
            "leadtime_hour": [str(h) for h in range(0, 25, 3)], "type": ["forecast"], "data_format": "netcdf_zip"}


def indice_cercano(valores, x):
    """Índice del valor más cercano en una lista ordenada (ascendente o descendente)."""
    return min(range(len(valores)), key=lambda i: abs(valores[i] - x))


def lon_en_malla(lon, lons):
    """Lleva la longitud al rango de la malla (0–360 o −180–180)."""
    return lon % 360 if min(lons) >= 0 else ((lon + 180) % 360) - 180


def promedios_ciudad(lugares, lats, lons, pm25, pm10):
    """pm25/pm10: listas [tiempo][lat][lon] en kg/m³ → {i: (pm25 µg/m³, pm10 µg/m³)} promedio de las 24 h."""
    out = {}
    for i, (_, _, lat, lon, _) in enumerate(lugares):
        a, b = indice_cercano(lats, lat), indice_cercano(lons, lon_en_malla(lon, lons))
        v25 = [t[a][b] for t in pm25 if t[a][b] is not None and t[a][b] == t[a][b]]  # sin vacíos ni NaN
        v10 = [t[a][b] for t in pm10 if t[a][b] is not None and t[a][b] == t[a][b]]
        if v25 and v10:
            out[i] = (round(sum(v25) / len(v25) * 1e9, 1), round(sum(v10) / len(v10) * 1e9, 1))
    return out


def features_cams(lugares, promedios, valido):
    feats = []
    for i, (nombre, iso, lat, lon, tipo) in enumerate(lugares):
        if i not in promedios:
            continue
        pm25, pm10 = promedios[i]
        aqi = max(a for a in (aqi_de(pm25, CORTES_PM25), aqi_de(pm10, CORTES_PM10)) if a is not None)
        nivel, etiqueta, color = banda(aqi)
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]}, "properties": {
            "layer": "air", "name": nombre, "pais_iso3": iso, "tipo_ciudad": tipo, "us_aqi": aqi, "level": nivel, "level_label": etiqueta,
            "color": color, "pm2_5": pm25, "pm10": pm10, "time": valido, "fuente": "CAMS de Copernicus (pronóstico, promedio de 24 h)"}})
    return feats


def leer_netcdf(ruta):
    """Archivo netCDF de CAMS → (lats, lons, pm25, pm10) como listas de Python."""
    import netCDF4  # se instala solo en el workflow

    with netCDF4.Dataset(ruta) as ds:
        lats = [float(x) for x in ds.variables["latitude"][:]]
        lons = [float(x) for x in ds.variables["longitude"][:]]

        def var(nombre):
            v = ds.variables[nombre][:]
            while v.ndim > 3:  # (periodo, tiempo de referencia, lat, lon) → (tiempo, lat, lon)
                v = v.reshape((-1,) + v.shape[-2:])
            return v.filled(float("nan")).tolist() if hasattr(v, "filled") else v.tolist()

        return lats, lons, var("pm2p5"), var("pm10")


def descargar(dia, llave, destino):
    import cdsapi  # se instala solo en el workflow

    cdsapi.Client(url=ADS_URL, key=llave, quiet=True).retrieve(CONJUNTO, peticion(dia), destino)


def main():
    llave = os.environ.get("ADS_API_KEY", "").strip()
    if not llave:
        print("aire CAMS: sin ADS_API_KEY; se omite")
        return 0
    if os.path.exists(OUT):
        gen = json.load(open(OUT, encoding="utf-8")).get("generado_utc", "")
        if gen and datetime.now(timezone.utc) - datetime.strptime(gen, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) < timedelta(hours=CADA_H):
            print("aire CAMS: datos recientes; se conservan")
            return 0
    lugares = seleccionar(json.load(open(os.path.join(ROOT, "config", "ciudades.json"), encoding="utf-8"))["ciudades"])
    hoy = datetime.now(timezone.utc)
    with tempfile.TemporaryDirectory() as tmp:
        for dia in (hoy.strftime("%Y-%m-%d"), (hoy - timedelta(days=1)).strftime("%Y-%m-%d")):  # la corrida de hoy puede no estar lista
            zipf = os.path.join(tmp, f"cams-{dia}.zip")
            try:
                descargar(dia, llave, zipf)
                break
            except Exception as e:  # noqa: BLE001
                print(f"aire CAMS {dia}: {e}"[:300])
        else:
            print("aire CAMS: sin datos; se conservan los anteriores")
            return 0
        with zipfile.ZipFile(zipf) as z:
            z.extractall(tmp)
        ncs = [os.path.join(tmp, n) for n in os.listdir(tmp) if n.endswith(".nc")]
        datos = {}
        for nc in ncs:  # puede venir un archivo por variable o uno con ambas
            la, lo, p25, p10 = leer_netcdf_parcial(nc)
            datos.setdefault("lats", la), datos.setdefault("lons", lo)
            if p25 is not None:
                datos["pm25"] = p25
            if p10 is not None:
                datos["pm10"] = p10
    prom = promedios_ciudad(lugares, datos["lats"], datos["lons"], datos["pm25"], datos["pm10"])
    feats = features_cams(lugares, prom, dia)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"type": "FeatureCollection", "generado_utc": hoy.strftime("%Y-%m-%dT%H:%M:%SZ"), "fuente": "CAMS de Copernicus", "atribucion": ATRIBUCION,
               "corrida": f"{dia} 00 UTC", "ciudades": len(lugares), "features": feats}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"aire CAMS: {len(feats)} de {len(lugares)} ciudades (corrida {dia})")
    return 0


def leer_netcdf_parcial(ruta):
    """Como leer_netcdf, pero tolera archivos que traen solo una de las dos variables."""
    import netCDF4

    with netCDF4.Dataset(ruta) as ds:
        nombres = set(ds.variables)
    if {"pm2p5", "pm10"} <= nombres:
        return leer_netcdf(ruta)
    with netCDF4.Dataset(ruta) as ds:
        lats = [float(x) for x in ds.variables["latitude"][:]]
        lons = [float(x) for x in ds.variables["longitude"][:]]

        def var(nombre):
            if nombre not in ds.variables:
                return None
            v = ds.variables[nombre][:]
            while v.ndim > 3:
                v = v.reshape((-1,) + v.shape[-2:])
            return v.filled(float("nan")).tolist() if hasattr(v, "filled") else v.tolist()

        return lats, lons, var("pm2p5"), var("pm10")


if __name__ == "__main__":
    sys.exit(main())
