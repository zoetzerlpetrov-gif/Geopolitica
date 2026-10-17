#!/usr/bin/env python3
"""Idiomas que se hablan en cada país (Unicode CLDR, «territoryInfo»).

Fuente: Unicode CLDR (Common Locale Data Repository), datos suplementarios de territorios, vía el repositorio público
`unicode-org/cldr-json` (licencia Unicode, uso libre con aviso). Para cada país CLDR da los idiomas con el porcentaje de la
población que los habla (estimación de CLDR a partir de censos y estudios; una persona puede hablar varios, así que la
suma puede pasar de 100 %) y su estatus: oficial, oficial de hecho u oficial en una región.

Nombres de los idiomas: los de CLDR en español; si CLDR no tiene uno (lenguas indígenas poco documentadas), el nombre de
referencia en inglés de la norma ISO 639-3 (tabla de SIL, vía el paquete `iso-639-3` de wooorm, licencia MIT).

Salida: data/base/idiomas.geojson, un polígono por país (fronteras de data/base/countries.geojson) con el idioma
principal (el de mayor porcentaje) y la lista completa. Se regenera a mano o cuando CLDR publique versión nueva:
    python3 tools/idiomas/idiomas.py
"""
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SALIDA = os.path.join(ROOT, "data", "base", "idiomas.geojson")
UA = "Geopolitica-monitor/1.0 (+https://github.com/zoetzerlpetrov-gif/Geopolitica)"
CLDR = "https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/"
URL_TERRITORIOS = CLDR + "cldr-core/supplemental/territoryInfo.json"
URL_NOMBRES_ES = CLDR + "cldr-localenames-full/main/es/languages.json"
URL_VERSION = CLDR + "cldr-core/package.json"
URL_ISO6393 = "https://raw.githubusercontent.com/wooorm/iso-639-3/main/iso6393.js"
MINIMO_PCT = 0.1   # idiomas hablados por menos del 0.1 % no se listan (salvo que sean oficiales)
MAX_IDIOMAS = 12
# Nombres en español de lenguas de México que CLDR no traduce (ISO 639-3 solo las nombra en inglés).
NOMBRES_MX = {"nhe": "náhuatl de la Huasteca oriental", "nhw": "náhuatl de la Huasteca occidental", "nch": "náhuatl de la Huasteca central",
              "nhi": "náhuatl de la Sierra Norte de Puebla", "maz": "mazahua", "yua": "maya yucateco", "sei": "seri", "tzh": "tseltal",
              "tzo": "tsotsil", "zap": "zapoteco", "mix": "mixteco", "oto": "otomí", "ote": "otomí del Valle del Mezquital", "tar": "tarahumara",
              "mto": "mixe de Totontepec", "chd": "chontal de Oaxaca", "pua": "purépecha"}
ESTATUS = {"official": "oficial", "de_facto_official": "oficial de hecho", "official_regional": "oficial en una región", "official_minority": "oficial de minoría"}


def get(url, timeout=90):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8")


def nombres_iso6393(texto):
    """Archivo iso6393.js (objetos con name e iso6393) → {código de 3 letras: nombre en inglés}."""
    out = {}
    for bloque in re.findall(r"\{[^{}]*\}", texto):
        n = re.search(r"name:\s*(?:'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\")", bloque)
        c = re.search(r"iso6393:\s*'([a-z]{3})'", bloque)
        if n and c:
            out[c.group(1)] = (n.group(1) or n.group(2) or "").replace("\\'", "'")
    return out


def nombre_idioma(codigo, es, iso):
    """Código CLDR (p. ej. «es», «zh_Hant», «nhe») → nombre en español, o el de ISO 639-3, o el código."""
    base = codigo.split("_")[0]
    if base in NOMBRES_MX:
        return NOMBRES_MX[base]
    if codigo in es:
        return es[codigo]
    if codigo == "zh_Hant":
        return "chino tradicional"
    if base in es:
        sufijo = {"Arab": " (escritura árabe)", "Latn": " (escritura latina)", "Cyrl": " (escritura cirílica)"}.get(codigo.split("_")[-1], "") if "_" in codigo else ""
        return es[base] + sufijo
    return iso.get(base, codigo)


def idiomas_de(territorio, es, iso):
    """Entrada de CLDR de un territorio → lista de idiomas ordenada por porcentaje (mayor primero)."""
    out = []
    for cod, d in (territorio.get("languagePopulation") or {}).items():
        if cod == "und":
            continue
        pct = float(d.get("_populationPercent", 0) or 0)
        estatus = ESTATUS.get(d.get("_officialStatus", ""), "")
        if pct < MINIMO_PCT and not estatus:
            continue
        out.append({"codigo": cod, "nombre": nombre_idioma(cod, es, iso), "pct": round(pct, 2), "estatus": estatus})
    out.sort(key=lambda x: (-x["pct"], x["nombre"]))
    return out[:MAX_IDIOMAS]


def construir(paises_geo, territorios, iso2_a_iso3, es, iso):
    iso3_a_iso2 = {v: k for k, v in iso2_a_iso3.items()}
    feats, sin = [], []
    for f in paises_geo["features"]:
        p = f["properties"]
        iso2 = iso3_a_iso2.get(p.get("iso3"))
        t = territorios.get(iso2) if iso2 else None
        lista = idiomas_de(t, es, iso) if t else []
        if not lista:
            sin.append(p.get("nombre") or p.get("iso3"))
            continue
        principal = lista[0]
        oficiales = [x["nombre"] for x in lista if x["estatus"].startswith("oficial") and "región" not in x["estatus"]]
        feats.append({"type": "Feature", "geometry": f["geometry"], "properties": {
            "iso3": p["iso3"], "pais": p.get("nombre") or p["iso3"], "principal": principal["codigo"].split("_")[0],
            "principal_nombre": principal["nombre"], "principal_pct": principal["pct"], "oficiales": oficiales,
            "poblacion": int(float(t.get("_population", 0) or 0)), "idiomas": lista}})
    return feats, sin


def main():
    territorios = json.loads(get(URL_TERRITORIOS))["supplemental"]["territoryInfo"]
    es = json.loads(get(URL_NOMBRES_ES))["main"]["es"]["localeDisplayNames"]["languages"]
    try:
        version = json.loads(get(URL_VERSION)).get("version", "")
    except Exception:  # noqa: BLE001
        version = ""
    iso = nombres_iso6393(get(URL_ISO6393, timeout=120))
    paises = json.load(open(os.path.join(ROOT, "data", "base", "countries.geojson"), encoding="utf-8"))
    iso2_a_iso3 = json.load(open(os.path.join(ROOT, "config", "gazetteer.json"), encoding="utf-8"))["iso2_a_iso3"]
    feats, sin = construir(paises, territorios, iso2_a_iso3, es, iso)
    with open(SALIDA, "w", encoding="utf-8") as fh:
        json.dump({"type": "FeatureCollection", "fuente": f"Unicode CLDR {version} (territoryInfo); nombres ISO 639-3 (SIL) cuando CLDR no tiene",
                   "features": feats}, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"idiomas: {len(feats)} países; sin datos: {len(sin)} ({', '.join(sin[:10])})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
