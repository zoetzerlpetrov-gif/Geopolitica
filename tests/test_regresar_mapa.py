"""Todas las páginas (salvo el mapa y la demostración, que se comparte por enlace) tienen «← Regresar al Mapa»."""
import glob
import os

ROOT = os.path.join(os.path.dirname(__file__), "..")


def test_todas_las_paginas_regresan_al_mapa_con_el_mismo_texto():
    faltan = [os.path.basename(f) for f in glob.glob(os.path.join(ROOT, "*.html"))
              if os.path.basename(f) not in ("index.html", "demo.html") and "← Regresar al Mapa" not in open(f, encoding="utf-8").read()]
    assert not faltan, faltan
