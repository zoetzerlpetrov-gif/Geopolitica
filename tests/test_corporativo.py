"""Mundo corporativo: categorías de los titulares, ubicación (titular, sede, medio), catálogo de empresas y organigrama."""
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "tools", "corporativo")))
import corporativo as C  # noqa: E402
import empresas as E  # noqa: E402
from geo import Gazetteer  # noqa: E402

G = Gazetteer()
AHORA = datetime(2026, 11, 5, 12, tzinfo=timezone.utc)
CATALOGO = {"empresas": [
    {"id": "Q312", "n": "Apple", "en": "Apple Inc.", "pais": "USA", "ind_en": "consumer electronics software", "s": 200},
    {"id": "Q7414", "n": "The Walt Disney Company", "en": "The Walt Disney Company", "pais": "USA", "ind_en": "mass media entertainment", "s": 150, "al": ["Disney"]},
    {"id": "Q1132403", "n": "Grupo Bimbo", "en": "Grupo Bimbo, S.A.B. de C.V.", "pais": "MEX", "ind_en": "food industry", "s": 40},
]}

RSS = b"""<?xml version="1.0"?><rss><channel>
<item><title>Nissan cierra planta en M\xc3\xa9xico y despide a 2,000 trabajadores</title><link>https://ejemplo.org/a</link><pubDate>Wed, 04 Nov 2026 10:00:00 +0000</pubDate><description>texto largo que no se guarda</description></item>
<item><title>Grupo Bimbo names new CEO</title><link>https://ejemplo.org/b</link><pubDate>Wed, 04 Nov 2026 09:00:00 +0000</pubDate></item>
<item><title>Interest rates expected to rise for first time in three years</title><link>https://ejemplo.org/c</link><pubDate>Wed, 04 Nov 2026 09:00:00 +0000</pubDate></item>
<item><title>Podcast: the best stocks to buy now</title><link>https://ejemplo.org/d</link><pubDate>Wed, 04 Nov 2026 09:00:00 +0000</pubDate></item>
<item><title>Startup files for Chapter 11 bankruptcy</title><link>https://ejemplo.org/e</link><pubDate>Wed, 04 Nov 2026 09:00:00 +0000</pubDate></item>
<item><title>Nota vieja: fusi\xc3\xb3n de bancos</title><link>https://ejemplo.org/f</link><pubDate>Mon, 01 Sep 2026 09:00:00 +0000</pubDate></item>
</channel></rss>"""


def test_categorias():
    assert C.categorias_de("Disney planea miles de despidos para recortar costos")[:1] == ["despidos"]
    assert C.categorias_de("Startup files for Chapter 11 bankruptcy") == ["quiebra"]
    assert "fusiones" in C.categorias_de("Mitsui Chemicals to buy Japan chip material maker JSR for $8.2bn")
    assert "directivos" in C.categorias_de("At Home taps former CFO as new chief executive")
    assert "competencia" in C.categorias_de("La COFECE investiga prácticas monopólicas en el mercado de gas")
    assert "fraude" in C.categorias_de("Former executive charged with accounting fraud")
    assert C.categorias_de("Interest rates expected to rise for first time in three years") == []
    assert C.categorias_de("Podcast: the best stocks to buy now") == []
    # Un lanzamiento del gobierno no es una marca; un lanzamiento de producto sí.
    assert "marca" not in C.categorias_de("Beijing launches barrage of measures to stabilise stock market")
    assert "marca" in C.categorias_de("Toyota launches new electric model in Europe")


def test_empresas_y_ubicacion():
    emp = C.Empresas(CATALOGO)
    assert C.nombre_corto("Grupo Bimbo, S.A.B. de C.V.") == "Grupo Bimbo" and C.nombre_corto("Apple Inc.") == "Apple"
    assert emp.en("Disney planeja milhares de demissões")[0][0] == "Q7414"
    # «apple» es palabra común: solo cuenta con mayúscula y no al inicio del titular.
    assert emp.en("Shares of Apple fall after earnings") == [("Q312", "Apple")]
    assert emp.en("apple growers face tariffs") == []
    n = C.nota("Disney planeja milhares de demissões", "Folha", "https://x.org/1", "2026-11-04T10:00:00Z", G, emp, pais_medio="BRA")
    assert n["paises"] == ["USA"] and n["ubic"] == "sede"  # la sede gana al país del medio
    n = C.nota("Nissan cierra planta en México", "Medio", "https://x.org/2", "2026-11-04T10:00:00Z", G, emp, pais_medio="ESP")
    assert n["paises"][0] == "MEX" and n["ubic"] == "titular"
    n = C.nota("Startup files for Chapter 11 bankruptcy", "Medio", "https://x.org/3", "2026-11-04T10:00:00Z", G, emp, pais_medio="IND")
    assert n["paises"] == ["IND"] and n["ubic"] == "medio"
    n = C.nota("S&amp;P upgrades Grupo Bimbo credit rating", "Medio", "https://x.org/4", "2026-11-04T10:00:00Z", G, emp)
    assert n["t"].startswith("S&P") and n["sectores"] == ["alimentos"]  # sector por la industria de la empresa


def test_construir(tmp_path, monkeypatch):
    monkeypatch.setattr(C, "OUT", str(tmp_path / "c.geojson"))
    monkeypatch.setattr(C, "ESTADO", str(tmp_path / "e.json"))
    (tmp_path / "emp.json").write_text(json.dumps(CATALOGO), encoding="utf-8")
    monkeypatch.setattr(C, "EMPRESAS", str(tmp_path / "emp.json"))
    C.construir(AHORA, leer=lambda u: RSS, permitido=lambda u: True, pausa=0, feeds=[("Medio", "https://ejemplo.org/feed", "es", None)])
    d = json.load(open(C.OUT, encoding="utf-8"))
    claves = {(f["properties"]["iso3"], f["properties"]["cat"]) for f in d["features"]}
    assert ("MEX", "despidos") in claves and ("MEX", "operaciones") in claves and ("MEX", "directivos") in claves
    assert d["sin_pais"] == 1 and d["total_notas"] == 3  # sin la nota vieja, la de tasas ni el podcast
    # Cada categoría de un país en su propio punto: no se enciman.
    mex = [f["geometry"]["coordinates"] for f in d["features"] if f["properties"]["iso3"] == "MEX"]
    assert len(mex) == len(set(map(tuple, mex)))
    bimbo = next(f["properties"] for f in d["features"] if f["properties"]["cat"] == "directivos")
    assert bimbo["empresas"][0][1] == "Q1132403" and bimbo["por_sede"] == 1
    assert "texto largo" not in open(C.ESTADO, encoding="utf-8").read()  # nunca el texto de la nota


def b(**kw):
    return {k: {"value": v} for k, v in kw.items()}


def test_catalogo_empresas(tmp_path, monkeypatch):
    monkeypatch.setattr(E, "OUT", str(tmp_path / "emp.json"))
    W = "http://www.wikidata.org/entity/"
    respuestas = {
        "base": [b(e=W + "Q1", s="40", les="Cemex", len="Cemex", iso="MEX", cik="1076378"), b(e=W + "Q2", s="9", len="Q2")],
        "extra": [b(e=W + "Q1", indEn="building materials", indEs="materiales de construcción", sede="San Pedro Garza García", web="https://www.cemex.com")],
        "alias": [b(e=W + "Q1", al="Cementos Mexicanos"), b(e=W + "Q1", al="CX")],
        "bolsas": [b(e=W + "Q1", bolsa="Mexican Stock Exchange", tick="CEMEXCPO"), b(e=W + "Q1", bolsa="New York Stock Exchange", tick="CX")],
        "P169": [b(e=W + "Q1", v=W + "Q10", les="Fernando González Olivieri", hum="1", vs="3")],
        "P127": [b(e=W + "Q1", v=W + "Q20", len="Fondo X", parte="0.051")],
    }

    def consulta(q):
        if "?s ?les ?len ?iso" in q:
            return respuestas["base"]
        if "?indEs" in q:
            return respuestas["extra"]
        if "?al " in q:
            return respuestas["alias"]
        if "?bolsa" in q:
            return respuestas["bolsas"]
        for p in ("P169", "P127"):
            if f"p:{p} " in q:
                return respuestas[p]
        if "p:P3320 " in q:
            raise TimeoutError
        return []

    E.construir(AHORA, consulta=consulta, pausa=0)
    d = json.load(open(E.OUT, encoding="utf-8"))
    assert [e["id"] for e in d["empresas"]] == ["Q1"]  # sin nombre legible no entra
    e = d["empresas"][0]
    assert e["ceo"] == [["Fernando González Olivieri", "Q10", "", 1]]
    assert e["duenos"] == [["Fondo X", "Q20", "5.1 %", 0]]
    assert e["bolsas"] == [["Mexican Stock Exchange", "CEMEXCPO"], ["New York Stock Exchange", "CX"]]
    assert e["ind"] == "materiales de construcción" and e["web"] == "https://www.cemex.com"
    assert e["al"] == ["Cementos Mexicanos"]  # la clave de cotización no sirve de alias
    assert d["fuentes"]["consejo"].startswith("error")
    # Solo nombre, cargo e identificador de cada persona: ningún otro dato personal.
    assert set(json.dumps(e["ceo"])) and len(e["ceo"][0]) == 4
