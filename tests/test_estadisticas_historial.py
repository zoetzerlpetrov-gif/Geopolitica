"""Conteos diarios del historial para la página de analítica."""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
import run as R  # noqa: E402


def test_estadisticas_por_dia(tmp_path):
    evs = [{"area_principal": "seguridad", "severidad": 4, "pais_iso3": "MEX"},
           {"area_principal": "seguridad", "severidad": 2, "pais_iso3": "USA"},
           {"area_principal": None, "severidad": 3, "pais_iso3": None}]
    (tmp_path / "2026-10-21.json").write_text(json.dumps({"dia": "2026-10-21", "total": 3, "eventos": evs}))
    d = R.estadisticas_historial(str(tmp_path))[0]
    assert d["dia"] == "2026-10-21" and d["total"] == 3
    assert d["areas"] == {"seguridad": 2, "otras": 1}
    assert d["sev"] == {"4": 1, "2": 1, "3": 1} and d["paises"] == {"MEX": 1, "USA": 1}
