"""Una corrida vieja/parcial de datos-vivos no puede quitar México de la publicación dedicada."""
import json
import os
import sys
import subprocess
from pathlib import Path
from datetime import datetime, timezone
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools/red'))
import estafas as E
import fusionar_estafas as P


def crear(carpeta, pais, fecha='2026-11-17T12:00:00Z', version=2):
    ahora = datetime.fromisoformat(fecha.replace('Z', '+00:00'))
    ns = [{'t': f'Alerta por estafa bancaria en {pais}', 'f': 'Medio', 'url': f'https://medio.example/{pais}', 'fecha': '2026-11-16T12:00:00Z'}]
    fc, notas = E.construir({}, {}, ns, ahora)
    fc.update(version_esquema=version, fuentes={'Medio': {'estado': 'error'}})
    carpeta.mkdir(parents=True, exist_ok=True)
    (carpeta / 'estafas.geojson').write_text(json.dumps(fc))
    (carpeta / 'estafas_estado.json').write_text(json.dumps({'version_esquema': version, 'generado_utc': fecha, 'notas': notas}))


def paises(carpeta):
    return {f['properties']['iso3'] for f in json.loads((carpeta / 'estafas.geojson').read_text())['features']}


def test_corrida_nueva_parcial_conserva_reportes_mexicanos(tmp_path):
    viejo, nuevo, salida = [tmp_path / p for p in ['vigente', 'parcial', 'salida']]
    crear(viejo, 'México')
    crear(nuevo, 'Colombia', '2026-11-17T13:00:00Z')
    P.fusionar(viejo, nuevo, salida)
    assert paises(salida) == {'MEX', 'COL'}
    assert json.loads((salida / 'estafas.geojson').read_text())['fuentes']['Medio']['estado'] == 'error'


def test_esquema_antiguo_no_sustituye_y_corrida_antigua_no_revierte(tmp_path):
    viejo, nuevo, salida = [tmp_path / p for p in ['vigente', 'antiguo', 'salida']]
    crear(viejo, 'México')
    crear(nuevo, 'Colombia', '2026-11-17T13:00:00Z', version=1)
    with pytest.raises(ValueError, match='Esquema antiguo'):
        P.fusionar(viejo, nuevo, salida)
    assert not salida.exists()
    crear(nuevo, 'Colombia', '2026-11-17T11:00:00Z')
    P.fusionar(viejo, nuevo, salida)
    assert paises(salida) == {'MEX'}


def test_expiran_a_los_30_dias_y_no_se_conservan_como_incidentes_actuales(tmp_path):
    viejo, nuevo, salida = [tmp_path / p for p in ['vigente', 'nuevo', 'salida']]
    crear(viejo, 'México')
    crear(nuevo, 'Colombia', '2026-12-20T12:00:00Z')
    P.fusionar(viejo, nuevo, salida)
    assert paises(salida) == set()


def test_publicador_real_solo_envia_estafas_y_preserva_estado(tmp_path):
    env = {**os.environ, 'GIT_AUTHOR_NAME': 'test', 'GIT_AUTHOR_EMAIL': 'test@example.org',
           'GIT_COMMITTER_NAME': 'test', 'GIT_COMMITTER_EMAIL': 'test@example.org',
           'PATH': str(Path(sys.executable).parent) + os.pathsep + os.environ['PATH']}
    remoto = tmp_path / 'remoto.git'
    subprocess.run(['git', 'init', '-q', '--bare', str(remoto)], check=True)
    semilla = tmp_path / 'semilla'; crear(semilla / 'vivos', 'México')
    def git(*args, cwd=semilla):
        return subprocess.check_output(['git', *args], cwd=cwd, env=env, stderr=subprocess.DEVNULL).decode()
    git('init', '-q'); git('checkout', '-q', '-b', 'datos-estafas'); git('add', 'vivos'); git('commit', '-qm', 'semilla')
    git('push', '-q', str(remoto), 'HEAD:datos-estafas')
    trabajo = tmp_path / 'trabajo'; crear(trabajo / 'vivos', 'Colombia', '2026-11-17T13:00:00Z')
    for nombre in ['tools', 'ingest', 'config']:
        (trabajo / nombre).symlink_to(ROOT / nombre, target_is_directory=True)
    git('init', '-q', cwd=trabajo)
    r = subprocess.run(['bash', str(ROOT / 'tools/red/publicar_estafas.sh')], cwd=trabajo,
                       env={**env, 'DESTINO_GIT': str(remoto)}, capture_output=True, text=True, timeout=30)
    assert r.returncode == 0, r.stderr
    d = json.loads(git('--git-dir=' + str(remoto), 'show', 'datos-estafas:vivos/estafas.geojson'))
    assert {f['properties']['iso3'] for f in d['features']} == {'MEX', 'COL'}
    assert git('--git-dir=' + str(remoto), 'ls-tree', '-r', '--name-only', 'datos-estafas').splitlines() == [
        'vivos/estafas.geojson', 'vivos/estafas_estado.json']
