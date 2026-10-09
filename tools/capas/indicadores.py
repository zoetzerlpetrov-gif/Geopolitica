"""Indicadores por país del Banco Mundial (API v2, licencia CC BY 4.0) pintados como coropleta.

Cada indicador se divide en rangos fijos (no cuantiles), para que el color signifique lo mismo de un
año a otro: «más de 300 hab/km²» siempre es el mismo tono. Se toma el valor más reciente disponible de
cada país (parámetro mrnev=1), así que el año puede variar entre países; la ficha lo dice.
"""
import json

API = "https://api.worldbank.org/v2/country/all/indicator/{ind}?format=json&mrnev=1&per_page=400"

# (id, subtipo, límite superior del rango, etiqueta, color). El último rango no tiene límite.
DENSIDAD = [
    ("densidad_1", 10, "Menos de 10 hab/km²", "#f7f4c8"),
    ("densidad_2", 50, "10 a 50 hab/km²", "#f5d98b"),
    ("densidad_3", 100, "50 a 100 hab/km²", "#efa95a"),
    ("densidad_4", 300, "100 a 300 hab/km²", "#e0713a"),
    ("densidad_5", 1000, "300 a 1,000 hab/km²", "#c03a2b"),
    ("densidad_6", None, "Más de 1,000 hab/km²", "#7a1022"),
]


def leer_api(paginas):
    """Respuestas JSON de la API (lista de páginas) → {iso3: (valor, año)}. Ignora agregados sin ISO3 de país."""
    out = {}
    for pag in paginas:
        if not isinstance(pag, list) or len(pag) < 2 or not pag[1]:
            continue
        for r in pag[1]:
            iso, v = r.get("countryiso3code"), r.get("value")
            if iso and len(iso) == 3 and v is not None:
                out[iso] = (float(v), r.get("date") or "")
    return out


def rango(valor, rangos):
    for st, tope, etiqueta, color in rangos:
        if tope is None or valor < tope:
            return st, etiqueta, color
    return rangos[-1][0], rangos[-1][2], rangos[-1][3]


def features_indicador(paises_fc, valores, rangos, prefijo, formato, nota=""):
    """Polígonos de países con subtipo por rango. «formato» convierte el valor en texto para la ficha."""
    out = []
    for f in paises_fc["features"]:
        iso = f["properties"].get("iso3")
        if iso not in valores:
            continue
        v, anio = valores[iso]
        st, etiqueta, color = rango(v, rangos)
        out.append({"type": "Feature", "geometry": f["geometry"], "properties": {
            "id": f"{prefijo}:{iso}", "n": f["properties"].get("nombre") or iso, "st": st, "p": iso,
            "x": f"{formato(v)} ({anio})" + (f" · {nota}" if nota else ""), "color": color, "rango": etiqueta, "z": 0}})
    return out


def num(v, dec=0):
    return f"{v:,.{dec}f}"


def json_paginas(texto):
    return json.loads(texto)
