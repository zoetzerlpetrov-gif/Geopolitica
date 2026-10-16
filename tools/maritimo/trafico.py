#!/usr/bin/env python3
"""Tráfico marítimo: cuántos barcos hay en los puertos principales y en los estrechos estratégicos, y cómo cambia.

Usa la instantánea AIS que ya genera tools/vivos/actualizar.py (vivos/buques.json, AISStream) y la cuenta, a lo más
una vez por hora, dentro de un radio alrededor de cada puerto y de cada chokepoint de config/chokepoints.json.
- En puertos se separan los barcos detenidos (menos de 1 nudo: fondeados esperando o atracados) de los que se mueven:
  muchos detenidos = congestión o espera.
- En estrechos se cuentan los barcos y cuántos son tanqueros y de carga.
Se guarda una serie de 30 días por lugar (un punto por hora) en vivos/trafico_maritimo.geojson.
Ojo: AISStream recibe sobre todo de antenas en tierra; donde hay pocas antenas se ven menos barcos de los que hay.
Sirve para comparar un lugar consigo mismo a lo largo del tiempo, no para comparar lugares entre sí.
"""
import json
import math
import os
import sys
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ENTRADA = os.path.join(ROOT, "vivos", "buques.json")
SALIDA = os.path.join(ROOT, "vivos", "trafico_maritimo.geojson")
CHOKE = os.path.join(ROOT, "config", "chokepoints.json")
DIAS = 30
RADIO_CHOKE_KM = 60
# (id, nombre, lat, lon, radio km)
PUERTOS = [("shanghai", "Shanghái (China)", 31.25, 121.85, 40), ("ningbo", "Ningbo-Zhoushan (China)", 29.93, 121.88, 30),
           ("singapur", "Singapur", 1.26, 103.82, 30), ("shenzhen_hk", "Shenzhen y Hong Kong", 22.40, 114.10, 30),
           ("busan", "Busan (Corea del Sur)", 35.08, 129.06, 20), ("tokio", "Bahía de Tokio (Japón)", 35.50, 139.80, 30),
           ("jebel_ali", "Jebel Ali (EAU)", 25.01, 55.06, 20), ("mumbai", "Mumbai / JNPT (India)", 18.95, 72.95, 20),
           ("port_said", "Port Said (Egipto)", 31.26, 32.30, 20), ("pireo", "El Pireo (Grecia)", 37.94, 23.62, 15),
           ("rotterdam", "Róterdam (Países Bajos)", 51.95, 4.05, 25), ("amberes", "Amberes (Bélgica)", 51.28, 4.33, 20),
           ("hamburgo", "Hamburgo (Alemania)", 53.54, 9.93, 20), ("felixstowe", "Felixstowe (Reino Unido)", 51.95, 1.32, 15),
           ("valencia", "Valencia (España)", 39.44, -0.32, 15), ("algeciras", "Algeciras (España)", 36.13, -5.43, 15),
           ("tanger_med", "Tánger Med (Marruecos)", 35.88, -5.50, 15), ("durban", "Durban (Sudáfrica)", -29.87, 31.04, 15),
           ("santos", "Santos (Brasil)", -23.98, -46.30, 20), ("callao", "El Callao (Perú)", -12.05, -77.15, 15),
           ("cartagena_co", "Cartagena (Colombia)", 10.39, -75.53, 15), ("colon", "Colón (Panamá)", 9.36, -79.90, 15),
           ("balboa", "Balboa (Panamá)", 8.95, -79.57, 15), ("los_angeles", "Los Ángeles / Long Beach (EUA)", 33.73, -118.24, 25),
           ("vancouver", "Vancouver (Canadá)", 49.29, -123.10, 20), ("houston", "Houston (EUA)", 29.70, -94.95, 30),
           ("nueva_york", "Nueva York / Nueva Jersey (EUA)", 40.66, -74.08, 20), ("manzanillo", "Manzanillo (México)", 19.06, -104.30, 15),
           ("lazaro_cardenas", "Lázaro Cárdenas (México)", 17.93, -102.18, 15), ("veracruz", "Veracruz (México)", 19.20, -96.13, 15),
           ("altamira", "Altamira (México)", 22.48, -97.86, 15), ("ensenada", "Ensenada (México)", 31.85, -116.62, 12)]


def km(lat1, lon1, lat2, lon2):
    r = math.radians
    a = math.sin(r(lat2 - lat1) / 2) ** 2 + math.cos(r(lat1)) * math.cos(r(lat2)) * math.sin(r(lon2 - lon1) / 2) ** 2
    return 12742 * math.asin(math.sqrt(a))


def lugares():
    out = [{"id": i, "nombre": n, "lat": la, "lon": lo, "radio_km": rk, "tipo": "puerto"} for i, n, la, lo, rk in PUERTOS]
    try:
        for c in json.load(open(CHOKE, encoding="utf-8"))["chokepoints"]:
            out.append({"id": f"ch_{c['id']}", "nombre": c["nombre"], "lat": c["lat"], "lon": c["lon"], "radio_km": RADIO_CHOKE_KM, "tipo": "estrecho"})
    except (OSError, KeyError, ValueError):
        pass
    return out


def contar(barcos, campos, lugar):
    """→ {total, detenidos, carga, tanquero} dentro del radio del lugar."""
    i = {c: k for k, c in enumerate(campos)}
    n = {"total": 0, "detenidos": 0, "carga": 0, "tanquero": 0}
    # Prefiltro rápido por caja (1° ≈ 111 km) antes de la distancia exacta.
    dlat = lugar["radio_km"] / 111 + 0.05
    dlon = dlat / max(0.2, math.cos(math.radians(lugar["lat"])))
    for b in barcos:
        lat, lon = b[i["lat"]], b[i["lon"]]
        if abs(lat - lugar["lat"]) > dlat or abs(((lon - lugar["lon"] + 180) % 360) - 180) > dlon:
            continue
        if km(lat, lon, lugar["lat"], lugar["lon"]) > lugar["radio_km"]:
            continue
        n["total"] += 1
        if (b[i["vel_nudos"]] or 0) < 1:
            n["detenidos"] += 1
        sub = b[i["subtipo"]] or ""
        if sub == "carga":
            n["carga"] += 1
        elif sub in ("tanqueros", "tanquero", "petrolero", "tanker"):
            n["tanquero"] += 1
    return n


def actualizar(snapshot, previo, ahora):
    campos, barcos = snapshot.get("campos", []), snapshot.get("b", [])
    t = snapshot.get("generado_utc") or ahora.strftime("%Y-%m-%dT%H:%M:%SZ")
    ant = {f["properties"]["id"]: f["properties"] for f in (previo or {}).get("features", [])}
    limite = (ahora - timedelta(days=DIAS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    feats = []
    for lg in lugares():
        n = contar(barcos, campos, lg)
        serie = [x for x in ant.get(lg["id"], {}).get("serie", []) if x[0] >= limite]
        if not serie or serie[-1][0][:13] != t[:13]:  # un punto por hora
            serie.append([t, n["total"], n["detenidos"], n["carga"], n["tanquero"]])
        totales = [x[1] for x in serie]
        prom = sum(totales) / len(totales) if totales else 0
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [lg["lon"], lg["lat"]]}, "properties": {
            **lg, **n, "promedio_30d": round(prom, 1), "vs_promedio": round(n["total"] / prom, 2) if prom else None, "serie": serie, "actualizado_utc": t}})
    return {"type": "FeatureCollection", "generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "fuente": "AISStream (instantánea del monitor)",
            "nota": "Conteo de barcos dentro de un radio; depende de la cobertura de antenas AIS", "features": feats}


def main():
    ahora = datetime.now(timezone.utc)
    try:
        snapshot = json.load(open(ENTRADA, encoding="utf-8"))
    except (OSError, ValueError) as e:
        print(f"tráfico marítimo: sin instantánea AIS ({e})")
        return 0
    if not snapshot.get("b"):
        print("tráfico marítimo: la instantánea AIS está vacía; se conserva el anterior")
        return 0
    previo = None
    try:
        previo = json.load(open(SALIDA, encoding="utf-8"))
    except (OSError, ValueError):
        pass
    fc = actualizar(snapshot, previo, ahora)
    json.dump(fc, open(SALIDA, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    top = sorted(fc["features"], key=lambda f: -f["properties"]["total"])[:6]
    print("tráfico marítimo:", ", ".join(f"{f['properties']['nombre']} {f['properties']['total']}" for f in top))
    return 0


if __name__ == "__main__":
    sys.exit(main())
