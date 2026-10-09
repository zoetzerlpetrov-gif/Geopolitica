#!/usr/bin/env python3
"""Genera config/admin1.json: estados, provincias y regiones del mundo con sus nombres en varios idiomas
(Natural Earth 1:10m admin-1, dominio público). Lo usan los recolectores de noticias para ubicar un
titular en la provincia que menciona («Trapani», «Sicilia») en vez de en el centro del país.

Formato: {"campos": [...], "lugares": [[nombres…], iso3, lat, lon, tipo]}. «tipo» es «provincia» o
«region» (las regiones agrupan provincias, p. ej. Sicilia = Palermo + Catania + …; su punto es el promedio).
Uso: python3 tools/admin1.py
"""
import json
import os
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson"
IDIOMAS = ("name", "name_en", "name_es", "name_it", "name_fr", "name_de", "name_pt")
# Nombres locales de regiones que Natural Earth solo trae en inglés (las más citadas en noticias).
ALIAS_REGION = {
    "Sicily": ["Sicilia", "Sicile", "Sizilien"], "Sardinia": ["Sardegna", "Cerdeña", "Sardaigne"], "Apulia": ["Puglia"],
    "Lombardy": ["Lombardia", "Lombardía"], "Tuscany": ["Toscana"], "Piedmont": ["Piemonte"], "Latium": ["Lazio", "Lacio"],
    "Andalusia": ["Andalucía"], "Catalonia": ["Cataluña", "Catalunya"], "Bavaria": ["Bayern", "Baviera"],
    "Brittany": ["Bretagne", "Bretaña"], "Normandy": ["Normandie", "Normandía"],
}


def nombres(p):
    out = []
    for k in IDIOMAS:
        v = (p.get(k) or "").strip()
        if v and v not in out:
            out.append(v)
    for v in (p.get("name_alt") or "").split("|"):
        v = v.strip()
        if len(v) > 3 and v not in out:
            out.append(v)
    return out


def construir(fc):
    lugares, regiones = [], {}
    for f in fc["features"]:
        p = f["properties"]
        iso, lat, lon = p.get("adm0_a3"), p.get("latitude"), p.get("longitude")
        if not iso or lat is None or lon is None:
            continue
        ns = nombres(p)
        if ns:
            lugares.append([ns, iso, round(lat, 3), round(lon, 3), "provincia"])
        reg = (p.get("region") or "").strip()
        if reg and reg not in ns:
            regiones.setdefault((reg, iso), []).append((lat, lon))
    for (reg, iso), pts in regiones.items():
        if len(pts) < 2:
            continue
        lat = sum(x for x, _ in pts) / len(pts)
        lon = sum(y for _, y in pts) / len(pts)
        lugares.append([[reg, *ALIAS_REGION.get(reg, [])], iso, round(lat, 3), round(lon, 3), "region"])
    # Natural Earth pone a veces el nombre de la región como nombre alterno de cada provincia («Sicilia» en
    # Trapani, Palermo…): se quita para que «Sicilia» apunte a la región y no a una provincia al azar.
    de_region = {(n.lower(), l[1]) for l in lugares if l[4] == "region" for n in l[0]}
    for l in lugares:
        if l[4] == "provincia":
            l[0] = [n for n in l[0] if (n.lower(), l[1]) not in de_region] or l[0][:1]
    return {"fuente": "Natural Earth 1:10m admin-1 (dominio público)", "campos": ["nombres", "iso3", "lat", "lon", "tipo"], "lugares": lugares}


if __name__ == "__main__":
    fc = json.load(urllib.request.urlopen(URL, timeout=300))
    datos = construir(fc)
    with open(os.path.join(ROOT, "config", "admin1.json"), "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(datos['lugares'])} lugares")
