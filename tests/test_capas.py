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
