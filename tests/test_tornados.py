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


def test_lugar_del_titulo_y_gentilicios():
    locs = "1#German#GM#GM##51.5#10.5#GM#5;4#Rome, Lazio, Italy#IT#IT07##41.9#12.483#-1#60;4#Marsala, Sicilia, Italy#IT#IT15##37.8#12.433#-3#300"
    f = T.fila_a_feature(fila("Tromba d'aria a Marsala, feriti 4 bambini", locs=locs), "traducido")
    assert f["properties"]["state"].startswith("Marsala")
    locs2 = "4#Rome, Lazio, Italy#IT#IT07##41.9#12.483#-1#60;4#Trapani, Sicilia, Italy#IT#IT15##38.017#12.5#-4#400"
    assert T.fila_a_feature(fila("Doppia tromba d'aria nel Trapanese", locs=locs2), "traducido")["properties"]["state"].startswith("Trapani")


def test_descarta_pronosticos_y_ayudas():
    assert T.fila_a_feature(fila("Why Hurricane Isaias could spawn tornadoes across north Florida"), "ingles") is None
    assert T.fila_a_feature(fila("How to apply for FEMA tornado relief funds"), "ingles") is None


def test_agrupa_un_fenomeno():
    def nota(lugar, c, fecha, titulo, sev=False, prec="ciudad", url=None):
        return {"type": "Feature", "geometry": {"type": "Point", "coordinates": c},
                "properties": {"title": titulo, "url": url or titulo, "source": "x", "date": fecha, "kind": "TORNADO", "severe": sev,
                               "state": lugar, "precision": prec}}
    notas = [nota("Marsala", [12.433, 37.8], "2026-10-09T10:00:00Z", "a"), nota("Marsala", [12.433, 37.8], "2026-10-09T11:00:00Z", "b", sev=True),
             nota("Sicilia", [14.25, 37.75], "2026-10-09T12:00:00Z", "c", prec="estado"), nota("Florida", [-81.7, 27.8], "2026-10-09T12:00:00Z", "d")]
    g = T.agrupar(notas)
    assert len(g) == 2
    sic = next(x for x in g if x["properties"]["notas"] == 3)["properties"]
    assert sic["state"] == "Marsala" and sic["severe"] is True and sic["title"] == "b" and len(sic["enlaces"]) == 3


def test_nomenclator_del_titulo():
    N = T.Nomenclator(ciudades=[["Marsala", "Marsala", "ITA", 37.805, 12.439, "ciudad", 80000], ["Victoria", "Victoria", "CAN", 48.4, -123.4, "capital", 300000],
                                ["Victoria", "Victoria", "MEX", 23.7, -99.1, "capital", 330000]],
                      admin1=[[["Trapani"], "ITA", 37.85, 12.7, "provincia"], [["Sicily", "Sicilia"], "ITA", 37.5, 14.2, "region"]],
                      paises={"ITA": {"es": "Italia", "en": "Italy", "lat": 42.8, "lon": 12.8}, "CAN": {"es": "Canadá", "en": "Canada", "lat": 56, "lon": -100}})
    assert N.ubicar("Tromba d'aria a Marsala, feriti")[0] == "Marsala"
    assert N.ubicar("Doppia tromba d'aria nel Trapanese")[:1] == ("Trapani",) and N.ubicar("Doppia tromba nel Trapanese")[3] == "estado"
    assert N.ubicar("Sicilian tornado")[0] == "Sicily"
    assert N.ubicar("Tornado hits Victoria, Canada")[1:3] == (48.4, -123.4)  # la ciudad del país mencionado
    assert N.ubicar("tornado activity is shifting across the country") is None


def test_medio_al_final_y_homonimos():
    N = T.nomenclator()
    assert N.ubicar("Tornado hits Florida panhandle")[1] > 20  # el estado de EUA, no la ciudad de Uruguay
    locs = "4#Dallas, Texas, United States#US#USTX##32.8#-96.8#-5#900;1#Italian#IT#IT##42.8#12.8#IT#10"
    assert T.fila_a_feature(fila("Doppel-Tornado in Marsala - FOX 4 Dallas", locs=locs), "ingles")["properties"]["state"] == "Marsala"
