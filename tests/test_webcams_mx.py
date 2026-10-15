"""Cámaras de Webcams de México (API de WordPress) sin red."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "capas"))
import webcams_mx as W  # noqa: E402


def _post(i, cats, lat="20.93", lon="-89.01", enable="1"):
    return {"id": i, "link": f"https://webcamsdemexico.com/webcam/c{i}/", "title": {"rendered": "Izamal, Yucat&#8211;n"}, "webcam_category": cats,
            "cmb2": {"webcammx_single_settings": {"webcammx_enable": enable, "webcammx_ciudad": "Izamal", "webcammx_estado": "Yucatán",
                                                  "webcammx_latitud": lat, "webcammx_longitud": lon, "webcammx_host": "Palacio Municipal"}}}


def test_camaras_con_coordenadas_categoria_y_video():
    cats = {13: "pueblos-magicos", 14: "volcanes", 9: "playas"}
    posts = [_post(1, [13]), _post(2, [9, 14]), _post(3, [9], lat=""), _post(4, [9], lat="40.4", lon="-3.7"), _post(5, [9], enable="0")]
    r = W.camaras(posts, cats, lambda url: "Ozvr21XUhfY" if url.endswith("c1/") else "")
    assert [c["id"] for c in r] == ["wdm:1", "wdm:2"]  # sin coordenadas, fuera de México o apagada: fuera
    assert r[0]["st"] == "wcmx_pueblos_magicos" and r[0]["yt"] == "Ozvr21XUhfY" and r[0]["estado"] == "Yucatán"
    assert r[1]["st"] == "wcmx_volcanes"  # varias categorías: gana la más específica


def test_id_de_youtube_de_la_pagina():
    html = '<iframe class="embed-responsive-item" id="ytIframe" src="https://www.youtube.com/embed/Ozvr21XUhfY?autoplay=1"></iframe>'
    assert W.youtube_de(html) == "Ozvr21XUhfY"
    assert W.youtube_de("<p>sin video</p>") == ""
