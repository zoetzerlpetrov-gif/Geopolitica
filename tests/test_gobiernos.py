"""Capas de gobierno (Wikidata) y lugares religiosos: clasificación sin red."""
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "capas"))
import gobiernos as G  # noqa: E402
import lugares_religiosos as L  # noqa: E402


def b(**kw):
    return {k: {"value": v} for k, v in kw.items()}


def test_forma_principal_por_prioridad():
    assert G.forma_principal(["presidential system", "federal republic"]) == "presidencial"
    assert G.forma_principal(["constitutional monarchy", "parliamentary system"]) == "monarquia_constitucional"
    assert G.forma_principal(["one-party state", "socialist state", "unitary state"]) == "partido_unico"
    assert G.forma_principal(["Islamic republic", "presidential system"]) == "teocracia"
    assert G.forma_principal(["semi-presidential system"]) == "semipresidencial"
    assert G.forma_principal([]) == "otra"
    assert G.es_federal(["federal republic"]) and not G.es_federal(["unitary state"])


def test_alineacion_y_espectro():
    assert G.valor_alineacion("centre-left") == -1
    assert G.valor_alineacion("left-wing") == -2
    assert G.valor_alineacion("far-right") == 3
    assert G.valor_alineacion("centre-right") == 1
    assert G.valor_alineacion("big tent") == 0
    assert G.espectro_de({"alineaciones_en": ["centre-left", "left-wing"], "ideologias_en": []}, "presidencial") == "centroizquierda"
    assert G.espectro_de({"alineaciones_en": ["right-wing", "far-right"], "ideologias_en": []}, "parlamentaria") == "derecha"
    assert G.espectro_de({"alineaciones_en": ["far-right"], "ideologias_en": []}, "parlamentaria") == "extrema_derecha"
    assert G.espectro_de({"alineaciones_en": ["alt-right", "right-libertarianism"], "ideologias_en": []}, "presidencial") == "derecha"
    # Sin alineación: se estima con las ideologías.
    assert G.espectro_y_origen({"alineaciones_en": [], "ideologias_en": ["social democracy", "democratic socialism"]}, "presidencial") == ("centroizquierda", "ideología")
    assert G.espectro_de({"alineaciones_en": ["far-left politics", "left-wing"], "ideologias_en": ["communism"]}, "partido_unico") == "comunista"
    pcc = {"alineaciones_en": ["far-left"], "ideologias_en": ["communism", "socialism with Chinese characteristics"]}
    assert G.espectro_de(pcc, "partido_unico") == "comunista"
    assert G.espectro_de(pcc, "presidencial") == "extrema_izquierda"
    assert G.espectro_de(None, "monarquia_absoluta") == "sin_partido"
    assert G.espectro_de({"alineaciones_en": [], "ideologias_en": ["populism"]}, "presidencial") == "sin_dato"


def test_partido_vigente_e_inferencia_de_forma():
    sheinbaum = {"qid": "Q1", "partidos": ["PRD", "MORENA"], "inicio": {"MORENA": "2014-07-09T00:00:00Z"}}
    assert G.partido_vigente(sheinbaum) == "MORENA"
    burnham = {"qid": "Q2", "partidos": ["COOP", "LAB"], "inicio": {}}
    assert G.partido_vigente(burnham, {"LAB": {"alineaciones_en": ["centre-left"]}, "COOP": {}}) == "LAB"
    misma = {"estado": [{"qid": "Q9"}], "gobierno": [{"qid": "Q9"}]}
    assert G.inferir_forma("otra", ["constitutional republic"], misma, {"ideologias_en": ["conservatism"]}) == ("presidencial", True)
    pcc = {"ideologias_en": ["communism"]}
    assert G.inferir_forma("otra", ["people's republic"], {"estado": [{"qid": "A"}], "gobierno": [{"qid": "B"}]}, pcc) == ("partido_unico", True)
    assert G.inferir_forma("parlamentaria", ["parliamentary republic"], misma, pcc) == ("parlamentaria", False)
    assert G.forma_principal(["super-presidential republic"]) == "presidencial"


def test_corrientes():
    assert G.corrientes(["Marxism–Leninism"]) == ["comunista o marxista"]
    assert "socialista" in G.corrientes(["socialism"])
    assert "socialdemócrata" in G.corrientes(["social democracy"]) and "socialista" not in G.corrientes(["democratic socialism"])
    assert G.corrientes(["conservatism", "nationalism"]) == ["conservadora", "nacionalista"]


def test_features_gobierno_elige_quien_gobierna():
    formas = G.leer_formas({"results": {"bindings": [
        b(iso="GBR", pais="http://www.wikidata.org/entity/Q145", paisEs="Reino Unido", forma="http://www.wikidata.org/entity/Q41614", formaEn="constitutional monarchy", formaEs="monarquía constitucional"),
        b(iso="MEX", pais="http://www.wikidata.org/entity/Q96", paisEs="México", forma="http://www.wikidata.org/entity/Q1", formaEn="presidential system", formaEs="sistema presidencial"),
        b(iso="MEX", pais="http://www.wikidata.org/entity/Q96", forma="http://www.wikidata.org/entity/Q2", formaEn="federal republic", formaEs="república federal"),
    ]}})
    jefes = G.leer_jefes({"results": {"bindings": [
        b(iso="GBR", rol="estado", jefe="http://www.wikidata.org/entity/Q10", jefeNombre="Monarca"),
        b(iso="GBR", rol="gobierno", jefe="http://www.wikidata.org/entity/Q11", jefeNombre="Primer ministro", partido="http://www.wikidata.org/entity/P_LAB"),
        b(iso="MEX", rol="estado", jefe="http://www.wikidata.org/entity/Q12", jefeNombre="Presidenta", partido="http://www.wikidata.org/entity/P_MOR"),
        b(iso="MEX", rol="gobierno", jefe="http://www.wikidata.org/entity/Q12", jefeNombre="Presidenta", partido="http://www.wikidata.org/entity/P_MOR"),
    ]}})
    assert G.partidos_de(jefes) == ["P_LAB", "P_MOR"]
    partidos = G.leer_partidos({"results": {"bindings": [
        b(partido="http://www.wikidata.org/entity/P_LAB", partidoEs="Partido Laborista", alinEn="centre-left", ideoEn="social democracy", ideoEs="socialdemocracia"),
        b(partido="http://www.wikidata.org/entity/P_MOR", partidoEs="Morena", alinEn="left-wing", ideoEn="left-wing populism", ideoEs="populismo de izquierda"),
    ]}})
    paises = {"features": [
        {"type": "Feature", "geometry": {"type": "Polygon", "coordinates": []}, "properties": {"iso3": "GBR", "nombre": "Reino Unido"}},
        {"type": "Feature", "geometry": {"type": "Polygon", "coordinates": []}, "properties": {"iso3": "MEX", "nombre": "México"}},
        {"type": "Feature", "geometry": {"type": "Polygon", "coordinates": []}, "properties": {"iso3": "ATA", "nombre": "Antártida"}},
    ]}
    forma, orient = G.features_gobierno(paises, formas, jefes, partidos, "2026-10-09")
    assert [f["properties"]["p"] for f in forma] == ["GBR", "MEX"]
    gbr, mex = orient
    assert gbr["properties"]["st"] == "gobor_centroizquierda" and gbr["properties"]["gobierna"] == "gobierno"
    assert forma[0]["properties"]["st"] == "gobforma_monarquia_constitucional"
    assert mex["properties"]["st"] == "gobor_izquierda" and mex["properties"]["gobierna"] == "estado"
    assert forma[1]["properties"]["federal"] is True
    assert json.loads(mex["properties"]["corrientes"]) == ["populista"]


def test_lugares_religiosos():
    clase = ("Q2977", "Catedral", "cristianismo", 4)
    res = {"results": {"bindings": [
        b(x="http://www.wikidata.org/entity/Q2981", xEs="Catedral de Notre Dame", coord="Point(2.35 48.853)", n="120", relEn="Catholic Church", relEs="Iglesia católica", iso="FRA", patr="true"),
        b(x="http://www.wikidata.org/entity/Q9", xEn="Small cathedral", coord="Point(10 10)", n="6"),
        b(x="http://www.wikidata.org/entity/Q8", coord="sin coordenada", n="50"),
    ]}}
    reg = L.leer_clase(res, clase)
    assert set(reg) == {"Q2981", "Q9"}
    feat = lambda g, p, z: {"geometry": g, "properties": {**p, "z": z}}  # noqa: E731
    punto = lambda lon, lat: {"type": "Point", "coordinates": [lon, lat]}  # noqa: E731
    out = L.features_lugares(reg, feat, punto)
    nd = out[0]["properties"]
    assert nd["st"] == "culto_cristianismo" and nd["nivel"] == "muy_alta" and nd["z"] == 1 and "Patrimonio Mundial" in nd["x"]
    assert out[1]["properties"]["nivel"] == "media" and out[1]["properties"]["z"] == 6
    assert L.religion_de(["Sunni Islam"], None) == "islam"
    assert L.religion_de([], None) == "otras"
    assert L.nivel_de(20, False) == "alta"
