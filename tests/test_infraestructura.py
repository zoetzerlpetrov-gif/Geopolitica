import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "capas"))

import redes as R  # noqa: E402
import sitios as S  # noqa: E402


def feat(geom, props, z):
    return {"type": "Feature", "geometry": geom, "properties": {**props, "z": z}}


def punto(lon, lat):
    return {"type": "Point", "coordinates": [lon, lat]}


def test_zoom_de_escala():
    assert R.zoom_de_escala(3) == 2 and R.zoom_de_escala(4) == 2
    assert R.zoom_de_escala(8) == 5 and R.zoom_de_escala(10) == 7
    assert R.zoom_de_escala(None) == 6


def test_tramos_parte_multilineas():
    multi = {"type": "MultiLineString", "coordinates": [[[0, 0], [1, 1]], [[2, 2]], [[3, 3], [4, 4.123456]]]}
    t = R.tramos(multi)
    assert [x["type"] for x in t] == ["LineString", "LineString"]  # el tramo de un solo punto se descarta
    assert t[1]["coordinates"][1] == [4, 4.1235]
    assert R.tramos({"type": "Point", "coordinates": [0, 0]}) == []


def test_ferrocarriles_por_electrificacion():
    fc = {"features": [
        {"properties": {"featurecla": "Railroad", "electric": 1, "mult_track": 1, "scalerank": 4}, "geometry": {"type": "LineString", "coordinates": [[0, 0], [1, 0]]}},
        {"properties": {"featurecla": "Railroad", "electric": 0, "mult_track": 0, "scalerank": 10}, "geometry": {"type": "LineString", "coordinates": [[0, 0], [1, 0]]}},
        {"properties": {"featurecla": "Railroad ferry", "scalerank": 6}, "geometry": {"type": "LineString", "coordinates": [[0, 0], [1, 0]]}},
        {"properties": {"featurecla": None}, "geometry": {"type": "LineString", "coordinates": [[0, 0], [1, 0]]}},
    ]}
    fs = R.features_ferrocarriles(fc, feat, lambda lon, lat: "MEX")
    assert [f["properties"]["st"] for f in fs] == ["ferrocarril_electrificado", "ferrocarril_sin_electrificar", "ferrocarril_transbordador"]
    assert fs[0]["properties"]["x"] == "vía doble o múltiple" and fs[0]["properties"]["z"] == 2
    assert fs[0]["properties"]["p"] == "MEX"


def test_autopistas_solo_troncales():
    lin = {"type": "LineString", "coordinates": [[0, 0], [1, 0]]}
    fc = {"features": [
        {"properties": {"featurecla": "Road", "type": "Major Highway", "expressway": 1, "name": "57D", "toll": 1, "sov_a3": "MEX", "scalerank": 3}, "geometry": lin},
        {"properties": {"featurecla": "Road", "type": "Major Highway", "expressway": 0, "name": None, "sov_a3": "USA", "level": "Interstate", "scalerank": 5}, "geometry": lin},
        {"properties": {"featurecla": "Road", "type": "Secondary Highway", "expressway": 0, "scalerank": 7}, "geometry": lin},
        {"properties": {"featurecla": "Ferry", "type": "Ferry Route", "expressway": 0}, "geometry": lin},
    ]}
    fs = R.features_autopistas(fc, feat)
    assert [f["properties"]["st"] for f in fs] == ["autopista", "carretera_troncal"]
    assert fs[0]["properties"]["n"] == "57D" and fs[0]["properties"]["x"] == "de cuota"
    assert fs[1]["properties"]["x"] == "Interstate"


def _fila(q, nombre, wkt, n, **extra):
    f = {"x": {"value": f"http://www.wikidata.org/entity/{q}"}, "coord": {"value": wkt}, "n": {"value": str(n)}}
    if nombre:
        f["xEs"] = {"value": nombre}
    for k, v in extra.items():
        f[k] = {"value": v}
    return f


def test_sitios_une_filas_y_descarta_sin_nombre():
    res = {"results": {"bindings": [
        _fila("Q1", "Laguna Verde", "Point(-96.40 19.72)", 20, iso="MEX", estEn="in use", estEs="en uso", opEs="CFE"),
        _fila("Q1", "Laguna Verde", "Point(-96.40 19.72)", 20, iso="MEX", opEs="Comisión Federal de Electricidad"),
        _fila("Q2", None, "Point(1 1)", 5),
        _fila("Q3", "Fuera", "Point(500 1)", 5),
    ]}}
    regs = S.leer(res, ("Q134447", "nuclear_operacion", 3, "lugar", 4))
    assert list(regs) == ["Q1"]
    assert regs["Q1"]["operador"] == ["CFE", "Comisión Federal de Electricidad"]
    fs = S.features(regs, feat, punto, S.subtipo_nuclear)
    p = fs[0]["properties"]
    assert p["id"] == "wd:Q1" and p["st"] == "nuclear_operacion" and p["p"] == "MEX"
    assert "opera: CFE" in p["x"] and "20 Wikipedias" in p["x"]
    assert p["z"] == 3  # ≥ 12 Wikipedias: un nivel antes


def test_subtipo_nuclear_por_estado():
    base = {"estado_en": []}
    assert S.subtipo_nuclear({**base, "estado_en": ["decommissioned"]}) == "nuclear_cerrada"
    assert S.subtipo_nuclear({**base, "estado_en": ["under construction"]}) == "nuclear_construccion"
    assert S.subtipo_nuclear(base) == "nuclear_operacion"


def test_sede_de_empresa():
    res = {"results": {"bindings": [_fila("Q9", "Pfizer", "Point(-73.97 40.75)", 60, iso="USA", sedeEs="Nueva York")]}}
    regs = S.leer(res, ("Q19644607", "farma_sede", 5, "sede", 5))
    p = S.features(regs, feat, punto)[0]["properties"]
    assert p["st"] == "farma_sede" and p["x"].startswith("sede en Nueva York") and p["z"] == 3


def test_densidad_por_rangos():
    import indicadores as I
    paginas = [[{"page": 1}, [{"countryiso3code": "MEX", "value": 66.4, "date": "2023"}, {"countryiso3code": "", "value": 5, "date": "2023"},
                              {"countryiso3code": "BGD", "value": 1329.0, "date": "2022"}, {"countryiso3code": "MNG", "value": None, "date": "2023"}]]]
    v = I.leer_api(paginas)
    assert v == {"MEX": (66.4, "2023"), "BGD": (1329.0, "2022")}
    paises = {"features": [{"geometry": {"type": "Polygon", "coordinates": []}, "properties": {"iso3": "MEX", "nombre": "México"}},
                           {"geometry": {"type": "Polygon", "coordinates": []}, "properties": {"iso3": "BGD", "nombre": "Bangladés"}},
                           {"geometry": {"type": "Polygon", "coordinates": []}, "properties": {"iso3": "MNG", "nombre": "Mongolia"}}]}
    fs = I.features_indicador(paises, v, I.DENSIDAD, "dens", lambda x: f"{I.num(x, 1)} hab/km²")
    assert [(f["properties"]["p"], f["properties"]["st"]) for f in fs] == [("MEX", "densidad_3"), ("BGD", "densidad_6")]
    assert fs[0]["properties"]["x"] == "66.4 hab/km² (2023)" and fs[1]["properties"]["color"] == "#7a1022"
