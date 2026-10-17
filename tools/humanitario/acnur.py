#!/usr/bin/env python3
"""Desplazamiento forzado por país, con las estadísticas oficiales de ACNUR (UNHCR Refugee Data Finder).

API pública sin clave: `api.unhcr.org/population/v1/population/`. Dos consultas por año:
- `coo_all=true`: por país de ORIGEN → refugiados y solicitantes de asilo que salieron de ese país, desplazados internos.
- `coa_all=true`: por país de ASILO → refugiados y solicitantes de asilo que ese país acoge, apátridas.
Se usa el año más reciente con datos (ACNUR publica las cifras de fin de año a mediados del año siguiente).

Salidas (un punto por país, en el centro del país del gazetteer), refresco cada 30 días; si falla, se conservan:
  vivos/desplazamiento_origen.geojson    personas que huyeron de cada país + desplazados dentro de él
  vivos/desplazamiento_acogida.geojson   personas que cada país acoge
"""
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_ORIGEN = os.path.join(ROOT, "vivos", "desplazamiento_origen.geojson")
OUT_ACOGIDA = os.path.join(ROOT, "vivos", "desplazamiento_acogida.geojson")
UA = "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"
API = "https://api.unhcr.org/population/v1/population/?limit=100&page={pagina}&year={anio}&{eje}_all=true"
DIAS = 30
MINIMO = 1000  # países con menos personas no se dibujan


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read())


def num(v):
    """ACNUR usa "-" o "0" como texto para vacío."""
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


def leer(anio, eje, pedir=get_json):
    """Todas las páginas de un año y eje ('coo' u 'coa') → lista de registros."""
    filas, pagina = [], 1
    while pagina <= 60:
        d = pedir(API.format(pagina=pagina, anio=anio, eje=eje))
        filas += d.get("items") or []
        if pagina >= num(d.get("maxPages")):
            break
        pagina += 1
        time.sleep(0.5)
    return filas


def por_origen(filas, paises, anio):
    feats = []
    for r in filas:
        iso = r.get("coo_iso") or r.get("coo")
        if iso not in paises:
            continue
        refugiados, solicitantes, internos = num(r.get("refugees")), num(r.get("asylum_seekers")), num(r.get("idps"))
        otros = num(r.get("oip"))  # otras personas con necesidad de protección internacional (p. ej. venezolanos)
        total = refugiados + solicitantes + internos + otros
        if total < MINIMO:
            continue
        p = paises[iso]
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [p["lon"], p["lat"]]},
                      "properties": {"iso3": iso, "pais": p.get("es") or p.get("en") or iso, "anio": anio, "total": total,
                                     "refugiados": refugiados, "solicitantes": solicitantes, "otros_proteccion": otros,
                                     "desplazados_internos": internos, "retornados": num(r.get("returned_refugees")) + num(r.get("returned_idps"))}})
    return sorted(feats, key=lambda f: -f["properties"]["total"])


def por_acogida(filas, paises, anio):
    feats = []
    for r in filas:
        iso = r.get("coa_iso") or r.get("coa")
        if iso not in paises:
            continue
        refugiados, solicitantes, otros = num(r.get("refugees")), num(r.get("asylum_seekers")), num(r.get("oip"))
        total = refugiados + solicitantes + otros
        if total < MINIMO:
            continue
        p = paises[iso]
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [p["lon"], p["lat"]]},
                      "properties": {"iso3": iso, "pais": p.get("es") or p.get("en") or iso, "anio": anio, "total": total,
                                     "refugiados": refugiados, "solicitantes": solicitantes, "otros_proteccion": otros,
                                     "apatridas": num(r.get("stateless")), "comunidades_anfitrionas": num(r.get("hst"))}})
    return sorted(feats, key=lambda f: -f["properties"]["total"])


def escribir(ruta, feats, ahora, anio):
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "anio": anio,
                   "fuente": "ACNUR, Refugee Data Finder (api.unhcr.org)", "features": feats}, f, ensure_ascii=False, separators=(",", ":"))


def main():
    ahora = datetime.now(timezone.utc)
    try:
        prev = json.load(open(OUT_ORIGEN, encoding="utf-8"))
        if ahora - datetime.strptime(prev["generado_utc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) < timedelta(days=DIAS):
            print("desplazamiento: datos recientes")
            return 0
    except (OSError, ValueError, KeyError):
        pass
    paises = {k: v for k, v in json.load(open(os.path.join(ROOT, "config", "gazetteer.json"), encoding="utf-8"))["paises"].items() if v.get("lat") is not None}
    for anio in (ahora.year - 1, ahora.year - 2):
        try:
            origen = por_origen(leer(anio, "coo"), paises, anio)
            if len(origen) < 50:  # el año todavía no está publicado
                continue
            acogida = por_acogida(leer(anio, "coa"), paises, anio)
        except Exception as e:  # noqa: BLE001
            print(f"desplazamiento {anio}: error {e}")
            continue
        if len(acogida) < 50:
            continue
        os.makedirs(os.path.dirname(OUT_ORIGEN), exist_ok=True)
        escribir(OUT_ORIGEN, origen, ahora, anio)
        escribir(OUT_ACOGIDA, acogida, ahora, anio)
        print(f"desplazamiento {anio}: {len(origen)} países de origen, {len(acogida)} de acogida")
        return 0
    print("desplazamiento: sin datos nuevos; se conservan los anteriores")
    return 0


if __name__ == "__main__":
    sys.exit(main())
