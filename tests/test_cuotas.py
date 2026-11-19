"""Cuotas de APIs: corridas por día desde el cron, consumo estimado y semáforo."""
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, os.path.join(ROOT, "tools", "cuotas"))
import cuotas  # noqa: E402


def test_corridas_por_dia():
    assert cuotas.corridas_por_dia("*/20 * * * *") == 72
    assert cuotas.corridas_por_dia("17 13 * * *") == 1
    assert cuotas.corridas_por_dia("20 */4 * * *") == 6
    assert round(cuotas.corridas_por_dia("41 6 1 * *"), 3) == round(1 / 30, 3)
    assert round(cuotas.corridas_por_dia("0 9 * * 1"), 3) == round(1 / 7, 3)


def test_calculo_y_semaforo(tmp_path):
    (tmp_path / "a.yml").write_text('on:\n  schedule:\n    - cron: "*/10 * * * *"\n', encoding="utf-8")
    cfg = {"umbrales": {"amarillo": 0.6, "rojo": 0.85}, "servicios": [
        {"id": "x", "nombre": "X", "secreto": "X_KEY", "limite": 1000, "unidad": "llamadas", "periodo": "día",
         "flujos": [{"workflow": "a.yml", "llamadas_por_corrida": 6}]},
        {"id": "y", "nombre": "Y", "secreto": "—", "limite": None, "unidad": "llamadas", "periodo": "día",
         "flujos": [{"workflow": "a.yml", "llamadas_por_corrida": 1}]},
        {"id": "z", "nombre": "Z", "secreto": "—", "limite": 10, "unidad": "llamadas", "periodo": "mes", "flujos": []}]}
    r = {s["id"]: s for s in cuotas.calcular(cfg, str(tmp_path), medir=False)["servicios"]}
    assert r["x"]["usado"] == 864 and r["x"]["semaforo"] == "rojo"
    assert r["y"]["semaforo"] == "sin_limite"
    assert r["z"]["semaforo"] == "sin_medicion"


def test_config_sin_llaves_y_workflows_existentes():
    cfg = json.load(open(os.path.join(ROOT, "config", "apis_cuotas.json"), encoding="utf-8"))
    texto = json.dumps(cfg)
    for patron in ("AIza", "ghp_", "sk-", "APP_USR"):
        assert patron not in texto
    for s in cfg["servicios"]:
        for f in s.get("flujos", []):
            assert os.path.exists(os.path.join(ROOT, ".github", "workflows", f["workflow"])), f["workflow"]
