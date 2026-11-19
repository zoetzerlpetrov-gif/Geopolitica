"""El submenú Admin de Secciones (index.html) se organiza en grupos plegables; dentro de cada grupo, orden alfabético."""
import os
import re
import unicodedata

ROOT = os.path.join(os.path.dirname(__file__), "..")


def _clave(linea):
    m = re.search(r"<summary>([^<]+)</summary>", linea) if 'class="centro-menu"' in linea else None
    t = m.group(1) if m else re.sub(r"<[^>]+>", "", linea).strip()
    t = re.sub(r"^[^\wÁÉÍÓÚÑáéíóúñ]+", "", t)
    return unicodedata.normalize("NFD", t).encode("ascii", "ignore").decode().lower()


def _grupos():
    s = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    return re.findall(r'<details class="admin-grupo" data-admin-grupo="([a-z]+)"><summary>[^<]+</summary>(?:<p class="meta">[^<]*</p>)?\n(.*?)\n\s*</details>\n', s, re.S)


def test_admin_en_grupos_y_orden_alfabetico():
    grupos = _grupos()
    assert [g for g, _ in grupos] == ["acceso", "analisis", "negocio", "sistema"]
    total = 0
    for nombre, cuerpo in grupos:
        lineas = [x for x in cuerpo.split("\n") if x.strip() and "<template" not in x]
        if nombre == "acceso":
            assert 'id="acceso-mapa-admin"' in lineas[0]
            lineas = lineas[1:]
        claves = [_clave(x) for x in lineas]
        assert claves == sorted(claves), nombre
        total += len(lineas)
    assert total >= 25


def test_lo_que_guarda_en_el_servidor_va_en_acceso_administrativo():
    acceso = dict(_grupos())["acceso"]
    for pagina in ("apariencia.html", "legal.html", "marketing.html"):
        assert f'href="https://admin.dominusosint.com/{pagina}"' in acceso
    assert "huella-admin-menu" in acceso
