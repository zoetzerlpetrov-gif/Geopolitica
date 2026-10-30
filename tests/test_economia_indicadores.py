"""Sección Economía (tools/economia/pulso_economico.py, config/economia.json, economia.html): lectores sin red, conservación y catálogo."""
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "economia"))
import catalogo_economia as C  # noqa: E402
import pulso_economico as E  # noqa: E402


def test_catalogo_generado_y_completo():
    cfg = json.load(open(os.path.join(ROOT, "config", "economia.json"), encoding="utf-8"))
    assert cfg == json.loads(json.dumps(C.construir(), ensure_ascii=False)), "config/economia.json se genera con tools/economia/catalogo_economia.py"
    ids = [i["id"] for i in cfg["indicadores"] + cfg["derivados"]]
    assert len(ids) == len(set(ids))
    for i in cfg["indicadores"]:
        assert i["region"] in ("MX", "US", "EU", "GL") and i["grupo"] in ("macro", "consumo", "curioso")
        assert i["lectura"] in ("sube_bien", "sube_mal", "neutral") and i["confiabilidad"] in ("oficial", "aproximacion")
        assert i["que_mide"] and i["unidad"] and i["fuente"]["tipo"] in ("fred", "eurostat", "inegi", "banxico", "bigmac", "gscpi")
    for d in cfg["derivados"]:
        assert d["a"] in ids and d["b"] in ids
    nombres = " ".join(x["nombre"] for x in cfg["sin_datos"])
    assert "Báltico" in nombres and "faldas" in nombres and "rascacielos" in nombres.lower()


def test_sin_llaves_en_el_catalogo():
    texto = open(os.path.join(ROOT, "config", "economia.json"), encoding="utf-8").read().lower()
    assert "token" not in texto and "api_key" not in texto


def test_lectores():
    assert E.leer_fred("DATE,X\n2026-08-01,4.2\n2026-09-01,.\n") == [("2026-08-01", 4.2)]
    js = {"dimension": {"time": {"category": {"index": {"2026-08": 0, "2026-09": 1, "2026-Q3": 2}}}}, "value": {"0": 6.1, "1": 6.2, "2": 0.5}}
    assert E.leer_eurostat(js) == [("2026-08-01", 6.1), ("2026-09-01", 6.2), ("2026-07-01", 0.5)]
    bx = {"bmx": {"series": [{"datos": [{"fecha": "01/08/2026", "dato": "5,452.33"}, {"fecha": "01/09/2026", "dato": "N/E"}]}]}}
    assert E.leer_banxico(bx) == [("2026-08-01", 5452.33)]
    ine = {"Series": [{"OBSERVATIONS": [{"TIME_PERIOD": "2026/02", "OBS_VALUE": "18155564", "COBER_GEO": "0"},
                                        {"TIME_PERIOD": "2026/01", "OBS_VALUE": "1", "COBER_GEO": "07"}]}]}
    assert E.leer_inegi(ine) == [("2026-02-01", 18155564.0)]
    assert E.leer_inegi(ine, trimestral=True) == [("2026-04-01", 18155564.0)], "2.º trimestre empieza en abril"
    csv = "date,iso_a3,USD_raw,dollar_price\n2026-07-01,MEX,0.00794,6.27\n2026-07-01,USA,0,6.22\n"
    assert E.leer_bigmac(csv, "MEX") == [("2026-07-01", 0.79)]
    assert E.leer_bigmac(csv, "USA", "dollar_price") == [("2026-07-01", 6.22)]


def test_transformaciones():
    pts = [("2025-09-01", 100.0), ("2026-08-01", 102.0), ("2026-09-01", 103.0)]
    assert E.anual(pts) == [("2026-09-01", 3.0)]
    assert E.mensual([("2026-09-02", 1), ("2026-09-30", 2), ("2026-10-01", 3)]) == [("2026-09-30", 2), ("2026-10-01", 3)]
    assert E.derivar("cociente", [("2026-08-01", 91882)], [("2026-08-01", 76783)]) == [("2026-08-01", 1.1966)]
    assert E.derivar("suma", [("2026-09-01", 4.2)], [("2026-09-01", 2.9)]) == [("2026-09-01", 7.1)]


class Falsa:
    def __init__(self, falla=()):
        self.falla = set(falla)

    def serie(self, f):
        if f.get("id") in self.falla or f.get("dataset") in self.falla:
            raise TimeoutError("sin respuesta")
        return [("2025-09-01", 100.0), ("2026-08-01", 101.0), ("2026-09-01", 102.0)]


def test_si_una_fuente_falla_se_conserva_su_ultimo_dato():
    cfg = {"indicadores": [{"id": "a", "fuente": {"tipo": "fred", "id": "UNRATE"}, "frecuencia": "mensual"},
                           {"id": "b", "fuente": {"tipo": "fred", "id": "CPIAUCSL"}, "frecuencia": "mensual", "transform": "anual"}],
           "derivados": [{"id": "c", "operacion": "suma", "a": "a", "b": "b"}]}
    previo = {"indicadores": [{"id": "b", "puntos": [["2026-07-01", 2.5]], "actualizado_utc": "2026-10-01T00:00:00Z"}]}
    res = E.construir(cfg, previo, Falsa(falla={"CPIAUCSL"}), pausa=0)
    por = {i["id"]: i for i in res["indicadores"]}
    assert por["a"]["puntos"][-1] == ("2026-09-01", 102.0) and "error" not in por["a"]
    assert por["b"]["conservado"] and por["b"]["puntos"] == [["2026-07-01", 2.5]] and "TimeoutError" in por["b"]["error"]
    assert any(e.startswith("b:") for e in res["errores"])


def test_pagina_solo_admin_y_publicada():
    planes = json.load(open(os.path.join(ROOT, "config", "planes.json"), encoding="utf-8"))
    assert any(x.get("href") == "economia.html" for x in planes["solo_admin"])
    pages = open(os.path.join(ROOT, ".github", "workflows", "pages.yml"), encoding="utf-8").read()
    assert "economia.html" in pages and "datos-economia" in pages
    wf = open(os.path.join(ROOT, ".github", "workflows", "economia.yml"), encoding="utf-8").read()
    assert "secrets.INEGI_TOKEN" in wf and "secrets.BANXICO_API_KEY" in wf and "cron:" in wf
    procesos = json.load(open(os.path.join(ROOT, "config", "procesos.json"), encoding="utf-8"))
    assert any(p["workflow"] == "economia.yml" for p in procesos["workflows"])
    html = open(os.path.join(ROOT, "economia.html"), encoding="utf-8").read()
    assert "pulsociudadano" not in html.lower(), "no depende de Pulso Ciudadano"
