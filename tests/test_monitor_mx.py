import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "mexico"))
import monitor_mx as M  # noqa: E402

AHORA = datetime(2026, 11, 17, 16, 0, tzinfo=timezone.utc)


def respuesta(series):
    return {"bmx": {"series": [{"idSerie": i, "datos": [{"fecha": f, "dato": d} for f, d in datos]} for i, datos in series.items()]}}


def test_leer_ignora_ne_y_ordena():
    js = respuesta({"SE1": [("01/02/2026", "1,234.5"), ("01/01/2026", "N/E"), ("01/12/2025", "10")]})
    assert M.leer(js) == {"SE1": [("2025-12-01", 10.0), ("2026-02-01", 1234.5)]}


def test_alertas_salto_cero_reaparece_desplome():
    base = [(f"2025-{m:02d}", 10.0) for m in range(1, 13)]
    assert M.alerta(base + [("2026-01", 60.0)], 12)["alerta"] == "salto"
    assert M.alerta(base + [("2026-01", 0.0)], 12)["alerta"] == "a cero"
    assert M.alerta(base + [("2026-01", 1.5)], 12)["alerta"] == "desplome"
    assert M.alerta(base + [("2026-01", 12.0)], 12)["alerta"] is None
    ceros = [(f"2025-{m:02d}", 0.0) for m in range(1, 13)]
    assert M.alerta(ceros + [("2026-01", 3.0)], 12)["alerta"] == "reaparece"
    a = M.alerta(base + [("2026-01", 60.0)], 12)
    assert a["razon"] == 6.0 and a["mismo_periodo_anio_anterior"] == 10.0


def test_trimestres_y_suma_mensual_de_variacion_diaria():
    assert M.periodo("2026-07-01", True) == "2026-T3"
    pts = [("2026-10-01", 5.0), ("2026-10-02", -2.0), ("2026-11-01", 1.0)]
    assert M.ultimo_por_periodo(pts, diaria=True, suma=True) == [("2026-10", 3.0), ("2026-11", 1.0)]
    assert M.ultimo_por_periodo(pts, diaria=True) == [("2026-10", -2.0), ("2026-11", 1.0)]


def test_main_con_api_simulada(tmp_path, monkeypatch):
    monkeypatch.setattr(M, "OUT", str(tmp_path / "mx.json"))
    cfg = json.load(open(M.CONFIG, encoding="utf-8"))
    cuba = next(s for s in cfg["remesas_pais_destino"] if s["nombre"] == "Cuba")
    trimestres = [f"01/{m:02d}/{a}" for a in (2025, 2026) for m in (1, 4, 7, 10)][:7]

    def pedir(url):
        ids = url.split("/series/")[1].split("/")[0].split(",")
        datos = {}
        for i in ids:
            vals = ["2"] * 6 + ["40"] if i == cuba["id"] else ["5"] * 7
            datos[i] = list(zip(trimestres, vals))
        return respuesta(datos)

    assert M.main(AHORA, pedir=pedir) == 0
    out = json.load(open(tmp_path / "mx.json"))
    assert out["series_recibidas"] == out["series_pedidas"]
    al = [a for a in out["alertas"] if a["donde"] == "Cuba"]
    assert al and al[0]["alerta"] == "salto" and al[0]["que"].startswith("Remesas enviadas")
    assert len(out["capas"]["remesas_estado"]["features"]) == 32


def test_config_sin_ids_repetidos_y_con_coordenadas():
    cfg = json.load(open(M.CONFIG, encoding="utf-8"))
    for k in ("remesas_estado", "remesas_pais_origen", "remesas_pais_destino"):
        assert all(s["coord"] and len(s["coord"]) == 2 for s in cfg[k])
    ids = [s["id"] for k in ("indicadores", "remesas_estado", "remesas_pais_origen", "remesas_pais_destino") for s in cfg[k]]
    assert len(ids) == len(set(ids))
