"""Fichas de redes de criptomonedas con datos de DefiLlama (tools/finanzas/cripto.py)."""
import os
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, os.path.join(ROOT, "tools", "finanzas"))
import cripto as C  # noqa: E402


def test_tendencia_tvl_y_diagnostico():
    hist = [{"date": i, "tvl": 100.0} for i in range(400)] + [{"date": 401, "tvl": 150.0}]
    assert round(C.tendencia_tvl(hist), 2) == 0.5 and C.tendencia_tvl(hist[:10]) is None
    d = {x["tema"]: x["semaforo"] for x in C.diagnostico({"comisiones_1a": 200e6, "comisiones_30d": 20e6, "tvl_cambio_1a": -0.5, "tvl": 1e9})}
    assert d["Uso de la red (comisiones)"] == "verde" and d["Tendencia del uso"] == "verde" and d["Valor bloqueado (TVL)"] == "rojo"
    # redes de comisiones bajas por diseño: nunca rojo por eso
    assert {x["tema"]: x["semaforo"] for x in C.diagnostico({"comisiones_1a": 0.3e6})}["Uso de la red (comisiones)"] == "ambar"


def test_ficha():
    chains = [{"name": "Solana", "tvl": 5e9}]
    est = [{"name": "Solana", "totalCirculatingUSD": {"peggedUSD": 14e9}}]
    hist = [{"date": i, "tvl": 10e9} for i in range(400)] + [{"date": 401, "tvl": 5e9}]
    f = C.ficha("SOL-USD", "Solana", "Solana", "solana", chains, est, hist, {"total30d": 16e6, "total1y": 230e6}, {"total1y": 5e6})
    assert f["perfil"] == "cripto" and f["red"]["estables"] == 14e9 and round(f["red"]["tvl_cambio_1a"], 2) == -0.5
    assert f["bloques"][0]["filas"][0][1] == "230.0 millones de USD" and f["calificacion"] in ("verde", "ambar", "rojo")
