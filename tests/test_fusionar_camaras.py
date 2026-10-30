"""Fusión de capas/ entre «Cámaras del mundo» y «Construir capas» (grupos de concurrencia separados)."""
import json
import os
import shutil
import subprocess
import sys

import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "capas"))
import fusionar_camaras as F  # noqa: E402

SCRIPT = os.path.join(ROOT, "tools", "capas", "publicar_datos_capas.sh")
FUSIONAR = os.path.join(ROOT, "tools", "capas", "fusionar_camaras.py")


def hacer_capas(carpeta, cam_fecha, cam_texto, otras_texto, gen="2026-10-30T00:00:00Z"):
    os.makedirs(os.path.join(carpeta, "camaras_cache"), exist_ok=True)
    open(os.path.join(carpeta, "camaras.geojson"), "w").write(cam_texto)
    open(os.path.join(carpeta, "camaras_cache", "a.json"), "w").write(cam_texto)
    open(os.path.join(carpeta, "cables.pmtiles"), "w").write(otras_texto)
    manifest = {"generado_utc": gen, "familias": {
        "camaras": {"actualizado_utc": cam_fecha, "objetos": len(cam_texto)},
        "cables": {"actualizado_utc": gen, "nota": otras_texto}}}
    json.dump(manifest, open(os.path.join(carpeta, "manifest.json"), "w"))


def leer(carpeta, rel):
    return open(os.path.join(carpeta, rel)).read()


def test_camaras_solo_cambia_camaras(tmp_path):
    remoto, mio, out = tmp_path / "remoto", tmp_path / "mio", tmp_path / "out"
    hacer_capas(remoto, "2026-10-28T00:00:00Z", "cam-vieja", "cables-NUEVOS")
    hacer_capas(mio, "2026-10-30T00:00:00Z", "cam-nueva", "cables-viejos")
    assert F.fusionar(remoto, mio, out) is True
    assert leer(out, "camaras.geojson") == "cam-nueva"
    assert leer(out, "camaras_cache/a.json") == "cam-nueva"
    assert leer(out, "cables.pmtiles") == "cables-NUEVOS"
    m = json.load(open(out / "manifest.json"))
    assert m["familias"]["camaras"]["actualizado_utc"] == "2026-10-30T00:00:00Z"
    assert m["familias"]["cables"]["nota"] == "cables-NUEVOS"


def test_capas_conserva_camaras_mas_recientes_del_remoto(tmp_path):
    construido, remoto, out = tmp_path / "construido", tmp_path / "remoto", tmp_path / "out"
    hacer_capas(construido, "2026-10-28T00:00:00Z", "cam-vieja", "cables-NUEVOS")
    hacer_capas(remoto, "2026-10-30T00:00:00Z", "cam-nueva", "cables-viejos")
    assert F.fusionar(construido, remoto, out, solo_si_mas_reciente=True) is True
    assert leer(out, "camaras.geojson") == "cam-nueva"
    assert leer(out, "cables.pmtiles") == "cables-NUEVOS"


def test_capas_conserva_sus_camaras_si_las_reconstruyo(tmp_path):
    construido, remoto, out = tmp_path / "construido", tmp_path / "remoto", tmp_path / "out"
    hacer_capas(construido, "2026-11-01T07:00:00Z", "cam-mensual", "cables")
    hacer_capas(remoto, "2026-10-30T00:00:00Z", "cam-remota", "cables")
    assert F.fusionar(construido, remoto, out, solo_si_mas_reciente=True) is False
    assert leer(out, "camaras.geojson") == "cam-mensual"


def test_mismo_contrato_que_verificar_solo_camaras():
    texto = open(os.path.join(ROOT, "tools", "capas", "verificar_solo_camaras.py"), encoding="utf-8").read()
    for nombre in F.ARCHIVOS_CAMARAS | F.CARPETAS_CAMARAS:
        assert f"'{nombre}'" in texto, nombre


def test_workflows_usan_el_script_y_grupos_separados():
    wf = os.path.join(ROOT, ".github", "workflows")
    cam = open(os.path.join(wf, "camaras.yml"), encoding="utf-8").read()
    cap = open(os.path.join(wf, "capas.yml"), encoding="utf-8").read()
    assert "group: camaras" in cam and "group: capas" in cap
    assert "publicar_datos_capas.sh camaras" in cam and "publicar_datos_capas.sh capas" in cap
    assert "--force " not in cam and "--force " not in cap


def _git(*args, cwd):
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


@pytest.mark.skipif(shutil.which("git") is None, reason="sin git")
def test_publicacion_no_pisa_lo_publicado_en_medio(tmp_path):
    """Si «Construir capas» publica mientras «Cámaras» prepara su push, el lease falla y se reintenta."""
    env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
           "GIT_COMMITTER_EMAIL": "t@t"}
    remoto = tmp_path / "remoto.git"
    subprocess.run(["git", "init", "-q", "--bare", str(remoto)], check=True)

    def publicar_rama(texto_cables, cam_fecha, cam_texto):
        d = tmp_path / f"semilla-{texto_cables}"
        hacer_capas(d / "capas", cam_fecha, cam_texto, texto_cables)
        subprocess.run(f"git init -q && git checkout -q -b datos-capas && git add capas && git commit -q -m s "
                       f"&& git push -q --force {remoto} HEAD:datos-capas", shell=True, cwd=d, check=True, env=env)

    publicar_rama("cables-v1", "2026-10-28T00:00:00Z", "cam-vieja")

    # Repo de trabajo de «Cámaras»: un fusionar falso que, en su primera llamada, simula que «Construir capas»
    # publica cables-v2 justo antes del push (el push con lease debe fallar y el reintento debe conservar v2).
    trabajo = tmp_path / "trabajo"
    (trabajo / "tools" / "capas").mkdir(parents=True)
    shutil.copy(SCRIPT, trabajo / "tools" / "capas" / "publicar_datos_capas.sh")
    marca = tmp_path / "ya"
    (tmp_path / "v2.py").write_text(
        "import os, subprocess, sys\n"
        f"sys.path.insert(0, {os.path.dirname(__file__)!r})\n"
        "import test_fusionar_camaras as T\n"
        f"d = {str(tmp_path / 'semilla-v2')!r}\n"
        "T.hacer_capas(os.path.join(d, 'capas'), '2026-10-28T00:00:00Z', 'cam-vieja', 'cables-v2')\n"
        f"subprocess.run('git init -q && git checkout -q -b datos-capas && git add capas && git commit -q -m v2 "
        f"&& git push -q --force {remoto} HEAD:datos-capas', shell=True, cwd=d, check=True)\n")
    (trabajo / "tools" / "capas" / "fusionar_camaras.py").write_text(
        "import os, runpy, sys\n"
        f"if not os.path.exists({str(marca)!r}):\n"
        f"    open({str(marca)!r}, 'w').close()\n"
        f"    runpy.run_path({str(tmp_path / 'v2.py')!r})\n"
        f"sys.argv = [{FUSIONAR!r}] + sys.argv[1:]\n"
        f"runpy.run_path({FUSIONAR!r}, run_name='__main__')\n")
    hacer_capas(trabajo / "capas", "2026-10-30T00:00:00Z", "cam-nueva", "cables-v1")
    _git("init", "-q", cwd=trabajo)

    r = subprocess.run(["bash", "tools/capas/publicar_datos_capas.sh", "camaras", "cámaras prueba"], cwd=trabajo,
                       env={**env, "DESTINO_GIT": str(remoto), "ESPERA_REINTENTO": "0"}, capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, r.stderr
    assert "reintento 1" in r.stderr
    ver = tmp_path / "ver"
    subprocess.run(["git", "clone", "-q", "-b", "datos-capas", str(remoto), str(ver)], check=True)
    assert leer(ver, "capas/cables.pmtiles") == "cables-v2"
    assert leer(ver, "capas/camaras.geojson") == "cam-nueva"
