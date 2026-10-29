"""Fase 7: catálogo de planes y lista de fuentes no comerciales."""
import json
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def cargar(p):
    return json.load(open(os.path.join(ROOT, p), encoding="utf-8"))


def test_planes_y_secciones_solo_admin_existen():
    cat = cargar("config/planes.json")
    assert [(p["id"], p["usd"]) for p in cat["planes"]] == [("demo", 0), ("recon", 4.99), ("analyst", 8.99), ("command", 12.99)]
    assert cat["cobro"]["tipo_cambio"]["serie"] == "SF43718"
    index = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    capas = {c["id"] for c in cargar("config/capas.json")["familias"]}
    for s in cat["solo_admin"]:
        if s["tipo"] == "pagina":
            assert os.path.exists(os.path.join(ROOT, s["href"])), s
        elif s["tipo"] == "bloque":
            assert f'id="{s["id"]}"' in index, s
        else:
            assert s["id"] in capas, s


def test_cada_fuente_no_comercial_de_sources_esta_en_la_lista():
    lic = cargar("config/comercial_licencias.json")
    patrones = [f["patron"] for f in lic["fuentes"]]
    assert all(f["accion"] in lic["acciones"] for f in lic["fuentes"])
    nc = re.compile(r"BY-NC|no comercial|non-commercial|\| \*\*No\*\*", re.I)
    faltan = []
    for linea in open(os.path.join(ROOT, "SOURCES.md"), encoding="utf-8"):
        if linea.startswith("|") and nc.search(linea) and not any(p in linea for p in patrones):
            faltan.append(linea[:100])
    assert not faltan, faltan
