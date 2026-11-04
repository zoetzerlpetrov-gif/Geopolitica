"""Elecciones (Wikidata): tipo, regla para ganar, estado y las 24 horas de resultado."""
import json
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "tools", "elecciones")))
import elecciones as E  # noqa: E402

AHORA = datetime(2026, 11, 4, 12, tzinfo=timezone.utc)


def fila(qid, iso, fecha, nombre, tipo_en, ganador=None):
    b = {"e": {"value": f"http://www.wikidata.org/entity/{qid}"}, "iso": {"value": iso}, "fecha": {"value": f"{fecha}T00:00:00Z"},
         "nombreEs": {"value": nombre}, "nombreEn": {"value": nombre}, "tipoEn": {"value": tipo_en}}
    if ganador:
        b["ganadorEs"] = {"value": ganador}
    return b


def leer_falso(filas, cand):
    def leer(url):
        datos = cand if "P726" in __import__("urllib.parse").parse.unquote(url) else filas
        return json.dumps({"results": {"bindings": datos}}).encode()
    return leer


def test_tipos_reglas_y_estados(tmp_path, monkeypatch):
    monkeypatch.setattr(E, "OUT", str(tmp_path / "e.json"))
    monkeypatch.setattr(E, "ESTADO", str(tmp_path / "s.json"))
    filas = [fila("Q1", "USA", "2026-11-03", "2026 United States House of Representatives elections", "legislative election"),
             fila("Q2", "CHL", "2026-11-15", "Elección presidencial de Chile", "presidential election"),
             fila("Q3", "BRA", "2026-10-25", "Eleição presidencial", "presidential election", ganador="Persona X"),
             fila("Q4", "XXX", "2026-11-10", "País inexistente", "election")]
    cand = [{"e": {"value": "http://www.wikidata.org/entity/Q2"}, "cEs": {"value": "Candidata A"}},
            {"e": {"value": "http://www.wikidata.org/entity/Q2"}, "cEn": {"value": "Q999"}}]
    E.construir(AHORA, leer=leer_falso(filas, cand))
    d = {e["id"]: e for e in json.load(open(E.OUT, encoding="utf-8"))["elecciones"]}
    assert set(d) == {"Q1", "Q2", "Q3"}
    assert d["Q1"]["estado"] == "conteo" and d["Q1"]["tipo"] == "legislativa" and "218" in d["Q1"]["regla"]
    assert d["Q2"]["estado"] == "proxima" and "Más de la mitad" in d["Q2"]["regla"] and d["Q2"]["candidatos"] == ["Candidata A"]
    assert d["Q3"]["estado"] == "resultado" and d["Q3"]["mostrar_hasta_utc"] == "2026-11-05T12:00:00Z"
    # Al día siguiente el ganador sigue «visto» desde la primera vez: no se reinician las 24 h.
    E.construir(AHORA + timedelta(hours=10), leer=leer_falso(filas, cand))
    d2 = {e["id"]: e for e in json.load(open(E.OUT, encoding="utf-8"))["elecciones"]}
    assert d2["Q3"]["mostrar_hasta_utc"] == "2026-11-05T12:00:00Z"


def test_regla_general_si_no_hay_pais():
    r = json.load(open(E.REGLAS, encoding="utf-8"))
    assert E.regla(r, "ZZZ", "referendum").startswith("Se aprueba")
    assert E.tipo_de("2026 Brazilian general election", "") == "legislativa"
    assert E.tipo_de("referendum on X", "") == "referendum"
    assert E.es_nacional("2026 New Zealand general election", None, "New Zealand", "2026-11-07")
    assert not E.es_nacional("2026 Ontario municipal elections", None, "Canada", "2026-10-26")
    assert not E.es_nacional("2026 United States Senate election in South Dakota", None, "United States", "2026-11-03")
    assert not E.es_nacional("2026 Utah House of Representatives election", None, "United States", "2026-11-03")
    assert not E.es_nacional("second round of Brazilian presidential election, 2022", None, "Brazil", "2026-10-25")
