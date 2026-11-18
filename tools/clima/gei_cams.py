#!/usr/bin/env python3
"""Gases de efecto invernadero por ciudad con CAMS de Copernicus: CO₂ y metano (CH₄), cerca del suelo y en la columna.

Conjunto: «CAMS global greenhouse gas forecasts» (cams-global-greenhouse-gas-forecasts, licencia CC-BY 4.0: uso
comercial permitido citando a Copernicus). Es un MODELO que combina observaciones de satélite y estaciones con la
física de la atmósfera (~40 km de resolución): da el ambiente general de una ciudad, no el de una calle.
Se pide el pronóstico más reciente (hora 0):
  * carbon_dioxide y methane en el nivel 137 del modelo (el más cercano al suelo): fracción de masa → ppm y ppb.
  * co2_column_mean_molar_fraction y ch4_column_mean_molar_fraction: promedio de toda la columna de aire (lo que
    miden los satélites como OCO-2 o Sentinel-5P).
Para cada ciudad de config/ciudades.json (la misma lista que la calidad del aire) se toma el punto de malla más cercano.
Requisitos: secreto ADS_API_KEY y la licencia del conjunto aceptada en ads.atmosphere.copernicus.eu.
Salida: vivos/gei_cams.geojson (una vez al día).
"""
import json
import os
import sys
import tempfile
import zipfile
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.dirname(__file__))
from aire import seleccionar  # noqa: E402

OUT = os.path.join(ROOT, "vivos", "gei_cams.geojson")
ADS_URL = "https://ads.atmosphere.copernicus.eu/api"
CONJUNTO = "cams-global-greenhouse-gas-forecasts"
CADA_H = 20
ATRIBUCION = "Generado con información del Copernicus Atmosphere Monitoring Service (CAMS) [2026]"
AIRE_SECO, M_CO2, M_CH4 = 28.9644, 44.0095, 16.0425   # g/mol
PETICIONES = [  # (nombre, cuerpo sin fecha): superficie (nivel 137) y columna, en dos peticiones (los niveles no aplican a la columna)
    ("superficie", {"variable": ["carbon_dioxide", "methane"], "model_level": ["137"], "leadtime_hour": ["0"], "data_format": "netcdf_zip"}),
    ("columna", {"variable": ["co2_column_mean_molar_fraction", "ch4_column_mean_molar_fraction"], "leadtime_hour": ["0"], "data_format": "netcdf_zip"}),
]


def con_fecha(cuerpo, dia):
    """El conjunto exige «date» (rango AAAA-MM-DD/AAAA-MM-DD): se pide un solo día."""
    f = dia.strftime("%Y-%m-%d")
    return {**cuerpo, "date": [f"{f}/{f}"]}


def clasificar(nombre, nombre_largo=""):
    """Nombre de variable del netCDF → co2_sup, ch4_sup, co2_col, ch4_col o None."""
    n, l = nombre.lower(), (nombre_largo or "").lower()
    gas = "co2" if ("co2" in n or "carbon dioxide" in l) else "ch4" if ("ch4" in n or "methane" in l) else None
    if not gas:
        return None
    columna = n.startswith("x") or "column" in l or "column" in n or n.startswith("tc")
    return f"{gas}_{'col' if columna else 'sup'}"


def a_unidades(clave, v):
    """Valor del modelo → ppm (CO₂) o ppb (CH₄). Superficie: fracción de masa (kg/kg). Columna: fracción molar,
    a veces ya en ppm/ppb y a veces en mol/mol (se detecta por magnitud)."""
    if v is None or v != v:
        return None
    if clave == "co2_sup":
        return round(v * AIRE_SECO / M_CO2 * 1e6, 1)
    if clave == "ch4_sup":
        return round(v * AIRE_SECO / M_CH4 * 1e9, 0)
    if clave == "co2_col":
        return round(v * 1e6 if v < 1 else v, 1)
    return round(v * 1e9 if v < 1e-3 else v * 1e3 if v < 10 else v, 0)


def indice_cercano(valores, x):
    return min(range(len(valores)), key=lambda i: abs(valores[i] - x))


def lon_en_malla(lon, lons):
    return lon % 360 if min(lons) >= 0 else ((lon + 180) % 360) - 180


def leer_netcdf(ruta):
    """→ (lats, lons, {clave: matriz [lat][lon]}) del primer tiempo y nivel."""
    import netCDF4

    out = {}
    with netCDF4.Dataset(ruta) as ds:
        lats = [float(x) for x in ds.variables["latitude"][:]]
        lons = [float(x) for x in ds.variables["longitude"][:]]
        for nombre, var in ds.variables.items():
            if var.ndim < 2 or nombre in ("latitude", "longitude"):
                continue
            clave = clasificar(nombre, getattr(var, "long_name", ""))
            if not clave:
                continue
            v = var[:]
            while v.ndim > 2:
                v = v[0]
            out[clave] = v.filled(float("nan")).tolist() if hasattr(v, "filled") else v.tolist()
    return lats, lons, out


def features(lugares, lats, lons, campos, corrida):
    feats = []
    for nombre, iso, lat, lon, tipo in lugares:
        a, b = indice_cercano(lats, lat), indice_cercano(lons, lon_en_malla(lon, lons))
        p = {k: a_unidades(k, m[a][b]) for k, m in campos.items()}
        if not any(v is not None for v in p.values()):
            continue
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]},
                      "properties": {"name": nombre, "pais_iso3": iso, "tipo_ciudad": tipo, **p, "corrida": corrida}})
    return feats


def resumen(feats):
    """Promedio y extremos por variable (para la leyenda y para comparar cada ciudad con el resto)."""
    out = {}
    for k in ("co2_sup", "ch4_sup", "co2_col", "ch4_col"):
        vals = sorted(f["properties"][k] for f in feats if f["properties"].get(k) is not None)
        if vals:
            out[k] = {"promedio": round(sum(vals) / len(vals), 1), "min": vals[0], "max": vals[-1], "p10": vals[len(vals) // 10], "p90": vals[len(vals) * 9 // 10]}
    return out


def main():
    llave = os.environ.get("ADS_API_KEY", "").strip()
    if not llave:
        print("GEI CAMS: sin ADS_API_KEY; se omite")
        return 0
    if os.path.exists(OUT):
        gen = json.load(open(OUT, encoding="utf-8")).get("generado_utc", "")
        if gen and datetime.now(timezone.utc) - datetime.strptime(gen, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) < timedelta(hours=CADA_H):
            print("GEI CAMS: datos recientes; se conservan")
            return 0
    import cdsapi

    lugares = seleccionar(json.load(open(os.path.join(ROOT, "config", "ciudades.json"), encoding="utf-8"))["ciudades"])
    cliente = cdsapi.Client(url=ADS_URL, key=llave, quiet=True)
    lats = lons = None
    campos, errores, corrida = {}, [], None
    hoy = datetime.now(timezone.utc)
    with tempfile.TemporaryDirectory() as tmp:
        for dia in (hoy, hoy - timedelta(days=1)):  # el pronóstico de hoy sale unas horas tarde: si aún no está, el de ayer
            for nombre, cuerpo in PETICIONES:
                if any(k.endswith("_sup" if nombre == "superficie" else "_col") for k in campos):
                    continue
                carpeta = os.path.join(tmp, f"{nombre}_{dia:%Y%m%d}")
                zipf = carpeta + ".zip"
                try:
                    cliente.retrieve(CONJUNTO, con_fecha(cuerpo, dia), zipf)
                    with zipfile.ZipFile(zipf) as z:
                        z.extractall(carpeta)
                    for n in os.listdir(carpeta):
                        if n.endswith(".nc"):
                            la, lo, c = leer_netcdf(os.path.join(carpeta, n))
                            lats, lons = lats or la, lons or lo
                            campos.update(c)
                            corrida = corrida or dia.strftime("%Y-%m-%d")
                except Exception as e:  # noqa: BLE001  una petición con error no impide la otra
                    errores.append(f"{nombre} {dia:%Y-%m-%d}: {e}"[:300])
            if len(campos) >= 4:
                break
    if not campos:
        print("GEI CAMS: sin datos; se conservan los anteriores. " + "; ".join(errores))
        return 0
    feats = features(lugares, lats, lons, campos, corrida)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"type": "FeatureCollection", "generado_utc": hoy.strftime("%Y-%m-%dT%H:%M:%SZ"), "fuente": "CAMS de Copernicus (pronóstico de gases de efecto invernadero)",
               "atribucion": ATRIBUCION, "variables": sorted(campos), "resumen": resumen(feats), "errores": errores, "features": feats},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"GEI CAMS: {len(feats)} ciudades; variables {sorted(campos)}; resumen {resumen(feats)}" + (f"; errores {errores}" if errores else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
