"""El submenú Admin de Secciones (index.html) va en orden alfabético para encontrar las opciones más rápido."""
import os
import re
import unicodedata

ROOT = os.path.join(os.path.dirname(__file__), "..")


def _clave(linea):
    m = re.search(r"<summary>([^<]+)</summary>", linea) if 'class="centro-menu"' in linea else None
    t = m.group(1) if m else re.sub(r"<[^>]+>", "", linea).strip()
    t = re.sub(r"^[^\wÁÉÍÓÚÑáéíóúñ]+", "", t)
    return unicodedata.normalize("NFD", t).encode("ascii", "ignore").decode().lower()


def test_admin_en_orden_alfabetico():
    s = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    i = s.index('<div class="admin-menu-contenido">\n') + len('<div class="admin-menu-contenido">\n')
    j = s.index("\n          </div></details>\n        </div>\n      </details>", i)
    claves = [_clave(x) for x in s[i:j].split("\n")]
    assert len(claves) >= 15 and claves == sorted(claves)
