"""Capa de ciberataques: qué cuenta como incidente, tipo, sector y país afectado vs. señalado."""
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "tools", "red")))
import ciberataques as C  # noqa: E402
from geo import Gazetteer  # noqa: E402

G = Gazetteer()
AHORA = datetime(2026, 11, 4, 12, tzinfo=timezone.utc)

RSS = b"""<?xml version="1.0"?><rss><channel>
<item><title>Nuevo ciberataque a supermercados europeos: hackers manipulan refrigeradores en Belgica y Suecia</title>
<link>https://ejemplo.org/a</link><pubDate>Tue, 03 Nov 2026 10:00:00 +0000</pubDate><description>texto largo que no se guarda</description></item>
<item><title>Iranian hackers target water utilities in Israel</title><link>https://ejemplo.org/b</link><pubDate>Tue, 03 Nov 2026 09:00:00 +0000</pubDate></item>
<item><title>Cyberattack disrupts supermarkets across Europe</title><link>https://ejemplo.org/c</link><pubDate>Mon, 02 Nov 2026 09:00:00 +0000</pubDate></item>
<item><title>Webinar: how to protect your SOC from ransomware</title><link>https://ejemplo.org/d</link><pubDate>Mon, 02 Nov 2026 09:00:00 +0000</pubDate></item>
<item><title>Police arrest three suspected hackers in Spain</title><link>https://ejemplo.org/e</link><pubDate>Mon, 02 Nov 2026 09:00:00 +0000</pubDate></item>
<item><title>Nota vieja: ransomware en hospital de Chile</title><link>https://ejemplo.org/f</link><pubDate>Mon, 01 Sep 2026 09:00:00 +0000</pubDate></item>
</channel></rss>"""


def test_afectado_y_senalado():
    assert C.paises_de("Iranian hackers target water utilities in Israel", G) == (["ISR"], ["IRN"])
    assert C.paises_de("hackers rusos atacan hospitales de Alemania", G) == (["DEU"], ["RUS"])
    assert C.paises_de("China-Aligned Hackers Hijack Sogou Input Method", G) == ([], ["CHN"])
    assert C.paises_de("North Korea denies being behind record $6.3bn Binance hack", G) == ([], ["PRK"])
    assert C.paises_de("French blood storage units targeted in cyberattack", G) == (["FRA"], [])
    assert C.paises_de("AU: Criminal investigation after NSW Health hit by cyber breach", G)[0] == ["AUS"]


def test_tipo_sector_y_ruido():
    assert C.es_incidente("Ransomware gang hits hospital") and not C.es_incidente("Webinar: how to stop ransomware")
    assert not C.es_incidente("Police arrest three suspected hackers in Spain")
    assert C.tipo_de("Ciberataque a refrigeradores de supermercados") == "sabotaje"
    assert C.tipo_de("Hospital hit by ransomware") == "ransomware"
    assert C.sectores_de("Ciberataque a supermercados y a un hospital") == ["comercio", "salud"]


def test_construir_por_pais(tmp_path, monkeypatch):
    monkeypatch.setattr(C, "OUT", str(tmp_path / "c.geojson"))
    monkeypatch.setattr(C, "ESTADO", str(tmp_path / "e.json"))
    monkeypatch.setattr(C, "FEEDS", [("Medio", "https://ejemplo.org/feed", "es")])
    eventos = [{"titulo": "Hackean a banco de Brasil", "fuente": "El Economista", "url": "https://ejemplo.org/g", "fecha_utc": "2026-11-03T08:00:00Z",
                "tipo_fuente": "noticia", "subtemas": ["ciberataques"], "pais_iso3": "MEX"},
               {"titulo": "Ciberataque sin país", "fuente": "El Economista", "url": "https://ejemplo.org/h", "fecha_utc": "2026-11-03T08:00:00Z",
                "tipo_fuente": "noticia", "subtemas": ["ciberataques"], "pais_iso3": "MEX"}]
    C.construir(AHORA, leer=lambda u: RSS, permitido=lambda u: True, pausa=0, eventos=eventos)
    d = json.load(open(C.OUT, encoding="utf-8"))
    por = {f["properties"]["iso3"]: f["properties"] for f in d["features"]}
    assert set(por) == {"BEL", "SWE", "ISR", "EUR", "BRA"}  # sin la nota vieja, el webinar, el arresto ni México por omisión
    assert por["BEL"]["icono"] == "🛒" and por["BEL"]["tipo"] == "sabotaje"
    assert por["ISR"]["senalados"] == [["Irán", 1]] and por["ISR"]["icono"] == "💧"
    assert por["EUR"]["region"] is True
    texto = open(C.ESTADO, encoding="utf-8").read()
    assert "texto largo" not in texto  # nunca el texto de la nota
    assert d["sin_pais"] == 1
