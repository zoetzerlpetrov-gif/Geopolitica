"""Constructor de capas estáticas: conversión de los cables submarinos de TeleGeography."""
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "capas"))
import construir as c  # noqa: E402


def test_cables_y_aterrizajes():
    cables = {"features": [
        {"type": "Feature", "properties": {"id": "marea", "name": "MAREA"},
         "geometry": {"type": "MultiLineString", "coordinates": [[[-2.123456, 43.3], [-75.1, 36.9]]]}},
        {"type": "Feature", "properties": {"id": "sin-geo"}, "geometry": None},
    ]}
    aterrizajes = {"features": [
        {"type": "Feature", "properties": {"id": "bilbao-spain", "name": "Bilbao, Spain"}, "geometry": {"type": "Point", "coordinates": [-2.9, 43.3]}},
    ]}
    out = c.cables_de_geojson(cables, aterrizajes)
    assert [f["properties"]["st"] for f in out] == ["cables_submarinos", "aterrizajes_cable"]
    assert out[0]["properties"]["id"] == "tgc:marea" and out[0]["properties"]["z"] == 0
    assert out[0]["geometry"]["coordinates"][0][0] == [-2.1235, 43.3]
    assert out[1]["properties"]["id"] == "tgl:bilbao-spain" and out[1]["properties"]["z"] == 4


def test_cables_tiene_constructor_y_esta_habilitada():
    import json
    cfg = json.load(open(os.path.join(ROOT, "config", "capas.json"), encoding="utf-8"))
    fam = next(f for f in cfg["familias"] if f["id"] == "cables")
    assert fam["habilitada"] and "cables" in c.FAMILIAS


def test_camaras_solo_enlace_y_con_revision():
    out = c.camaras(revisar=lambda url: "ok", externas=False)
    assert out and all(f["properties"]["x"].startswith("https://") for f in out)
    assert all(f["properties"]["t"] in ("organismo_publico", "operador_turistico") for f in out)
    assert all(f["properties"]["v"].startswith("ok (") for f in out)
    import json
    cat = json.load(open(os.path.join(ROOT, "config", "entities.json"), encoding="utf-8"))
    subtipos = {s["id"] for k in cat["categorias"] if k["id"] == "camaras" for s in k["subtipos"]}
    assert {f["properties"]["st"] for f in out} <= subtipos


def test_enlace_responde_respeta_robots():
    assert c.enlace_responde("https://x.org/cam", robots=lambda u: "User-agent: *\nDisallow: /cam", abrir=lambda u: b"") == "robots.txt no permite revisarlo"
    assert c.enlace_responde("https://x.org/cam", robots=lambda u: "", abrir=lambda u: b"") == "ok"


DT = {"type": "FeatureCollection", "features": [
    {"type": "Feature", "id": "C01502", "geometry": {"type": "Point", "coordinates": [24.7, 60.2, 0]},
     "properties": {"id": "C01502", "name": "vt1_Espoo_Hirvisuo", "collectionStatus": "GATHERING",
                    "presets": [{"id": "C0150200", "inCollection": True}, {"id": "C0150201", "inCollection": False}]}},
    {"type": "Feature", "id": "C09999", "geometry": {"type": "Point", "coordinates": [25, 61]},
     "properties": {"id": "C09999", "name": "x", "collectionStatus": "REMOVED_TEMPORARILY", "presets": [{"id": "C0999900"}]}},
]}
CT = {"data": [
    {"cctv": {"index": "1", "inService": "true", "location": {"district": "7", "locationName": "I-5 at Main St", "route": "I-5", "longitude": "-118.2", "latitude": "34.05"},
              "imageData": {"static": {"currentImageURL": "https://cwwp2.dot.ca.gov/data/d7/cctv/image/a/a.jpg"}}}},
    {"cctv": {"index": "2", "inService": "false", "location": {"longitude": "-118", "latitude": "34"}, "imageData": {"static": {"currentImageURL": "https://x/y.jpg"}}}},
    {"cctv": {"index": "3", "inService": "true", "location": {"longitude": "", "latitude": "34"}}},
]}


def test_camaras_digitraffic_solo_activas_con_imagen_del_operador():
    out = c.camaras_digitraffic(DT)
    assert len(out) == 1
    p = out[0]["properties"]
    assert p["imgs"] == ["https://weathercam.digitraffic.fi/C0150200.jpg"] and p["lic"] == "CC BY 4.0" and p["st"] == "trafico"
    assert p["n"] == "vt1 Espoo Hirvisuo"


def test_camaras_caltrans_en_servicio():
    out = c.camaras_caltrans(CT)
    assert [f["properties"]["n"] for f in out] == ["I-5 · I-5 at Main St"]
    assert out[0]["geometry"]["coordinates"] == [-118.2, 34.05]


def test_fuente_de_camaras_tolera_fallas(monkeypatch):
    monkeypatch.setattr(c, "robots_permite", lambda u, robots=None: True)
    def leer(u):
        if "D02" in u:
            raise OSError("caída")
        return CT
    out = c._fuente_camaras("caltrans", [c.CALTRANS.format(d=1), c.CALTRANS.format(d=2)], c.camaras_caltrans, leer=leer)
    assert len(out) == 1 and c.CAM_FUENTES["caltrans"].startswith("ok (1); fallaron 1 de 2")


def test_presas_y_ductos_desde_osm(monkeypatch):
    def falso(selectores, familia="", salida="center"):
        if familia == "presas":
            return [{"type": "way", "id": 1, "center": {"lat": 17.0, "lon": -93.4}, "tags": {"name": "Presa Chicoasén", "power": "plant", "height": "261"}},
                    {"type": "node", "id": 2, "lat": 25.0, "lon": -100.0, "tags": {"name": "Presa El Cuchillo"}}]
        assert salida == "geom"
        return [{"type": "way", "id": 3, "tags": {"name": "Gasoducto Sur de Texas-Tuxpan", "substance": "gas", "operator": "IEnova"},
                 "geometry": [{"lat": 25.9, "lon": -97.1}, {"lat": 21.0, "lon": -97.3}]},
                {"type": "way", "id": 4, "tags": {"name": "x", "substance": "oil"}, "geometry": [{"lat": 1, "lon": 1}]}]
    monkeypatch.setattr(c, "overpass", falso)
    monkeypatch.setattr(c, "Paises", lambda: type("P", (), {"de": lambda self, lon, lat: "MEX"})())
    p = c.presas()
    assert [f["properties"]["st"] for f in p] == ["presa_hidro", "presa_otros"] and p[0]["properties"]["x"] == "261 m de altura"
    d = c.ductos()
    assert len(d) == 1 and d[0]["geometry"]["type"] == "LineString" and d[0]["properties"]["st"] == "ductos_gas"
    assert d[0]["properties"]["id"] == "osm:w3" and d[0]["properties"]["p"] == "MEX"
    import json
    cat = json.load(open(os.path.join(ROOT, "config", "entities.json"), encoding="utf-8"))
    ids = {s["id"] for k in cat["categorias"] for s in k["subtipos"]}
    assert {"presa_hidro", "presa_otros", "ductos_gas", "ductos_petroleo"} <= ids


def test_rellenar_zonas_sin_respuesta_con_la_corrida_anterior(tmp_path, monkeypatch):
    monkeypatch.setattr(c, "SALIDA", str(tmp_path))
    punto = lambda i, lon, lat: c.feat(c.punto(lon, lat), {"id": f"osm:n{i}", "n": "", "st": "presa_otros", "p": "", "x": ""}, 6)  # noqa: E731
    linea = c.feat({"type": "LineString", "coordinates": [[-95, 20], [-94, 21]]}, {"id": "osm:w9", "n": "", "st": "ductos_gas", "p": "", "x": ""}, 3)
    c.guardar_crudo("presas", [punto(1, -99, 19), punto(2, 10, 50), linea])
    assert len(c.leer_crudo("presas")) == 3
    nuevos = [punto(2, 10, 50)]
    todos, n = c.rellenar_faltantes(nuevos, c.leer_crudo("presas"), [[15, -100, 22.5, -90]])
    assert n == 2 and {f["properties"]["id"] for f in todos} == {"osm:n1", "osm:n2", "osm:w9"}
    assert c.rellenar_faltantes(nuevos, [], [[15, -100, 22.5, -90]])[1] == 0


# ---------------- Dominio de grupos armados (UCDP) y religiones (Pew/OWID) ----------------
import json  # noqa: E402

import dominio as D  # noqa: E402


def test_enlaces_ucdp():
    html = '<a href="/downloads/ged/ged241-csv.zip">x</a><a href="ged/ged251-csv.zip">y</a><a href="candidateged/GEDEvent_v26_0_3.csv">c</a><a href="/x.pdf">p</a>'
    ged, cand = D.enlaces_ucdp(html)
    assert ged == "https://ucdp.uu.se/downloads/ged/ged251-csv.zip"
    assert cand == ["https://ucdp.uu.se/downloads/candidateged/GEDEvent_v26_0_3.csv"]


def test_actores_no_estatales():
    assert D.actores_no_estatales({"type_of_violence": "1", "side_a": "Government of Mali", "side_b": "JNIM"}) == ["JNIM"]
    assert D.actores_no_estatales({"type_of_violence": "2", "side_a": "CJNG", "side_b": "Sinaloa Cartel"}) == ["CJNG", "Sinaloa Cartel"]
    assert D.actores_no_estatales({"type_of_violence": "3", "side_a": "Government of X", "side_b": "Civilians"}) == []


def test_dominio_y_disputa_por_celda():
    import datetime as dt
    filas = ["id,date_start,latitude,longitude,type_of_violence,side_a,side_b,best,country"]
    # Celda A (Sinaloa): 4 eventos, todos del mismo grupo → dominio
    filas += [f"a{i},2026-01-0{i + 1},24.8,-107.4,3,Sinaloa Cartel - Chapitos,Civilians,1,Mexico" for i in range(4)]
    # Celda B (Michoacán): dos grupos que pelean → disputa
    filas += [f"b{i},2026-02-0{i + 1},19.4,-102.1,2,CJNG,Carteles Unidos,2,Mexico" for i in range(3)]
    # Fuera de ventana
    filas += ["c1,2020-01-01,19.4,-102.1,2,X,Y,50,Mexico"]
    ev = list(D.leer_eventos(["\n".join(filas)], dt.date(2025, 1, 1)))
    assert len(ev) == 7
    feats = D.cobertura_dominio(D.agregar_celdas(ev))
    por_estado = {f["properties"]["st"]: f["properties"] for f in feats}
    assert por_estado["conflicto_dominio"]["n"] == "Sinaloa Cartel - Chapitos"
    assert por_estado["conflicto_disputa"]["n"].startswith("Disputa: ")
    assert json.loads(por_estado["conflicto_disputa"]["actores"])[0][1] == 50
    assert all(f["geometry"]["type"] == "Polygon" for f in feats)


def test_religiones_desde_csv_owid():
    html = '<a href="/grapher/share-of-population-christian">a</a><a href="/grapher/share-folk-religions?x=1">b</a><a href="/grapher/gdp">c</a>'
    assert D.slugs_religion(html) == ["share-folk-religions", "share-of-population-christian"]
    csv_ = "Entity,Code,Year,Christians share\nMexico,MEX,2010,0.9\nMexico,MEX,2020,0.88\nWorld,OWID_WRL,2020,0.29\n"
    datos = D.leer_csv_owid(csv_, "share-of-population-christian")
    assert datos == {"MEX": {"cristianismo": 0.88}}
    paises = {"features": [{"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 0]]]}, "properties": {"iso3": "MEX", "nombre": "México"}}]}
    f = D.features_religion(paises, {"MEX": {"cristianismo": 0.88, "sin_religion": 0.1, "populares": 0.01}})[0]["properties"]
    assert f["st"] == "religion_cristianismo" and json.loads(f["porcentajes"])["cristianismo"] == 88.0
    assert D.categoria_de("Share of population with folk religions") == "populares"
    assert D.categoria_de("Religiously unaffiliated") == "sin_religion"


def test_religiones_conteos_a_porcentaje():
    import dominio as D
    assert D.normalizar_porcentajes({"cristianismo": 270000.0, "sin_religion": 70000.0, "otras": 84.0, "islam": 0.0}) == {"cristianismo": 79.4, "sin_religion": 20.6, "islam": 0.0}
    assert D.normalizar_porcentajes({"cristianismo": 0.6, "islam": 0.4}) == {"cristianismo": 60.0, "islam": 40.0}
