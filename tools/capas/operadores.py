"""País de la compañía que opera un campo, plataforma, refinería o mina.

Dos fuentes, en este orden:
  1. Wikidata: el operador (P137) o dueño (P127) del sitio y el país de esa compañía (P17).
  2. config/operadores.json: tabla propia de compañías conocidas → país de su sede, para cuando OpenStreetMap solo trae
     el nombre (etiqueta operator) o Wikidata no registra el país de la compañía.

Propiedades que se agregan a cada objeto del mapa:
  op   nombre de la compañía (o compañías, separadas por « / »)
  o    países de las compañías en ISO alfa-2, separados por coma (la página pone la bandera)
  nac  "n" nacional (todas las compañías son del país del sitio), "e" extranjera, "m" mixta; vacío si no se sabe
  est  "1" si alguna compañía es estatal según la tabla

Sede = domicilio de la matriz. No dice quién es dueño de las acciones ni de quién es el recurso: en la mayoría de los
países el subsuelo es de la nación y la compañía opera con una concesión o contrato.
"""
import json
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
_TABLA = None


def tabla():
    global _TABLA
    if _TABLA is None:
        with open(os.path.join(ROOT, "config", "operadores.json"), encoding="utf-8") as f:
            _TABLA = [(re.compile(o["rx"], re.I), o) for o in json.load(f)["operadores"]]
    return _TABLA


def buscar(nombre):
    """Nombre del operador (texto libre) → entradas de la tabla que coinciden, sin repetir país y compañía."""
    out, vistos = [], set()
    for parte in re.split(r"\s*[;/]\s*|\s+(?:y|and|&)\s+", nombre or ""):
        for rx, o in tabla():
            if rx.search(parte) and o["n"] not in vistos:
                vistos.add(o["n"])
                out.append(o)
                break
    return out


def propiedades(pais_sitio, nombres=(), paises=()):
    """pais_sitio: ISO alfa-3 del sitio. nombres: operadores tal como los da la fuente. paises: [(a2, a3)] que ya trae
    Wikidata para esos operadores. Devuelve {op, o, nac, est} sin claves vacías."""
    nombres = [n for n in dict.fromkeys(x.strip() for x in nombres if x and x.strip())]
    pares = [(a2.upper(), a3.upper()) for a2, a3 in paises if a2 and a3]
    estatal = False
    for n in nombres:
        for o in buscar(n):
            estatal = estatal or bool(o.get("estatal"))
            if o["a2"] and not any(a3 == o["a3"] for _, a3 in pares) and not paises:
                pares.append((o["a2"], o["a3"]))
    pares = list(dict.fromkeys(pares))
    props = {}
    if nombres:
        props["op"] = " / ".join(nombres)[:160]
    if pares:
        props["o"] = ",".join(a2 for a2, _ in pares[:4])
        if pais_sitio:
            propios = [a3 == pais_sitio for _, a3 in pares]
            props["nac"] = "n" if all(propios) else "e" if not any(propios) else "m"
    if estatal:
        props["est"] = "1"
    return props
