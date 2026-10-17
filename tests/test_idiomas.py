"""Idiomas por país (Unicode CLDR): nombres, orden, umbral y estatus oficial."""
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "idiomas"))
import idiomas as I  # noqa: E402

ES = {"es": "español", "en": "inglés", "ms": "malayo"}
ISO = {"nhe": "Eastern Huasteca Nahuatl", "kjb": "Q'anjob'al"}


def test_nombres_iso6393_con_comillas_simples_y_dobles():
    texto = "[{\n name: 'Seri',\n iso6393: 'sei'\n },{\n name: \"Q'anjob'al\",\n type: 'living',\n iso6393: 'kjb'\n }]"
    assert I.nombres_iso6393(texto) == {"sei": "Seri", "kjb": "Q'anjob'al"}


def test_nombre_idioma_prefiere_espanol_luego_mexico_luego_iso():
    assert I.nombre_idioma("es", ES, ISO) == "español"
    assert I.nombre_idioma("nhe", ES, ISO) == "náhuatl de la Huasteca oriental"
    assert I.nombre_idioma("kjb", ES, ISO) == "Q'anjob'al"
    assert I.nombre_idioma("ms_Arab", ES, ISO) == "malayo (escritura árabe)"
    assert I.nombre_idioma("xyz", ES, ISO) == "xyz"


def test_idiomas_ordenados_umbral_y_oficiales():
    t = {"languagePopulation": {"en": {"_populationPercent": "13"}, "es": {"_populationPercent": "83", "_officialStatus": "de_facto_official"},
                                "nhe": {"_populationPercent": "0.39"}, "sei": {"_populationPercent": "0.0007"},
                                "xx": {"_populationPercent": "0.01", "_officialStatus": "official_regional"}, "und": {"_populationPercent": "1"}}}
    lista = I.idiomas_de(t, ES, ISO)
    assert [x["codigo"] for x in lista] == ["es", "en", "nhe", "xx"]
    assert lista[0]["estatus"] == "oficial de hecho" and lista[-1]["estatus"] == "oficial en una región"


def test_construir_un_poligono_por_pais_con_principal():
    geo = {"features": [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [0, 0]}, "properties": {"iso3": "MEX", "nombre": "México"}},
                        {"type": "Feature", "geometry": {"type": "Point", "coordinates": [0, 0]}, "properties": {"iso3": "XKX", "nombre": "Kosovo"}}]}
    terr = {"MX": {"_population": "130740000", "languagePopulation": {"es": {"_populationPercent": "83", "_officialStatus": "de_facto_official"}}}}
    feats, sin = I.construir(geo, terr, {"MX": "MEX"}, ES, ISO)
    assert len(feats) == 1 and sin == ["Kosovo"]
    p = feats[0]["properties"]
    assert p["principal"] == "es" and p["oficiales"] == ["español"] and p["poblacion"] == 130740000
