"""Pruebas del clasificador por reglas: 26 titulares (2 por área) y casos especiales."""
import json
import os
import sys

import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
from classify import Clasificador, normalizar  # noqa: E402

CLF = Clasificador()
with open(os.path.join(ROOT, "tests", "titulares.json"), encoding="utf-8") as f:
    CASOS = json.load(f)["casos"]


def test_hay_dos_titulares_por_area():
    por_area = {}
    for c in CASOS:
        por_area[c["principal"]] = por_area.get(c["principal"], 0) + 1
    assert set(por_area) == set(CLF.areas)
    assert all(n >= 2 for n in por_area.values())
    assert len(CASOS) >= 26


@pytest.mark.parametrize("caso", CASOS, ids=lambda c: c["principal"] + ":" + c["titulo"][:40])
def test_titular(caso):
    r = CLF.clasificar(caso["titulo"])
    assert r["area_principal"] == caso["principal"], f"{r['puntajes']} · {r['evidencia']}"
    for a in caso.get("secundarias_incluye", []):
        assert a in r["areas_secundarias"], r
    assert len(r["areas_secundarias"]) <= 3
    assert r["area_principal"] not in r["areas_secundarias"]
    assert 0 < r["confianza"] <= 1


def test_sin_coincidencias():
    r = CLF.clasificar("Receta de pastel de chocolate")
    assert r["area_principal"] is None and r["confianza"] == 0


def test_normaliza_acentos_y_mayusculas():
    assert normalizar("Canal de PANAMÁ.") == " canal de panama "
    assert "pm2.5" in normalizar("Partículas PM2.5")


def test_palabra_completa_no_subcadena():
    # "port" no debe coincidir dentro de "important" ni "puerto" dentro de "puertorriqueño".
    r = CLF.clasificar("An important report")
    assert "infraestructura" not in r["puntajes"]


def test_subtemas_pertenecen_a_sus_areas():
    tax = json.load(open(os.path.join(ROOT, "config", "taxonomy.json"), encoding="utf-8"))
    sub_de = {a["id"]: {s["id"] for s in a["subtemas"]} for a in tax["areas"]}
    for c in CASOS:
        r = CLF.clasificar(c["titulo"])
        permitidos = set().union(*(sub_de[a] for a in [r["area_principal"], *r["areas_secundarias"]]))
        assert set(r["subtemas"]) <= permitidos
