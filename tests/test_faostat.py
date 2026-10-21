import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "capas"))

import faostat as FA  # noqa: E402

PAISES = {"features": [{"geometry": {"type": "Point", "coordinates": [0, 0]}, "properties": {"iso3": "MEX", "nombre": "México"}},
                       {"geometry": {"type": "Point", "coordinates": [1, 1]}, "properties": {"iso3": "CHN", "nombre": "China"}}]}


def fila(m49, item, codigo, anio, valor, elemento="Production", unidad="t"):
    return {"Area Code (M49)": f"'{m49}", "Item": item, "Item Code": str(codigo), "Element": elemento, "Unit": unidad, "Year": str(anio), "Value": str(valor)}


def test_cultivos_ultimo_anio_top_y_grupo():
    m49 = FA.tabla_m49()
    assert m49["484"] == "MEX" and m49["156"] == "CHN"
    filas = [fila("484", "Sugar cane", 156, 2023, 55e6), fila("484", "Maize (corn)", 56, 2023, 27e6),
             fila("484", "Cereals, primary", 1717, 2023, 40e6),            # agregado: se ignora
             fila("484", "Maize (corn)", 56, 2022, 99e6),                  # año anterior: se ignora
             fila("484", "Sugar cane", 156, 2023, 1, elemento="Area harvested", unidad="ha"),
             fila("156", "Rice", 27, 2024, 2e8)]
    d = FA.leer_cultivos(filas, m49)
    assert d["MEX"]["anio"] == 2023 and [n for n, _ in d["MEX"]["productos"]] == ["Sugar cane", "Maize (corn)"]
    fs = FA.features_cultivos(PAISES, d)
    mx = next(f["properties"] for f in fs if f["properties"]["p"] == "MEX")
    assert mx["st"] == "cultivo_cana" and "Caña de azúcar 55.0 millones de t" in mx["x"] and "Maíz" in mx["x"]
    assert next(f["properties"]["st"] for f in fs if f["properties"]["p"] == "CHN") == "cultivo_cereales"


def test_acuicultura_total_y_especies():
    cant = [{"COUNTRY.UN_CODE": "484", "SPECIES.ALPHA_3_CODE": "PNV", "MEASURE": "Q_tlw", "PERIOD": "2023", "VALUE": "200000"},
            {"COUNTRY.UN_CODE": "484", "SPECIES.ALPHA_3_CODE": "TLP", "MEASURE": "Q_tlw", "PERIOD": "2023", "VALUE": "50000"},
            {"COUNTRY.UN_CODE": "484", "SPECIES.ALPHA_3_CODE": "PNV", "MEASURE": "Q_tlw", "PERIOD": "2022", "VALUE": "999999"},
            {"COUNTRY.UN_CODE": "484", "SPECIES.ALPHA_3_CODE": "PNV", "MEASURE": "V_USD_1000", "PERIOD": "2023", "VALUE": "5"}]
    paises = [{"UN_Code": "484", "ISO3_Code": "MEX"}]
    especies = [{"3A_Code": "PNV", "Name_Es": "Camarón patiblanco"}, {"3A_Code": "TLP", "Name_Es": "Tilapia"}]
    d = FA.leer_acuicultura(cant, paises, especies)
    assert d["MEX"]["anio"] == 2023 and d["MEX"]["total"] == 250000
    f = FA.features_acuicultura(PAISES, d)[0]["properties"]
    assert f["st"] == "acuicultura_4" and "Camarón patiblanco" in f["x"] and "Tilapia" in f["x"]


def test_catalogo_tiene_los_subtipos():
    cat = json.load(open(os.path.join(os.path.dirname(__file__), "..", "config", "entities.json"), encoding="utf-8"))
    sub = {s["id"]: s for c in cat["categorias"] for s in c.get("subtipos", [])}
    for st, _, color, _ in FA.GRUPOS:
        assert sub[st]["familia"] == "cultivos_pais" and sub[st]["color"] == color
    for st, _, _, color in FA.ACUICULTURA:
        assert sub[st]["familia"] == "acuicultura_pais" and sub[st]["color"] == color
