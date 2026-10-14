#!/usr/bin/env python3
"""Cronología histórica por país (Wikidata, CC0), precalculada una vez al mes en «Construir capas».

Consultar Wikidata en vivo por país agota su tiempo (EUA, México, Francia: 504 a los 60 s), así que aquí se hace una
consulta POR TIPO de hecho (batallas, guerras, tratados, terremotos…) para todo el mundo y luego se reparte por país:
capas/historia/<ISO3>.json = {"generado_utc", "hechos": [[qid, nombre, fecha ISO, precisión, tipo, artículo es], …]}.
Solo hechos con artículo en 12 o más Wikipedias (relevancia internacional). País: P17 (país) o P3842 (territorio
actual); un hecho de varios países aparece en cada uno. Si un tipo falla, se conserva lo de la corrida anterior.

Uso: python3 tools/historia/cronologia.py [carpeta_salida]   (por omisión, capas/historia)
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone

UA = "Geopolitica-monitor/1.0 (https://github.com/zoetzerlpetrov-gif/Geopolitica; cronologia mensual)"
MINIMO_WIKIS = 12
# Igual que js/historia.js (CLASES_HISTORIA): QID → nombre en español.
CLASES = {
    "Q198": "guerra", "Q8465": "guerra civil", "Q178561": "batalla", "Q188055": "asedio", "Q10931": "revolución", "Q124734": "rebelión",
    "Q45382": "golpe de Estado", "Q131569": "tratado", "Q625298": "tratado de paz", "Q467011": "invasión", "Q645883": "operación militar",
    "Q350604": "conflicto armado", "Q3199915": "masacre", "Q41397": "genocidio", "Q2223653": "atentado terrorista", "Q273120": "protesta",
    "Q7944": "terremoto", "Q7692360": "erupción volcánica", "Q8092": "ciclón tropical", "Q12184": "pandemia", "Q44512": "epidemia",
    "Q168247": "hambruna", "Q43109": "referéndum", "Q3024240": "Estado histórico", "Q48349": "imperio", "Q465299": "cultura arqueológica",
    "Q11514315": "periodo histórico", "Q13418847": "hecho histórico", "Q3839081": "desastre", "Q8016240": "crisis", "Q2001676": "ofensiva",
}


def consulta(clase, minimo=MINIMO_WIKIS):
    # «optimizer None»: Wikidata ejecuta las líneas en este orden (primero el tipo, unos miles de objetos); sin la pista
    # empezaba por «país» y agotaba los 60 s. Sin GROUP BY ni servicio de etiquetas, que eran lo más costoso.
    return f"""SELECT ?e ?iso ?f ?l ?wp ?n WHERE {{
  hint:Query hint:optimizer "None" .
  ?e wdt:P31 wd:{clase} .
  ?e wikibase:sitelinks ?n . FILTER(?n >= {int(minimo)})
  ?e wdt:P17|wdt:P3842 ?pais . ?pais wdt:P298 ?iso .
  OPTIONAL {{ ?e wdt:P585 ?f1 }} OPTIONAL {{ ?e wdt:P580 ?f2 }} OPTIONAL {{ ?e wdt:P571 ?f3 }}
  BIND(COALESCE(?f1, ?f2, ?f3) AS ?f) FILTER(BOUND(?f))
  OPTIONAL {{ ?e rdfs:label ?l . FILTER(lang(?l) = "es") }}
  OPTIONAL {{ ?art schema:about ?e ; schema:isPartOf <https://es.wikipedia.org/> ; schema:name ?wp }}
}}"""


# Listas por país para la ficha (las más relevantes se eligen en el navegador por número de Wikipedias).
CLASES_CONFLICTO = {"Q198": "guerra", "Q8465": "guerra civil", "Q180684": "conflicto", "Q350604": "conflicto armado",
                    "Q21994376": "guerra de independencia", "Q10931": "revolución", "Q124734": "rebelión", "Q467011": "invasión"}
CLASES_TRATADO = {"Q131569": "tratado", "Q625298": "tratado de paz", "Q6934728": "tratado multilateral"}
_NOMBRES = """OPTIONAL {{ ?e rdfs:label ?l . FILTER(lang(?l) = "es") }} OPTIONAL {{ ?e rdfs:label ?le . FILTER(lang(?le) = "en") }}
  OPTIONAL {{ ?art schema:about ?e ; schema:isPartOf <https://es.wikipedia.org/> ; schema:name ?wp }}"""


def _valores(clases):
    return " ".join(f"wd:{c}" for c in clases)


def consulta_conflictos_participante():
    """Conflictos con el país como participante (P710 en el conflicto o P1344 «participó en» en el país)."""
    return f"""SELECT ?e ?c ?iso ?f ?n ?l ?le ?wp WHERE {{
  hint:Query hint:optimizer "None" .
  VALUES ?c {{ {_valores(CLASES_CONFLICTO)} }}
  ?e wdt:P31 ?c . ?e wikibase:sitelinks ?n . FILTER(?n >= 8)
  {{ ?e wdt:P710 ?pais . }} UNION {{ ?pais wdt:P1344 ?e . }}
  ?pais wdt:P298 ?iso .
  OPTIONAL {{ ?e wdt:P580 ?f1 }} OPTIONAL {{ ?e wdt:P585 ?f2 }} BIND(COALESCE(?f1, ?f2) AS ?f)
  {_NOMBRES.format()}
}}"""


def consulta_tratados():
    """Tratados con el país como firmante (P1891)."""
    return f"""SELECT ?e ?c ?iso ?f ?n ?l ?le ?wp WHERE {{
  hint:Query hint:optimizer "None" .
  VALUES ?c {{ {_valores(CLASES_TRATADO)} }}
  ?e wdt:P31 ?c . ?e wikibase:sitelinks ?n . FILTER(?n >= 3)
  ?e wdt:P1891 ?pais . ?pais wdt:P298 ?iso .
  OPTIONAL {{ ?e wdt:P571 ?f1 }} OPTIONAL {{ ?e wdt:P585 ?f2 }} OPTIONAL {{ ?e wdt:P580 ?f3 }} BIND(COALESCE(?f1, ?f2, ?f3) AS ?f)
  {_NOMBRES.format()}
}}"""


def consulta_organismos():
    """Organismos y alianzas de los que el país es miembro (P463), con año de ingreso si lo hay."""
    return f"""SELECT ?e ?iso ?f ?n ?l ?le ?wp WHERE {{
  ?pais wdt:P298 ?iso ; p:P463 ?st . ?st ps:P463 ?e . OPTIONAL {{ ?st pq:P580 ?f }}
  FILTER NOT EXISTS {{ ?st pq:P582 ?fin }}
  ?e wikibase:sitelinks ?n . FILTER(?n >= 10)
  {_NOMBRES.format()}
}}"""


def filas_lista(resp, clases=None, organismos=False):
    """Respuesta → {iso3: [filas]}. Conflictos y tratados: [qid, nombre, fecha, tipo, artículo, n]; organismos:
    [qid, nombre, desde, artículo, n]. Nombre: título en es.wikipedia, etiqueta en español o, si no, en inglés."""
    out = defaultdict(dict)
    for b in resp.get("results", {}).get("bindings", []):
        qid = b["e"]["value"].rsplit("/", 1)[-1]
        iso = b.get("iso", {}).get("value", "")
        wp = b.get("wp", {}).get("value", "")
        nombre = wp or b.get("l", {}).get("value", "") or b.get("le", {}).get("value", "")
        if len(iso) != 3 or not nombre:
            continue
        f = b.get("f", {}).get("value", "")
        f = f if "T" in f else ""
        n = int(b.get("n", {}).get("value") or 0)
        previo = out[iso].get(qid)
        if previo and (not f or (previo[2] and previo[2] <= f)):
            continue
        if organismos:
            out[iso][qid] = [qid, nombre, f, wp, n]
        else:
            out[iso][qid] = [qid, nombre, f, clases.get(b.get("c", {}).get("value", "").rsplit("/", 1)[-1], ""), wp, n]
    return {iso: sorted(d.values(), key=lambda x: -x[-1]) for iso, d in out.items()}


def pedir(q, intentos=3):
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": q, "format": "json"})
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/sparql-results+json"})
    for i in range(intentos):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            print(f"   reintento {i + 1}: {e}")
            time.sleep(15 * (i + 1))
    raise RuntimeError("Wikidata no respondió")


def precision(fecha):
    """Sin la precisión de Wikidata: «1° de enero» suele significar «solo el año»."""
    return 9 if fecha[-15:-10] == "01-01" or fecha.endswith("-01-01T00:00:00Z") else 11


def filas(resp, tipo):
    """Respuesta SPARQL → {iso3: [[qid, nombre, fecha, precisión, tipo, artículo]]}. El nombre es el título del artículo en
    Wikipedia en español (más vigilado que la etiqueta de Wikidata, que a veces aparece vandalizada); si no hay
    artículo, la etiqueta en español; sin ninguno de los dos no se incluye. «artículo» = título en es.wikipedia o ""."""
    out = defaultdict(dict)
    for b in resp.get("results", {}).get("bindings", []):
        qid = b["e"]["value"].rsplit("/", 1)[-1]
        wp = b.get("wp", {}).get("value", "")
        nombre = wp or b.get("l", {}).get("value", "")
        iso = b.get("iso", {}).get("value", "")
        f = b.get("f", {}).get("value", "")
        if not nombre or len(iso) != 3 or not f or "T" not in f:
            continue
        previo = out[iso].get(qid)
        if not previo or f < previo[2]:  # varias fechas: la más antigua (inicio)
            out[iso][qid] = [qid, nombre, f, precision(f), tipo, wp, int(b.get("n", {}).get("value") or 0)]
    return {iso: list(d.values()) for iso, d in out.items()}


def anio(iso):
    s = iso.lstrip("+")
    neg = s.startswith("-")
    try:
        return -int(s[1:].split("-")[0]) if neg else int(s.split("-")[0])
    except ValueError:
        return 0


def combinar(por_tipo):
    """{tipo: {iso: filas}} → {iso: filas sin repetir (un hecho con dos tipos queda una vez), ordenadas por fecha}."""
    out = defaultdict(dict)
    for por_iso in por_tipo.values():
        for iso, fs in por_iso.items():
            for f in fs:
                out[iso].setdefault(f[0], f)
    # Fechas geológicas (p. ej. «Orogenia varisca», hace 380 millones de años) no son historia humana.
    return {iso: sorted((f for f in d.values() if anio(f[2]) >= -100000), key=lambda f: (anio(f[2]), f[2])) for iso, d in out.items()}


def main(salida="capas/historia"):
    os.makedirs(salida, exist_ok=True)
    previas, previas_completas = {}, {}
    for nombre in os.listdir(salida):
        if nombre.endswith(".json") and len(nombre) == 8:
            try:
                previas_completas[nombre[:3]] = json.load(open(os.path.join(salida, nombre), encoding="utf-8"))
                previas[nombre[:3]] = previas_completas[nombre[:3]]["hechos"]
            except (OSError, ValueError, KeyError):
                pass
    por_tipo, fallidos = {}, []
    for clase, tipo in CLASES.items():
        t0 = time.time()
        try:
            por_tipo[clase] = filas(pedir(consulta(clase)), tipo)
            print(f"{tipo}: {sum(len(v) for v in por_tipo[clase].values())} filas, {time.time() - t0:.1f} s")
        except Exception as e:  # noqa: BLE001
            fallidos.append(tipo)
            print(f"{tipo}: ERROR {e}")
            # Se conserva lo de la corrida anterior para ese tipo.
            por_tipo[clase] = {iso: [f for f in fs if f[4] == tipo] for iso, fs in previas.items()}
        time.sleep(2)  # cortesía con el servicio público de consultas
    datos = combinar(por_tipo)
    # Listas de la ficha: si una consulta falla, se conserva la lista de la corrida anterior.
    listas = {}
    for clave, q, args in (("conflictos", consulta_conflictos_participante(), {"clases": CLASES_CONFLICTO}),
                           ("tratados", consulta_tratados(), {"clases": CLASES_TRATADO}),
                           ("organismos", consulta_organismos(), {"organismos": True})):
        t0 = time.time()
        try:
            listas[clave] = filas_lista(pedir(q), **args)
            print(f"{clave}: {sum(len(v) for v in listas[clave].values())} filas, {time.time() - t0:.1f} s")
        except Exception as e:  # noqa: BLE001
            fallidos.append(clave)
            print(f"{clave}: ERROR {e}")
            listas[clave] = {iso: d[clave] for iso, d in previas_completas.items() if d.get(clave)}
        time.sleep(2)
    ahora = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    for iso in set(datos) | {i for v in listas.values() for i in v}:
        json.dump({"generado_utc": ahora, "fuente": "Wikidata (CC0)", "minimo_wikis": MINIMO_WIKIS, "hechos": datos.get(iso, []),
                   **{k: v.get(iso, []) for k, v in listas.items()}},
                  open(os.path.join(salida, f"{iso}.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"cronología: {len(datos)} países, listas de {len(set().union(*listas.values()))} países, {sum(len(v) for v in datos.values())} hechos; tipos con error: {fallidos or 'ninguno'}")
    return 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:]))
