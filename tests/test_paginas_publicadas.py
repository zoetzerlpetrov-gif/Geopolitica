"""Cada página .html de la raíz se copia al sitio publicado (si falta en pages.yml, el sitio da 404)."""
import glob
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def test_todas_las_paginas_se_publican():
    yml = open(os.path.join(ROOT, ".github", "workflows", "pages.yml"), encoding="utf-8").read()
    copia = next(l for l in yml.splitlines() if re.search(r"cp -r index\.html", l))
    faltan = [os.path.basename(p) for p in glob.glob(os.path.join(ROOT, "*.html")) if os.path.basename(p) not in copia.split()]
    assert not faltan, f"agregar a pages.yml: {faltan}"
