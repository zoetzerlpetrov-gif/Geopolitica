#!/usr/bin/env python3
"""Elecciones nacionales en curso o próximas (Wikidata) con la regla para ganar de cada país.

Fuente: Wikidata (consulta SPARQL pública, datos CC0). Se piden las elecciones con fecha (P585) entre hace 21 días
y dentro de 30 días, con país (P17), sin las que solo aplican a una región o ciudad (P1001 distinto del país).
De cada una: nombre, fecha, país, tipo, candidatos (P726), ganador si ya está cargado (P991) y artículo de Wikipedia.

Cuándo se muestra (lo decide la página con los campos que publica este script):
- «próxima»: faltan 14 días o menos;
- «votación y conteo»: ya pasó la fecha y Wikidata aún no tiene ganador;
- «resultado»: Wikidata ya tiene ganador. Se muestra 24 horas desde que este script lo vio por primera vez
  (vivos/elecciones_estado.json lo recuerda) y después se quita sola.
- Tope: 21 días después de la fecha, aunque Wikidata no tenga ganador.

Wikidata lo editan voluntarios: el ganador puede tardar o cargarse antes de lo oficial. Por eso cada elección enlaza
al artículo y la página lo advierte. No hay conteo por región: ninguna fuente abierta lo da para todos los países.

Salida: vivos/elecciones.json.
"""
import json
import os
import re
import sys
import urllib.parse
from datetime import datetime, timedelta, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import fuentes as F  # noqa: E402

OUT = os.path.join(ROOT, "vivos", "elecciones.json")
ESTADO = os.path.join(ROOT, "vivos", "elecciones_estado.json")
REGLAS = os.path.join(ROOT, "config", "elecciones_reglas.json")
GAZ = os.path.join(ROOT, "config", "gazetteer.json")
SPARQL = "https://query.wikidata.org/sparql"
UA = "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica)"
DIAS_ATRAS, DIAS_ADELANTE, DIAS_PROXIMA, HORAS_RESULTADO = 21, 30, 14, 24
CADA_H = 3

CONSULTA = """
SELECT ?e ?nombreEs ?nombreEn ?fecha ?iso ?tipoEn ?ganadorEs ?ganadorEn ?artEs ?artEn WHERE {
  hint:Query hint:optimizer "None" .
  ?e wdt:P585 ?fecha . hint:Prior hint:rangeSafe true .
  FILTER(?fecha >= "%(desde)s"^^xsd:dateTime && ?fecha <= "%(hasta)s"^^xsd:dateTime)
  ?e wdt:P31 ?tipo ; wdt:P17 ?pais .
  ?tipo wdt:P279* wd:Q40231 .
  ?pais wdt:P298 ?iso .
  FILTER NOT EXISTS { ?e wdt:P1001 ?j . FILTER(?j != ?pais) }
  FILTER NOT EXISTS { ?e wdt:P131 ?lugar . }
  OPTIONAL { ?e rdfs:label ?nombreEs FILTER(lang(?nombreEs) = "es") }
  OPTIONAL { ?e rdfs:label ?nombreEn FILTER(lang(?nombreEn) = "en") }
  OPTIONAL { ?tipo rdfs:label ?tipoEn FILTER(lang(?tipoEn) = "en") }
  OPTIONAL { ?e wdt:P991 ?g . OPTIONAL { ?g rdfs:label ?ganadorEs FILTER(lang(?ganadorEs) = "es") }
             OPTIONAL { ?g rdfs:label ?ganadorEn FILTER(lang(?ganadorEn) = "en") } }
  OPTIONAL { ?artEs schema:about ?e ; schema:isPartOf <https://es.wikipedia.org/> }
  OPTIONAL { ?artEn schema:about ?e ; schema:isPartOf <https://en.wikipedia.org/> }
} LIMIT 400
"""
CONSULTA_CAND = """
SELECT ?e ?cEs ?cEn WHERE {
  VALUES ?e { %(ids)s }
  ?e wdt:P726 ?c .
  OPTIONAL { ?c rdfs:label ?cEs FILTER(lang(?cEs) = "es") }
  OPTIONAL { ?c rdfs:label ?cEn FILTER(lang(?cEn) = "en") }
} LIMIT 600
"""

TIPOS = [("referendum", r"referend|plebisc|consulta popular"), ("presidencial", r"president"),
         ("legislativa", r"parliament|legislat|general election|house of|senate|chamber|congress|national assembly|duma|diet|bundestag|lok sabha")]


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def leer_json(ruta, defecto=None):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def tipo_de(*textos):
    t = " ".join(x or "" for x in textos).lower()
    return next((k for k, rx in TIPOS if re.search(rx, t)), "otra")


# Elecciones que no son nacionales (aunque Wikidata les ponga el país): estados, municipios, cargos locales.
LOCAL = re.compile(r"\b(local|municipal|regional|county|council|city|mayor|mayoral|by-election|gubernatorial|state (?:house|senate|legislative)|"
                   r"district|provincial|province|board|secretary of state|attorney general|comptroller|lieutenant|primar(?:y|ies)|"
                   r"cantonal|prefectural|assembly of [A-Z]|mäslihat|municipales|regionales|autonómicas|estatales)\b", re.I)


def es_nacional(nombre_en, nombre_es, pais_en, fecha):
    """True si parece una elección de todo el país: sin palabras locales, sin «en <lugar>» y con el año de su fecha."""
    n = f"{nombre_en or ''} | {nombre_es or ''}"
    if not (nombre_en or nombre_es) or LOCAL.search(n):
        return False
    if re.search(r"\b(in|en) (?!el |la |los |las )[A-Z]", nombre_en or "") or re.search(r" de 20\d\d en [A-Z]", nombre_es or ""):
        return False
    anios = set(re.findall(r"\b(19\d\d|20\d\d)\b", n))
    if anios and fecha[:4] not in anios:  # p. ej. «second round … 2022» con fecha de 2026: dato mal cargado
        return False
    # EUA: muchas elecciones estatales no dicen «state»; se exige el nombre del país.
    if pais_en == "United States" and "United States" not in (nombre_en or "") and "Estados Unidos" not in (nombre_es or ""):
        return False
    return True


def regla(reglas, iso3, tipo):
    p = (reglas.get("paises") or {}).get(iso3) or {}
    return p.get(tipo) or (reglas.get("general") or {}).get(tipo) or (reglas.get("general") or {}).get("otra", "")


def sparql(q, leer=None):
    url = SPARQL + "?" + urllib.parse.urlencode({"query": q, "format": "json"})
    datos = leer(url) if leer else F.get(url, timeout=90)
    return json.loads(datos)["results"]["bindings"]


def v(b, k):
    return (b.get(k) or {}).get("value")


def construir(ahora=None, leer=None):
    ahora = ahora or datetime.now(timezone.utc)
    desde = (ahora - timedelta(days=DIAS_ATRAS)).strftime("%Y-%m-%dT00:00:00Z")
    hasta = (ahora + timedelta(days=DIAS_ADELANTE)).strftime("%Y-%m-%dT23:59:59Z")
    filas = sparql(CONSULTA % {"desde": desde, "hasta": hasta}, leer)
    reglas = leer_json(REGLAS, {}) or {}
    gaz = (leer_json(GAZ, {}) or {}).get("paises", {})
    previo = (leer_json(ESTADO, {}) or {}).get("ganador_visto", {})
    elecciones = {}
    for b in filas:
        qid = v(b, "e").rsplit("/", 1)[-1]
        iso3 = v(b, "iso")
        if iso3 not in gaz or not es_nacional(v(b, "nombreEn"), v(b, "nombreEs"), gaz[iso3].get("en"), v(b, "fecha")[:10]):
            continue
        e = elecciones.setdefault(qid, {"id": qid, "nombre": v(b, "nombreEs") or v(b, "nombreEn") or qid, "fecha": v(b, "fecha")[:10],
                                        "iso3": iso3, "pais": gaz[iso3]["es"], "lat": gaz[iso3]["lat"], "lon": gaz[iso3]["lon"],
                                        "tipos": set(), "ganador": None, "candidatos": [],
                                        "url": v(b, "artEs") or v(b, "artEn") or f"https://www.wikidata.org/wiki/{qid}",
                                        "wikidata": f"https://www.wikidata.org/wiki/{qid}"})
        e["tipos"].add(tipo_de(v(b, "nombreEn"), v(b, "tipoEn")))
        g = v(b, "ganadorEs") or v(b, "ganadorEn")
        if g:
            e["ganador"] = g
    ids = list(elecciones)
    for i in range(0, len(ids), 80):
        try:
            for b in sparql(CONSULTA_CAND % {"ids": " ".join(f"wd:{x}" for x in ids[i:i + 80])}, leer):
                c = v(b, "cEs") or v(b, "cEn")
                e = elecciones.get(v(b, "e").rsplit("/", 1)[-1])
                if e and c and c not in e["candidatos"] and not re.match(r"^Q\d+$", c):
                    e["candidatos"].append(c)
        except Exception:  # noqa: BLE001  sin candidatos se publica lo demás
            break
    hoy = ahora.strftime("%Y-%m-%d")
    visto, salida = {}, []
    for e in elecciones.values():
        tipos = e.pop("tipos") - {"otra"} or {"otra"}
        if tipos == {"otra"} and not re.search(r"general|national|federal|nacional", e["nombre"], re.I):
            continue  # p. ej. «2026 United States elections» (resumen de varias) o una sin tipo claro
        e["tipo"] = sorted(tipos, key=["presidencial", "legislativa", "referendum", "otra"].index)[0]
        e["regla"] = regla(reglas, e["iso3"], e["tipo"])
        if e["ganador"]:
            visto[e["id"]] = previo.get(e["id"]) or iso(ahora)
            e["ganador_visto_utc"] = visto[e["id"]]
            e["estado"] = "resultado"
            e["mostrar_hasta_utc"] = iso(datetime.strptime(visto[e["id"]], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) + timedelta(hours=HORAS_RESULTADO))
        elif e["fecha"] > hoy:
            e["estado"] = "proxima"
            e["mostrar_hasta_utc"] = None
        else:
            e["estado"] = "conteo"
            e["mostrar_hasta_utc"] = None
        e["mostrar_desde"] = (datetime.strptime(e["fecha"], "%Y-%m-%d") - timedelta(days=DIAS_PROXIMA)).strftime("%Y-%m-%d")
        e["tope"] = (datetime.strptime(e["fecha"], "%Y-%m-%d") + timedelta(days=DIAS_ATRAS)).strftime("%Y-%m-%d")
        e["candidatos"] = e["candidatos"][:12]
        salida.append(e)
    salida.sort(key=lambda e: ({"conteo": 0, "resultado": 1, "proxima": 2}[e["estado"]], e["fecha"]))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(ESTADO, "w", encoding="utf-8") as f:
        json.dump({"generado_utc": iso(ahora), "ganador_visto": visto}, f, ensure_ascii=False)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"generado_utc": iso(ahora), "fuente": "Wikidata (CC0)", "elecciones": salida}, f, ensure_ascii=False, separators=(",", ":"))
    return f"{len(salida)} elecciones ({sum(e['estado'] == 'conteo' for e in salida)} en conteo, {sum(e['estado'] == 'resultado' for e in salida)} con resultado)"


def main():
    ahora = datetime.now(timezone.utc)
    gen = (leer_json(OUT, {}) or {}).get("generado_utc", "")
    try:
        if ahora - datetime.strptime(gen, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc) < timedelta(hours=CADA_H) and "--forzar" not in sys.argv:
            print("elecciones: datos recientes")
            return 0
    except ValueError:
        pass
    try:
        print("elecciones:", construir(ahora))
    except Exception as e:  # noqa: BLE001  se conserva el archivo anterior
        print(f"elecciones: error {e}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
