"""Histórico de riesgo de 12 meses por zona y país (tools/corporativo/riesgo_historico.py)."""
import os
import sys
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "corporativo"))
import riesgo_historico as R  # noqa: E402


def ev(lat, lon, sev, area="seguridad", iso="MEX"):
    return {"lat": lat, "lon": lon, "severidad": sev, "area_principal": area, "pais_iso3": iso, "titulo": "no se guarda", "url": "https://x"}


def test_celda_y_meses():
    assert R.celda(25.67, -100.31) == "25.5,-100.5"
    assert R.celda(-0.2, 0.2) == "-0.5,0.0"
    assert R.meses_vigentes(date(2026, 3, 15), 4) == ["2025-12", "2026-01", "2026-02", "2026-03"]


def test_acumula_sin_duplicar_y_recorta_a_12_meses():
    dias = {"2026-11-01": [ev(25.67, -100.31, 4), ev(25.6, -100.4, 2, "clima")], "2026-11-02": [ev(19.43, -99.13, 3)]}
    r = R.acumular({}, dias, date(2026, 11, 26))
    mty = r["celdas"]["25.5,-100.5"]["2026-11"]
    assert (mty["n"], mty["sev"], mty["tipos"]) == (2, 6, {"conflicto": 1, "clima": 1})
    assert r["paises"]["MEX"]["2026-11"]["n"] == 3
    # Correr otra vez con los mismos días no suma doble
    r2 = R.acumular(r, dias, date(2026, 11, 26))
    assert r2["celdas"]["25.5,-100.5"]["2026-11"]["n"] == 2
    # Un año después, noviembre de 2026 ya salió de la ventana
    r3 = R.acumular(r2, {}, date(2027, 12, 2))
    assert "25.5,-100.5" not in r3["celdas"] and not r3["dias_incluidos"]
    # Nunca guarda títulos ni enlaces
    assert "no se guarda" not in str(r) and "https://x" not in str(r)
