"""fuentes.html se genera desde SOURCES.md y el sitio ya no enlaza al repositorio."""
import os
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, os.path.join(ROOT, "tools", "pages"))
import fuentes_pagina as fuentes  # noqa: E402


def test_convierte_tablas_enlaces_y_escapa():
    h = fuentes.convertir("# Título\n\nTexto **fuerte** <script>x</script> [OSM](https://www.openstreetmap.org) [mal](javascript:alert(1))\n\n"
                          "| A | B |\n|---|---|\n| 1 | `c` |\n\n- uno\n- dos\n")
    assert '<h1 id="t-tulo">' in h or "<h1" in h
    assert "<table>" in h and "<code>c</code>" in h and "<li>dos</li>" in h
    assert "<script>" not in h and "&lt;script&gt;" in h
    assert 'href="https://www.openstreetmap.org"' in h and "javascript:" not in h.split("[mal]")[0].replace("(javascript:alert(1))", "")
    assert 'href="javascript' not in h


def test_pagina_completa_desde_sources():
    md = open(os.path.join(ROOT, "SOURCES.md"), encoding="utf-8").read()
    p = fuentes.pagina(md)
    assert p.count("<table>") >= 10 and 'rel="icon"' in p


def test_el_sitio_no_enlaza_al_repositorio():
    for f in ("index.html", "terminos.html", "privacidad.html", "tutorial.html", "js/marco.js"):
        assert "github.com/zoetzerlpetrov-gif" not in open(os.path.join(ROOT, f), encoding="utf-8").read(), f
