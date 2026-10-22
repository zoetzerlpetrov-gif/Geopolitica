"""Esquema mínimo de los archivos de inmuebles en seguimiento (config/inmuebles_desarrollos)."""
import collections
import glob
import json
import os

CARPETA = os.path.join(os.path.dirname(__file__), "..", "config", "inmuebles_desarrollos")


def _archivos():
    return [r for r in sorted(glob.glob(os.path.join(CARPETA, "*.json"))) if not os.path.basename(r).startswith("_")]


def test_campos_y_coordenadas():
    for ruta in _archivos():
        d = json.load(open(ruta, encoding="utf-8"))
        for x in d["inmuebles"]:
            for k in ("id", "pais_iso3", "lat", "lon", "url"):
                assert x.get(k) not in (None, ""), f"{os.path.basename(ruta)} {x.get('id')} sin {k}"
            assert -90 <= x["lat"] <= 90 and -180 <= x["lon"] <= 180, x["id"]
            assert x["url"].startswith("http"), x["id"]


def test_ids_unicos_entre_archivos():
    c = collections.Counter(x["id"] for r in _archivos() for x in json.load(open(r, encoding="utf-8"))["inmuebles"])
    assert not [k for k, v in c.items() if v > 1]


def test_archivos_listados_en_la_pagina():
    js = open(os.path.join(CARPETA, "..", "..", "js", "inmuebles.js"), encoding="utf-8").read()
    for r in _archivos():
        assert f'"{os.path.basename(r)[:-5]}"' in js, os.path.basename(r)


def test_biblioteca_ids_y_relaciones():
    base = os.path.join(CARPETA, "..", "ops_biblioteca")
    met = [m for r in glob.glob(os.path.join(base, "*.json")) for m in json.load(open(r, encoding="utf-8"))["metodologias"]]
    ids = collections.Counter(m["id"] for m in met)
    assert not [k for k, v in ids.items() if v > 1]
    assert not [(m["id"], r) for m in met for r in m.get("relacion", []) if r not in ids]
