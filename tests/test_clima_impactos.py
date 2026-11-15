import importlib.util
import json
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location('clima_impactos_actualizar', ROOT / 'tools/clima_impactos/actualizar.py')
C = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(C)
AHORA = datetime(2026, 11, 15, 12, tzinfo=timezone.utc)


def test_enso_fecha_y_avisos_no_se_infiere_por_un_solo_indice():
    a = C.discusion('<p>12 November 2026</p> ENSO Alert System Status: <b>El Niño Advisory</b> Synopsis: text')
    assert a == {'estado_en': 'El Niño Advisory', 'fase': 'nino', 'emitido': '2026-11-12'}
    b = C.discusion('12 November 2026 ENSO Alert System Status: La Niña Watch Synopsis: text')
    assert b['fase'] == 'vigilancia'
    c = C.discusion('12 November 2026 ENSO Alert System Status: Final El Niño Advisory Synopsis: text')
    assert c['fase'] == 'neutral'


def test_probabilidades_cruce_de_anio_y_suma():
    d = C.probabilidades('Issued November 2026 Season La Niña Neutral El Niño OND Oct Nov Dec 0 20 80 NDJ Nov Dec Jan 1 39 60 DJF Dec Jan Feb 10 50 40 JFM Jan Feb Mar 25 50 25')
    assert d['periodos'][0]['desde'] == '2026-10'
    assert d['periodos'][1]['hasta'] == '2027-01'
    assert d['periodos'][2]['desde'] == '2026-12'
    assert d['periodos'][3]['desde'] == '2027-01'
    assert all(sum(r[k] for k in ('nino', 'neutral', 'nina')) == 100 for r in d['periodos'])
    enero = C.probabilidades('Issued January 2027 DJF 20 50 30 JFM 30 40 30')
    assert enero['periodos'][0]['desde'] == '2026-12'
    assert enero['periodos'][1]['desde'] == '2027-01'


def test_probabilidades_rechaza_numeros_imposibles():
    import pytest
    with pytest.raises(ValueError):
        C.probabilidades('Issued November 2026 OND 200 0 1')
    with pytest.raises(ValueError):
        C.discusion('ENSO is warm')


def ejemplo_met():
    return {'properties': {'meta': {'updated_at': '2026-11-15T10:00:00Z'}, 'timeseries': [{'time': '2026-11-15T12:00:00Z', 'data': {'instant': {'details': {'air_temperature': 0, 'wind_speed': 10, 'relative_humidity': 50}}, 'next_6_hours': {'details': {'precipitation_amount': 0}}}}]}}


def test_met_unidades_ceros_y_datos_ausentes_no_se_suman_ventanas():
    x = C.meteorologia(ejemplo_met())
    h = x['horas'][0]
    assert h['viento_kmh'] == 36
    assert h['temp_c'] == 0
    assert h['lluvia_6h_mm'] == 0
    assert h['lluvia_1h_mm'] is None
    assert x['emitido_utc'] == '2026-11-15T10:00:00Z'


def test_fallo_conserva_dato_y_fecha_originales():
    def falla(*_):
        raise OSError('sin conexión')
    previo = {'dato': {'emitido': '2026-10-01'}, 'consultado_utc': '2026-10-02T00:00:00Z', 'ok': True}
    nuevo = C.actualizar_fuente(previo, C.URL_ENSO, C.discusion, AHORA, falla)
    assert nuevo['ok'] is False
    assert nuevo['dato'] == previo['dato']
    assert nuevo['consultado_utc'] == previo['consultado_utc']
    assert nuevo['intento_utc'] == '2026-11-15T12:00:00Z'
    assert previo['ok'] is True


def test_met_no_consulta_antes_de_expires_y_usa_last_modified():
    lugar = {'id': 'cdmx', 'lat': 19.4326, 'lon': -99.1332}
    previo = {'dato': C.meteorologia(ejemplo_met()), 'consultado_utc': '2026-11-15T11:00:00Z', 'ok': True}
    cache = {'cdmx': {'expires': 'Sun, 15 Nov 2026 13:00:00 GMT', 'last_modified': 'Sun, 15 Nov 2026 10:00:00 GMT'}}
    def prohibido(*_):
        raise AssertionError('No debe consultar datos no expirados')
    assert C.actualizar_lugar(previo, lugar, cache, AHORA, prohibido)['consultado_utc'] == previo['consultado_utc']
    cache['cdmx']['expires'] = 'Sun, 15 Nov 2026 11:00:00 GMT'
    def no_modificado(url, headers):
        assert 'lat=19.4326&lon=-99.1332' in url
        assert headers['If-Modified-Since'] == cache['cdmx']['last_modified']
        raise urllib.error.HTTPError(url, 304, 'Not modified', {}, None)
    d = C.actualizar_lugar(previo, lugar, cache, AHORA, no_modificado)
    assert d['ok'] and d['dato']['emitido_utc'] == previo['dato']['emitido_utc']


def test_catalogo_coherente_fuentes_horizontes_y_geografia():
    c = json.loads((ROOT / 'config/clima-impactos.json').read_text())
    ids = {x['id'] for x in c['fuentes']}
    assert len(ids) == len(c['fuentes'])
    hs = {x['id'] for x in c['horizontes']}
    ss = {x['id'] for x in c['sectores']}
    assert len(c['amenazas']) >= 20 and len(c['lugares']) == 24
    for a in c['amenazas']:
        assert a['horizonte'] in hs
        assert set(a['fuentes']) <= ids
        assert set(a['sectores']) <= ss
        assert a['limite'] and a['confirmar'] and a['acciones']
    for l in c['lugares']:
        assert -90 <= l['lat'] <= 90 and -180 <= l['lon'] <= 180


def test_reservado_admin_y_publicado_sin_cambiar_los_otros_planes():
    planes = json.loads((ROOT / 'config/planes.json').read_text())
    assert any(p.get('href') == 'clima-impactos.html' and p.get('tipo') == 'pagina' for p in planes['solo_admin'])
    h = (ROOT / 'index.html').read_text()
    admin = h[h.index('id="menu-admin"'):h.index('id="huella-admin-menu"')]
    assert 'href="clima-impactos.html" data-solo-admin' in admin
    assert 'clima-impactos.html' in (ROOT / '.github/workflows/pages.yml').read_text()
    assert 'datos-clima-impactos' in (ROOT / '.github/workflows/clima-impactos.yml').read_text()
