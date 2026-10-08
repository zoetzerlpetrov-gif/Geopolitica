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
    out = c.camaras(revisar=lambda url: "ok")
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
