"""Las páginas de administración se publican en /ops/ con <base> y redirecciones desde sus rutas viejas."""
import json
import os
import shutil
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, os.path.join(ROOT, "tools", "pages"))
import mover_admin  # noqa: E402


def test_mueve_las_paginas_admin_a_ops(tmp_path):
    sitio = tmp_path / "_site"
    sitio.mkdir()
    for p in ("legal.html", "portafolio.html", "demo.html", "index.html"):
        shutil.copy(os.path.join(ROOT, p), sitio / p)
    (sitio / "_redirects").write_text("/condiciones  /terminos  301\n", encoding="utf-8")
    (sitio / "_headers").write_text("/*\n  X-Content-Type-Options: nosniff\n", encoding="utf-8")
    movidas = mover_admin.mover(str(sitio))
    assert movidas == ["legal", "portafolio"]
    assert not (sitio / "legal.html").exists() and (sitio / "demo.html").exists()
    html = (sitio / "ops" / "legal.html").read_text(encoding="utf-8")
    assert html.index('<base href="../">') < html.index("css/app.css")
    red = (sitio / "_redirects").read_text(encoding="utf-8")
    assert "/legal.html  /ops/legal  301" in red and "/portafolio  /ops/portafolio  301" in red
    assert "/ops/*\n  X-Robots-Tag: noindex" in (sitio / "_headers").read_text(encoding="utf-8")


def test_lista_de_admin_coherente():
    c = json.load(open(os.path.join(ROOT, "config", "paginas_admin.json"), encoding="utf-8"))
    planes = json.load(open(os.path.join(ROOT, "config", "planes.json"), encoding="utf-8"))
    for p in c["paginas"]:
        assert os.path.exists(os.path.join(ROOT, p + ".html")), p
        assert p + ".html" not in planes["acceso_por_plan"]["paginas"], f"{p} es de un plan de clientes"
    for compartida in ("demo", "cartera", "camaras", "privacidad", "terminos", "planes", "tutorial"):
        assert compartida not in c["paginas"]


def test_sin_redireccion_vieja_que_cree_un_ciclo():
    assert "/legal  /legal.html" not in open(os.path.join(ROOT, "_redirects"), encoding="utf-8").read()
