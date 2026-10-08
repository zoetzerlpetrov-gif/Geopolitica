#!/usr/bin/env python3
"""Valida config/entities.json y los registros de data/entidades/*.json contra schema/entity.schema.json.

Reglas extra además del esquema:
  - cada subtipo apunta a una fuente declarada en "fuentes";
  - ids de subtipo únicos dentro de su categoría;
  - personas: categoría no dibujable, todos sus subtipos con tipo_capa "ficha" y sin zoom;
  - registros de personas sin ningún campo fuera de la lista permitida (el esquema lo impide).
Uso: python3 ingest/validate_entities.py
"""
import glob
import json
import os
import sys

from jsonschema import Draft202012Validator

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
REGISTRO = {"personas.json": "persona", "organizaciones.json": "organizacion", "militar.json": "instalacion_militar"}


def _schema():
    with open(os.path.join(ROOT, "schema", "entity.schema.json"), encoding="utf-8") as f:
        return json.load(f)


def validador_def(nombre):
    s = _schema()
    return Draft202012Validator({"$ref": f"#/$defs/{nombre}", "$defs": s["$defs"]})


def validar_catalogo(cat):
    errores = [f"esquema · {'/'.join(map(str, e.absolute_path))}: {e.message}" for e in validador_def("catalogo").iter_errors(cat)]
    if errores:
        return errores
    for c in cat["categorias"]:
        ids = [s["id"] for s in c["subtipos"]]
        if len(ids) != len(set(ids)):
            errores.append(f"{c['id']}: ids de subtipo repetidos")
        for s in c["subtipos"]:
            if s["fuente"] not in cat["fuentes"]:
                errores.append(f"{c['id']}/{s['id']}: fuente '{s['fuente']}' no declarada")
        if c["id"] == "personas":
            if c["dibujable"]:
                errores.append("personas: la categoría no puede ser dibujable")
            for s in c["subtipos"]:
                if s["tipo_capa"] != "ficha" or s["zoom_min"] is not None:
                    errores.append(f"personas/{s['id']}: debe ser tipo_capa 'ficha' sin zoom_min")
    return errores


def validar_registros():
    errores = []
    for ruta in sorted(glob.glob(os.path.join(ROOT, "data", "entidades", "*.json"))):
        nombre = os.path.basename(ruta)
        if nombre not in REGISTRO:
            continue
        with open(ruta, encoding="utf-8") as f:
            datos = json.load(f)
        v = validador_def(REGISTRO[nombre])
        for i, reg in enumerate(datos.get("registros", [])):
            for e in v.iter_errors(reg):
                errores.append(f"{nombre}[{i}] {reg.get('id')}: {e.message}")
    return errores


def main():
    with open(os.path.join(ROOT, "config", "entities.json"), encoding="utf-8") as f:
        cat = json.load(f)
    errores = validar_catalogo(cat) + validar_registros()
    if errores:
        print(f"✗ entidades: {len(errores)} error(es)")
        for e in errores[:50]:
            print("  -", e)
        return 1
    print(f"✓ entidades: {len(cat['categorias'])} categorías, {sum(len(c['subtipos']) for c in cat['categorias'])} subtipos válidos")
    return 0


if __name__ == "__main__":
    sys.exit(main())
