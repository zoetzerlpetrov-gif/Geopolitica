"""Pagos por país: moneda digital de banco central (CBDC), criptomonedas y efectivo.

No hay una fuente abierta que reúna las tres cosas en un archivo descargable, así que la tabla es propia
(config/pagos.json), con la fuente y una nota por país. Cada dimensión es una capa del mapa (coropleta).
"""
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DIMENSIONES = {"pagos_cbdc": "cbdc", "pagos_cripto": "cripto", "pagos_efectivo": "efectivo"}
ETIQUETA = {"cbdc": "Moneda digital del banco central", "cripto": "Criptomonedas", "efectivo": "Efectivo"}


def cargar():
    with open(os.path.join(ROOT, "config", "pagos.json"), encoding="utf-8") as f:
        return json.load(f)


def resumen(fila, estados):
    """Las tres dimensiones de un país en una línea (la ficha muestra todo, sin importar la capa elegida)."""
    partes = []
    for dim in ("cbdc", "cripto", "efectivo"):
        if dim in fila:
            partes.append(f"{ETIQUETA[dim]}: {estados[dim][fila[dim]['e']][0]}. {fila[dim]['nota']}")
    return " · ".join(partes)


def features(fid, paises_fc, datos=None):
    """Polígonos de los países con dato en la dimensión de la familia «fid». Subtipo = «<dim>_<estado>»."""
    datos = datos or cargar()
    dim = DIMENSIONES[fid]
    estados = datos["estados"]
    out = []
    for f in paises_fc["features"]:
        iso = f["properties"].get("iso3")
        fila = datos["paises"].get(iso, {})
        if dim not in fila:
            continue
        e = fila[dim]
        out.append({"type": "Feature", "geometry": f["geometry"], "properties": {
            "id": f"{fid}:{iso}", "n": f["properties"].get("nombre") or iso, "st": f"{dim}_{e['e']}", "p": iso,
            "x": f"{resumen(fila, estados)} · Fuente: {e['fuente']} ({e['url']}) · Revisado: {datos['revisado']}",
            "color": estados[dim][e["e"]][1], "z": 0}})
    return out
