"""Tornados desde GDELT GKG: filtro por tema y título, elección del lugar y acumulación de 7 días."""
import os
import sys
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "clima"))
import tornados as T  # noqa: E402


def fila(titulo, temas="NATURAL_DISASTER_TORNADO,120;WB_123_FOO,10",
         locs="1#Italy#IT#IT##42.8#12.8#IT#30;4#Palermo, Sicilia, Italy#IT#IT15##38.116#13.361#-2#140;2#Sicilia, Italy#IT#IT15##37.6#14.0#IT15#900"):
    f = [""] * 27
    f[1], f[3], f[4], f[8], f[10] = "20261009121500", "ansa.it", "https://www.ansa.it/sicilia/tromba", temas, locs
    f[26] = f"<PAGE_TITLE>{titulo}</PAGE_TITLE><PAGE_AUTHORS>x</PAGE_AUTHORS>"
    return f


def test_toma_el_lugar_mas_especifico_y_cercano():
    ft = T.fila_a_feature(fila("Tromba d'aria a Palermo, alberi abbattuti e danni"), "traducido")
    p = ft["properties"]
    assert ft["geometry"]["coordinates"] == [13.361, 38.116] and p["state"].startswith("Palermo")
    assert p["kind"] == "TORNADO" and p["severe"] is True and p["precision"] == "ciudad" and "traducida" in p["via"]


def test_descarta_sin_tema_o_titulo_ajeno():
    assert T.fila_a_feature(fila("Maltempo in Sicilia", temas="WB_1,1"), "ingles") is None
    assert T.fila_a_feature(fila("Il governo approva la manovra"), "ingles") is None  # tema sin mención en el título
    assert T.fila_a_feature(fila("Luftwaffe retires last Panavia Tornado jets"), "ingles") is None
    assert T.fila_a_feature(fila("Tornado hits town", locs=""), "ingles") is None


def test_tromba_marina_y_union():
    f = T.fila_a_feature(fila("Waterspout spotted off Catania coast"), "ingles")
    assert f["properties"]["kind"] == "TROMBA MARINA" and f["properties"]["severe"] is False
    viejo = {"type": "Feature", "geometry": {}, "properties": {"title": "Old", "url": "u1", "date": "2026-09-01T00:00:00Z"}}
    repetido = {"type": "Feature", "geometry": {}, "properties": {"title": "Waterspout spotted off Catania coast!", "url": "u2", "date": "2026-10-09T10:00:00Z"}}
    out = T.unir([viejo, repetido], [f], datetime(2026, 10, 9, 13, tzinfo=timezone.utc))
    assert [x["properties"]["url"] for x in out] == [f["properties"]["url"]]
