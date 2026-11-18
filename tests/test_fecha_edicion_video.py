"""Fecha editorial de la edición y restauración real del historial, sin subir videos."""
import json
import os
import subprocess
import sys
from pathlib import Path
from datetime import datetime, timezone
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools/noticiero_video'))
import fecha_edicion as F
import guion as G
import subir as S


def utc(t):
    return datetime.fromisoformat(t.replace('Z', '+00:00'))


def guion(fecha='2026-11-17', origen='automatica'):
    g = G.guion(fecha, [])
    g['edicion'] = F.edicion(fecha if origen == 'manual' else None, ahora=utc('2026-11-17T13:17:00Z'))
    return g


def test_martes_17_y_miercoles_18_se_calculan_en_cdmx():
    assert F.edicion(ahora=utc('2026-11-17T13:17:00Z'))['fecha'] == '2026-11-17'
    assert G.fecha_larga('2026-11-17') == 'martes 17 de noviembre de 2026'
    assert G.fecha_larga('2026-11-18') == 'miércoles 18 de noviembre de 2026'
    assert F.edicion(ahora=utc('2026-11-18T05:59:59Z'))['fecha'] == '2026-11-17'
    assert F.edicion(ahora=utc('2026-11-18T06:00:00Z'))['fecha'] == '2026-11-18'


def test_portada_locucion_descripcion_y_youtube_comparten_fecha():
    g = guion()
    F.validar_edicion(g, g['descripcion'], ahora=utc('2026-11-17T23:59:00Z'))
    m = S.metadatos(g, g['descripcion'])
    assert 'Martes 17 de noviembre de 2026' in m['snippet']['title']
    assert 'martes 17 de noviembre de 2026' in m['snippet']['description']
    assert 'martes 17 de noviembre de 2026' in g['escenas'][0]['voz']


@pytest.mark.parametrize('campo', ['titulo', 'descripcion', 'portada', 'voz'])
def test_se_rechaza_una_fecha_distinta_en_cualquier_salida(campo):
    g = guion()
    if campo == 'titulo': g['titulo'] = 'Brújula Diaria · Lunes 16 de noviembre de 2026'
    elif campo == 'descripcion': g['descripcion'] = 'Edición del lunes 16 de noviembre de 2026'
    elif campo == 'portada': g['escenas'][0]['texto'] = 'Lunes 16 de noviembre de 2026'
    else: g['escenas'][0]['voz'] = 'Buenos días, lunes 16 de noviembre de 2026'
    with pytest.raises(ValueError, match='no coincide'):
        F.validar_edicion(g, g['descripcion'], ahora=utc('2026-11-17T14:00:00Z'))


def test_cambio_de_dia_bloquea_subida_automatica_pero_respeta_edicion_manual():
    g = guion()
    with pytest.raises(ValueError, match='otro día'):
        F.validar_edicion(g, g['descripcion'], ahora=utc('2026-11-18T13:17:00Z'))
    g['edicion']['origen'] = 'manual'
    F.validar_edicion(g, g['descripcion'], ahora=utc('2026-11-18T13:17:00Z'))
    for invalida in ['2026-02-30', '17/11/2026', '2026-11-17 ']:
        with pytest.raises(ValueError): F.edicion(invalida)


def test_fecha_incorrecta_se_detecta_antes_de_pedir_token_o_enviar_a_youtube(monkeypatch, tmp_path):
    g = guion(); g['titulo'] = 'Lunes 16 de noviembre de 2026'
    g['edicion']['origen'] = 'manual'  # Aísla el chequeo de coherencia de la hora real del runner.
    (tmp_path / 'guion.json').write_text(json.dumps(g))
    (tmp_path / 'descripcion.txt').write_text(g['descripcion'])
    for k in ['YT_CLIENT_ID', 'YT_CLIENT_SECRET', 'YT_REFRESH_TOKEN']: monkeypatch.setenv(k, 'prueba')
    monkeypatch.setattr(S, 'token_de_acceso', lambda *a: pytest.fail('No debe abrir una sesión ni subir un video con fecha incoherente'))
    with pytest.raises(ValueError, match='no coincide'):
        S.subir(str(tmp_path))


@pytest.mark.parametrize('con_guiones', [True, False])
def test_restauracion_desde_subcarpeta_no_pierde_guiones_y_admite_historial_vacio(tmp_path, con_guiones):
    env = {**os.environ, 'GIT_AUTHOR_NAME': 'test', 'GIT_AUTHOR_EMAIL': 'test@example.org',
           'GIT_COMMITTER_NAME': 'test', 'GIT_COMMITTER_EMAIL': 'test@example.org'}
    remoto = tmp_path / 'remoto.git'
    subprocess.run(['git', 'init', '-q', '--bare', str(remoto)], check=True)
    semilla = tmp_path / 'semilla'; semilla.mkdir()
    (semilla / 'comentarios').mkdir(); (semilla / 'comentarios/borradores.json').write_text('{}')
    if con_guiones:
        (semilla / 'guiones').mkdir(); (semilla / 'guiones/video.json').write_text('{"fecha":"2026-11-16"}')
    for args in [['init','-q'],['checkout','-q','-b','datos-comentarios'],['add','.'],['commit','-qm','historial'],['push','-q',str(remoto),'HEAD:datos-comentarios']]:
        subprocess.run(['git', *args], cwd=semilla, env=env, check=True, capture_output=True)
    trabajo = tmp_path / 'trabajo'; trabajo.mkdir()
    subprocess.run(['git', 'init', '-q'], cwd=trabajo, check=True)
    destino = trabajo / 'datos'
    r = subprocess.run(['bash', str(ROOT / 'tools/noticiero_video/restaurar_historial.sh'), str(destino)],
                       cwd=trabajo, env={**env, 'DESTINO_GIT': str(remoto)}, capture_output=True, text=True, timeout=30)
    assert r.returncode == 0, r.stderr
    assert (destino / '.git').exists() and (destino / 'guiones').is_dir()
    assert (destino / 'comentarios/borradores.json').exists()
    if con_guiones: assert json.loads((destino / 'guiones/video.json').read_text())['fecha'] == '2026-11-16'
    else: assert '::warning::' in r.stdout


def test_workflow_identifica_artefacto_por_fecha_y_no_omite_validacion_de_fecha_manual():
    wf = (ROOT / '.github/workflows/noticiero-video.yml').read_text()
    assert 'noticiero-${{ steps.render.outputs.fecha }}-' in wf
    assert 'if [ -n "$FECHA" ]' in wf
    assert 'restaurar_historial.sh /tmp/previos' in wf
    assert 'restaurar_historial.sh datos' in (ROOT / '.github/workflows/comentarios-youtube.yml').read_text()
