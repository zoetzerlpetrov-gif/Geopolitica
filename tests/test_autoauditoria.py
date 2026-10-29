"""Autoauditoría semanal (tools/autoauditoria/autoauditoria.py y config/autoauditoria.json)."""
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "autoauditoria"))
import autoauditoria as A  # noqa: E402


def test_cada_control_tiene_verificacion_o_estado():
    cfg = json.load(open(os.path.join(ROOT, "config", "autoauditoria.json"), encoding="utf-8"))
    ids = [c["id"] for c in cfg["controles"]]
    assert len(ids) == len(set(ids))
    for c in cfg["controles"]:
        assert c["marco"] in cfg["marcos"] and c["mejora"] and c["prioridad"] in A.PRIORIDAD, c["id"]
        if c["tipo"] == "auto":
            assert c["check"] in A.VERIFICACIONES, c["id"]
        else:
            assert c["estado"] in ("cumple", "parcial", "no_cumple", "no_aplica", "sin_evaluar"), c["id"]


def test_evalua_y_calcula_puntajes():
    cfg = json.load(open(os.path.join(ROOT, "config", "autoauditoria.json"), encoding="utf-8"))
    res = A.evaluar(cfg, correr_pruebas=False)
    assert 0 <= res["puntaje_global"] <= 100
    assert {m["id"] for m in res["marcos"]} == set(cfg["marcos"])
    assert all(c["estado"] in ("cumple", "parcial", "no_cumple", "no_aplica", "sin_evaluar") for c in res["controles"])
    # Hechos conocidos del repositorio: sin secretos y sin rastreadores.
    por = {c["id"]: c for c in res["controles"]}
    assert por["iso_a_8_4"]["estado"] == "cumple" and por["p_minimo"]["estado"] == "cumple"
    assert len({x["mejora"] for x in res["mejoras"]}) == len(res["mejoras"]), "una mejora por acción"


def test_puntaje_ignora_sin_evaluar():
    assert A.puntaje([{"estado": "cumple"}, {"estado": "no_cumple"}, {"estado": "sin_evaluar"}, {"estado": "parcial"}]) == 50
