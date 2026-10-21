"""Polígonos de estados para las fichas (tools/zonas_eventos.py) y videos recientes (tools/conflictos/videos.py), sin red."""
import json
import os
import sys

RAIZ = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, os.path.join(RAIZ, "tools"))
sys.path.insert(0, os.path.join(RAIZ, "tools", "conflictos"))
import zonas_eventos as ZE  # noqa: E402
import videos as VI  # noqa: E402


def cuadro(x0, y0, x1, y1, nombre, iso3="MEX"):
    return {"nombres": [nombre], "iso3": iso3, "tipo": "Estado", "bbox": [x0, y0, x1, y1],
            "geometry": {"type": "Polygon", "coordinates": [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]}}


def test_solo_estados_con_puntos_y_cuantos(tmp_path):
    polis = [cuadro(-109, 22, -105, 27, "Sinaloa"), cuadro(-105, 18, -100, 22, "Jalisco"), cuadro(-100, 15, -95, 18, "Oaxaca")]
    ruta = tmp_path / "vial.geojson"
    punto = lambda x, y, prec: {"type": "Feature", "geometry": {"type": "Point", "coordinates": [x, y]}, "properties": {"precision": prec}}
    ruta.write_text(json.dumps({"features": [punto(-107, 24, "ciudad"), punto(-106, 25, "estado"), punto(-103, 20, "ciudad"),
                                             punto(-97, 16, "país")]}))
    fc = ZE.zonas(polis, ZE.puntos([str(ruta), str(tmp_path / "no_existe.geojson")]))
    assert {f["properties"]["nombre"]: f["properties"]["n"] for f in fc["features"]} == {"Sinaloa": 2, "Jalisco": 1}  # Oaxaca: solo un punto de país


def test_videos_recientes_sin_repetir_y_en_ventana():
    it = lambda vid, fecha, titulo="Bloqueo en la autopista": {"snippet": {"resourceId": {"videoId": vid}, "publishedAt": fecha, "title": titulo}}
    canal = next(iter(VI.CANALES))
    r = VI.recientes([(canal, it("a" * 11, "2026-10-21T10:00:00Z")), (canal, it("a" * 11, "2026-10-21T10:00:00Z")),
                      (canal, it("b" * 11, "2026-10-01T10:00:00Z")), (canal, it("c" * 11, "2026-10-21T12:00:00Z", "Private video")),
                      (canal, it("d" * 11, "2026-10-21T11:00:00Z"))], "2026-10-14T00:00:00Z")
    assert [x["v"] for x in r] == ["d" * 11, "a" * 11] and r[0]["c"] == VI.CANALES[canal]
