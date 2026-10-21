"""Cámaras en vivo de YouTube: filtro de cámaras, tema, ubicación por título y armado sin red."""
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "capas"))
import youtube_vivo as Y  # noqa: E402

CIUDADES = Y.Ciudades([["Venice", "Venecia", "ITA", 45.44, 12.33, "ciudad", 260000], ["Cancun", "Cancún", "MEX", 21.16, -86.85, "ciudad", 888000],
                       ["Paris", "París", "FRA", 48.85, 2.35, "capital", 11000000], ["Paris", "", "USA", 33.66, -95.55, "ciudad", 25000]])


def test_filtro_de_camaras():
    assert Y.es_camara({"title": "Venice live cam Rialto"}, "19")
    assert not Y.es_camara({"title": "Noticias en vivo 24/7"}, "25")
    assert not Y.es_camara({"title": "lofi beats live cam"}, "10")
    assert not Y.es_camara({"title": "Live webcam"}, "20")  # videojuegos


def test_tema_y_ciudad_mas_poblada():
    assert Y.tema("Cancún playa en vivo") == "yt_playas"
    assert Y.tema("JFK airport live cam") == "yt_aeropuertos"
    assert Y.tema("Times Square live") == "yt_ciudades"
    assert CIUDADES.en("Paris live cam Eiffel")[2] == "FRA"
    assert CIUDADES.en("Cámara en vivo Cancún")[2] == "MEX"
    assert CIUDADES.en("live cam somewhere") is None
    c = Y.Ciudades([["Florida", "", "URY", -34.1, -56.2, "ciudad", 30000], ["Key West", "Cayo Hueso", "USA", 24.55, -81.78, "ciudad", 25000]])
    assert c.en("Duval Street - Key West, Florida - Live Cam")[2] == "USA"  # el nombre más específico gana; «Florida» se ignora


def test_camaras_sin_red(monkeypatch):
    def llamar(llave, metodo, **p):
        if metodo == "search":
            return {"items": [{"id": {"videoId": "AAAAAAAAAAA"}}, {"id": {"videoId": "BBBBBBBBBBB"}}, {"id": {"videoId": "CCCCCCCCCCC"}}]}
        return {"items": [
            {"id": "AAAAAAAAAAA", "snippet": {"title": "Venice live cam", "liveBroadcastContent": "live", "categoryId": "19", "channelId": "UCx"},
             "status": {"embeddable": True}, "recordingDetails": {}},
            {"id": "BBBBBBBBBBB", "snippet": {"title": "Harbor live cam", "liveBroadcastContent": "live", "categoryId": "19", "channelId": "UCy"},
             "status": {"embeddable": True}, "recordingDetails": {"location": {"latitude": 53.54, "longitude": 9.99}}},
            {"id": "CCCCCCCCCCC", "snippet": {"title": "live cam sin lugar", "liveBroadcastContent": "live", "categoryId": "19", "channelId": "UCz"},
             "status": {"embeddable": True}, "recordingDetails": {}},
        ]}
    monkeypatch.setattr(Y, "llamar", llamar)
    out = {c["id"]: c for c in Y.camaras("k", CIUDADES, busquedas=["live cam"])}
    assert set(out) == {"AAAAAAAAAAA", "BBBBBBBBBBB"}  # la que no tiene ubicación se descarta
    assert out["AAAAAAAAAAA"]["aprox"] and out["AAAAAAAAAAA"]["pais"] == "ITA"
    assert not out["BBBBBBBBBBB"]["aprox"] and out["BBBBBBBBBBB"]["st"] == "yt_puertos"
    assert out["BBBBBBBBBBB"]["canal_url"].endswith("/UCy")
