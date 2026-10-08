"""Resumen propio por reglas (~30 palabras): extrae hechos y nunca copia oraciones del medio.

Ejecutar:  python3 -m pytest -q tests/test_resumen.py
"""
import os
import sys

import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "ingest"))
sys.path.insert(0, os.path.dirname(__file__))
import fuentes as F  # noqa: E402
import resumen as RS  # noqa: E402
import test_ingesta as T  # noqa: E402
from classify import normalizar  # noqa: E402

RSS = """<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>
<item><title>Saudi Arabia confirms three dead in Houthi strikes on its airports</title><link>https://example.org/s1</link>
<pubDate>Thu, 08 Oct 2026 10:00:00 GMT</pubDate><description>Yemen's Houthi rebels launched drones at two airports in southern Saudi Arabia, killing three people and injuring 12, officials said. The UN called for restraint.</description></item>
<item><title>Ataques con drones dejan sin electricidad a Kiev</title><link>https://example.org/s2</link>
<pubDate>Thu, 08 Oct 2026 10:00:00 GMT</pubDate><description>Rusia lanzó 40 drones contra la red eléctrica ucraniana; 200.000 hogares quedaron sin luz y hubo 2 heridos.</description></item>
<item><title>EU-China trade talks begin in Beijing amid escalating pressure</title><link>https://example.org/s3</link>
<pubDate>Thu, 08 Oct 2026 10:00:00 GMT</pubDate><description>The European Union seeks to cut its 300 billion euro trade deficit with China, as tariffs on electric vehicles rise 15%.</description></item>
</channel></rss>""".encode()


def _eventos():
    c = F.parsear_rss(RSS, {"id": "x", "nombre": "Medio", "tipo": "noticia", "idioma": "en"})
    c.append(F.fila_gdelt(T.fila(), T.CFG["gdelt"]))
    descripciones = {x["url"]: x["texto_clasificar"] for x in c}
    eventos, _ = T._procesar(c)
    return {e["url"]: e for e in eventos}, descripciones


@pytest.mark.parametrize("texto,esperado", [
    ("Saudi Arabia confirms three dead; officials say killing three people and injuring 12", ["3 muertos", "12 heridos"]),
    ("Rusia lanzó 40 drones; 200.000 hogares sin luz y hubo 2 heridos", ["40 drones", "200.000 hogares afectados", "2 heridos"]),
    ("Un muerto y dos heridos en el ataque", ["1 muerto", "2 heridos"]),
    ("Deficit of 300 billion euro as tariffs rise 15%", ["300 mil millones de euros", "15 %"]),
    ("Sin cifras en este titular", []),
])
def test_cifras(texto, esperado):
    assert RS.cifras(texto) == esperado


def test_organismos_y_siglas():
    assert RS.organismos("The UN and NATO met in Brussels") == ["la ONU", "la OTAN"]
    assert RS.organismos("Hay un acuerdo") == []          # «un» en minúsculas no es la ONU
    assert RS.organismos("Officials who spoke said") == []  # «who» en minúsculas no es la OMS


def test_resumenes_de_unas_30_palabras_y_en_espanol():
    ev, _ = _eventos()
    for e in ev.values():
        n = len(e["resumen"].split())
        assert 15 <= n <= 45, (n, e["resumen"])
        assert len(e["resumen"]) <= 400
    s = ev["https://example.org/s1"]["resumen"]
    assert "Arabia Saudita" in s and "3 muertos y 12 heridos" in s and "los hutíes" in s and "inglés" in s
    assert "40 drones" in ev["https://example.org/s2"]["resumen"]


def test_no_copia_frases_del_medio():
    """Ninguna secuencia de 5 palabras de la descripción del medio aparece en el resumen."""
    ev, desc = _eventos()
    for url, e in ev.items():
        if e["fuente"].startswith("GDELT"):
            continue
        d = normalizar(desc[url]).split()
        r = normalizar(e["resumen"])
        for i in range(len(d) - 4):
            assert f" {' '.join(d[i:i + 5])} " not in r, (url, d[i:i + 5])


def test_gdelt_titulo_y_resumen_en_espanol():
    ev, _ = _eventos()
    g = next(e for e in ev.values() if e["fuente"].startswith("GDELT"))
    assert g["titulo"] == "Combate: Rusia → Ucrania (Kyiv, Ucrania)"
    assert "40 artículos de 12 medios" in g["resumen"] and "russian missile strike kyiv power grid" in g["resumen"]


def test_actor_que_no_es_pais_se_conserva():
    gaz = T.GAZ
    assert RS.nombre_actor("NATIONAL GUARD", gaz) == "National Guard"
    assert RS.nombre_actor("UNITED STATES", gaz) == "Estados Unidos"
