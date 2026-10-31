#!/usr/bin/env python3
"""Ondas de calor, olas de frío, heladas, índice de calor, UV y niebla en ~1,000 ciudades (pronóstico de 7 días).

No descarga pronóstico propio: lee vivos/ct/forecast.geojson, que ya genera «Clima Táctico» con MET Norway (CC BY 4.0)
y trae por día la máxima, la mínima, el índice de calor (temperatura + humedad), el UV con cielo despejado y la
fracción de niebla. Lo que agrega es la climatología de cada ciudad para saber qué es «anormal» ahí:
promedio de la máxima y la mínima de cada mes 2001-2020 de NASA POWER (dominio público, permite uso comercial). Se
descarga una sola vez por ciudad, poco a poco (LOTE por corrida) y se guarda en vivos/clima_base.json.

Reglas propias (ESTIMACIÓN; los avisos oficiales en México son del SMN y Protección Civil):
- Día cálido: máxima ≥ promedio de la máxima del mes + 5 °C y ≥ 30 °C. Sin climatología todavía: máxima ≥ 35 °C.
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
POWER = ("https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M_MAX,T2M_MIN&community=AG"
         "&longitude={lon:.2f}&latitude={lat:.2f}&start=2001&end=2020&format=JSON")
UA = "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"
LOTE, PAUSA_S = 60, 1.0
MESES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
CAT_CALOR = ["", "Precaución", "Precaución extrema", "Peligro", "Peligro extremo"]
CAT_UV = [(11, "Extremo"), (8, "Muy alto"), (6, "Alto"), (3, "Moderado"), (0, "Bajo")]


def clave(lat, lon):
    return f"{lat:.2f},{lon:.2f}"


def leer_power(texto):
    """Respuesta de NASA POWER (climatología) → {"tmax": [12 meses], "tmin": [12 meses]}; None si falta algo."""
    p = (json.loads(texto).get("properties") or {}).get("parameter") or {}
    out = {}
    for nombre, var in (("tmax", "T2M_MAX"), ("tmin", "T2M_MIN")):
        vals = [(p.get(var) or {}).get(m) for m in MESES]
        if any(v is None or v <= -900 for v in vals):
            return None
        out[nombre] = [round(float(v), 1) for v in vals]
    return out


def completar_base(puntos, base, bajar=None, lote=LOTE, pausa=PAUSA_S):
    """Descarga la climatología de hasta `lote` ciudades que aún no la tienen. Respeta robots.txt de NASA POWER."""
    if bajar is None:
        import fuentes as F
        if not F.permitido_por_robots(POWER.format(lat=0, lon=0)):
            print("calor: robots.txt de NASA POWER no lo permite; se usan umbrales fijos")
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
            c = leer_power(bajar(POWER.format(lat=lat, lon=lon)))
        except Exception as e:  # noqa: BLE001
            print(f"calor: NASA POWER no respondió para {k} ({e})")
            break
        if c:
            base[k] = c
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
               "fuente": "MET Norway (pronóstico, CC BY 4.0) y NASA POWER (climatología 2001-2020); reglas propias, no aviso oficial",
               "con_climatologia": sum(1 for x in feats if x["properties"]["climatologia"]), "features": feats},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    c = sum(1 for x in feats if x["properties"]["onda_calor"])
    fr = sum(1 for x in feats if x["properties"]["ola_frio"])
    print(f"calor: {len(feats)} ciudades ({len(base)} con climatología, {n} nuevas): {c} con onda de calor, {fr} con ola de frío")
    return 0


if __name__ == "__main__":
    sys.exit(main())
