#!/usr/bin/env python3
"""Perturbaciones tropicales: zonas donde el NHC vigila que se pueda formar un ciclón en 2 y 7 días.

Antes de tener nombre, un sistema es una «perturbación» (un área de tormentas desorganizadas o una onda tropical). El
NHC publica en su Perspectiva del Tiempo Tropical (Tropical Weather Outlook) la ubicación actual de cada perturbación,
la región donde podría desarrollarse y la probabilidad de formación en 48 horas y en 7 días (baja < 40 %,
media 40–60 %, alta > 60 %). Cubre el Atlántico, el Pacífico oriental y el Pacífico central.

Fuente: servicio de mapas del NWS «NHC_tropical_weather_summary» (dominio público): capas 1 (ubicación actual, 2 días),
2 (ubicación actual, 7 días), 3 (región de posible desarrollo, 7 días) y 33 (dirección del movimiento).
No se incluye el JTWC (Pacífico occidental e Índico): su robots.txt no permite consultas automáticas.
Salida: vivos/perturbaciones.geojson.
"""
import json
import os
import sys
import urllib.parse
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F  # noqa: E402

OUT = os.path.join(ROOT, "vivos", "perturbaciones.geojson")
MAPA = "https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather_summary/MapServer"
CAPAS = {1: "ubicacion_2d", 2: "ubicacion_7d", 3: "region_7d", 33: "movimiento"}


def consulta(capa):
    q = urllib.parse.urlencode({"where": "1=1", "outFields": "*", "returnGeometry": "true", "f": "geojson"})
    return f"{MAPA}/{capa}/query?{q}"


def _campo(p, *claves):
    """Primer valor no vacío entre varias claves posibles (el servicio cambia mayúsculas y nombres)."""
    bajas = {k.lower(): v for k, v in p.items()}
    for c in claves:
        v = bajas.get(c.lower())
        if v not in (None, "", " "):
            return v
    return None


def nivel(prob):
    """«30%» o 30 → ('baja', 30). Umbrales del NHC: baja < 40, media 40–60, alta > 60."""
    try:
        n = int(str(prob).strip().rstrip("%"))
    except (TypeError, ValueError):
        return None, None
    return ("alta" if n > 60 else "media" if n >= 40 else "baja"), n


def normalizar(f, tipo):
    p = f.get("properties") or {}
    n2, p2 = nivel(_campo(p, "prob2day", "prob_2day", "twoday_prob", "prob48"))
    n7, p7 = nivel(_campo(p, "prob7day", "prob_7day", "sevenday_prob", "prob5day"))
    riesgo2 = _campo(p, "risk2day", "risk_2day")
    riesgo7 = _campo(p, "risk7day", "risk_7day", "risk5day")
    return {"type": "Feature", "geometry": f["geometry"],
            "properties": {"id": f"{tipo}-{_campo(p, 'objectid', 'fid', 'area') or ''}-{_campo(p, 'basin') or ''}", "kind": tipo, "area": _campo(p, "area", "areaid", "id", "objectid"), "cuenca": _campo(p, "basin", "basin_id") or "",
                           "prob_2d": p2, "prob_7d": p7, "nivel_2d": n2 or (str(riesgo2).lower() if riesgo2 else None),
                           "nivel_7d": n7 or (str(riesgo7).lower() if riesgo7 else None),
                           "texto": _campo(p, "discussion", "text", "description", "comments") or "",
                           "emitido": _campo(p, "issuance", "idp_filedate", "issue_time", "advdate") or "",
                           "url": "https://www.nhc.noaa.gov/gtwo.php", "fuente": "NOAA NHC · Perspectiva del Tiempo Tropical"}}


def main():
    feats, estado = [], {}
    if not F.permitido_por_robots(MAPA):
        print("perturbaciones: robots.txt no lo permite")
        return 0
    for capa, tipo in CAPAS.items():
        try:
            fc = json.loads(F.get(consulta(capa), timeout=60))
            nuevos = [normalizar(f, tipo) for f in fc.get("features", []) if f.get("geometry")]
            feats += nuevos
            estado[tipo] = len(nuevos)
        except Exception as e:  # noqa: BLE001
            estado[tipo] = f"error: {e}"[:120]
    if all(isinstance(v, str) for v in estado.values()):
        print(f"perturbaciones: ninguna capa respondió ({estado}); se conserva el archivo anterior")
        return 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"type": "FeatureCollection", "generado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "fuentes": estado, "features": feats},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"perturbaciones: {len(feats)} elementos · {estado}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
