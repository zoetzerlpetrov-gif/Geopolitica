"""Lectores de cámaras de tráfico de datos abiertos: Singapur, Hong Kong, Nueva Zelanda e Islandia."""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools", "capas"))
import construir as C  # noqa: E402


def test_singapur_sin_url_de_imagen_guardada():
    d = {"items": [{"cameras": [{"camera_id": "2701", "image": "https://images.data.gov.sg/x.jpg", "location": {"latitude": 1.44, "longitude": 103.77}}]}]}
    f = C.camaras_singapur(d)[0]["properties"]
    assert f["sg"] == "2701" and f["p"] == "SGP" and "imgs" not in f


def test_hong_kong_xml():
    xml = b"""<image-list><image><key>H429F</key><region>Hong Kong Island</region><district>Southern</district>
      <description>Aberdeen Praya Road</description><latitude>22.24845</latitude><longitude>114.1505</longitude>
      <url>https://tdcctv.data.one.gov.hk/H429F.JPG</url></image><image><key>X</key><url>http://x</url></image></image-list>"""
    out = C.camaras_hong_kong(xml)
    assert len(out) == 1 and out[0]["properties"]["imgs"] == ["https://tdcctv.data.one.gov.hk/H429F.JPG"]
    assert out[0]["properties"]["lugar"] == "Southern, Hong Kong Island"


def test_nueva_zelanda_url_relativa():
    d = {"response": {"camera": [{"id": 714, "description": "Hinds", "imageUrl": "/camera/714.jpg", "latitude": -43.9, "longitude": 171.5, "highway": "SH1"},
                                 {"id": 1, "imageUrl": "/camera/1.jpg"}]}}
    out = C.camaras_nueva_zelanda(d)
    assert len(out) == 1 and out[0]["properties"]["imgs"] == ["https://www.trafficnz.info/camera/714.jpg"]


def test_islandia_agrupa_vistas():
    filas = [{"Maelist_nr": 7001, "Myndavel": "Hellisheiði", "Vegheiti": "Hringvegur", "Slod": f"https://www.vegagerdin.is/v/h_{i}.jpg", "Breidd": 64.0, "Lengd": -21.3}
             for i in range(6)]
    out = C.camaras_islandia(filas)
    assert len(out) == 1 and len(out[0]["properties"]["imgs"]) == 4 and out[0]["properties"]["p"] == "ISL"
