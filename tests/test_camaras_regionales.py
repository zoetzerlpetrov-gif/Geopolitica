"""Contratos de fuentes regionales sin consultas de red."""
import json
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools/capas'))
import camaras_regionales as R
import camaras_mundo as M
import youtube_vivo as Y

CFG = json.loads((ROOT / 'config/camaras_fuentes.json').read_text())


def normalizar(sid, raw):
    return M.normalizar(next(s for s in CFG['fuentes'] if s['id'] == sid), raw)


def test_seattle_orden_lat_lon_y_exclusion_socios():
    d = {'Features': [{'PointCoordinate': [47.6, -122.3], 'Cameras': [
        {'Id': 1, 'Description': 'SDOT', 'Type': 'sdot', 'ImageUrl': 'a b.jpg'},
        {'Id': 2, 'Type': 'wsdot', 'ImageUrl': 'b.jpg'},
        {'Id': 3, 'Type': 'sdot', 'ImageUrl': '../c.jpg'}]}]}
    fs = normalizar('seattle', d)
    assert len(fs) == 1
    assert fs[0]['geometry']['coordinates'] == [-122.3, 47.6]
    assert fs[0]['properties']['modo'] == 'enlace'
    assert 'imgs' not in fs[0]['properties']  # No ofrecer preview que respondió 403.


def test_tallinn_solo_ids_publicados_por_operador():
    d = {'html': '<a href="#modal_cam103"><img src="/last/cam103.jpg">Viru</a><a href="#modal_cam104"><img src="/last/cam105.jpg">Retirada</a>', 'lon': 24.728, 'lat': 59.434}
    assert [f['properties']['id'] for f in normalizar('tallinn', d)] == ['tallinn:cam103']
    assert normalizar('tallinn', d)[0]['properties']['aprox'] == 1


def test_dgac_solo_estaciones_publicadas_civiles():
    indice = '<a href="/camara_ubicacion/show/designador/SCAR" title="Chacalluta"></a><a href="/camara_ubicacion/show/designador/SCXX" title="Base (MIL)"></a>'
    coords = "var point = {'latitude':-18.3,'longitude':-70.3,'type':'3'}; marker = createMarker(point,\"SCAR\\nChacalluta\", '3'); var point = {'latitude':-20,'longitude':-71,'type':'3'}; marker = createMarker(point,\"SCXX\\nBase (MIL)\", '3');"
    assert set(R.aerodromos(indice, coords)) == {'SCAR'}


def test_dgac_direcciones_unicas_no_imagenes_referencia():
    d = {'estaciones': {'SCAR': {'lat': -18.3, 'lon': -70.3, 'nombre': 'Chacalluta'}}, 'paginas': {'SCAR': '''
      <a href="https://aipchile.dgac.gob.cl/camara/ftp/SCAR/NORTE/actual.jpg" title="Foto tomada el 2026-10-28"></a>
      <a href="https://aipchile.dgac.gob.cl/camara/ftp/SCAR/NORTE/actual.jpg"></a>
      <a href="https://aipchile.dgac.gob.cl/uploads/referencia.jpg"></a>
      <a href="https://otro.test/camara/ftp/SCAR/SUR/actual.jpg"></a>'''}}
    fs = normalizar('dgac_chile', d)
    assert len(fs) == 1
    assert fs[0]['properties']['aprox'] == 1
    assert fs[0]['properties']['p'] == 'CHL'
    assert fs[0]['properties']['captura_utc'] == '2026-10-28 UTC'


def test_cetsp_activa_con_ubicacion_conocida():
    d = {'html': "gCams.push({pasta:225,titulo:'Reis',subTitulo:'Toledo',detalhe:'',ativa:true,apImg:1});gCams.push({pasta:184,titulo:'Brasil',subTitulo:'',detalhe:'',ativa:false,apImg:1});gCams.push({pasta:999,titulo:'No ubicada',subTitulo:'',detalhe:'',ativa:true,apImg:1});", 'ubicaciones': {'225': {'lat': -23.6, 'lon': -46.65}, '184': {'lat': -23.57, 'lon': -46.66}}}
    fs = normalizar('cetsp', d)
    assert len(fs) == 1
    assert fs[0]['properties']['aprox'] == 1
    assert fs[0]['properties']['imgs'] == ['https://cameras.cetsp.com.br/Cams/225/1.jpg']


def test_izmir_inventario_sin_preview_y_truncamiento():
    fs = normalizar('izmir', {'result': {'total': 1, 'records': [{'_id': 7, 'ADI': 'Kordon', 'ENLEM': '38.4', 'BOYLAM': '27.1'}]}})
    assert fs[0]['geometry']['coordinates'] == [27.1, 38.4]
    assert fs[0]['properties']['modo'] == 'enlace'
    assert 'imgs' not in fs[0]['properties']
    with pytest.raises(ValueError):
        normalizar('izmir', {'result': {'total': 10, 'records': []}})


def test_kamchatka_dedup_objetivo_aproximado_sin_preview():
    d = {'html': '<img src="/video/AVH/img_1.jpg" alt="Volcán"><img src="/video/AVH/img_1.jpg">', 'ubicaciones': {'AVH': {'lat': 53.256, 'lon': 158.835}}}
    fs = normalizar('kamchatka', d)
    assert len(fs) == 1
    assert fs[0]['properties']['modo'] == 'enlace'
    assert fs[0]['properties']['aprox'] == 1
    assert fs[0]['properties']['st'] == 'volcanes_clima'


@pytest.mark.parametrize('titulo,pais', [('Москва веб камера онлайн', 'RUS'), ('Санкт-Петербург live webcam', 'RUS'), ('دبي كاميرا مباشر', 'ARE'), ('東京都ライブカメラ', 'JPN'), ('서울실시간카메라', 'KOR')])
def test_alias_nativo_con_gazetteer_real(titulo, pais):
    regiones = json.loads((ROOT / 'config/camaras_regiones.json').read_text())
    ciudades = Y.Ciudades(json.loads((ROOT / 'config/ciudades.json').read_text())['ciudades'], regiones['aliases_ciudades'])
    assert ciudades.en(titulo)[2] == pais


def test_youtube_memo_revalida_previos_y_elimina_finalizados(monkeypatch):
    llamadas = []
    def llamar(_llave, metodo, **params):
        llamadas.append((metodo, params))
        if metodo == 'search':
            return {'items': []}
        return {'items': [{'id': v, 'snippet': {'title': 'Venice live cam', 'liveBroadcastContent': vivo, 'categoryId': '19'}, 'status': {'embeddable': True}} for v, vivo in [('AAAAAAAAAAA', 'live'), ('BBBBBBBBBBB', 'none')]]}
    monkeypatch.setattr(Y, 'llamar', llamar)
    memo = {'buscada': '2026-10-28'}
    ciudades = Y.Ciudades([['Venice', 'Venecia', 'ITA', 45.4, 12.3, 'ciudad', 260000]])
    fs = Y.camaras('no-es-clave', ciudades, ['buscada'], ['AAAAAAAAAAA', 'BBBBBBBBBBB'], memo, '2026-10-28')
    assert [c['id'] for c in fs] == ['AAAAAAAAAAA']
    assert [m for m, _ in llamadas] == ['videos']


def test_youtube_intento_fallido_no_repetido(monkeypatch):
    def fallar(*args, **kwargs):
        raise ValueError('sin cuota')
    monkeypatch.setattr(Y, 'llamar', fallar)
    memo = {}
    assert Y.camaras('k', Y.Ciudades([]), ['q'], consultas=memo, hoy='2026-10-28') == []
    assert memo == {'q': '2026-10-28'}
