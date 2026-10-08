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
    assert set(p) == {"title", "url", "source", "date", "tipo", "severidad", "lugar", "pais_iso3", "precision", "origen", "arma"}  # sin texto del artículo
    g = c.a_feature({**art, "url": "https://otro.mx/b", "title": "Ataque armado en Uruapan deja 3 muertos - Otro"}, "mx", EST, GAZ)
    assert len(c.deduplicar([f, g])) == 1
    assert c.a_feature({**art, "url": "javascript:x"}, "mx", EST, GAZ) is None


def test_evento_gdelt_criminal_y_violento():
    from geo import Paises
    f = [""] * 61
    f[6], f[12], f[16], f[28], f[33], f[51] = "SINALOA CARTEL", "CRM", "MEXICO", "19", "4", "4"
    f[52], f[56], f[57], f[59] = "Culiacan, Sinaloa, Mexico", "24.8", "-107.39", "20261008220000"
    f[60] = "https://www.medio.mx/seguridad/2026/10/08/enfrentamiento-armado-deja-cinco-muertos-en-culiacan"
    pa = Paises()
    p = c.evento_gdelt(f, GAZ, pa)["properties"]
    assert (p["tipo"], p["severidad"], p["pais_iso3"], p["precision"], p["date"]) == ("Narcotráfico", 4, "MEX", "ciudad", "2026-10-08T22:00:00Z")
    assert "enfrentamiento armado" in p["title"].lower()
    g = list(f); g[12] = ""  # sin actor criminal/armado: no entra
    assert c.evento_gdelt(g, GAZ, pa) is None
    h = list(f); h[28] = "04"  # acción no violenta (consulta): no entra
    assert c.evento_gdelt(h, GAZ, pa) is None
    k = list(f); k[12] = "INS"; k[6] = "ISLAMIC STATE"; k[60] = "https://news.example/2026/10/08/isis-suicide-bomber-attack"; k[52] = "Kabul, Afghanistan"; k[56], k[57] = "34.5", "69.2"
    assert c.evento_gdelt(k, GAZ, pa)["properties"]["tipo"] == "Terrorismo"


def test_ataques_por_codigo_cameo_y_palabras():
    from geo import Paises
    f = [""] * 61
    f[6], f[16], f[26], f[28], f[33], f[51] = "RUSSIA", "UKRAINE", "1952", "19", "12", "4"
    f[52], f[56], f[57], f[59] = "Kyiv, Ukraine", "50.45", "30.52", "20261008220000"
    f[60] = "https://news.example/2026/10/08/overnight-attack-on-kyiv-power-grid"
    p = c.evento_ataque(f, Paises())["properties"]
    assert (p["arma"], p["tipo"], p["severidad"], p["pais_iso3"]) == ("Drones", "Ataque", 4, "UKR")
    g = list(f); g[26] = "190"  # fuerza militar genérica: no es un ataque con arma identificada
    assert c.evento_ataque(g, Paises()) is None
    assert c.arma_de("Russia fires ballistic missiles at Kharkiv") == "Misiles o cohetes"
    assert c.arma_de("", "1832") == "Coche bomba"


def test_titulares_de_medios_mexicanos():
    assert c.clasificar_titular("Deslave bloquea la carretera Acapulco-Zihuatanejo") == ("deslave", None)
    assert c.clasificar_titular("Atacan con drones explosivos a comunidad de Michoacán") == ("ataque", "Drones")
    assert c.clasificar_titular("Balacera en Celaya deja dos muertos")[0] == "crimen"
    assert c.clasificar_titular("Inauguran feria del libro") == (None, None)
    cfg = json.load(open(os.path.join(ROOT, "config", "fuentes_mx.json"), encoding="utf-8"))
    assert all(x["url"].startswith("https://") for x in cfg["feeds"]) and len({x["id"] for x in cfg["feeds"]}) == len(cfg["feeds"])
