"""Lista de archivos de data/ por plan (tools/pages/datos_por_plan.py)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "pages"))
import datos_por_plan as D  # noqa: E402


def test_cada_archivo_queda_con_el_plan_mas_bajo_que_lo_pidio():
    informe = {"resultados": [
        {"rol": "demo", "datos": ["data/vivos/sismos.geojson", "data/events.json"]},
        {"rol": "recon", "datos": ["data/vivos/sismos.geojson", "data/vivos/trenes.geojson", "data/vivos/rastros/a1.json"]},
        {"rol": "analyst", "datos": ["data/vivos/trenes.geojson", "data/history/mx.json"]},
        {"rol": "command", "datos": ["data/vivos/seguimiento.json"]},
        {"rol": "admin", "datos": ["data/vivos/marketing_borradores.json", "data/vivos/seguimiento.json", "data/../x"]},
    ]}
    archivos, medidos = D.calcular(informe)
    assert archivos == {"data/vivos/trenes.geojson": "recon", "data/vivos/rastros/": "recon",
                        "data/vivos/seguimiento.json": "command", "data/vivos/marketing_borradores.json": "admin"}
    assert medidos == ["demo", "recon", "analyst", "command", "admin"]


def test_sin_todos_los_roles_medidos_no_se_escribe(tmp_path, monkeypatch):
    import json
    p = tmp_path / "informe.json"
    p.write_text(json.dumps({"resultados": [{"rol": "demo", "datos": ["data/vivos/a.json"]}]}), encoding="utf-8")
    monkeypatch.setattr(D, "SALIDA", str(tmp_path / "salida.json"))
    assert D.main(str(p)) == 1 and not (tmp_path / "salida.json").exists()
