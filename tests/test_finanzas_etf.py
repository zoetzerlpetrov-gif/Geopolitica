"""ETF por sus posiciones (N-PORT) y la salud de las empresas que contienen (tools/finanzas/etf.py)."""
import os
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, os.path.join(ROOT, "tools", "finanzas"))
import etf as T  # noqa: E402


def test_nombres_normalizados():
    assert T.normal("Apple Inc.") == "apple" and T.normal("APPLE INC") == "apple"
    assert T.normal("Alphabet Inc Class A") == "alphabet" and T.normal("Eli Lilly & Co") == "eli lilly"
    assert T.normal("Nestlé S.A.") == "nestle"


def test_posiciones_ligado_y_diagnostico():
    fecha, neto, pos = T.posiciones(open(os.path.join(ROOT, "tests", "datos", "nport_mini.xml"), "rb").read())
    assert fecha == "2026-06-30" and neto == 1000 and len(pos) == 3
    emp = [{"ticker": "AAPL", "nombre": "Apple", "empresa_sec": "Apple Inc.", "calificacion": "verde"},
           {"ticker": "TXN", "nombre": "Texas Instruments", "empresa_sec": "TEXAS INSTRUMENTS INC", "calificacion": "rojo"}]
    r = T.resumen(T.ligar(pos, emp))
    assert round(r["cobertura"]) == 70 and round(r["semaforo"]["verde"]) == 57 and round(r["semaforo"]["rojo"]) == 43
    assert r["principales"][0]["ticker"] == "AAPL" and r["paises"][0][0] == "US"
    d = {x["tema"]: x["semaforo"] for x in T.diagnostico(r)}
    assert d["Diversificación"] == "rojo" and d["Concentración"] == "rojo" and d["Salud de las empresas dentro"] == "rojo"
