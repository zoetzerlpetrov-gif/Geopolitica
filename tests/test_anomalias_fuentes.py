"""Anomalías: medios propios y GDELT en varios idiomas (filtro del tema, ubicación y entidades de HTML)."""
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "tools", "anomalias")))
import anomalias as A  # noqa: E402

U = A.Ubicador()

RSS = b"""<?xml version="1.0"?><rss><channel>
<item><title>UFO spotted over Shiraz, Iran&nbsp;</title><link>https://ej.org/1</link><pubDate>Tue, 03 Nov 2026 10:00:00 +0000</pubDate></item>
<item><title>Oil prices rise in Tehran</title><link>https://ej.org/2</link><pubDate>Tue, 03 Nov 2026 10:00:00 +0000</pubDate></item>
</channel></rss>"""


def test_feeds_propios_filtran_y_limpian_entidades():
    f, est = A.de_feeds_propios(U, leer=lambda u: RSS, permitido=lambda u: True, feeds=[("Medio", "https://ej.org/feed", False)])
    assert est["Medio"] == "2 notas, 1 del tema"
    p = f[0]["properties"]
    assert p["lugar"] == "Shiraz" and p["capa"] == "anom_recientes" and p["url"] == "https://ej.org/1" and p["resumen"] == ""


def test_titulos_en_otros_idiomas():
    n = A.nota_propia("مشاهده بشقاب پرنده در آسمان تهران", "https://ej.org/3", "2026-11-04", "x (vía GDELT)", U, origen="gdelt")
    assert n["properties"]["lugar"] == "Teherán"
    n = A.nota_propia("НЛО над Москвой", "https://ej.org/4", "2026-11-04", "x", U, pais_medio="RUS")
    assert n["properties"]["precision"].startswith("país del medio")
    assert A.nota_propia("Webinar about markets", "https://ej.org/5", "", "x", U, pais_medio="RUS") is None


def test_gdelt_dos_consultas():
    resp = json.dumps({"articles": [{"title": "Strange lights: UFO over Isfahan", "url": "https://ej.org/6", "seendate": "20261104T101500Z",
                                      "sourcecountry": "Iran", "domain": "ej.org"}]}).encode()
    f, est = A.de_gdelt(U, leer=lambda u: resp, pausa=0)
    assert len(f) == 2 and f[0]["properties"]["lugar"] == "Isfahán" and f[0]["properties"]["fecha"] == "2026-11-04"
    assert "consulta 2" in est
