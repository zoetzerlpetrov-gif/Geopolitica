#!/usr/bin/env python3
"""Protocolos, alertas y niveles oficiales activados en el mundo → vivos/protocolos.geojson.

Dos partes:
1. Registro curado (config/protocolos.json): iniciativas y llamados oficiales de preparación (p. ej. FORTRESS America,
   Estrategia de la Unión de Preparación de la UE). Cada uno con su fuente y un resumen propio.
2. Niveles oficiales que se actualizan solos (dominio público o licencia abierta; solo título, nivel, fecha y enlace):
   - Avisos de viaje del Departamento de Estado de EUA (RSS; niveles 3 y 4).
   - Avisos de viaje de Canadá (JSON de travel.gc.ca, Licencia de Gobierno Abierto de Canadá; «evitar viajes no
     esenciales» y «evitar todo viaje»).
   - Nivel nacional de amenaza terrorista del Reino Unido (RSS del MI5).
   - Boletines del National Terrorism Advisory System de EUA (DHS), solo si hay uno activo.
Un aviso de viaje por país junta los de EUA y Canadá. Cada fuente falla por separado: si una no responde, se conserva
lo que tenía en la corrida anterior. Se consulta cada 3 horas como máximo.
"""
import json
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "salud"))
import salud as S  # noqa: E402  (Paises: centro de cada país del gazetteer)

ROOT = S.ROOT
OUT = os.path.join(ROOT, "vivos", "protocolos.geojson")
UA = S.UA
EUA_RSS = "https://travel.state.gov/_res/rss/TAsTWs.xml"
CANADA = "https://data.international.gc.ca/travel-voyage/index-alpha-eng.json"
MI5 = "https://www.mi5.gov.uk/UKThreatLevel/UKThreatLevel.xml"
NTAS = "https://www.dhs.gov/ntas/1.1/feed.xml"
HORAS_MIN = 3

NIVEL_EUA = {3: "Nivel 3: reconsiderar el viaje", 4: "Nivel 4: no viajar"}
NIVEL_CANADA = {2: "Evitar viajes no esenciales", 3: "Evitar todo viaje"}
# Nivel de amenaza del Reino Unido → nivel común de la capa (1 bajo … 4 crítico).
NIVEL_MI5 = {"LOW": 1, "MODERATE": 2, "SUBSTANTIAL": 3, "SEVERE": 3, "CRITICAL": 4}
ES_MI5 = {"LOW": "bajo", "MODERATE": "moderado", "SUBSTANTIAL": "sustancial", "SEVERE": "severo", "CRITICAL": "crítico"}


def get(url, timeout=60):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=timeout) as r:
        return r.read()


def punto(lon, lat, props):
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 3), round(lat, 3)]}, "properties": props}


def registro(cfg, nom):
    """Entradas curadas → un punto en la sede del organismo, con la lista de países afectados."""
    out = []
    for r in cfg.get("registro", []):
        nombres = [nom.de(i)[0] for i in r.get("paises", []) if i in nom.datos]
        out.append(punto(r["lon"], r["lat"], {
            "id": f"reg:{r['id']}", "tipo": "registro", "titulo": r["nombre"], "organismo": r["organismo"], "nivel": r.get("nivel", 2),
            "ambitos": ", ".join(cfg["ambitos"].get(a, a) for a in r.get("ambitos", [])), "estado": r.get("estado", ""),
            "fecha": r.get("fecha", ""), "paises": ", ".join(nombres) if len(nombres) <= 6 else f"{len(nombres)} países", "iso3": (r.get("paises") or [""])[0],
            "resumen": r.get("resumen", ""), "url": r.get("url", ""), "fuente": r.get("fuente", "")}))
    return out


def avisos_eua(xml_bytes):
    """RSS del Departamento de Estado → {iso3: (nivel 3|4, título, enlace, fecha)}. El ISO3 viene en el enlace
    (…/destination.irn.html)."""
    out = {}
    for it in ET.fromstring(xml_bytes).iter("item"):
        titulo, enlace = (it.findtext("title") or "").strip(), (it.findtext("link") or "").strip()
        m, d = re.search(r"Level (\d)", titulo), re.search(r"destination\.([a-z]{3})\.html", enlace)
        if not m or not d or int(m.group(1)) < 3:
            continue
        out[d.group(1).upper()] = (int(m.group(1)), titulo, enlace, S.fecha_rss(it.findtext("pubDate") or "") or "")
    return out


def avisos_canada(datos, iso2a3):
    """JSON de travel.gc.ca → {iso3: (estado 2|3, texto, enlace, fecha)}."""
    out = {}
    for iso2, p in (datos.get("data") or {}).items():
        estado = int(p.get("advisory-state") or 0)
        iso3 = iso2a3.get(iso2.upper())
        if estado < 2 or not iso3:
            continue
        eng = p.get("eng") or {}
        out[iso3] = (estado, eng.get("advisory-text") or NIVEL_CANADA[estado], f"https://travel.gc.ca/destinations/{eng.get('url-slug', '')}",
                     (p.get("date-published") or {}).get("date", "").replace(" ", "T")[:16] + "Z" if (p.get("date-published") or {}).get("date") else "")
    return out


def viajes(eua, can, nom):
    """Un punto por país con los avisos de EUA y Canadá juntos; nivel = el más alto (EUA 4 o Canadá «evitar todo» = 4)."""
    out = []
    for iso3 in sorted(set(eua) | set(can)):
        if iso3 not in nom.datos:
            continue
        nombre, lat, lon, _, _ = nom.de(iso3)
        e, c = eua.get(iso3), can.get(iso3)
        nivel = max(e[0] if e else 0, (c[0] + 1) if c else 0)
        detalle = ([f"EUA: {NIVEL_EUA[e[0]]}"] if e else []) + ([f"Canadá: {NIVEL_CANADA[c[0]]}"] if c else [])
        out.append(punto(lon, lat, {
            "id": f"viaje:{iso3}", "tipo": "viaje", "titulo": f"Aviso de viaje: {nombre}", "organismo": " y ".join(x for x, y in (("Departamento de Estado de EUA", e), ("Gobierno de Canadá", c)) if y),
            "nivel": nivel, "ambitos": "Avisos de viaje, seguridad", "estado": "vigente", "fecha": max(x[3] for x in (e, c) if x), "paises": nombre, "iso3": iso3,
            "resumen": " · ".join(detalle) + ". Un aviso alto suele reflejar conflicto armado, terrorismo, crimen, secuestros o inestabilidad.",
            "url": (e or c)[2], "url2": c[2] if e and c else "", "fuente": "travel.state.gov (dominio público) · travel.gc.ca (Licencia de Gobierno Abierto de Canadá)"}))
    return out


def nivel_reino_unido(xml_bytes, nom):
    it = ET.fromstring(xml_bytes).find(".//item")
    if it is None:
        return []
    m = re.search(r"Threat Level:\s*([A-Z]+)", it.findtext("title") or "")
    if not m or "GBR" not in nom.datos:
        return []
    nombre, lat, lon, _, _ = nom.de("GBR")
    lvl = m.group(1)
    return [punto(lon, lat, {
        "id": "nivel:GBR", "tipo": "nivel_nacional", "titulo": f"Nivel de amenaza terrorista del Reino Unido: {ES_MI5.get(lvl, lvl.lower())}", "organismo": "MI5 (Servicio de Seguridad del Reino Unido)",
        "nivel": NIVEL_MI5.get(lvl, 2), "ambitos": "Seguridad y terrorismo", "estado": "vigente", "fecha": S.fecha_rss(it.findtext("pubDate") or "") or "", "paises": nombre, "iso3": "GBR",
        "resumen": f"Escala de 5 niveles: bajo, moderado, sustancial, severo y crítico. «{ES_MI5.get(lvl, lvl.lower()).capitalize()}» quiere decir que un ataque es "
                   + {"LOW": "muy poco probable.", "MODERATE": "posible, pero no probable.", "SUBSTANTIAL": "probable.", "SEVERE": "muy probable.", "CRITICAL": "muy probable en el corto plazo."}.get(lvl, "posible."),
        "url": "https://www.mi5.gov.uk/threats-and-advice/threat-levels", "fuente": "MI5 (© Crown Copyright; solo nivel y enlace)"})]


def boletines_ntas(xml_bytes, nom):
    """Feed del NTAS: vacío (<alerts/>) cuando no hay boletín activo, que es lo normal."""
    out = []
    raiz = ET.fromstring(xml_bytes)
    for a in raiz.iter("alert"):
        texto = " ".join(" ".join(x.itertext()) for x in a)[:300] or a.get("type", "")
        titulo = a.get("type") or (a.findtext("summary") or "Boletín NTAS")
        nombre, lat, lon, _, _ = nom.de("USA")
        out.append(punto(lon - 3, lat, {
            "id": f"ntas:{a.get('id') or titulo[:20]}", "tipo": "boletin", "titulo": f"NTAS: {titulo}", "organismo": "Departamento de Seguridad Nacional de EUA (DHS)",
            "nivel": 4 if "imminent" in titulo.lower() else 3, "ambitos": "Seguridad y terrorismo", "estado": "vigente", "fecha": a.get("start", "") or "",
            "paises": nombre, "iso3": "USA", "resumen": " ".join(texto.split()), "url": "https://www.dhs.gov/ntas", "fuente": "DHS (dominio público)"}))
    return out


def anteriores(tipo):
    try:
        return [f for f in json.load(open(OUT, encoding="utf-8")).get("features", []) if f["properties"].get("tipo") in tipo]
    except (OSError, ValueError, KeyError):
        return []


def construir(ahora=None, leer=get):
    ahora = ahora or datetime.now(timezone.utc)
    gaz = json.load(open(os.path.join(ROOT, "config", "gazetteer.json"), encoding="utf-8"))
    nom = S.Paises(gaz["paises"])
    cfg = json.load(open(os.path.join(ROOT, "config", "protocolos.json"), encoding="utf-8"))
    feats, estado = registro(cfg, nom), {"registro": f"ok ({len(cfg.get('registro', []))})"}
    eua = can = None
    try:
        eua = avisos_eua(leer(EUA_RSS)); estado["eua"] = f"ok ({len(eua)})"
    except Exception as e:  # noqa: BLE001
        estado["eua"] = f"error: {type(e).__name__}"
    try:
        can = avisos_canada(json.loads(leer(CANADA)), gaz.get("iso2_a_iso3", {})); estado["canada"] = f"ok ({len(can)})"
    except Exception as e:  # noqa: BLE001
        estado["canada"] = f"error: {type(e).__name__}"
    feats += viajes(eua or {}, can or {}, nom) if (eua is not None or can is not None) else anteriores({"viaje"})
    for nombre, url, fn, tipo in (("mi5", MI5, nivel_reino_unido, {"nivel_nacional"}), ("ntas", NTAS, boletines_ntas, {"boletin"})):
        try:
            nuevos = fn(leer(url), nom); feats += nuevos; estado[nombre] = f"ok ({len(nuevos)})"
        except Exception as e:  # noqa: BLE001
            feats += anteriores(tipo); estado[nombre] = f"error: {type(e).__name__}"
    return {"type": "FeatureCollection", "actualizado_utc": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "fuentes": estado, "features": feats}


def main():
    try:
        previo = json.load(open(OUT, encoding="utf-8"))
        t = datetime.strptime(previo["actualizado_utc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) - t < timedelta(hours=HORAS_MIN):
            print("protocolos: al día"); return 0
    except (OSError, ValueError, KeyError):
        pass
    fc = construir()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(fc, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"protocolos: {len(fc['features'])} puntos · {fc['fuentes']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
