"""Contratos de catálogos, aislamiento de fallos y conservación de otras capas."""
import json
from pathlib import Path
import sys
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools/capas'))
import camaras_mundo as M
from verificar_solo_camaras import inventario

ROOT = Path(__file__).resolve().parents[1]
CFG = json.loads((ROOT / 'config/camaras_fuentes.json').read_text())


def fuente(sid):
    return next(s for s in CFG['fuentes'] if s['id'] == sid)


def test_jsonp_solo_callbacks_conocidos_sin_evaluacion():
    assert M.json_de(b'jsonTMCEarthCamerasCallback({"Data": []});') == {'Data': []}
    with pytest.raises(ValueError):
        M.json_de('evil({"Data": []})')


def test_geonet_coordenadas_invertidas_y_url_oficial():
    d = [{'features': [{'geometry': {'coordinates': [-39.16, 175.48]}, 'properties': {'title': 'Ngauruhoe', 'latest-image-large': 'latest/ngauruhoe.jpg'}}]}]
    f = M.normalizar(fuente('geonet'), json.dumps(d))[0]
    assert f['geometry']['coordinates'] == [175.48, -39.16]
    assert f['properties']['imgs'] == ['https://images.geonet.org.nz/volcano/cameras/latest/ngauruhoe.jpg']
    assert f['properties']['st'] == 'volcanes_clima'


def test_tfl_clips_no_etiquetados_como_directo_y_medios_filtrados():
    def row(id, url):
        return {'id': id, 'commonName': 'Street', 'lon': -.1, 'lat': 51.5, 'additionalProperties': [{'key': 'videoUrl', 'value': url}]}
    fs = M.normalizar(fuente('tfl'), json.dumps([row('1', 'https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/a.mp4'), row('2', 'https://evil.example/a.mp4'), row('3', 'https://s3-eu-west-1.amazonaws.com/a.mp4?token=SECRET')]))
    assert fs[0]['properties']['modo'] == 'clip'
    assert 'mp4' not in fs[1]['properties'] and 'mp4' not in fs[2]['properties']


def test_puntos_invalidos_y_privados_no_se_publican():
    for u in ['http://example.com/a', 'javascript:alert(1)', 'https://127.0.0.1/a', 'https://10.0.0.1/a', 'https://user:pass@example.com/a', 'https://example.com/a?key=SECRET']:
        assert not M.url_publica(u)
    data = [{'id': 1, 'name': 'camera', 'is_on': True, 'location': {'coordinates': [200, 49]}},
            {'id': 2, 'name': 'camera', 'location': {'coordinates': [float('nan'), 49]}}]
    assert M.normalizar(fuente('drivebc'), json.dumps(data)) == []


def test_fuentes_solo_enlace_no_incorporan_senal():
    s = fuente('autostrade')
    d = {'webcams': [{'c_uuid': 'x', 't_des_pub': 'A1', 'n_crd_lat': 44, 'n_crd_lon': 11, 'frames': {'V': {'t_url': 'a.mp4'}}}]}
    p = M.normalizar(s, json.dumps(d))[0]['properties']
    assert p['modo'] == 'enlace' and 'imgs' not in p and 'mp4' not in p


def test_duplicados_por_medio_no_por_proximidad():
    def f(id, url):
        return {'properties': {'id': id, 'imgs': [url]}, 'geometry': {'type': 'Point', 'coordinates': [0, 1]}}
    fs = [f('1', 'https://x.example/a.jpg?t=1'), f('2', 'https://x.example/a.jpg?t=2'), f('3', 'https://x.example/b.jpg')]
    assert [x['properties']['id'] for x in M.deduplicar(fs)] == ['1', '3']


def test_catalogo_truncado_no_reemplaza_completo():
    with pytest.raises(ValueError):
        M.normalizar(fuente('noruega'), json.dumps({'numberMatched': 1000, 'features': []}))


def contexto(tmp_path):
    (tmp_path / 'config').mkdir()
    (tmp_path / 'config/camaras_fuentes.json').write_text(json.dumps({'fuentes': [fuente('tfl')]}))
    c = SimpleNamespace(ROOT=str(tmp_path), SALIDA=str(tmp_path / 'capas'), CAM_FUENTES={}, CAM_511={}, iso3=lambda c: 'GBR',
        camaras_webcams_mx=lambda: [], DIGITRAFFIC='', CALTRANS='{d}', SINGAPUR='', HONG_KONG='', NUEVA_ZELANDA='', ISLANDIA='',
        camaras_digitraffic=None, camaras_caltrans=None, camaras_singapur=None, camaras_hong_kong=None, camaras_nueva_zelanda=None,
        camaras_islandia=None, leer_json_aceptando=None, _fuente_camaras=lambda *a, **k: [])
    return c


def test_fallo_no_filtra_secreto_y_conserva_catalogo(tmp_path, monkeypatch):
    for key in ('CAM_NYC_ACUERDO', 'WINDY_WEBCAMS_KEY', 'WSDOT_ACCESS_CODE', 'YOUTUBE_API_KEY'):
        monkeypatch.delenv(key, raising=False)
    c = contexto(tmp_path)
    cached = {'features': [{'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [-.1, 51.5]}, 'properties': {'id': 'tfl:1', 'p': 'GBR', 'catalogo_utc': '2025-01-01'}}], 'actualizado_utc': '2025-01-01'}
    M.guardar(Path(c.SALIDA) / 'camaras_cache/tfl.json', cached)
    def fallo(_):
        raise RuntimeError('https://example.com/?key=SECRETA')
    monkeypatch.setattr(M, 'descargar', fallo)
    fs = M.ampliar(c, [])
    assert fs[0]['properties']['catalogo_anterior'] is True
    assert fs[0]['properties']['catalogo_utc'] == '2025-01-01'
    reporte = (Path(c.SALIDA) / 'camaras_estado.json').read_text()
    assert 'SECRETA' not in reporte
    assert json.loads(reporte)['fuentes']['tfl']['estado'] == 'catalogo_anterior'


def test_guardia_detecta_cambio_en_otras_capas(tmp_path):
    (tmp_path / 'manifest.json').write_text(json.dumps({'generado_utc': 'ayer', 'familias': {'camaras': {'objetos': 1}, 'volcanes': {'objetos': 2}}}))
    (tmp_path / 'volcanes.pmtiles').write_bytes(b'original')
    antes = inventario(tmp_path)
    (tmp_path / 'camaras.geojson').write_text('{}')
    assert antes == inventario(tmp_path)
    (tmp_path / 'volcanes.pmtiles').write_bytes(b'modificado')
    assert antes != inventario(tmp_path)
