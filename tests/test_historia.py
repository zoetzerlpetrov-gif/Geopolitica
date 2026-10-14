"""Cronología histórica por país (sin red)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "historia"))
import cronologia as H  # noqa: E402


def _b(qid, nombre, iso, fecha, wp=""):
    b = {"e": {"value": f"http://www.wikidata.org/entity/{qid}"}, "iso": {"value": iso}, "f": {"value": fecha}}
    if nombre:
        b["l"] = {"value": nombre}
    if wp:
        b["wp"] = {"value": wp}
    return b


def test_filas_por_pais_descarta_sin_traducir_y_sin_iso():
    r = H.filas({"results": {"bindings": [_b("Q1", "Batalla de ñoño", "MEX", "1862-05-05T00:00:00Z", wp="Batalla de Puebla"), _b("Q1", "Batalla de Puebla", "MEX", "1863-01-01T00:00:00Z"),
                                          _b("Q2", "", "MEX", "1900-01-01T00:00:00Z"), _b("Q3", "Batalla X", "", "1900-01-01T00:00:00Z"),
                                          _b("Q4", "Guerra de los Pasteles", "FRA", "1838-01-01T00:00:00Z")]}}, "batalla")
    assert r["MEX"] == [["Q1", "Batalla de Puebla", "1862-05-05T00:00:00Z", 11, "batalla", "Batalla de Puebla"]]  # el título de Wikipedia gana
    assert r["FRA"][0][3] == 9  # 1° de enero: solo se conoce el año


def test_combinar_sin_repetir_y_en_orden_con_fechas_antes_de_cristo():
    por_tipo = {"Q178561": {"MEX": [["Q1", "B", "1862-05-05T00:00:00Z", 11, "batalla", 30]]},
                "Q198": {"MEX": [["Q1", "B", "1862-05-05T00:00:00Z", 11, "guerra", 30], ["Q9", "Antigua", "-0500-01-01T00:00:00Z", 9, "guerra", 20],
                         ["Q7", "Orogenia", "-380000000-01-01T00:00:00Z", 9, "periodo histórico", ""]]}}
    assert [f[0] for f in H.combinar(por_tipo)["MEX"]] == ["Q9", "Q1"]
    assert H.anio("-0500-01-01T00:00:00Z") == -500 and H.anio("+1862-05-05T00:00:00Z") == 1862


def test_consulta_por_tipo_y_umbral():
    q = H.consulta("Q178561")
    assert "wdt:P31 wd:Q178561" in q and "?n >= 12" in q and "wdt:P298 ?iso" in q and 'optimizer "None"' in q
