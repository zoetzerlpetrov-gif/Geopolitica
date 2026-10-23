#!/usr/bin/env python3
"""Aeronaves que transmiten un código de emergencia en el transpondedor (squawk), con su rastro reciente.

Códigos fijos de la OACI: 7700 emergencia general, 7600 falla de radio, 7500 interferencia ilícita (secuestro).
Un código puede ser un error del piloto o una prueba; la confirmación llega por la aerolínea, la autoridad o la prensa.

Fuentes (sin llave):
  1. adsb.lol y adsb.fi `/v2/sqk/7700`, `/7600`, `/7500` (misma API; adsb.lol con licencia ODbL): todas
     las aeronaves del mundo con ese código que ve cada red de receptores voluntarios.
  2. vivos/aeronaves.json (OpenSky + adsb.lol militares), que tools/vivos/actualizar.py acaba de escribir.
Privacidad: se excluyen las aeronaves cuyo dueño pidió privacidad (banderas PIA/LADD de adsb.lol). Se guarda lo que la
aeronave transmite (indicativo, matrícula, tipo, posición); nunca se vincula a personas.

Para escuchar la frecuencia: a cada emergencia se le agregan los 3 aeropuertos grandes o medianos más cercanos
(a menos de 400 km, código OACI) de OurAirports (dominio público; copia semanal en vivos/aeropuertos_icao.json). La ficha
enlaza su búsqueda en LiveATC, donde voluntarios retransmiten y archivan el audio de muchas torres y centros de control.

Cada emergencia se conserva 6 h desde la última vez que se vio, con hasta 40 posiciones, para que una corrida de
20 min no la pierda si el avión ya aterrizó o cambió el código. Salida: vivos/emergencias_aereas.geojson.
"""
import csv
import io
import json
import math
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F  # noqa: E402

OUT = os.path.join(ROOT, "vivos", "emergencias_aereas.geojson")
AERONAVES = os.path.join(ROOT, "vivos", "aeronaves.json")
CODIGOS = {"7700": "Emergencia general", "7600": "Falla de radio", "7500": "Interferencia ilícita (posible secuestro)"}
AEROPUERTOS = os.path.join(ROOT, "vivos", "aeropuertos_icao.json")
# Emergencias que reporta la prensa (tools/crimen/crimen.py las escribe cada hora con tools/transporte/emergencias_prensa.py):
# cubren aviones que ningún receptor de ADS-B vio con el código, como buena parte de los vuelos dentro de México.
PRENSA = os.path.join(ROOT, "vivos", "emergencias_prensa.geojson")
OURAIRPORTS = "https://davidmegginson.github.io/ourairports-data/airports.csv"
# Redes de receptores voluntarios con la misma API (formato readsb) y cobertura mundial: cada una ve aviones que la otra
# no (adsb.fi tiene muchos receptores en Europa). Uso no comercial con atribución; una consulta por segundo como máximo.
# airplanes.live responde 403 a consultas desde servidores (probado en oct 2026), por eso no está.
REDES = [("adsb.lol", "https://api.adsb.lol/v2/sqk/"), ("adsb.fi", "https://opendata.adsb.fi/api/v2/sqk/")]
CONSERVAR_S = 6 * 3600
MAX_RASTRO = 40


def iso(t):
    return datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def pedir(url, intentos=2):
    """GET con un reintento: adsb.lol a veces tarda más de 40 s en responder."""
    for i in range(intentos):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": F.UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read())
        except Exception:  # noqa: BLE001
            if i == intentos - 1:
                raise
            time.sleep(5)


def de_adsblol(a, codigo, t):
    """Aeronave de adsb.lol → registro, o None (sin posición o con privacidad pedida)."""
    if a.get("lat") is None or a.get("lon") is None or (a.get("dbFlags") or 0) & 12:
        return None
    en_tierra = a.get("alt_baro") == "ground"
    return {"hex": a["hex"], "indicativo": (a.get("flight") or "").strip(), "matricula": a.get("r") or "", "tipo_av": a.get("t") or "",
            "squawk": codigo, "lon": round(a["lon"], 3), "lat": round(a["lat"], 3),
            "alt_m": 0 if en_tierra else round((a.get("alt_geom") or a.get("alt_baro") or 0) * 0.3048),
            "vel_kmh": round((a.get("gs") or 0) * 1.852), "rumbo": round(a.get("track") or 0), "en_tierra": en_tierra,
            "emergencia": a.get("emergency") if a.get("emergency") not in (None, "none") else "", "fuente": "adsb.lol", "t": t}


def de_filas(datos, t):
    """Filas de vivos/aeronaves.json con un código de emergencia."""
    campos = datos.get("campos") or []
    out = []
    for fila in datos.get("a") or []:
        r = dict(zip(campos, fila))
        if str(r.get("squawk")) in CODIGOS and r.get("lat") is not None:
            out.append({"hex": r["hex"], "indicativo": r.get("indicativo") or "", "matricula": r.get("matricula") or "", "tipo_av": r.get("tipo_av") or "",
                        "squawk": str(r["squawk"]), "lon": r["lon"], "lat": r["lat"], "alt_m": r.get("alt_m") or 0, "vel_kmh": r.get("vel_kmh") or 0,
                        "rumbo": r.get("rumbo") or 0, "en_tierra": r.get("subtipo") == "en_tierra", "emergencia": "", "fuente": "OpenSky", "t": t})
    return out


def combinar(previas, nuevas, t):
    """Une lo visto ahora con lo guardado: por avión, primera y última vez, código más grave visto y rastro."""
    orden = {"7500": 3, "7700": 2, "7600": 1}
    por_hex = {p["hex"]: p for p in previas if t - p["ultima_t"] <= CONSERVAR_S}
    for n in nuevas:
        p = por_hex.get(n["hex"])
        punto = [n["lon"], n["lat"], n["alt_m"], n["t"]]
        if p is None:
            p = {**n, "primera_t": n["t"], "ultima_t": n["t"], "rastro": [punto], "codigos": [n["squawk"]]}
            por_hex[n["hex"]] = p
            continue
        if p["ultima_t"] == n["t"] and p["fuente"] == "adsb.lol" and n["fuente"] != "adsb.lol":
            continue  # adsb.lol trae más datos; OpenSky solo completa lo que no vio
        cods = p.get("codigos", [])
        if n["squawk"] not in cods:
            cods.append(n["squawk"])
        rastro = p.get("rastro", [])
        if not rastro or rastro[-1][:2] != punto[:2]:
            rastro.append(punto)
        p.update({k: v for k, v in n.items() if v not in ("", None)})
        p.update({"ultima_t": n["t"], "rastro": rastro[-MAX_RASTRO:], "codigos": cods,
                  "squawk": max(cods, key=lambda c: orden.get(c, 0))})
    return list(por_hex.values())


def leer_aeropuertos(texto):
    """CSV de OurAirports → [[OACI, nombre, lat, lon]] de aeropuertos grandes y medianos con código OACI de 4 letras."""
    out = []
    for r in csv.DictReader(io.StringIO(texto)):
        if r.get("type") not in ("large_airport", "medium_airport"):
            continue
        icao = (r.get("icao_code") or r.get("gps_code") or r.get("ident") or "").strip().upper()
        if len(icao) != 4 or not icao.isalpha():
            continue
        try:
            out.append([icao, r["name"][:60], round(float(r["latitude_deg"]), 3), round(float(r["longitude_deg"]), 3)])
        except (KeyError, ValueError):
            continue
    return out


def aeropuertos(t):
    """Lista de aeropuertos (se descarga una vez por semana; si falla, se usa la copia anterior)."""
    previo = None
    try:
        previo = json.load(open(AEROPUERTOS, encoding="utf-8"))
        if t - previo.get("t", 0) < 7 * 86400 and previo.get("a"):
            return previo["a"]
    except (OSError, ValueError):
        pass
    try:
        req = urllib.request.Request(OURAIRPORTS, headers={"User-Agent": F.UA})
        with urllib.request.urlopen(req, timeout=60) as r:
            lista = leer_aeropuertos(r.read().decode("utf-8"))
        if len(lista) > 1000:
            json.dump({"t": t, "fuente": "OurAirports (dominio público)", "a": lista}, open(AEROPUERTOS, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
            return lista
    except Exception as e:  # noqa: BLE001
        print(f"OurAirports no respondió: {e}")
    return (previo or {}).get("a", [])


def cercanos(lista, lon, lat, n=3, max_km=400):
    """Los n aeropuertos más cercanos a [lon, lat] (a menos de max_km): [[OACI, nombre, km]]."""
    def km(a):
        p = math.pi / 180
        h = math.sin((a[2] - lat) * p / 2) ** 2 + math.cos(lat * p) * math.cos(a[2] * p) * math.sin((a[3] - lon) * p / 2) ** 2
        return 12742 * math.asin(math.sqrt(min(1, h)))
    cerca = sorted(((km(a), a) for a in lista if abs(a[2] - lat) < 5), key=lambda x: x[0])
    return [[a[0], a[1], round(d)] for d, a in cerca[:n] if d <= max_km]


def a_geojson(registros, t, lista_ap=()):
    feats = []
    for r in registros:
        activo = t - r["ultima_t"] < 30 * 60
        base = {k: r[k] for k in ("hex", "indicativo", "matricula", "tipo_av", "squawk", "alt_m", "vel_kmh", "rumbo", "en_tierra", "emergencia", "fuente")}
        base.update({"id": r["hex"], "codigo_texto": CODIGOS.get(r["squawk"], ""), "codigos": r.get("codigos", []), "primera_vez": iso(r["primera_t"]),
                     "ultima_vez": iso(r["ultima_t"]), "activo": activo, "kind": "avion",
                     "url": f"https://globe.adsb.lol/?icao={r['hex']}", "aeropuertos": cercanos(lista_ap, r["lon"], r["lat"]) if lista_ap else []})
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [r["lon"], r["lat"]]}, "properties": base})
        if len(r.get("rastro", [])) > 1:
            feats.append({"type": "Feature", "geometry": {"type": "LineString", "coordinates": [p[:2] for p in r["rastro"]]},
                          "properties": {"id": f"{r['hex']}-rastro", "hex": r["hex"], "indicativo": r["indicativo"], "squawk": r["squawk"], "kind": "rastro"}})
    return feats


def notas_prensa(ruta):
    """Features de emergencias aéreas en la prensa → mismas features con kind «prensa» (un punto por nota)."""
    try:
        feats = json.load(open(ruta, encoding="utf-8")).get("features", [])
    except (OSError, ValueError):
        return []
    out = []
    for i, f in enumerate(feats):
        p = f.get("properties") or {}
        if not p.get("url") or not f.get("geometry"):
            continue
        out.append({"type": "Feature", "geometry": f["geometry"],
                    "properties": {**p, "id": f"prensa-{i}", "kind": "prensa", "squawk": "", "activo": False}})
    return out


def main():
    t = int(time.time())
    previo = {}
    try:
        previo = json.load(open(OUT, encoding="utf-8"))
    except (OSError, ValueError):
        pass
    nuevas, estado = [], {}
    for red, base in REDES:
        for codigo in CODIGOS:
            try:
                d = pedir(f"{base}{codigo}")
                vistos = [dict(x, fuente=red) for x in (de_adsblol(a, codigo, t) for a in d.get("ac") or d.get("aircraft") or []) if x]
                nuevas += vistos
                estado[f"{red} {codigo}"] = len(vistos)
            except Exception as e:  # noqa: BLE001
                estado[f"{red} {codigo}"] = f"error: {e}"[:120]
            time.sleep(1.5)  # límite de las APIs públicas: una consulta por segundo
    try:
        de_os = de_filas(json.load(open(AERONAVES, encoding="utf-8")), t)
        nuevas += de_os
        estado["aeronaves.json"] = len(de_os)
    except (OSError, ValueError) as e:
        estado["aeronaves.json"] = f"error: {e}"[:120]
    prensa = notas_prensa(PRENSA)
    estado["prensa (48 h)"] = len(prensa)
    registros = combinar(previo.get("registros", []), nuevas, t)
    lista_ap = aeropuertos(t) if registros else []
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"type": "FeatureCollection", "generado_utc": iso(t), "fuentes": estado, "registros": registros, "features": a_geojson(registros, t, lista_ap) + prensa},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"emergencias aéreas: {len(registros)} aeronaves (6 h) · {estado}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
