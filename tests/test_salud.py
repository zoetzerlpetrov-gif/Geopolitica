"""Salud: brotes oficiales (OMS, CDC, ECDC) y señales en noticias (GDELT). Textos de ejemplo tomados de las fuentes (octubre de 2026)."""
import os
import sys
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "salud"))
import salud as S  # noqa: E402

AHORA = datetime(2026, 10, 17, tzinfo=timezone.utc)


def test_titulares_de_brotes():
    assert S.tipo_de_titulo("Dengue cases surge in Mexico")[0] == "dengue"
    assert S.tipo_de_titulo("Brote de cólera deja 12 muertos en Haití")[0] == "colera"
    assert S.tipo_de_titulo("Norovirus outbreak sickens 200 on cruise ship")[2] == "gastro"
    assert S.tipo_de_titulo("Lab leak suspected at research facility")[0] == "laboratorio"
    assert S.tipo_de_titulo("Yakima County resident tests positive for avian influenza")[0] == "aviar"
    # Sin contexto de brote o con otro sentido: no cuenta.
    assert S.tipo_de_titulo("Flu season tips for families") is None
    assert S.tipo_de_titulo("Stock price of vaccine maker drops after flu cases rise") is None
    assert S.tipo_de_titulo("New computer virus spreads through email") is None


def test_paises_por_nombre_y_alias():
    P = S.Paises()
    assert P.ubicar("Kingdom of Saudi Arabia")[4] == "SAU"
    assert P.ubicar("the Russian Federation")[4] == "RUS"
    assert P.ubicar("Colombia")[4] == "COL"  # no Colombo (Sri Lanka)
    assert P.ubicar("Bolivia")[4] == "BOL"
    assert P.ubicar("Ebola disease outbreak in the Democratic Republic of the Congo")[4] == "COD"
    assert P.ubicar("Republic of the Congo")[4] == "COG"
    assert P.ubicar("Niger")[4] == "NER" and P.ubicar("Nigeria")[4] == "NGA"
    assert P.ubicar("Weekly threats report") is None


def test_oms_un_punto_por_pais_y_ventana():
    d = {"value": [{"UrlName": "a", "PublicationDateAndTime": "2026-10-15T16:00:00Z", "Title": "Middle East respiratory syndrome coronavirus - Kingdom of Saudi Arabia"},
                   {"UrlName": "b", "PublicationDateAndTime": "2026-10-08T15:16:26Z", "Title": "Ebola disease caused by Bundibugyo virus - Democratic Republic of the Congo"},
                   {"UrlName": "c", "PublicationDateAndTime": "2025-01-01T00:00:00Z", "Title": "Cholera - Haiti"}]}
    f = S.oms(d, S.Paises(), AHORA)
    assert [x["properties"]["enf_id"] for x in f] == ["mers", "ebola"]
    assert f[1]["properties"]["grupo"] == "grave" and f[1]["properties"]["nivel"] == 3
    assert f[0]["properties"]["url"].endswith("/item/a")


RSS_CDC = b"""<?xml version="1.0"?><rss><channel>
<item><title>Level 1 - Global Dengue</title><link>https://wwwnc.cdc.gov/travel/notices/level1/dengue-global</link>
<description><![CDATA[Dengue is a year-round risk. Country List :  Colombia, Vietnam, Bolivia, Colombia Country List :  Colombia]]></description><pubDate>Thu, 02 Oct 2026 04:00:00 GMT</pubDate></item>
<item><title>Level 2 - Chikungunya in Cuba</title><link>https://x</link><description>Outbreak</description><pubDate>Thu, 02 Oct 2026 04:00:00 GMT</pubDate></item>
<item><title>Travel notices overview</title><link>https://y</link><description></description><pubDate></pubDate></item>
</channel></rss>"""


def test_cdc_paises_y_nivel():
    f = S.cdc(RSS_CDC, S.Paises(), AHORA)
    paises = [(x["properties"]["pais_iso3"], x["properties"]["nivel_cdc"]) for x in f]
    assert paises == [("COL", 1), ("VNM", 1), ("BOL", 1), ("CUB", 2)]  # sin repetir Colombia
    assert f[-1]["properties"]["enfermedad"] == "Chikungunya" and f[-1]["properties"]["date"] == "2026-10-02T04:00:00Z"


def test_ecdc_ubica_por_titulo():
    rss = b"""<rss><channel><item><title>Ebola disease outbreak in the Democratic Republic of the Congo</title><link>https://ecdc/x</link>
    <pubDate>Wed, 14 Oct 2026 17:36:21 +0200</pubDate></item><item><title>Communicable disease threats report, week 41</title><link>https://ecdc/y</link>
    <pubDate>Wed, 14 Oct 2026 17:36:21 +0200</pubDate></item></channel></rss>"""
    f = S.ecdc(rss, S.Paises(), AHORA)
    assert len(f) == 1 and f[0]["properties"]["pais_iso3"] == "COD" and f[0]["properties"]["date"] == "2026-10-14T15:36:21Z"


def _fila(titulo, url="https://medio.example/nota"):
    f = [""] * 27
    f[1], f[3], f[4], f[26] = "20261016233000", "medio.example", url, f"<PAGE_TITLE>{titulo}</PAGE_TITLE>"
    return f


def test_noticia_corta_el_nombre_del_medio_y_prefiere_el_pais():
    ft = S.fila_a_feature(_fila("Kenya records third Ebola case, linked to first patient who died - Grenada Chronicle – Daily news"), "ingles")
    assert ft and ft["properties"]["pais_iso3"] == "KEN" and ft["properties"]["enfermedad"] == "Ébola" and ft["properties"]["severe"]
    assert S.fila_a_feature(_fila("Flu season tips for families"), "ingles") is None
