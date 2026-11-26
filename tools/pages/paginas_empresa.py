"""Copias públicas de DOMINUS OPS, Caja del analista e Inteligencia corporativa para las empresas cliente.

Uso: python3 tools/pages/paginas_empresa.py _site   (antes de mover_admin.py, que mueve los originales a /ops/)

Las originales son de administración. Las copias (empresa-ops.html, empresa-caja.html, empresa-corporativo.html) quedan en
la raíz para abrirse dentro de Mi empresa → 🧭 Flujo de trabajo: js/sincronizar.js las detecta por su nombre, exige la
empresa (?org=) y el modo incrustado, y guarda los datos con la sesión del miembro en /cuenta/empresa/<org>/datos.
Sin sesión de un miembro de esa empresa, la página no muestra la herramienta.
"""
import os
import sys

COPIAS = {"ops.html": "empresa-ops.html", "herramientas.html": "empresa-caja.html", "corporativo.html": "empresa-corporativo.html"}
META = '<meta name="robots" content="noindex, nofollow">'


def copiar(sitio):
    hechas = []
    for origen, destino in COPIAS.items():
        with open(os.path.join(sitio, origen), encoding="utf-8") as f:
            html = f.read()
        i = html.lower().find("<head")
        if i < 0:
            raise ValueError(f"{origen}: sin <head>")
        j = html.index(">", i) + 1
        html = html[:j] + META + html[j:]
        with open(os.path.join(sitio, destino), "w", encoding="utf-8") as f:
            f.write(html)
        hechas.append(destino)
    with open(os.path.join(sitio, "_headers"), "a", encoding="utf-8") as f:
        for d in hechas:
            for ruta in (f"/{d}", f"/{d[:-5]}"):
                f.write(f"\n{ruta}\n  X-Robots-Tag: noindex, nofollow\n  Cache-Control: no-store\n")
    return hechas


if __name__ == "__main__":
    print("Copias para empresas:", ", ".join(copiar(sys.argv[1] if len(sys.argv) > 1 else "_site")))
