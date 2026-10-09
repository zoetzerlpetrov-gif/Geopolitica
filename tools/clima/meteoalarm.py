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
# Canal JSON (más pesado): solo para los países cuyos avisos del Atom no traen un código de región conocido
# (zonas marinas, municipios, condados); el JSON trae el polígono del aviso.
FEED_JSON = "https://feeds.meteoalarm.org/api/v1/warnings/feeds-{pais}"
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
PAIS_ISO2 = {"austria": "AT", "belgium": "BE", "bosnia-herzegovina": "BA", "bulgaria": "BG", "croatia": "HR", "cyprus": "CY", "czechia": "CZ", "denmark": "DK",
             "estonia": "EE", "finland": "FI", "france": "FR", "germany": "DE", "greece": "GR", "hungary": "HU", "iceland": "IS", "ireland": "IE", "israel": "IL",
             "italy": "IT", "latvia": "LV", "lithuania": "LT", "luxembourg": "LU", "malta": "MT", "moldova": "MD", "montenegro": "ME", "netherlands": "NL",
             "republic-of-north-macedonia": "MK", "norway": "NO", "poland": "PL", "portugal": "PT", "romania": "RO", "serbia": "RS", "slovakia": "SK",
             "slovenia": "SI", "spain": "ES", "sweden": "SE", "switzerland": "CH", "ukraine": "UA", "united-kingdom": "GB"}


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


def poligonos_cap(textos):
    """Polígonos CAP («lat,lon lat,lon …») → anillos GeoJSON [[lon, lat], …]."""
    out = []
    for t in textos or []:
        pts = []
        for par in str(t).split():
            try:
                la, lo = (float(x) for x in par.split(","))
            except ValueError:
                continue
            pts.append([round(lo, 3), round(la, 3)])
        if len(pts) >= 4:
            out.append(pts)
    return out


def leer_json(d, pais):
    """Canal JSON de MeteoAlarm → avisos con el mismo formato que leer_feed, más «poligonos»."""
    out = []
    for w in (d or {}).get("warnings", []):
        al = w.get("alert", {})
        if (al.get("msgType") or al.get("msg_type") or "").lower() == "cancel" or (al.get("status") or "Actual").lower() != "actual":
            continue
        infos = al.get("info") or []
        info = next((i for i in infos if (i.get("language") or "").lower().startswith("en")), infos[0] if infos else None)
        if not info:
            continue
        par = {p.get("valueName"): p.get("value") or "" for p in info.get("parameter", [])}
        m = re.match(r"\s*\d+;\s*(\w+)", par.get("awareness_level", ""))
        nivel = NIVEL.get((m.group(1) if m else "").lower())
        if not nivel:
            continue
        tipo_en = (par.get("awareness_type", "").split(";")[-1].strip().lower().replace(" ", "-"))
        for area in info.get("area", []):
            pol = area.get("polygon")
            out.append({"codigos": [g.get("value") for g in area.get("geocode", []) if g.get("value")], "esquema": "", "region": area.get("areaDesc") or "",
                        "pais": pais, "nivel": nivel, "tipo": TIPO.get(tipo_en, tipo_en.capitalize() or "Otro"),
                        "desde": info.get("onset") or info.get("effective") or "", "hasta": info.get("expires") or "", "enviado": al.get("sent") or "",
                        "severidad_cap": info.get("severity") or "", "url": "https://meteoalarm.org",
                        "poligonos": poligonos_cap(pol if isinstance(pol, list) else [pol] if pol else [])})
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


def features(avisos, regiones, ahora, centroides=None):
    """Une los avisos por región: polígono con el nivel máximo + punto interior con la lista de avisos.
    Región = código EMMA_ID conocido; si no, nombre de la región en el mismo país; si no, el polígono del aviso
    (canal JSON); si no, un punto en el centro del país («centroides»: {ISO2: [lon, lat]})."""
    regiones = dict(regiones)
    por_nombre = {}
    for cod, r in regiones.items():
        por_nombre.setdefault((r["p"], _norm(r["n"])), cod)
    por_region, sin = {}, 0
    for a in avisos:
        cods = [c for c in a["codigos"] if c in regiones]
        if not cods:  # Francia y otros mandan NUTS3: se busca la región por nombre dentro del país
            c = por_nombre.get(((a["codigos"] or ["??"])[0][:2], _norm(a["region"])))
            cods = [c] if c else []
        if not cods and a.get("poligonos"):
            cod = f"POL:{a['pais']}:{_norm(a['region'])[:40]}"
            anillos = a["poligonos"]
            g = {"type": "Polygon", "coordinates": [anillos[0]]} if len(anillos) == 1 else {"type": "MultiPolygon", "coordinates": [[r] for r in anillos]}
            xs, ys = [p[0] for p in anillos[0]], [p[1] for p in anillos[0]]
            regiones.setdefault(cod, {"n": a["region"], "p": PAIS_ISO2.get(a["pais"], "?"), "c": [round(sum(xs) / len(xs), 3), round(sum(ys) / len(ys), 3)], "g": g})
            cods = [cod]
        if not cods and centroides and PAIS_ISO2.get(a["pais"]) in centroides:
            i2 = PAIS_ISO2[a["pais"]]
            cod = f"PAIS:{i2}"
            regiones.setdefault(cod, {"n": f"{a['region']} (ubicación aproximada: país)", "p": i2, "c": centroides[i2], "g": None})
            cods = [cod]
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
        props = {"id": f"emma:{cod}", "codigo": cod if not cod.startswith(("POL:", "PAIS:")) else "", "region": r["n"], "pais_iso2": r["p"], "nivel": nivel, "en_curso": en_curso,
                 "tipos": sorted({a["tipo"] for a in lista if a["nivel"] == nivel}),
                 "url": f"https://meteoalarm.org?geocode=EMMA_ID:{cod}" if ":" not in cod else f"https://meteoalarm.org?region={r['p']}",
                 "fecha_utc": min((a["desde"] for a in lista), default=""), "leido_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"),
                 "avisos": [{k: a[k] for k in ("tipo", "nivel", "desde", "hasta", "severidad_cap")} for a in lista[:8]]}
        if r["g"]:
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
    # Países con avisos sin región conocida: se vuelven a leer del canal JSON (trae polígonos).
    conocidos = set(regiones)
    nombres = {(r["p"], _norm(r["n"])) for r in regiones.values()}
    faltan = sorted({a["pais"] for a in avisos if not any(c in conocidos for c in a["codigos"])
                     and ((a["codigos"] or ["??"])[0][:2], _norm(a["region"])) not in nombres})
    for pais in faltan:
        try:
            nuevos = leer_json(json.loads(F.get(FEED_JSON.format(pais=pais), timeout=90)), pais)
            avisos = [a for a in avisos if a["pais"] != pais] + nuevos
            estado[pais] = f"{len(nuevos)} (JSON)"
        except Exception as e:  # noqa: BLE001
            estado[pais] = f"{estado.get(pais)}; JSON error: {e}"[:100]
        time.sleep(0.5)
    if all(isinstance(v, str) and "error" in v for v in estado.values()):
        print(f"meteoalarm: ninguna fuente respondió; se conserva el archivo anterior {estado}")
        return 0
    gaz = json.load(open(os.path.join(ROOT, "config", "gazetteer.json"), encoding="utf-8"))
    centroides = {i2.upper(): [gaz["paises"][i3]["lon"], gaz["paises"][i3]["lat"]] for i2, i3 in gaz["iso2_a_iso3"].items() if i3 in gaz["paises"]}
    feats, sin = features(vigentes(avisos, ahora), regiones, ahora, centroides)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({"type": "FeatureCollection", "generado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "fuentes": estado, "sin_region": sin,
               "atribucion": "MeteoAlarm (EUMETNET) y servicios meteorológicos nacionales", "features": feats},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"meteoalarm: {sum(1 for f in feats if f['properties']['k'] == 'region')} regiones con aviso, {sin} avisos sin región; {estado}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
