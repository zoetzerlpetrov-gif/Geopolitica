"""Capa de terrorismo, narcotráfico y crimen organizado: tipo, severidad, ubicación y duplicados."""
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "crimen"))
import crimen as c  # noqa: E402

EST = json.load(open(os.path.join(ROOT, "config", "mx_estados.json"), encoding="utf-8"))
GAZ = c.Gazetteer()


def test_tipo():
    assert c.tipo_de("Atentado con coche bomba en Mogadiscio") == "Terrorismo"
    assert c.tipo_de("Detienen a operador del Cártel de Sinaloa en Culiacán") == "Narcotráfico"
    assert c.tipo_de("Italian police arrest 'Ndrangheta bosses") == "Mafia"
    assert c.tipo_de("Pandillas imponen cobro de piso a comerciantes") == "Crimen organizado"


def test_severidad():
    assert c.severidad_de("Masacre deja 12 muertos en bar de Celaya") == 5
    assert c.severidad_de("Ataque armado en Uruapan") == 4
    assert c.severidad_de("Detienen a 3 por extorsión") == 2
    assert c.severidad_de("Cártel amplía su presencia en la sierra") == 3


def test_ubicacion_prioriza_ciudad_y_estado_de_mexico():
    assert c.ubicar("Balacera en Culiacán deja dos heridos", EST, GAZ, "mx")[2] == "Culiacán, Sinaloa"
    assert c.ubicar("Hallan fosa clandestina en Zacatecas", EST, GAZ, "mx")[3] == "MEX"
    assert c.ubicar("Operativo en el Estado de México", EST, GAZ, "mx")[2] == "Estado de México"
    # «Hidalgo» como apellido no es el estado
    r = c.ubicar("Diputado Hidalgo denuncia amenazas", EST, GAZ, "mx")
    assert r[2] == "México (sin lugar en el título)" and r[4] == "país"
    assert c.ubicar("Violencia en Hidalgo: dos ejecutados", EST, GAZ, "mx")[2] == "Hidalgo"
    assert c.ubicar("Bomb attack in Kabul kills five", EST, GAZ, "mundo")[3] == "AFG"
    assert c.ubicar("Mafia boss arrested", EST, GAZ, "mundo") is None


def test_feature_y_duplicados():
    art = {"title": "Ataque armado en Uruapan deja 3 muertos", "url": "https://medio.mx/a", "domain": "medio.mx", "seendate": "20261008T120000Z"}
    f = c.a_feature(art, "mx", EST, GAZ)
    p = f["properties"]
    assert (p["tipo"], p["severidad"], p["lugar"], p["date"]) == ("Crimen organizado", 4, "Uruapan, Michoacán", "2026-10-08T12:00:00Z")
    assert set(p) == {"title", "url", "source", "date", "tipo", "severidad", "lugar", "pais_iso3", "precision", "origen"}  # sin texto del artículo
    g = c.a_feature({**art, "url": "https://otro.mx/b", "title": "Ataque armado en Uruapan deja 3 muertos - Otro"}, "mx", EST, GAZ)
    assert len(c.deduplicar([f, g])) == 1
    assert c.a_feature({**art, "url": "javascript:x"}, "mx", EST, GAZ) is None
