#!/usr/bin/env python3
"""Valida data/events.json contra schema/event.schema.json y reglas de negocio.

Se ejecuta en GitHub Actions antes de publicar. Si encuentra un error, termina con
código 1 y el workflow se detiene: el sitio sigue mostrando la última versión buena.

Uso:  python3 ingest/validate.py [ruta/events.json]
"""
import json
import os
import sys
from datetime import datetime

from jsonschema import Draft202012Validator

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def _load(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return json.load(f)


def _fecha_ok(s):
    try:
        datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ")
        return True
    except (TypeError, ValueError):
        return False


def validar(data, taxonomy=None):
    """Devuelve una lista de errores legibles (vacía si todo está bien)."""
    taxonomy = taxonomy or _load("config/taxonomy.json")
    schema = _load("schema/event.schema.json")
    errores = []

    for e in Draft202012Validator(schema).iter_errors(data):
        ruta = "/".join(str(p) for p in e.absolute_path) or "(raíz)"
        errores.append(f"esquema · {ruta}: {e.message}")
    if errores:
        return errores  # sin estructura válida no tiene sentido seguir

    sub_de_area = {a["id"]: {s["id"] for s in a["subtemas"]} for a in taxonomy["areas"]}
    if not _fecha_ok(data["generado_utc"]):
        errores.append("generado_utc debe tener formato AAAA-MM-DDTHH:MM:SSZ")
    if data["total"] != len(data["eventos"]):
        errores.append(f"total={data['total']} no coincide con {len(data['eventos'])} eventos")

    vistos = set()
    for ev in data["eventos"]:
        eid = ev["id"]
        if eid in vistos:
            errores.append(f"{eid}: id duplicado")
        vistos.add(eid)
        if not _fecha_ok(ev["fecha_utc"]):
            errores.append(f"{eid}: fecha_utc debe tener formato AAAA-MM-DDTHH:MM:SSZ")
        if ev["area_principal"] in ev["areas_secundarias"]:
            errores.append(f"{eid}: el área principal no puede repetirse como secundaria")
        if (ev["lat"] is None) != (ev["lon"] is None):
            errores.append(f"{eid}: lat y lon deben venir juntas o ambas nulas")
        permitidos = set().union(*(sub_de_area[a] for a in [ev["area_principal"], *ev["areas_secundarias"]]))
        ajenos = [s for s in ev["subtemas"] if s not in permitidos]
        if ajenos:
            errores.append(f"{eid}: subtemas {ajenos} no pertenecen a sus áreas")
        if ev["fuentes"][0]["url"] != ev["url"]:
            errores.append(f"{eid}: fuentes[0].url debe ser igual a url")
    for ev in data["eventos"]:
        rotas = [c for c in ev.get("correlaciones", []) if c not in vistos]
        if rotas:
            errores.append(f"{ev['id']}: correlaciones apuntan a eventos inexistentes {rotas}")
    return errores


def main(argv):
    ruta = argv[1] if len(argv) > 1 else os.path.join(ROOT, "data", "events.json")
    with open(ruta, encoding="utf-8") as f:
        data = json.load(f)
    errores = validar(data)
    if errores:
        print(f"✗ {ruta}: {len(errores)} error(es)")
        for e in errores[:50]:
            print("  -", e)
        return 1
    print(f"✓ {ruta}: {data['total']} eventos válidos")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
