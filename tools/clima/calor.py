#!/usr/bin/env python3
"""Ondas de calor, olas de frío, heladas, índice de calor, UV y niebla en ~1,000 ciudades (pronóstico de 7 días).

No descarga pronóstico propio: lee vivos/ct/forecast.geojson, que ya genera «Clima Táctico» con MET Norway (CC BY 4.0)
y trae por día la máxima, la mínima, el índice de calor (temperatura + humedad), el UV con cielo despejado y la
fracción de niebla. Lo que agrega es la climatología de cada ciudad para saber qué es «anormal» ahí:
promedio diario 1991-2020 de la máxima y la mínima del CPC de NOAA (rejilla de 0.5°, dominio público). Del servicio
THREDDS de NOAA PSL se pide la rejilla mundial del día 15 de cada mes (24 archivos de ~1 MB, una sola vez) y se toma la
celda de cada ciudad; queda en vivos/clima_base.json y solo se vuelve a pedir para ciudades nuevas.
(NASA POWER se descartó: su robots.txt no permite consultar su API.)

Reglas propias (ESTIMACIÓN; los avisos oficiales en México son del SMN y Protección Civil):
- Promedio del día: interpolado entre los días 15 de cada mes. Días parciales del pronóstico (hoy y el último, con
  menos de 18 h) no cuentan para ondas ni olas.
- Día cálido: máxima ≥ promedio de la máxima de ese día + 5 °C y ≥ 30 °C. Sin climatología (todavía, o ciudad costera
  que cae en una celda de mar del CPC): máxima ≥ 35 °C.
- Onda de calor: 3 días seguidos o más cálidos. Nivel por el índice de calor más alto (categorías del NWS de EUA):
  1 precaución (< 32 °C), 2 precaución extrema (32-39), 3 peligro (39-51), 4 peligro extremo (≥ 51).
- Día frío: mínima ≤ promedio de la mínima de ese día − 5 °C y ≤ 5 °C. Sin climatología: mínima ≤ 0 °C.
- Ola de frío: 3 días seguidos o más fríos. Helada: algún día con mínima ≤ 0 °C.
- UV: el máximo con cielo despejado (lo más alto posible ese día): 0-2 bajo, 3-5 moderado, 6-7 alto, 8-10 muy alto,
  11+ extremo (escala de la OMS).
- Niebla probable: alguna hora con 50 % o más del área cubierta de niebla (MET Norway lo da en los primeros ~2.5 días).
Salida: vivos/calor_frio.geojson.
"""
import json
import os
import sys
import time
import urllib.request
from datetime import date, datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
PRONOSTICO = os.path.join(ROOT, "vivos", "ct", "forecast.geojson")
BASE = os.path.join(ROOT, "vivos", "clima_base.json")
OUT = os.path.join(ROOT, "vivos", "calor_frio.geojson")
CPC = ("https://psl.noaa.gov/thredds/ncss/grid/Datasets/cpc_global_temp/{var}.day.ltm.1991-2020.nc"
       "?var={var}&time=0001-{mes:02d}-15T00:00:00Z&accept=netcdf4")
UA = "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"
PAUSA_S = 1.0
CAT_CALOR = ["", "Precaución", "Precaución extrema", "Peligro", "Peligro extremo"]
CAT_UV = [(11, "Extremo"), (8, "Muy alto"), (6, "Alto"), (3, "Moderado"), (0, "Bajo")]


def clave(lat, lon):
    return f"{lat:.2f},{lon:.2f}"


def url_cpc(var, mes):
    return CPC.format(var=var, mes=mes)


def leer_nc4(datos, var):
    """NetCDF-4 de THREDDS (una fecha, rejilla mundial) → (lats, lons 0-360, matriz con NaN donde no hay dato)."""
    import io
    import h5py  # lo instala el workflow «Datos en movimiento» (también lo usa la capa de rayos)
    import numpy as np
    with h5py.File(io.BytesIO(datos), "r") as f:
        v = f[var]
        m = np.array(v[0] if v.ndim == 3 else v, dtype=float)
        for attr in ("_FillValue", "missing_value"):
            if attr in v.attrs:
                m[m == float(np.ravel(v.attrs[attr])[0])] = np.nan
        return np.array(f["lat"][:], dtype=float), np.array(f["lon"][:], dtype=float), m


def muestrear(lats, lons, campo, lat, lon):
    """Valor de la celda más cercana (lon de la rejilla en 0-360). El CPC solo tiene tierra: si una ciudad costera cae en
    una celda de mar se usa la celda de tierra vecina (hasta 1 celda, ~55 km). None si no hay ninguna."""
    import numpy as np
    i0 = int(np.abs(lats - lat).argmin())
    j0 = int(np.abs(lons - (lon % 360)).argmin())
    for di, dj in [(0, 0), (0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (1, -1), (-1, 1), (-1, -1)]:
        i, j = i0 + di, (j0 + dj) % campo.shape[1]
        if 0 <= i < campo.shape[0]:
            v = float(campo[i, j])
            if v == v and -90 < v < 70:
                return round(v, 1)
    return None


def completar_base(puntos, base, bajar=None, leer=leer_nc4, pausa=PAUSA_S):
    """Si hay ciudades sin climatología, pide la rejilla del día 15 de cada mes (máxima y mínima) y llena todas de una
    vez. Una ciudad sin dato (celda de mar del CPC) se guarda como None para no volver a pedirla. Respeta robots.txt."""
    faltan = [(lat, lon) for _, lat, lon in puntos if clave(lat, lon) not in base]
    if not faltan:
        return 0
    if bajar is None:
        import fuentes as F
        if not F.permitido_por_robots(url_cpc("tmax", 1)):
            print("calor: robots.txt de NOAA PSL no lo permite; se usan umbrales fijos")
            return 0

        def bajar(url):
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=120) as r:
                return r.read()
    valores = {k: {"tmax": [], "tmin": []} for k in faltan}
    try:
        for var in ("tmax", "tmin"):
            for mes in range(1, 13):
                lats, lons, campo = leer(bajar(url_cpc(var, mes)), var)
                for lat, lon in faltan:
                    valores[(lat, lon)][var].append(muestrear(lats, lons, campo, lat, lon))
                time.sleep(pausa)
    except Exception as e:  # noqa: BLE001
        print(f"calor: NOAA PSL no respondió ({e}); se usan umbrales fijos por ahora")
        return 0
    for (lat, lon), v in valores.items():
        ok = all(x is not None for x in v["tmax"] + v["tmin"])
        base[clave(lat, lon)] = v if ok else None
    return len(faltan)


def normal(doce, fecha):
    """Promedio del día: interpolación lineal entre los valores del día 15 de cada mes (el CPC da el promedio de ese
    día). Sin esto, el 1 de noviembre se compararía con el 15 de noviembre (en otoño, ~2-4 °C más frío)."""
    d = date.fromisoformat(fecha)
    m = d.month - 1
    if d.day >= 15:
        a, b = date(d.year, d.month, 15), date(d.year + (d.month == 12), d.month % 12 + 1, 15)
        i, j = m, (m + 1) % 12
    else:
        a, b = date(d.year - (d.month == 1), (d.month - 2) % 12 + 1, 15), date(d.year, d.month, 15)
        i, j = (m - 1) % 12, m
    return doce[i] + (doce[j] - doce[i]) * (d - a).days / (b - a).days


def rachas(banderas):
    """[True, True, False, True, True, True] → [(3, 5)] : tramos de 3 o más días seguidos (índices inicio, fin)."""
    out, ini = [], None
    for i, b in enumerate(list(banderas) + [False]):
        if b and ini is None:
            ini = i
        elif not b and ini is not None:
            if i - ini >= 3:
                out.append((ini, i - 1))
            ini = None
    return out


def cat_calor(ic):
    if ic is None:
        return 1
    return 4 if ic >= 51 else 3 if ic >= 39 else 2 if ic >= 32 else 1


def cat_uv(uv):
    return next(n for u, n in CAT_UV if (uv or 0) >= u)


def evaluar(props, clima):
    """Propiedades del pronóstico de una ciudad (+ su climatología o None) → resumen de calor, frío, UV y niebla."""
    dias = [d for d in props.get("days") or [] if d.get("date")]
    umbral_c = [max(30.0, normal(clima["tmax"], d["date"]) + 5) if clima else 35.0 for d in dias]
    umbral_f = [min(5.0, normal(clima["tmin"], d["date"]) - 5) if clima else 0.0 for d in dias]
    # Un día parcial (el de hoy desde la hora de la corrida, o el último) no tiene su máxima y mínima reales: no cuenta.
    completo = [d.get("h") is None or d["h"] >= 18 for d in dias]
    calido = [c and d.get("tmax") is not None and d["tmax"] >= u for d, u, c in zip(dias, umbral_c, completo)]
    frio = [c and d.get("tmin") is not None and d["tmin"] <= u for d, u, c in zip(dias, umbral_f, completo)]
    ondas, olas = rachas(calido), rachas(frio)
    ic_max = max((d["hi"] for d in dias if d.get("hi") is not None), default=None)
    uv_max = max((d["uv"] for d in dias if d.get("uv") is not None), default=None)
    niebla = max((d["fog"] for d in dias if d.get("fog") is not None), default=None)
    heladas = [d["date"] for d in dias if d.get("tmin") is not None and d["tmin"] <= 0]  # una helada cuenta aunque el día sea parcial
    tramo = lambda r: {"inicio": dias[r[0]]["date"], "fin": dias[r[1]]["date"], "dias": r[1] - r[0] + 1}  # noqa: E731
    ic_onda = max((d["hi"] for a, b in ondas for d in dias[a:b + 1] if d.get("hi") is not None), default=None)
    return {
        "onda_calor": bool(ondas), "calor_nivel": cat_calor(ic_onda) if ondas else 0, "calor_tramos": [tramo(r) for r in ondas],
        "ola_frio": bool(olas), "frio_tramos": [tramo(r) for r in olas], "heladas": heladas,
        "frio_nivel": (3 if olas and heladas else 2 if olas else 1 if heladas else 0),
        "indice_calor_max_c": ic_max, "indice_calor_cat": CAT_CALOR[cat_calor(ic_max)] if ic_max and ic_max >= 27 else "",
        "uv_max": round(uv_max, 1) if uv_max is not None else None, "uv_cat": cat_uv(uv_max) if uv_max is not None else "",
        "niebla_pct": round(niebla) if niebla is not None else None, "niebla": bool(niebla is not None and niebla >= 50),
        "climatologia": bool(clima),
        "serie": [[d["date"], d.get("tmax"), d.get("tmin"), d.get("hi"), round(uc, 1), round(uf, 1)] for d, uc, uf in zip(dias, umbral_c, umbral_f)],
    }


def main():
    try:
        pron = json.load(open(PRONOSTICO, encoding="utf-8"))
    except (OSError, ValueError):
        print("calor: aún no hay pronóstico (vivos/ct/forecast.geojson); se conserva el anterior")
        return 0
    try:
        base = json.load(open(BASE, encoding="utf-8"))
    except (OSError, ValueError):
        base = {}
    puntos = [(f["properties"].get("name"), f["geometry"]["coordinates"][1], f["geometry"]["coordinates"][0]) for f in pron.get("features", [])]
    n = completar_base(puntos, base)
    if n:
        os.makedirs(os.path.dirname(BASE), exist_ok=True)
        json.dump(base, open(BASE, "w", encoding="utf-8"), separators=(",", ":"))
    feats = []
    for f in pron.get("features", []):
        lon, lat = f["geometry"]["coordinates"][:2]
        p = evaluar(f["properties"], base.get(clave(lat, lon)))
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]},
                      "properties": {"name": f["properties"].get("name"), **p}})
    if not feats:
        print("calor: pronóstico vacío; se conserva el anterior")
        return 0
    json.dump({"type": "FeatureCollection", "generado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
               "fuente": "MET Norway (pronóstico, CC BY 4.0) y CPC de NOAA (climatología 1991-2020); reglas propias, no aviso oficial",
               "con_climatologia": sum(1 for x in feats if x["properties"]["climatologia"]), "features": feats},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    c = sum(1 for x in feats if x["properties"]["onda_calor"])
    fr = sum(1 for x in feats if x["properties"]["ola_frio"])
    print(f"calor: {len(feats)} ciudades ({sum(1 for v in base.values() if v)} con climatología, {len(base)} consultadas, {n} nuevas): {c} con onda de calor, {fr} con ola de frío")
    return 0


if __name__ == "__main__":
    sys.exit(main())
