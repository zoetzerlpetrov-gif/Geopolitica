#!/usr/bin/env python3
"""Cono de pronóstico y avisos costeros de huracanes del NHC (NOAA): Atlántico, Pacífico oriental y central.

El cono NO es el tamaño del huracán: es la zona por donde podría pasar el CENTRO en los próximos 5 días. El NHC lo
traza con círculos que contienen el 67 % de sus errores de pronóstico de los últimos 5 años; los efectos (viento,
lluvia, marea) pueden llegar muy lejos del cono.

Fuentes (dominio público, gobierno de EUA; sin robots.txt que lo impida):
  1. www.nhc.noaa.gov/CurrentStorms.json: ciclones activos y su «cartera» (AT1–AT5, EP1–EP5, CP1–CP5).
  2. Servicio de mapas del NWS (mapservices.weather.noaa.gov/tropical/.../NHC_tropical_weather/MapServer):
     por cartera, la capa «Forecast Cone» y la capa «Watch-Warning» (vigilancias y avisos de huracán o tormenta
     tropical en la costa). Cada cartera ocupa 26 capas a partir de la 4: cono = 4 + 26·i + 4, avisos = + 5.
Salida: vivos/nhc_conos.geojson (la lee la capa «Ciclones» junto con GDACS e IBTrACS).
"""
import json
import os
import sys
import urllib.parse
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F  # noqa: E402

OUT = os.path.join(ROOT, "vivos", "nhc_conos.geojson")
ACTIVOS = "https://www.nhc.noaa.gov/CurrentStorms.json"
MAPAS = "https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer"
CARTERAS = [f"{c}{n}" for c in ("AT", "EP", "CP") for n in range(1, 6)]
CLASE = {"HU": "Huracán", "TS": "Tormenta tropical", "TD": "Depresión tropical", "PTC": "Ciclón potencial", "STS": "Tormenta subtropical",
         "SD": "Depresión subtropical", "PT": "Postropical", "MH": "Huracán mayor"}
# Códigos de vigilancia y aviso en la costa (campo TCWW del NHC).
AVISO = {"HWR": ("Aviso de huracán", 4), "HWA": ("Vigilancia de huracán", 3), "TWR": ("Aviso de tormenta tropical", 3),
         "TWA": ("Vigilancia de tormenta tropical", 2)}


def capas(cartera):
    i = CARTERAS.index(cartera)
    base = 4 + 26 * i
    return base + 4, base + 5


def consulta(capa):
    q = urllib.parse.urlencode({"where": "1=1", "outFields": "*", "returnGeometry": "true", "f": "geojson"})
    return f"{MAPAS}/{capa}/query?{q}"


def codigo_aviso(props):
    for v in props.values():
        if isinstance(v, str) and v.strip().upper() in AVISO:
            return v.strip().upper()
    return None


def features_tormenta(t, cono_fc, avisos_fc):
    nombre = t.get("name") or t.get("id")
    clase = CLASE.get(t.get("classification"), t.get("classification") or "")
    base = {"storm_id": t.get("id"), "name": nombre, "clase": clase, "intensity_kt": int(t.get("intensity") or 0) or None,
            "url": (t.get("forecastGraphics") or {}).get("url") or "https://www.nhc.noaa.gov/", "fuente": "NOAA NHC (cono oficial)",
            "last_update": t.get("lastUpdate"), "aviso_num": (t.get("publicAdvisory") or {}).get("advNum")}
    out = []
    for f in (cono_fc or {}).get("features", []):
        if f.get("geometry"):
            out.append({"type": "Feature", "geometry": f["geometry"], "properties": {**base, "kind": "cono", "opacidad": 0.16}})
    for f in (avisos_fc or {}).get("features", []):
        cod = codigo_aviso(f.get("properties") or {})
        if f.get("geometry") and cod:
            out.append({"type": "Feature", "geometry": f["geometry"], "properties": {**base, "kind": "aviso_costa", "aviso": AVISO[cod][0], "aviso_nivel": AVISO[cod][1]}})
    return out


def main():
    ahora = datetime.now(timezone.utc)
    try:
        if not F.permitido_por_robots(ACTIVOS):
            raise PermissionError("robots.txt no lo permite")
        activos = json.loads(F.get(ACTIVOS, timeout=40)).get("activeStorms") or []
    except Exception as e:  # noqa: BLE001
        print(f"nhc_conos: sin lista de ciclones activos ({e}); se conserva el archivo anterior")
        return 0
    feats, estado = [], {}
    for t in activos:
        cartera = (t.get("binNumber") or "").upper()
        if cartera not in CARTERAS:
            continue
        c_cono, c_avisos = capas(cartera)
        try:
            cono = json.loads(F.get(consulta(c_cono), timeout=60))
            avisos = json.loads(F.get(consulta(c_avisos), timeout=60))
            nuevos = features_tormenta(t, cono, avisos)
            feats += nuevos
            estado[t.get("name") or cartera] = f"ok ({sum(1 for f in nuevos if f['properties']['kind'] == 'cono')} cono, {sum(1 for f in nuevos if f['properties']['kind'] == 'aviso_costa')} avisos)"
        except Exception as e:  # noqa: BLE001
            estado[t.get("name") or cartera] = f"error: {e}"[:120]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"type": "FeatureCollection", "generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "fuentes": estado, "features": feats},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"nhc_conos: {len(activos)} ciclones activos; {estado}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
