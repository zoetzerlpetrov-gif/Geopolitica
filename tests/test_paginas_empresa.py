"""Copias de OPS, Caja y Corporativo para Mi empresa (tools/pages/paginas_empresa.py)."""
import os
import shutil
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools", "pages"))
import paginas_empresa  # noqa: E402

RAIZ = os.path.join(os.path.dirname(__file__), "..")


def test_copias_con_noindex_y_mismo_contenido(tmp_path):
    for n in paginas_empresa.COPIAS:
        shutil.copy(os.path.join(RAIZ, n), tmp_path / n)
    (tmp_path / "_headers").write_text("/*\n  X-Frame-Options: SAMEORIGIN\n", encoding="utf-8")
    hechas = paginas_empresa.copiar(str(tmp_path))
    assert hechas == ["empresa-ops.html", "empresa-caja.html", "empresa-corporativo.html"]
    for origen, destino in paginas_empresa.COPIAS.items():
        copia = (tmp_path / destino).read_text(encoding="utf-8")
        assert paginas_empresa.META in copia
        assert copia.replace(paginas_empresa.META, "") == (tmp_path / origen).read_text(encoding="utf-8")
        assert "js/sincronizar.js" in copia  # la copia revisa el acceso del miembro y guarda en su empresa
    cab = (tmp_path / "_headers").read_text(encoding="utf-8")
    assert "/empresa-ops.html\n  X-Robots-Tag: noindex" in cab and "/empresa-caja\n" in cab


def test_pages_las_genera_antes_de_mover_admin():
    yml = open(os.path.join(RAIZ, ".github", "workflows", "pages.yml"), encoding="utf-8").read()
    assert yml.index("paginas_empresa.py _site") < yml.index("mover_admin.py _site")
