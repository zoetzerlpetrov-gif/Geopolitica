"""Indicadores del noticiero (tools/noticiero/indicadores.py), sin red; respuestas copiadas de las fuentes."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "noticiero"))
import indicadores as I  # noqa: E402


def test_banxico_ultimo_y_anterior_con_comas_y_grupo():
    js = {"bmx": {"series": [
        {"idSerie": "SF43718", "titulo": "Tipo de cambio   Pesos por dólar E.U.A. (FIX)", "datos": [{"fecha": "17/10/2026", "dato": "18.3900"}, {"fecha": "20/10/2026", "dato": "18.4200"}]},
        {"idSerie": "SF43707", "titulo": "Reserva Internacional", "datos": [{"fecha": "09/10/2026", "dato": "256,900.0"}, {"fecha": "16/10/2026", "dato": "257,076.5"}]},
        {"idSerie": "SF43936", "titulo": "Cetes a 28 días", "datos": [{"fecha": "22/10/2026", "dato": "N/E"}, {"fecha": "15/10/2026", "dato": "6.25"}]},
        {"idSerie": "OTRA", "titulo": "x", "datos": [{"fecha": "01/01/2026", "dato": "1"}]}]}}
    out = {x["id"]: x for x in I.leer_banxico(js)}
    assert set(out) == {"SF43718", "SF43707", "SF43936"}
    assert out["SF43718"]["valor"] == 18.42 and out["SF43718"]["previo"] == 18.39 and out["SF43718"]["fecha"] == "2026-10-20"
    assert out["SF43718"]["nombre"] == "Tipo de cambio Pesos por dólar E.U.A. (FIX)" and out["SF43718"]["grupo"] == "mx"
    assert out["SF43707"]["valor"] == 257076.5
    assert out["SF43936"]["valor"] == 6.25 and out["SF43936"]["previo"] is None and out["SF43936"]["grupo"] == "mx_valores"


def test_ecb_y_cruces_contra_el_dolar():
    xml = b"""<?xml version="1.0"?><gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
      <Cube><Cube time="2026-10-21"><Cube currency="USD" rate="1.1000"/><Cube currency="JPY" rate="165.00"/><Cube currency="MXN" rate="20.35"/></Cube></Cube></gesmes:Envelope>"""
    tasas, f = I.leer_ecb(xml)
    assert f == "2026-10-21" and tasas["USD"] == 1.1
    d = {x["id"]: x for x in I.divisas(tasas, f, {"USD": 1.0, "JPY": 160.0, "MXN": 20.0})}
    assert d["EURUSD"]["valor"] == 1.1 and d["EURUSD"]["previo"] == 1.0
    assert round(d["USDJPY"]["valor"], 4) == 150.0 and round(d["USDJPY"]["previo"], 4) == 160.0
    assert round(d["USDMXN"]["valor"], 4) == 18.5 and "USDCNY" not in d


def test_cbr_rublo_por_dolar():
    xml = '<?xml version="1.0" encoding="windows-1251"?><ValCurs Date="22.10.2026"><Valute><CharCode>USD</CharCode><Nominal>1</Nominal><Value>81,5000</Value></Valute></ValCurs>'.encode("cp1251")
    assert I.leer_cbr(xml) == (81.5, "2026-10-22")


def test_tesoro_curva():
    csv = 'Date,"1 Mo","3 Mo","2 Yr","10 Yr","30 Yr"\n10/19/2026,4.11,4.27,4.77,5.15,5.48\n10/20/2026,4.10,4.26,4.79,5.12,5.42\n'
    d = {x["id"]: x for x in I.leer_tesoro(csv)}
    assert d["UST10Yr"]["valor"] == 5.12 and d["UST10Yr"]["previo"] == 5.15 and d["UST10Yr"]["fecha"] == "2026-10-20"
    assert set(d) == {"UST3Mo", "UST2Yr", "UST10Yr", "UST30Yr"}


def test_bls_inflacion_anual_y_desempleo():
    serie = lambda sid, vals: {"seriesID": sid, "data": [{"year": a, "period": p, "value": v} for a, p, v in vals]}
    js = {"Results": {"series": [
        serie("CUUR0000SA0", [("2026", "M09", "336.940"), ("2026", "M08", "334.980"), ("2025", "M09", "325.000"), ("2025", "M08", "324.000"), ("2025", "M13", "1")]),
        serie("LNS14000000", [("2026", "M09", "4.4"), ("2026", "M08", "4.3")])]}}
    d = {x["id"]: x for x in I.leer_bls(js)}
    assert round(d["CPIUS"]["valor"], 2) == round((336.94 / 325 - 1) * 100, 2) and d["CPIUS"]["fecha"] == "2026-09"
    assert d["UNRATE"]["valor"] == 4.4 and d["UNRATE"]["previo"] == 4.3


def test_kraken_precio_y_apertura():
    js = {"error": [], "result": {"XXBTZUSD": {"c": ["84344.9", "0.001"], "o": "82500.0"}, "XETHZUSD": {"c": ["2505.77", "1"], "o": "2446.55"},
                                  "XXLMZUSD": {"c": ["0.41230", "1"], "o": "0.40000"}}}
    d = {x["id"]: x for x in I.leer_kraken(js, "2026-10-21 15:51 UTC")}
    assert d["XBT"]["valor"] == 84344.9 and d["XBT"]["previo"] == 82500.0 and d["XBT"]["unidad"] == "USD"
    assert d["XLM"]["decimales"] == 4 and "XRP" not in d
