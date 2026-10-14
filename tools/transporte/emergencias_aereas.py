#!/usr/bin/env python3
"""Aeronaves que transmiten un código de emergencia en el transpondedor (squawk), con su rastro reciente.

Códigos fijos de la OACI: 7700 emergencia general, 7600 falla de radio, 7500 interferencia ilícita (secuestro).
Un código puede ser un error del piloto o una prueba; la confirmación llega por la aerolínea, la autoridad o la prensa.

Fuentes (sin llave):
  1. adsb.lol `/v2/sqk/7700`, `/7600`, `/7500` (licencia ODbL; robots.txt lo permite): todas las aeronaves del mundo
     con ese código que ve su red de receptores voluntarios.
  2. vivos/aeronaves.json (OpenSky + adsb.lol militares), que tools/vivos/actualizar.py acaba de escribir.
Privacidad: se excluyen las aeronaves cuyo dueño pidió privacidad (banderas PIA/LADD de adsb.lol). Se guarda lo que la
aeronave transmite (indicativo, matrícula, tipo, posición); nunca se vincula a personas.

Cada emergencia se conserva 6 h desde la última vez que se vio, con hasta 40 posiciones, para que una corrida de
20 min no la pierda si el avión ya aterrizó o cambió el código. Salida: vivos/emergencias_aereas.geojson.
"""
import json
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


def a_geojson(registros, t):
    feats = []
    for r in registros:
        activo = t - r["ultima_t"] < 30 * 60
        base = {k: r[k] for k in ("hex", "indicativo", "matricula", "tipo_av", "squawk", "alt_m", "vel_kmh", "rumbo", "en_tierra", "emergencia", "fuente")}
        base.update({"id": r["hex"], "codigo_texto": CODIGOS.get(r["squawk"], ""), "codigos": r.get("codigos", []), "primera_vez": iso(r["primera_t"]),
                     "ultima_vez": iso(r["ultima_t"]), "activo": activo, "kind": "avion",
                     "url": f"https://globe.adsb.lol/?icao={r['hex']}"})
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [r["lon"], r["lat"]]}, "properties": base})
        if len(r.get("rastro", [])) > 1:
            feats.append({"type": "Feature", "geometry": {"type": "LineString", "coordinates": [p[:2] for p in r["rastro"]]},
                          "properties": {"id": f"{r['hex']}-rastro", "hex": r["hex"], "indicativo": r["indicativo"], "squawk": r["squawk"], "kind": "rastro"}})
    return feats


def main():
    t = int(time.time())
    previo = {}
    try:
        previo = json.load(open(OUT, encoding="utf-8"))
    except (OSError, ValueError):
        pass
    nuevas, estado = [], {}
    for codigo in CODIGOS:
        url = f"https://api.adsb.lol/v2/sqk/{codigo}"
        try:
            d = pedir(url)
            vistos = [x for x in (de_adsblol(a, codigo, t) for a in d.get("ac") or []) if x]
            nuevas += vistos
            estado[f"adsb.lol {codigo}"] = len(vistos)
        except Exception as e:  # noqa: BLE001
            estado[f"adsb.lol {codigo}"] = f"error: {e}"[:120]
    try:
        de_os = de_filas(json.load(open(AERONAVES, encoding="utf-8")), t)
        nuevas += de_os
        estado["aeronaves.json"] = len(de_os)
    except (OSError, ValueError) as e:
        estado["aeronaves.json"] = f"error: {e}"[:120]
    registros = combinar(previo.get("registros", []), nuevas, t)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"type": "FeatureCollection", "generado_utc": iso(t), "fuentes": estado, "registros": registros, "features": a_geojson(registros, t)},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"emergencias aéreas: {len(registros)} aeronaves (6 h) · {estado}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
