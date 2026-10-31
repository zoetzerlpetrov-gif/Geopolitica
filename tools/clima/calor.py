#!/usr/bin/env python3
"""Ondas de calor, olas de frío, heladas, índice de calor, UV y niebla en ~1,000 ciudades (pronóstico de 7 días).

No descarga pronóstico propio: lee vivos/ct/forecast.geojson, que ya genera «Clima Táctico» con MET Norway (CC BY 4.0)
y trae por día la máxima, la mínima, el índice de calor (temperatura + humedad), el UV con cielo despejado y la
fracción de niebla. Lo que agrega es la climatología de cada ciudad para saber qué es «anormal» ahí:
promedio diario 1991-2020 de la máxima y la mínima del CPC de NOAA (rejilla de 0.5°, dominio público), pedido por punto
al servicio THREDDS de NOAA PSL y resumido por mes. Se descarga una sola vez por ciudad, poco a poco (LOTE por corrida),
y se guarda en vivos/clima_base.json. (NASA POWER se descartó: su robots.txt no permite consultar su API.)

Reglas propias (ESTIMACIÓN; los avisos oficiales en México son del SMN y Protección Civil):
- Día cálido: máxima ≥ promedio de la máxima del mes + 5 °C y ≥ 30 °C. Sin climatología (todavía, o ciudad costera
  que cae en una celda de mar del CPC): máxima ≥ 35 °C.
- Onda de calor: 3 días seguidos o más cálidos. Nivel por el índice de calor más alto (categorías del NWS de EUA):
  1 precaución (< 32 °C), 2 precaución extrema (32-39), 3 peligro (39-51), 4 peligro extremo (≥ 51).
- Día frío: mínima ≤ promedio de la mínima del mes − 5 °C y ≤ 5 °C. Sin climatología: mínima ≤ 0 °C.
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
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
PRONOSTICO = os.path.join(ROOT, "vivos", "ct", "forecast.geojson")
BASE = os.path.join(ROOT, "vivos", "clima_base.json")
OUT = os.path.join(ROOT, "vivos", "calor_frio.geojson")
CPC = ("https://psl.noaa.gov/thredds/ncss/grid/Datasets/cpc_global_temp/{var}.day.ltm.1991-2020.nc"
       "?var={var}&latitude={lat:.2f}&longitude={lon360:.2f}&temporal=all&accept=csv")
UA = "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"
LOTE, PAUSA_S = 60, 1.0
CAT_CALOR = ["", "Precaución", "Precaución extrema", "Peligro", "Peligro extremo"]
CAT_UV = [(11, "Extremo"), (8, "Muy alto"), (6, "Alto"), (3, "Moderado"), (0, "Bajo")]


def clave(lat, lon):
    return f"{lat:.2f},{lon:.2f}"


def leer_cpc(texto):
    """CSV de THREDDS (365 días de promedio 1991-2020) → 12 promedios mensuales; None si la celda no tiene dato (mar)."""
    por_mes = [[] for _ in range(12)]
    for linea in texto.splitlines()[1:]:
        partes = linea.split(",")
        if len(partes) < 5:
            continue
        try:
            v = float(partes[-1])
            mes = int(partes[0][5:7]) - 1
        except ValueError:
            continue
        if v == v and -90 < v < 70:  # descarta NaN y valores de relleno
            por_mes[mes].append(v)
    if any(len(m) < 20 for m in por_mes):
        return None
    return [round(sum(m) / len(m), 1) for m in por_mes]


def url_cpc(var, lat, lon):
    return CPC.format(var=var, lat=lat, lon360=lon % 360)


def completar_base(puntos, base, bajar=None, lote=LOTE, pausa=PAUSA_S):
    """Descarga la climatología de hasta `lote` ciudades que aún no la tienen (respeta robots.txt de NOAA PSL). Una
    ciudad sin dato (celda de mar) se guarda como None para no volver a pedirla."""
    if bajar is None:
        import fuentes as F
        if not F.permitido_por_robots(url_cpc("tmax", 0, 0)):
            print("calor: robots.txt de NOAA PSL no lo permite; se usan umbrales fijos")
            return 0

        def bajar(url):
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60) as r:
                return r.read().decode("utf-8")
    nuevos = 0
    for _, lat, lon in puntos:
        k = clave(lat, lon)
        if k in base:
            continue
        if nuevos >= lote:
            break
        try:
            tmax = leer_cpc(bajar(url_cpc("tmax", lat, lon)))
            time.sleep(pausa)
            tmin = leer_cpc(bajar(url_cpc("tmin", lat, lon))) if tmax else None
        except Exception as e:  # noqa: BLE001
            print(f"calor: NOAA PSL no respondió para {k} ({e})")
            break
        base[k] = {"tmax": tmax, "tmin": tmin} if tmax and tmin else None
        nuevos += 1
        time.sleep(pausa)
    return nuevos


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
    mes = lambda d: int(d["date"][5:7]) - 1  # noqa: E731
    umbral_c = [max(30.0, clima["tmax"][mes(d)] + 5) if clima else 35.0 for d in dias]
    umbral_f = [min(5.0, clima["tmin"][mes(d)] - 5) if clima else 0.0 for d in dias]
    calido = [d.get("tmax") is not None and d["tmax"] >= u for d, u in zip(dias, umbral_c)]
    frio = [d.get("tmin") is not None and d["tmin"] <= u for d, u in zip(dias, umbral_f)]
    ondas, olas = rachas(calido), rachas(frio)
    ic_max = max((d["hi"] for d in dias if d.get("hi") is not None), default=None)
    uv_max = max((d["uv"] for d in dias if d.get("uv") is not None), default=None)
    niebla = max((d["fog"] for d in dias if d.get("fog") is not None), default=None)
    heladas = [d["date"] for d in dias if d.get("tmin") is not None and d["tmin"] <= 0]
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
