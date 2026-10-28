"""Grupos por zona de las capas de puntos (tools/capas/zonas_grupos.py), sin red."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "capas"))
import zonas_grupos as ZG  # noqa: E402


def punto(lon, lat, st):
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]}, "properties": {"st": st}}


def test_pocos_puntos_no_se_agrupan():
    assert ZG.grupos([punto(0, 0, "a")] * 10) is None


def test_conteo_por_subtipo_y_banda():
    feats = [punto(-99.1, 19.4, "a")] * 40 + [punto(-99.2, 19.5, "b")] * 20 + [punto(2.3, 48.8, "a")] * 5
    feats.append({"type": "Feature", "geometry": {"type": "LineString", "coordinates": [[0, 0], [1, 1]]}, "properties": {"st": "a"}})
    fc = ZG.grupos(feats)
    b0 = [f for f in fc["features"] if f["properties"]["b"] == 0]
    mx = next(f for f in b0 if f["geometry"]["coordinates"][0] < 0)["properties"]
    assert mx["n"] == 60 and mx["c_a"] == 40 and mx["c_b"] == 20
    assert sum(f["properties"]["n"] for f in b0) == 65  # la línea no cuenta
    assert {f["properties"]["b"] for f in fc["features"]} == {0, 1, 2}
    assert fc["bandas"] == [[0, 3], [3, 5], [5, 7]]


def test_relleno_desde_archivos(tmp_path):
    feats = [punto(i * 0.01, 10, "x") for i in range(60)]
    (tmp_path / "cam.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}))
    (tmp_path / "manifest.json").write_text(json.dumps({"familias": {"cam": {"archivo": "data/capas/cam.geojson"}, "otra": {}}}))
    ZG.main(str(tmp_path))
    m = json.loads((tmp_path / "manifest.json").read_text())
    assert m["familias"]["cam"]["grupos"] == "data/capas/cam.grupos.json"
    assert "grupos" not in m["familias"]["otra"]
    assert (tmp_path / "cam.grupos.json").exists()
