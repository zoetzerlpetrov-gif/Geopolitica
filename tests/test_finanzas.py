"""Análisis financiero de empresas (tools/finanzas/edgar.py, finanzas.html)."""
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, os.path.join(ROOT, "tools", "finanzas"))
import edgar as E  # noqa: E402


def hechos(serie_flujo, serie_saldo):
    """companyfacts mínimo: {concepto: {año: valor}} → formato de la SEC con marcos CYAAAA / CYAAAAQ4I."""
    gaap = {}
    for c, por_anio in serie_flujo.items():
        gaap[c] = {"units": {"USD": [{"frame": f"CY{a}", "val": v, "end": f"{a}-12-31", "form": "10-K"} for a, v in por_anio.items()]}}
    for c, por_anio in serie_saldo.items():
        u = "shares" if c == "CommonStockSharesOutstanding" else "USD"
        gaap[c] = {"units": {u: [{"frame": f"CY{a}Q4I", "val": v, "end": f"{a}-12-31", "form": "10-K"} for a, v in por_anio.items()]}}
    return {"entityName": "Ejemplo SA", "facts": {"us-gaap": gaap}}


F = hechos(
    {"Revenues": {"2023": 1000, "2024": 1100, "2025": 1250}, "CostOfRevenue": {"2023": 600, "2024": 640, "2025": 700},
     "OperatingIncomeLoss": {"2023": 150, "2024": 180, "2025": 220}, "NetIncomeLoss": {"2023": 100, "2024": 120, "2025": 150},
     "InterestExpense": {"2023": 20, "2024": 20, "2025": 22}, "DepreciationDepletionAndAmortization": {"2023": 50, "2024": 55, "2025": 60},
     "NetCashProvidedByUsedInOperatingActivities": {"2023": 140, "2024": 160, "2025": 190},
     "PaymentsToAcquirePropertyPlantAndEquipment": {"2023": 60, "2024": 60, "2025": 70},
     "PaymentsOfDividends": {"2023": 30, "2024": 35, "2025": 40}},
    {"Assets": {"2023": 2000, "2024": 2100, "2025": 2200}, "AssetsCurrent": {"2023": 600, "2024": 700, "2025": 800},
     "LiabilitiesCurrent": {"2023": 400, "2024": 420, "2025": 400}, "Liabilities": {"2023": 1200, "2024": 1200, "2025": 1150},
     "LongTermDebtNoncurrent": {"2023": 500, "2024": 480, "2025": 450}, "CashAndCashEquivalentsAtCarryingValue": {"2023": 100, "2024": 150, "2025": 200},
     "StockholdersEquity": {"2023": 800, "2024": 900, "2025": 1050}, "RetainedEarningsAccumulatedDeficit": {"2023": 300, "2024": 400, "2025": 500},
     "CommonStockSharesOutstanding": {"2023": 100, "2024": 100, "2025": 99}})


def test_estados_razones_y_puntajes():
    inst = {"ticker": "EJM", "name": "Ejemplo", "current_price": 20, "currency": "USD", "sector": "Industria", "pays_dividend": True}
    r = E.analizar(inst, 1, F, None)
    assert r["anios"] == ["2023", "2024", "2025"] and r["moneda"] == "USD"
    z = r["razones"]["2025"]
    assert round(z["margen_bruto"], 3) == 0.44 and round(z["margen_neto"], 3) == 0.12 and round(z["crecimiento_ingresos"], 4) == 0.1364
    assert z["razon_circulante"] == 2 and z["flujo_libre"] == 120 and round(z["payout_flujo_libre"], 3) == 0.333
    assert round(z["deuda_neta_ebitda"], 3) == round((450 - 200) / 280, 3)
    assert r["piotroski"]["puntos"] >= 7 and r["altman"]["aplica"] and r["altman"]["zona"] in ("segura", "gris", "de riesgo")
    temas = {d["tema"]: d["semaforo"] for d in r["diagnostico"]}
    assert temas["Crecimiento"] == "verde" and temas["Liquidez"] == "verde" and temas["Dividendo"] == "verde"
    assert r["calificacion"] == "verde"


def test_altman_no_aplica_a_financieras_ni_adr_y_motivos():
    est = E.estados(F)
    assert not E.altman(est, 20, "USD", "Finanzas / Bancos")["aplica"]
    assert not E.altman(est, 20, "EUR", "Industria")["aplica"]
    assert "ETF" in E.motivo_sin_datos({"ticker": "VOO", "sector": "ETFs / Índices"})
    assert "Criptomoneda" in E.motivo_sin_datos({"ticker": "BTC-USD", "sector": "Criptomonedas"})
    assert "BMV" in E.motivo_sin_datos({"ticker": "FUNO11.MX", "sector": "FIBRAs (bienes raíces)"})


def test_semaforo_general_y_caja_neta():
    assert E.calificacion([{"semaforo": "rojo"}, {"semaforo": "rojo"}, {"semaforo": "verde"}]) == "rojo"
    assert E.calificacion([{"semaforo": "verde"}, {"semaforo": "ambar"}]) == "verde"
    assert E.calificacion([{"semaforo": "rojo"}, {"semaforo": "verde"}, {"semaforo": "verde"}]) == "ambar"
    est = E.estados(F)
    rz = E.razones(est)
    rz["2025"]["deuda_neta_ebitda"] = -0.5
    d = {x["tema"]: x["texto"] for x in E.diagnostico(est, rz, None, None)}
    assert d["Endeudamiento"].startswith("Tiene más efectivo que deuda")


def test_documentos_solo_reportes_relevantes():
    subs = {"cik": "320193", "filings": {"recent": {"form": ["4", "10-K", "8-K", "S-8"], "accessionNumber": ["a", "0000320193-25-000079", "0000320193-25-000080", "b"],
                                                    "filingDate": ["2025-11-01", "2025-10-31", "2025-10-30", "x"], "reportDate": ["", "2025-09-27", "", ""],
                                                    "primaryDocument": ["x", "aapl-20250927.htm", "a8k.htm", "y"]}}}
    d = E.documentos(subs)
    assert [x["forma"] for x in d] == ["10-K", "8-K"]
    assert d[0]["url"] == "https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927.htm"


def test_pagina_y_publicacion():
    html = open(os.path.join(ROOT, "finanzas.html"), encoding="utf-8").read()
    assert 'content="noindex"' in html and "js/finanzas.js" in html and "no asesoría de inversión" in html.replace("no es asesoría", "no asesoría")
    planes = json.load(open(os.path.join(ROOT, "config", "planes.json"), encoding="utf-8"))
    assert any(x.get("href") == "finanzas.html" for x in planes["solo_admin"])
    pages = open(os.path.join(ROOT, ".github", "workflows", "pages.yml"), encoding="utf-8").read()
    assert "finanzas.html" in pages and "datos-finanzas" in pages


def test_servicios_publicos_con_umbrales_propios():
    est = E.estados(F)
    rz = E.razones(est)
    rz["2025"].update({"razon_circulante": 0.6, "deuda_neta_ebitda": 5.3, "flujo_libre": -100, "conversion_efectivo": 2.4})
    gen = {d["tema"]: d["semaforo"] for d in E.diagnostico(est, rz, None, None, sector="Industria")}
    reg = {d["tema"]: d["semaforo"] for d in E.diagnostico(est, rz, None, None, sector="Servicios públicos (luz, gas, agua)")}
    assert (gen["Liquidez"], gen["Endeudamiento"], gen["Generación de efectivo"]) == ("rojo", "rojo", "rojo")
    assert (reg["Liquidez"], reg["Endeudamiento"], reg["Generación de efectivo"]) == ("ambar", "ambar", "ambar")
