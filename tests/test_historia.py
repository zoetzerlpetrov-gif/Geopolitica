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
    assert r["MEX"] == [["Q1", "Batalla de Puebla", "1862-05-05T00:00:00Z", 11, "batalla", "Batalla de Puebla", 0]]  # el título de Wikipedia gana
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


def test_filas_de_listas_conflictos_y_organismos():
    b = lambda **kw: {k: {"value": v} for k, v in kw.items()}  # noqa: E731
    r = {"results": {"bindings": [
        b(e="http://www.wikidata.org/entity/Q1", c="http://www.wikidata.org/entity/Q198", iso="MEX", f="1846-04-25T00:00:00Z", n="80", wp="Intervención estadounidense en México"),
        b(e="http://www.wikidata.org/entity/Q1", c="http://www.wikidata.org/entity/Q198", iso="MEX", f="1847-01-01T00:00:00Z", n="80", wp="Intervención estadounidense en México"),
        b(e="http://www.wikidata.org/entity/Q2", c="http://www.wikidata.org/entity/Q10931", iso="MEX", n="90", le="Mexican Revolution"),
        b(e="http://www.wikidata.org/entity/Q3", c="http://www.wikidata.org/entity/Q198", iso="XX", n="9", l="no"),
        b(e="http://www.wikidata.org/entity/Q4", c="http://www.wikidata.org/entity/Q198", iso="USA", n="9"),  # sin nombre
    ]}}
    out = H.filas_lista(r, clases=H.CLASES_CONFLICTO)
    assert list(out) == ["MEX"]
    assert out["MEX"][0] == ["Q2", "Mexican Revolution", "", "revolución", "", 90]  # ordenado por relevancia
    assert out["MEX"][1][2] == "1846-04-25T00:00:00Z"  # fecha más antigua
    org = H.filas_lista({"results": {"bindings": [b(e="http://www.wikidata.org/entity/Q1065", iso="MEX", f="1945-11-07T00:00:00Z", n="300", l="ONU")]}}, organismos=True)
    assert org == {"MEX": [["Q1065", "ONU", "1945-11-07T00:00:00Z", "", 300]]}
