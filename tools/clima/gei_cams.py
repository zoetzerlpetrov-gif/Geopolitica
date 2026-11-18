#!/usr/bin/env python3
"""Gases por ciudad con CAMS de Copernicus: CO₂, metano (CH₄) y monóxido de carbono (CO), más el flujo de CO₂ de la vegetación.

Conjunto: «CAMS global greenhouse gas forecasts» (cams-global-greenhouse-gas-forecasts, licencia CC-BY 4.0: uso
comercial permitido citando a Copernicus). Es un MODELO que combina observaciones de satélite y estaciones con la
física de la atmósfera (~40 km de resolución): da el ambiente general de una ciudad, no el de una calle.
Se pide el pronóstico más reciente (hora 0):
  * carbon_dioxide y methane en el nivel 137 del modelo (el más cercano al suelo): fracción de masa → ppm y ppb.
  * co2_column_mean_molar_fraction y ch4_column_mean_molar_fraction: promedio de toda la columna de aire (lo que
    miden los satélites como OCO-2 o Sentinel-5P).
  * carbon_monoxide en el nivel 137 (incendios, tráfico, industria): fracción de masa → ppb.
  * Flujos de CO₂ de la vegetación acumulados en 24 h (pronóstico hora 24): intercambio neto del ecosistema (NEE: positivo =
    la vegetación y el suelo EMITEN CO₂; negativo = lo ABSORBEN), producción primaria bruta (fotosíntesis) y respiración.
    Se convierten a g de CO₂ por m² al día. Además del valor por ciudad se publica una malla de 2° sobre tierra
    (vivos/flujo_co2.geojson) para ver dónde absorben los bosques y cultivos y dónde emiten.
Para cada ciudad de config/ciudades.json (la misma lista que la calidad del aire) se toma el punto de malla más cercano.
Requisitos: secreto ADS_API_KEY y la licencia del conjunto aceptada en ads.atmosphere.copernicus.eu.
Salida: vivos/gei_cams.geojson y vivos/flujo_co2.geojson (una vez al día).
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
OUT_FLUJO = os.path.join(ROOT, "vivos", "flujo_co2.geojson")
MALLA_FLUJO = 2.0  # grados
ADS_URL = "https://ads.atmosphere.copernicus.eu/api"
CONJUNTO = "cams-global-greenhouse-gas-forecasts"
CADA_H = 20
ATRIBUCION = "Generado con información del Copernicus Atmosphere Monitoring Service (CAMS) [2026]"
AIRE_SECO, M_CO2, M_CH4, M_CO = 28.9644, 44.0095, 16.0425, 28.0101   # g/mol
HORAS_FLUJO = 24
PETICIONES = [  # (nombre, cuerpo sin fecha, claves que aporta). Los niveles no aplican a la columna ni a los flujos.
    ("superficie", {"variable": ["carbon_dioxide", "methane", "carbon_monoxide"], "model_level": ["137"], "leadtime_hour": ["0"], "data_format": "netcdf_zip"},
     ("co2_sup", "ch4_sup", "co_sup")),
    ("columna", {"variable": ["co2_column_mean_molar_fraction", "ch4_column_mean_molar_fraction"], "leadtime_hour": ["0"], "data_format": "netcdf_zip"},
     ("co2_col", "ch4_col")),
    ("flujo", {"variable": ["accumulated_carbon_dioxide_net_ecosystem_exchange", "accumulated_carbon_dioxide_gross_primary_production",
                            "accumulated_carbon_dioxide_ecosystem_respiration"], "leadtime_hour": [str(HORAS_FLUJO)], "data_format": "netcdf_zip"},
     ("nee", "gpp", "reco")),
]
CLAVES = ("co2_sup", "ch4_sup", "co_sup", "co2_col", "ch4_col", "nee", "gpp", "reco")


def con_fecha(cuerpo, dia):
    """El conjunto exige «date» (rango AAAA-MM-DD/AAAA-MM-DD): se pide un solo día."""
    f = dia.strftime("%Y-%m-%d")
    return {**cuerpo, "date": [f"{f}/{f}"]}


def clasificar(nombre, nombre_largo=""):
    """Nombre de variable del netCDF → co2_sup, ch4_sup, co_sup, co2_col, ch4_col, nee, gpp, reco o None."""
    n, l = nombre.lower(), (nombre_largo or "").lower()
    # Los flujos primero: su nombre largo también dice «carbon dioxide».
    if "ecosystem exchange" in l or "nee" in n:
        return "nee"
    if "gross primary" in l or "gpp" in n:
        return "gpp"
    if "respiration" in l or n in ("rec", "areco", "aer", "reco"):
        return "reco"
    gas = ("co2" if ("co2" in n or "carbon dioxide" in l) else "ch4" if ("ch4" in n or "methane" in l)
           else "co" if (n in ("co", "tcco") or "carbon monoxide" in l) else None)
    if not gas:
        return None
    columna = n.startswith("x") or "column" in l or "column" in n or n.startswith("tc")
    if gas == "co" and columna:
        return None
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
    if clave == "co_sup":
        return round(v * AIRE_SECO / M_CO * 1e9, 0)
    if clave in ("nee", "gpp", "reco"):  # kg de CO₂/m² acumulados en HORAS_FLUJO → g/m² al día
        g = v * 1000 * 24 / HORAS_FLUJO
        return round(g if clave == "nee" else abs(g), 2)
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
            out[clave] = v.filled(float("nan")) if hasattr(v, "filled") else v   # matriz numpy (menos memoria que listas)
    return lats, lons, out


def features(lugares, lats, lons, campos, corrida):
    feats = []
    for nombre, iso, lat, lon, tipo in lugares:
        a, b = indice_cercano(lats, lat), indice_cercano(lons, lon_en_malla(lon, lons))
        p = {k: a_unidades(k, float(m[a][b])) for k, m in campos.items()}
        if not any(v is not None for v in p.values()):
            continue
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]},
                      "properties": {"name": nombre, "pais_iso3": iso, "tipo_ciudad": tipo, **p, "corrida": corrida}})
    return feats


def resumen(feats):
    """Promedio y extremos por variable (para la leyenda y para comparar cada ciudad con el resto)."""
    out = {}
    for k in CLAVES:
        vals = sorted(f["properties"][k] for f in feats if f["properties"].get(k) is not None)
        if vals:
            out[k] = {"promedio": round(sum(vals) / len(vals), 1), "min": vals[0], "max": vals[-1], "p10": vals[len(vals) // 10], "p90": vals[len(vals) * 9 // 10]}
    return out


def malla_flujo(lats, lons, campos, paso=MALLA_FLUJO):
    """Promedia NEE, GPP y respiración en celdas de `paso` grados; solo celdas con vegetación (|valor| > 0)."""
    import numpy as np

    if "nee" not in campos:
        return []
    la, lo = np.asarray(lats, dtype=float), np.asarray(lons, dtype=float)
    lo = np.where(lo > 180, lo - 360, lo)
    fila = np.floor((la + 90) / paso).astype(int)
    col = np.floor((lo + 180) / paso).astype(int) % int(360 / paso)
    sumas = {}
    claves = [k for k in ("nee", "gpp", "reco") if k in campos]
    arr = {k: np.asarray(campos[k], dtype=float) for k in claves}
    por_col = {int(j): np.where(col == j)[0] for j in np.unique(col)}
    for i in np.unique(fila):
        filas = np.where(fila == i)[0]
        for j, cols in por_col.items():
            idx = np.ix_(filas, cols)
            bloque = arr["nee"][idx]
            ok = np.isfinite(bloque) & (np.abs(bloque) > 1e-9)
            if ok.sum() < max(1, bloque.size // 4):   # al menos ¼ de la celda con vegetación (deja fuera mar y desierto)
                continue
            sumas[(int(i), j)] = {k: float(np.nanmean(a[idx][ok])) for k, a in arr.items()}
    feats = []
    for (i, j), v in sorted(sumas.items()):
        props = {k: a_unidades(k, x) for k, x in v.items()}
        if props.get("nee") is None:
            continue
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(-180 + (j + 0.5) * paso, 2), round(-90 + (i + 0.5) * paso, 2)]},
                      "properties": props})
    return feats


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
    campos, errores, corridas = {}, [], {}
    hoy = datetime.now(timezone.utc)
    with tempfile.TemporaryDirectory() as tmp:
        for nombre, cuerpo, claves in PETICIONES:
            for dia in (hoy, hoy - timedelta(days=1)):  # el pronóstico de hoy sale unas horas tarde: si aún no está, el de ayer
                carpeta = os.path.join(tmp, f"{nombre}_{dia:%Y%m%d}")
                try:
                    cliente.retrieve(CONJUNTO, con_fecha(cuerpo, dia), carpeta + ".zip")
                    with zipfile.ZipFile(carpeta + ".zip") as z:
                        z.extractall(carpeta)
                    for n in os.listdir(carpeta):
                        if n.endswith(".nc"):
                            la, lo, c = leer_netcdf(os.path.join(carpeta, n))
                            if lats is not None and (len(la) != len(lats) or len(lo) != len(lons)):
                                errores.append(f"{nombre}: malla distinta ({len(la)}×{len(lo)}); se omite")
                                continue
                            lats, lons = lats or la, lons or lo
                            campos.update(c)
                except Exception as e:  # noqa: BLE001  una petición con error no impide las otras
                    errores.append(f"{nombre} {dia:%Y-%m-%d}: {e}"[:300])
                if any(k in campos for k in claves):
                    corridas[nombre] = dia.strftime("%Y-%m-%d")
                    break
    if not campos:
        print("GEI CAMS: sin datos; se conservan los anteriores. " + "; ".join(errores))
        return 0
    corrida = corridas.get("superficie") or next(iter(corridas.values()), hoy.strftime("%Y-%m-%d"))
    feats = features(lugares, lats, lons, campos, corrida)
    flujo = malla_flujo(lats, lons, campos)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"type": "FeatureCollection", "generado_utc": hoy.strftime("%Y-%m-%dT%H:%M:%SZ"), "fuente": "CAMS de Copernicus (pronóstico de gases de efecto invernadero)",
               "atribucion": ATRIBUCION, "variables": sorted(campos), "corridas": corridas, "resumen": resumen(feats), "errores": errores, "features": feats},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    if flujo:
        json.dump({"type": "FeatureCollection", "generado_utc": hoy.strftime("%Y-%m-%dT%H:%M:%SZ"), "corrida": corridas.get("flujo"), "malla_grados": MALLA_FLUJO,
                   "unidad": "g de CO₂ por m² al día", "fuente": "CAMS de Copernicus (flujos de CO₂ del modelo de vegetación)", "atribucion": ATRIBUCION,
                   "resumen": resumen(flujo), "features": flujo}, open(OUT_FLUJO, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"GEI CAMS: {len(feats)} ciudades, {len(flujo)} celdas de flujo; variables {sorted(campos)}; resumen {resumen(feats)}" + (f"; errores {errores}" if errores else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
