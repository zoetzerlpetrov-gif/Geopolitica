"""Relieve, placas tectónicas, Cinturón de Fuego, volcanes y empresas por sector (sin red)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "capas"))
import construir as C  # noqa: E402
import sitios as S  # noqa: E402


def test_cinturon_de_fuego_solo_pacifico():
    assert C.en_cinturon_fuego(142, 38, "PA-OK")            # Japón
    assert C.en_cinturon_fuego(-72, -33, "NZ-SA")           # Chile
    assert C.en_cinturon_fuego(-103, 18, "CO-NA")           # México (placa de Cocos)
    assert not C.en_cinturon_fuego(-61, 15, "CA-SA")        # Antillas Menores: Atlántico
    assert not C.en_cinturon_fuego(-26, -57, "SA-SC")       # Sandwich del Sur: Atlántico
    assert not C.en_cinturon_fuego(25, 36, "AF-AS")         # Mediterráneo


def test_relieve_mapea_clases_de_natural_earth():
    assert C.RELIEVE["valley"][0] == "valles" and C.RELIEVE["plateau"][0] == "mesetas" and C.RELIEVE["range/mtn"][0] == "cordilleras"
    assert C.PUNTOS_RELIEVE["mountain"][0] == "montes_picos"
    assert set(C.LIMITE.values()) == {"limite_subduccion", "limite_convergente", "limite_divergente", "limite_transformante"}


def test_sector_empresa():
    assert S.sector_empresa(["petroleum industry"]) == "emp_energia"
    assert S.sector_empresa(["automotive industry"]) == "emp_automotriz"
    assert S.sector_empresa(["hospitality industry"]) == "emp_hospitalidad"
    assert S.sector_empresa(["food industry", "beverage industry"]) == "emp_alimentos"
    assert S.sector_empresa(["banking"]) == "emp_finanzas"
    assert S.sector_empresa([], "Petróleos Mexicanos") == "emp_otros"     # «Petróleos» no es «petroleum»
    assert S.sector_empresa([], "Saudi Aramco Oil Company") == "emp_energia"
    assert S.sector_empresa([]) == "emp_otros"


def test_leer_y_features_empresas():
    fila = lambda ind: {"x": {"value": "http://www.wikidata.org/entity/Q1"}, "xEs": {"value": "Grupo Bimbo"}, "coord": {"value": "Point(-99.2 19.4)"},  # noqa: E731
                        "n": {"value": "35"}, "iso": {"value": "MEX"}, "sedeEs": {"value": "Ciudad de México"}, "indEn": {"value": ind}}
    reg = S.leer_empresas({"results": {"bindings": [fila("food industry"), fila("bakery")]}}, {}, 12)
    assert reg["Q1"]["industrias"] == ["food industry", "bakery"]
    f = S.features_empresas(reg, C.feat, C.punto)[0]
    assert f["properties"]["st"] == "emp_alimentos" and f["properties"]["p"] == "MEX" and f["properties"]["z"] == 4
    assert "sede en Ciudad de México" in f["properties"]["x"]
