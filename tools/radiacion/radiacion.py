#!/usr/bin/env python3
"""Radiación ambiental: sensores ciudadanos en vivo (Safecast) y sitios históricos (config/radiacion_sitios.json).

1. Sensores — Safecast (datos CC0). Se lee la lista pública de dispositivos con su última lectura
   (tt.safecast.org/devices, ~1.4 MB) una vez por hora. Solo cuentan lecturas de las últimas 48 h.
   El contador Geiger da cuentas por minuto (CPM); se pasa a microsieverts por hora (µSv/h) con el factor
   del tubo: LND 7317/7318 («pancake») 334 CPM = 1 µSv/h; LND 712/7128 108 CPM = 1 µSv/h.
   Privacidad: muchos sensores están en casas. No se publica el nombre, correo ni número de serie del
   equipo (la fuente los trae) y la posición se redondea a 0.01° (~1 km).
2. Sitios — accidentes, zonas de pruebas y bombardeos atómicos con su año y una descripción propia.

Referencia de lectura (aproximada): la radiación de fondo natural suele ir de 0.05 a 0.3 µSv/h según la altitud
y el suelo. Una lectura alta aislada puede ser falla o el sensor en movimiento: por eso se marca como «revisar».

Salida: vivos/radiacion.geojson.
"""
import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "vivos", "radiacion.geojson")
SITIOS = os.path.join(ROOT, "config", "radiacion_sitios.json")
SAFECAST = "https://tt.safecast.org/devices"
UA = "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
HORAS = 48
CADA_H = 1
# Campo de la lectura → CPM por µSv/h del tubo Geiger.
TUBOS = {"lnd_7318u": 334.0, "lnd_7318c": 334.0, "lnd_7317": 334.0, "lnd_712u": 108.0, "lnd_7128ec": 108.0}
NIVELES = [(0.3, "normal", "Dentro del fondo natural habitual"), (1.0, "elevado", "Por encima del fondo habitual"),
           (10.0, "alto", "Alto respecto al fondo: esperable junto a zonas contaminadas; en otro lugar puede ser falla del sensor"),
           (float("inf"), "muy_alto", "Muy alto: confirma con la autoridad local antes de sacar conclusiones")]


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def leer_json(ruta, defecto=None):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def nivel(usv):
    return next((k, t) for lim, k, t in NIVELES if usv < lim)


def usv_de(d):
    """(µSv/h, tubo) de la lectura de un dispositivo; None si no trae contador Geiger."""
    for campo, factor in TUBOS.items():
        v = d.get(campo)
        if isinstance(v, (int, float)) and v >= 0:
            return round(v / factor, 3), campo
    return None


def sensores(dispositivos, ahora, horas=HORAS):
    limite = iso(ahora - timedelta(hours=horas))
    out, vistos = [], set()
    for d in dispositivos:
        cuando = d.get("when_captured") or ""
        lat, lon = d.get("loc_lat"), d.get("loc_lon")
        lect = usv_de(d)
        if cuando < limite or lect is None or not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
            continue
        if abs(lat) < 0.001 and abs(lon) < 0.001:  # sin GPS
            continue
        clave = (round(lat, 2), round(lon, 2))
        if clave in vistos:
            continue
        vistos.add(clave)
        usv, tubo = lect
        k, texto = nivel(usv)
        out.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [clave[1], clave[0]]},
                    "properties": {"k": "sensor", "usv_h": usv, "nivel": k, "nivel_texto": texto, "cuando_utc": cuando,
                                   "lugar": d.get("loc_name") or "", "pais_iso2": d.get("loc_country") or "", "tubo": tubo.upper().replace("_", " ")}})
    return out


def sitios(cfg):
    return [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [s["lon"], s["lat"]]},
             "properties": {"k": "sitio", **{c: s.get(c) for c in ("id", "nombre", "pais", "tipo", "anio", "ines", "texto", "url")}}}
            for s in cfg.get("sitios", [])]


def bajar(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=90) as r:
        return json.loads(r.read())


def construir(ahora=None, leer=bajar):
    ahora = ahora or datetime.now(timezone.utc)
    estado = "ok"
    try:
        sens = sensores(leer(SAFECAST), ahora)
    except Exception as e:  # noqa: BLE001  sin Safecast se publican al menos los sitios, y se conservan los sensores previos
        estado = f"error: {type(e).__name__}"
        previo = leer_json(OUT, {}) or {}
        sens = [f for f in previo.get("features", []) if f["properties"].get("k") == "sensor"]
    feats = sitios(leer_json(SITIOS, {}) or {}) + sens
    datos = {"type": "FeatureCollection", "generado_utc": iso(ahora), "ventana_h": HORAS, "sensores": len(sens),
             "fuentes": {"safecast": estado}, "features": feats}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, separators=(",", ":"))
    return f"{len(sens)} sensores, {len(feats) - len(sens)} sitios; safecast: {estado}"


def main():
    ahora = datetime.now(timezone.utc)
    gen = (leer_json(OUT, {}) or {}).get("generado_utc", "")
    try:
        if ahora - datetime.strptime(gen, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) < timedelta(hours=CADA_H):
            print("radiación: datos recientes")
            return 0
    except ValueError:
        pass
    print("radiación:", construir(ahora))
    return 0


if __name__ == "__main__":
    sys.exit(main())
