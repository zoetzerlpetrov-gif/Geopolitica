"""Empresas europeas desde informes ESEF en xBRL-JSON (tools/finanzas/esef.py)."""
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, os.path.join(ROOT, "tools", "finanzas"))
import esef as F  # noqa: E402


def hecho(concepto, periodo, valor, **extra):
    return {"value": str(valor), "dimensions": {"concept": f"ifrs-full:{concepto}", "entity": "lei:X", "period": periodo, "unit": "iso4217:EUR", **extra}}


def test_periodos_xbrl_json_con_fin_exclusivo():
    assert F.periodo("2025-01-01T00:00:00/2026-01-01T00:00:00") == "2025-01-01/2025-12-31"
    assert F.periodo("2026-01-01T00:00:00") == "2025-12-31"


def test_leer_json_y_analizar():
    a25, a24 = "2025-01-01T00:00:00/2026-01-01T00:00:00", "2024-01-01T00:00:00/2025-01-01T00:00:00"
    facts = {str(i): f for i, f in enumerate([
        hecho("Revenue", a25, 1100), hecho("Revenue", a24, 1000), hecho("ProfitLoss", a25, 110), hecho("ProfitLoss", a24, 90),
        hecho("ProfitLossFromOperatingActivities", a25, 160), hecho("Assets", "2026-01-01T00:00:00", 3000),
        hecho("Assets", "2025-01-01T00:00:00", 2900), hecho("CurrentAssets", "2026-01-01T00:00:00", 900),
        hecho("CurrentLiabilities", "2026-01-01T00:00:00", 600), hecho("Equity", "2026-01-01T00:00:00", 1500),
        hecho("Revenue", a25, 999, **{"ifrs-full:SegmentsAxis": "x:Europa"}),  # con dimensión: no cuenta
    ])}
    x = F.leer_json({"facts": facts})
    assert x["moneda"] == "EUR" and x["hechos"]["Revenue"]["2025-01-01/2025-12-31"] == 1100
    r = F.analizar({"ticker": "IBDRY", "name": "Iberdrola", "sector": "Utilities"}, "5QK37QC7NWOJ8D7WVQ45", [x], [])
    assert r["anios"] == ["2024", "2025"] and r["razones"]["2025"]["razon_circulante"] == 1.5
    assert "ESEF" in r["fuente"]


def test_config_lei():
    c = json.load(open(os.path.join(ROOT, "config", "finanzas_lei.json"), encoding="utf-8"))["empresas"]
    assert c["IBDRY"]["lei"] == "5QK37QC7NWOJ8D7WVQ45" and c["SPCX"]["esef"] is False
    assert all(len(v.get("lei", "x" * 20)) == 20 for v in c.values())
