#!/usr/bin/env python3
"""Avisos meteorológicos oficiales de Europa (MeteoAlarm, EUMETNET): 38 países, niveles amarillo, naranja y rojo.

MeteoAlarm reúne los avisos de los servicios meteorológicos nacionales (AEMET, DWD, Météo-France…) con una escala
común de colores. Se leen sus canales Atom por país (`feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-<país>`,
robots.txt sin restricciones). Cada aviso trae el código de su región (EMMA_ID) y la forma de la región sale de
config/meteoalarm_regiones.json (tools/meteoalarm_regiones.py). Licencia del canal: «términos equivalentes a
CC BY 4.0, con requisitos adicionales para redistribuir»: se cita a MeteoAlarm y al servicio nacional, se enlaza
la región en meteoalarm.org y no se altera el aviso (solo se traduce el tipo y el nivel). No se copia el texto.

Salida: vivos/meteoalarm.geojson con un polígono por región con aviso vigente o próximo (48 h) y un punto interior
con la lista de avisos. Los avisos verdes (sin peligro) se descartan.
"""
import json
import os
import re
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F  # noqa: E402

OUT = os.path.join(ROOT, "vivos", "meteoalarm.geojson")
FEED = "https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-{pais}"
PAISES = ("austria belgium bosnia-herzegovina bulgaria croatia cyprus czechia denmark estonia finland france germany greece hungary iceland "
          "ireland israel italy latvia lithuania luxembourg malta moldova montenegro netherlands republic-of-north-macedonia norway poland "
          "portugal romania serbia slovakia slovenia spain sweden switzerland ukraine united-kingdom").split()
NS = {"a": "http://www.w3.org/2005/Atom", "cap": "urn:oasis:names:tc:emergency:cap:1.2"}
NIVEL = {"yellow": 2, "orange": 3, "red": 4}
TIPO = {"wind": "Viento", "snow-ice": "Nieve y hielo", "snowice": "Nieve y hielo", "thunderstorm": "Tormentas", "thunderstorms": "Tormentas", "fog": "Niebla",
        "high-temperature": "Calor", "hightemperature": "Calor", "low-temperature": "Frío", "lowtemperature": "Frío", "coastalevent": "Fenómenos costeros",
        "coastal-event": "Fenómenos costeros", "forest-fire": "Incendios forestales", "forestfire": "Incendios forestales", "avalanches": "Aludes",
        "avalanche": "Aludes", "rain": "Lluvia", "flood": "Inundación", "flooding": "Inundación", "rain-flood": "Lluvia e inundación", "rainflood": "Lluvia e inundación"}
HORAS_ADELANTE = 48


def _t(e, ruta):
    x = e.find(ruta, NS)
    return (x.text or "").strip() if x is not None and x.text else ""


def fecha(s):
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)
    except (ValueError, AttributeError):
        return None


def leer_feed(xml_bytes, pais):
    """Atom de MeteoAlarm → lista de avisos {codigo, region, nivel, tipo, desde, hasta, url, enviado}."""
    raiz = ET.fromstring(xml_bytes)
    out = []
    for e in raiz.findall("a:entry", NS):
        titulo = _t(e, "a:title")
        m = re.match(r"(?i)(yellow|orange|red|green)\s+(.+?)\s+warning", titulo)
        if not m or m.group(1).lower() == "green":
            continue
        # Dentro de <cap:geocode>, <valueName> y <value> heredan el espacio de nombres por omisión (Atom).
        codigos = [((g.findtext("a:valueName", "", NS) or g.findtext("valueName") or "").strip(), (g.findtext("a:value", "", NS) or g.findtext("value") or "").strip())
                   for g in e.findall("cap:geocode", NS)]
        if _t(e, "cap:message_type").lower() == "cancel" or _t(e, "cap:status").lower() not in ("", "actual"):
            continue
        tipo_en = m.group(2).strip().lower().replace(" ", "-")
        enlace = next((l.get("href") for l in e.findall("a:link", NS) if "geocode=" in (l.get("href") or "")), None)
        out.append({"codigos": [v for n, v in codigos if v], "esquema": next((n for n, v in codigos if v), ""), "region": _t(e, "cap:areaDesc"),
                    "pais": pais, "nivel": NIVEL[m.group(1).lower()], "tipo": TIPO.get(tipo_en, m.group(2).strip().capitalize()),
                    "desde": _t(e, "cap:onset") or _t(e, "cap:effective"), "hasta": _t(e, "cap:expires"), "enviado": _t(e, "cap:sent"),
                    "severidad_cap": _t(e, "cap:severity"), "url": enlace or "https://meteoalarm.org"})
    return out


def _norm(t):
    return re.sub(r"[^a-z0-9]", "", (t or "").lower())


def vigentes(avisos, ahora):
    """Avisos que ya empezaron o empiezan en las próximas 48 h y aún no vencen."""
    out = []
    for a in avisos:
        d, h = fecha(a["desde"]), fecha(a["hasta"])
        if h and h < ahora:
            continue
        if d and d > ahora + timedelta(hours=HORAS_ADELANTE):
            continue
        out.append(a)
    return out


def features(avisos, regiones, ahora):
    """Une los avisos por región: polígono con el nivel máximo + punto interior con la lista de avisos."""
    por_nombre = {}
    for cod, r in regiones.items():
        por_nombre.setdefault((r["p"], _norm(r["n"])), cod)
    por_region, sin = {}, 0
    for a in avisos:
        cods = [c for c in a["codigos"] if c in regiones]
        if not cods:  # Francia y otros mandan NUTS3: se busca la región por nombre dentro del país
            c = por_nombre.get(((a["codigos"] or ["??"])[0][:2], _norm(a["region"])))
            cods = [c] if c else []
        if not cods:
            sin += 1
            continue
        for c in cods:
            por_region.setdefault(c, []).append(a)
    out = []
    for cod, lista in por_region.items():
        r = regiones[cod]
        lista.sort(key=lambda a: (-a["nivel"], a["desde"]))
        nivel = lista[0]["nivel"]
        en_curso = any((fecha(a["desde"]) or ahora) <= ahora for a in lista)
        props = {"id": f"emma:{cod}", "codigo": cod, "region": r["n"], "pais_iso2": r["p"], "nivel": nivel, "en_curso": en_curso,
                 "tipos": sorted({a["tipo"] for a in lista if a["nivel"] == nivel}), "url": f"https://meteoalarm.org?geocode=EMMA_ID:{cod}",
                 "fecha_utc": min((a["desde"] for a in lista), default=""),
                 "avisos": [{k: a[k] for k in ("tipo", "nivel", "desde", "hasta", "severidad_cap")} for a in lista[:8]]}
        out.append({"type": "Feature", "geometry": r["g"], "properties": {**props, "k": "zona", "opacidad": 0.42 if en_curso else 0.22}})
        out.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": r["c"]}, "properties": {**props, "k": "region"}})
    return out, sin


def main():
    ahora = datetime.now(timezone.utc)
    regiones = json.load(open(os.path.join(ROOT, "config", "meteoalarm_regiones.json"), encoding="utf-8"))["regiones"]
    avisos, estado = [], {}
    for pais in PAISES:
        url = FEED.format(pais=pais)
        try:
            if not F.permitido_por_robots(url):
                raise PermissionError("robots.txt no lo permite")
            lista = leer_feed(F.get(url, timeout=40), pais)
            avisos += lista
            estado[pais] = len(lista)
        except Exception as e:  # noqa: BLE001
            estado[pais] = f"error: {e}"[:80]
        time.sleep(0.3)
    if all(isinstance(v, str) for v in estado.values()):
        print(f"meteoalarm: ninguna fuente respondió; se conserva el archivo anterior {estado}")
        return 0
    feats, sin = features(vigentes(avisos, ahora), regiones, ahora)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"type": "FeatureCollection", "generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "fuentes": estado, "sin_region": sin,
               "atribucion": "MeteoAlarm (EUMETNET) y servicios meteorológicos nacionales", "features": feats},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"meteoalarm: {len(feats) // 2} regiones con aviso, {sin} avisos sin región; errores: {[p for p, v in estado.items() if isinstance(v, str)]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
