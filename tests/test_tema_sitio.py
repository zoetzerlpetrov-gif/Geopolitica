"""El tema claro u oscuro elegido en el mapa (gp_theme) se aplica en todas las páginas del sitio."""
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]


def test_todas_las_paginas_leen_el_tema_elegido():
    faltan = [p.name for p in sorted(RAIZ.glob("*.html")) if "gp_theme" not in p.read_text(encoding="utf-8")]
    assert not faltan, f"Páginas que no respetan el tema del mapa: {faltan}"


def test_las_paginas_con_estilo_propio_tienen_version_clara():
    for nombre in ("demo.html", "warroom.html"):
        assert ':root[data-theme="light"]' in (RAIZ / nombre).read_text(encoding="utf-8"), nombre
