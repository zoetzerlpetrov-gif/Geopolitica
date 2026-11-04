"""Ningún archivo del proyecto depende de otro repositorio ni lo nombra (pedido de la persona dueña, 04-nov-2026)."""
import os
import re
import subprocess

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PROHIBIDOS = re.compile(r"warroomviajero|clima t[aá]ctico|trackalien|inmueblewarroom|inmueblesarasadasi", re.I)


def test_no_se_nombran_otros_repositorios():
    archivos = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True).stdout.split()
    hallados = []
    for a in archivos:
        if a.startswith("tools/medicion/node_modules") or a.endswith((".png", ".jpg", ".pmtiles", ".gz", ".pbf", ".woff2")) or a == "tests/test_sin_repos_externos.py":
            continue
        try:
            texto = open(os.path.join(ROOT, a), encoding="utf-8").read()
        except (UnicodeDecodeError, OSError):
            continue
        if PROHIBIDOS.search(texto):
            hallados.append(a)
    assert not hallados, hallados


def test_ara_sadasi_usa_identificador_propio_y_robots():
    texto = open(os.path.join(ROOT, "tools", "inmuebles", "ara_sadasi.py"), encoding="utf-8").read()
    assert "Geopolitica-monitor" in texto and "permitido_por_robots" in texto and "Mozilla" not in texto
