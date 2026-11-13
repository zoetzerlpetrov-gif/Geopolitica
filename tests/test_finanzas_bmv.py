"""Emisoras mexicanas y FIBRAs desde los reportes XBRL de la CNBV publicados por BIVA (tools/finanzas/bmv.py)."""
import os
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, os.path.join(ROOT, "tools", "finanzas"))
import bmv as B  # noqa: E402

XBRL = open(os.path.join(ROOT, "tests", "datos", "cnbv_fibra_4d.xbrl"), "rb").read()


def test_clave_de_pizarra():
    assert B.clave_de("FUNO11.MX")[:2] == ["FUNO11", "FUNO"]
    assert "GMEXICO" in B.clave_de("GMEXICOB.MX") and "FIBRAPL" in B.clave_de("FIBRAPL14.MX")
    assert B.clave_de("WALMEX.MX") == ["WALMEX"]


def test_leer_xbrl_solo_totales_sin_dimensiones():
    x = B.leer_xbrl(XBRL)
    assert x["fibra"] and x["moneda"] == "MXN"
    assert x["hechos"]["Equity"] == {"2025-12-31": 13000000000.0}  # el renglón con dimensión (999) no cuenta
    assert x["hechos"]["Revenue"]["2025-01-01/2025-12-31"] == 1100000000.0


def test_fibra_anuales_ltv_icd_y_diagnostico():
    x = B.leer_xbrl(XBRL)
    res = B.analizar({"ticker": "FIBRAX11.MX", "name": "Fibra X", "sector": "FIBRAs (bienes raíces)"}, "FIBRAX", [x],
                     {"xbrl": x, "nombre": "Información trimestral 4D-2025"}, [])
    assert res["perfil"] == "fibra" and res["anios"] == ["2024", "2025"]
    assert res["estados"]["deuda_largo_plazo"]["2025"] == 6000000000.0  # bancarios + bursátiles
    ut = res["ultimo_trimestre"]
    assert ut["icd"] == 1.8 and round(ut["ltv"], 3) == round(6.5e9 / 20e9, 3)
    temas = {d["tema"]: d["semaforo"] for d in res["diagnostico"]}
    assert temas["Cobertura del servicio de la deuda (ICD)"] == "verde"
    assert temas["Endeudamiento (LTV)"] == "verde" and temas["Margen operativo"] == "verde"
    assert temas["Distribuciones frente al flujo"] == "verde"  # 600 de 800
    assert res["piotroski"] is None and not res["altman"]["aplica"]


def test_elegir_ultimo_y_cuartos_trimestres_dictaminados():
    lista = [{"trimestre": t, "dictaminado": d, "anio": a, "xbrl": f"{a}{t}{d}"} for a, t, d in
             [(2026, 3, False), (2026, 2, False), (2025, 4, True), (2025, 4, False), (2025, 3, False), (2024, 4, True)]]
    ultimo, q4 = B.elegir(lista)
    assert ultimo["xbrl"] == "20263False" and [r["xbrl"] for r in q4] == ["20254True", "20244True"]
