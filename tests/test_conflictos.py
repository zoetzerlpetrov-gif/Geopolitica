"""Zonas de conflicto: construcción de polígonos y filtro de videos."""
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "conflictos"))
import videos as V  # noqa: E402
import zonas as Z  # noqa: E402

CUADRO = lambda x, y: {"type": "Polygon", "coordinates": [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]]}  # noqa: E731
ADMIN1 = {"features": [
    {"properties": {"adm0_a3": "UKR", "name": "Donets'k"}, "geometry": CUADRO(37, 47)},
    {"properties": {"adm0_a3": "UKR", "name": "Luhans'k"}, "geometry": CUADRO(38, 48)},
    {"properties": {"adm0_a3": "MMR", "name": "Shan"}, "geometry": CUADRO(97, 20)},
    {"properties": {"adm0_a3": "MMR", "name": "Kachin"}, "geometry": CUADRO(97, 25)},
]}


def test_construir_une_regiones_y_paises():
    cfg = {"conflictos": [{"id": "u", "nombre": "U", "intensidad": "alta", "regiones": {"UKR": ["Donets'k", "Luhans'k", "Inexistente"]}, "palabras": ["donetsk"]},
                          {"id": "m", "nombre": "M", "intensidad": "media", "paises": ["MMR"]}]}
    fc, faltan = Z.construir(ADMIN1, cfg)
    assert [f["properties"]["id"] for f in fc["features"]] == ["u", "m"]
    assert faltan == ["u: UKR/Inexistente"]
    u = fc["features"][0]["properties"]
    assert u["paises"] == ["UKR"] and u["opacidad"] == 0.35 and len(u["etiqueta"]) == 2
    assert fc["features"][1]["geometry"]["type"] == "MultiPolygon"


def test_lista_real_completa():
    cfg = json.load(open(os.path.join(ROOT, "config", "conflictos.json"), encoding="utf-8"))
    ids = [c["id"] for c in cfg["conflictos"]]
    assert len(ids) == len(set(ids)) >= 10
    for c in cfg["conflictos"]:
        assert c["intensidad"] in ("alta", "media") and c["resumen"] and c["palabras"] and (c.get("regiones") or c.get("paises"))
    fc = json.load(open(os.path.join(ROOT, "data", "base", "conflictos.geojson"), encoding="utf-8"))
    assert {f["properties"]["id"] for f in fc["features"]} == set(ids)


def test_videos_asignados_por_palabras_y_solo_recientes():
    it = lambda vid, t, f, d="": {"snippet": {"title": t, "description": d, "publishedAt": f, "resourceId": {"videoId": vid}}}  # noqa: E731
    conflictos = [{"id": "ucrania", "palabras": ["járkov", "kharkiv", "ucrania"]}, {"id": "sudan", "palabras": ["darfur", "sudán"]}]
    videos = [("UCT4Jg8h03dD0iN3Pb5L0PMA", it("a1", "Ataque en Járkov", "2026-10-16T10:00:00Z")),
              ("UChqUTb7kYRX8-EiaN3XFrSQ", it("a2", "Market update", "2026-10-16T11:00:00Z", "Fighting in Darfur displaces thousands")),
              ("UChqUTb7kYRX8-EiaN3XFrSQ", it("a3", "Ucrania: archivo", "2026-09-01T10:00:00Z")),
              ("UCT4Jg8h03dD0iN3Pb5L0PMA", it("a1", "Ataque en Járkov", "2026-10-16T10:00:00Z")),
              ("UCT4Jg8h03dD0iN3Pb5L0PMA", it("a4", "Private video", "2026-10-16T10:00:00Z"))]
    r = V.asignar(videos, conflictos, "2026-10-10T00:00:00Z")
    assert [v["video"] for v in r["ucrania"]] == ["a1"] and r["ucrania"][0]["canal"] == "DW Español"
    assert [v["video"] for v in r["sudan"]] == ["a2"] and r["sudan"][0]["canal"] == "Reuters"
