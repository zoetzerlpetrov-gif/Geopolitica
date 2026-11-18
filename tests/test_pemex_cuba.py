import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "mexico"))
import pemex_cuba as P  # noqa: E402

TEXTO = ("for export to the Republic of Cuba. In 2025, Gasolinas Bienestar, S.A. de C.V. exported 15.0 thousand barrels per day of crude oil "
         "per day and 2.2 thousand barrels of petroleum products per day, amounting to Ps.9.5 billion (U.S.$0.5 billion). Such sales represented "
         "3.1% of our total exports of crude oil and 1.8% of our total sales of petroleum products, respectively. "
         "In the six months ended June 30, 2026, Servicios Logísticos y Recursos Estratégicos, S.A. de C.V. exported 0.9 thousand barrels per day of "
         "petroleum products in the aggregate amount of Ps.256.2 million (U.S.$14.7 million). Such sales represented 0.1% of total export sales.")


def test_extraer_frases_del_reporte():
    a, b = P.extraer(TEXTO)
    assert a["periodo"] == "Año 2025" and a["crudo_kbd"] == 15.0 and a["petroliferos_kbd"] == 2.2
    assert a["mxn_millones"] == 9500.0 and a["usd_millones"] == 500.0
    assert a["pct_crudo_exportado"] == 3.1 and a["pct_petroliferos"] == 1.8
    assert b["clave"] == "2026-06" and b["inicio"] == "2026-01" and b["crudo_kbd"] == 0.0
    assert b["usd_millones"] == 14.7 and b["pct_exportaciones"] == 0.1


def test_periodos():
    assert P.periodo("From July 2023 through December 30, 2023")[1:3] == ("2023-07", "2023-12")
    assert P.periodo("In the three months ended March 31, 2026")[:3] == ("2026-03", "2026-01", "2026-03")
    assert P.periodo("In the nine months ended September 30, 2025")[1] == "2025-01"


def test_el_reporte_mas_reciente_corrige():
    d1 = {"forma": "6-K", "fecha": "2025-06-01", "url": "u1"}
    d2 = {"forma": "20-F", "fecha": "2026-04-30", "url": "u2"}
    f = {"clave": "2025-12", "crudo_kbd": 1.0}
    out = P.combinar([(d1, [f]), (d2, [{**f, "crudo_kbd": 2.0}])])
    assert len(out) == 1 and out[0]["crudo_kbd"] == 2.0 and out[0]["fuente"] == "u2"
