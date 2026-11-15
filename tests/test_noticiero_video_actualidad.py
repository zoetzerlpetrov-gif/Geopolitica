"""Fecha de publicación, actualización por fuente y ausencia de falsos datos de hoy."""
import copy
import json
import os
import sys
from datetime import datetime, timezone

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'tools', 'noticiero_video'))
import actualidad as A
import guion as G

AHORA = datetime(2026, 11, 15, 13, 17, tzinfo=timezone.utc)


def met(*muestras, actualizado='2026-11-15T12:00:00Z'):
    return {'properties': {'meta': {'updated_at': actualizado}, 'timeseries': [
        {'time': t, 'data': {'instant': {'details': {'air_temperature': v}}}} for t, v in muestras]}}


def test_fecha_exacta_no_reemplaza_por_ayer_ni_manana():
    assert G._dia({'serie': [['2026-11-14', 30, 20], ['2026-11-16', 10, 0]]}, '2026-11-15') is None
    assert G._dia({'serie': [['2026-11-15', 25, 15], ['2026-11-16', 10, 0]]}, '2026-11-15') == (25, 15)


def test_clima_usa_dia_civil_y_cuenta_horas_restantes():
    ciudad = A.CIUDADES[0]
    fc = A.pronostico_ciudad(met(('2026-11-15T05:00:00Z', 0), ('2026-11-15T14:00:00Z', 18),
                                ('2026-11-16T03:00:00Z', 25), ('2026-11-16T07:00:00Z', -5)), ciudad, '2026-11-15', AHORA)
    assert fc['properties']['serie'] == [['2026-11-15', 25, 18]]
    assert fc['properties']['parcial'] and fc['properties']['zona'] == 'America/Mexico_City'
    bloque = G.bloque_clima({'features': [fc]}, {}, '2026-11-15')
    assert bloque['mx'] == [('Ciudad de México', 25, 18)]
    assert 'horas previstas restantes' in bloque['voz']
    assert G.bloque_clima({'features': [fc]}, {}, '2026-11-14') is None


def test_clima_no_usa_modelo_viejo_y_omite_ciudad_sin_el_dia():
    with pytest.raises(ValueError, match='antiguo'):
        A.pronostico_ciudad(met(actualizado='2026-11-13T00:00:00Z'), A.CIUDADES[0], '2026-11-15', AHORA)
    with pytest.raises(ValueError, match='fecha de publicación'):
        A.pronostico_ciudad(met(('2026-11-16T12:00:00Z', 22)), A.CIUDADES[0], '2026-11-15', AHORA)


def test_horario_verano_usa_zona_iana_no_longitud():
    ciudad = ('Madrid', 40.417, -3.704, 'Europe/Madrid')
    ahora = datetime(2026, 7, 15, 12, tzinfo=timezone.utc)
    fc = A.pronostico_ciudad(met(('2026-07-14T22:00:00Z', 20), ('2026-07-15T22:00:00Z', 30),
                                actualizado='2026-07-15T10:00:00Z'), ciudad, '2026-07-15', ahora)
    assert fc['properties']['serie'] == [['2026-07-15', 20, 20]]
    assert not fc['properties']['parcial']


def test_conversion_euro_peso_no_confunde_dolar_fix_y_fecha_de_consulta():
    grupo = A.divisas_indicativas({'data': {'currency': 'USD', 'rates': {'MXN': '18', 'EUR': '0.9'}}}, AHORA)
    datos = grupo['datos']
    assert datos[0]['valor'] == 18 and datos[1]['valor'] == 20
    assert datos[0]['fecha'] == '2026-11-15T13:17:00Z' and datos[0]['id'] != 'SF43718'
    assert 'no proporciona hora de operación' in grupo['nota']
    with pytest.raises(ValueError):
        A.divisas_indicativas({'data': {'currency': 'USD', 'rates': {'MXN': 'nan', 'EUR': '0.9'}}}, AHORA)


def test_fuente_caida_conserva_fecha_oficial_y_no_recicla_cotizacion_indicativa():
    previo = {'grupos': [{'id': 'mx', 'datos': [{'id': 'SF43718', 'valor': 18.5, 'fecha': '2026-11-13'}]},
                          {'id': 'video_divisas', 'datos': [{'id': 'USD_MXN_REF', 'valor': 18.4, 'fecha': '2026-11-14'}]}]}
    original = copy.deepcopy(previo)
    def falla(*a, **k):
        raise OSError('sin conexión')
    out = A.actualizar_cifras(previo, AHORA, bajar=falla, token='')
    assert out['grupos'] == [previo['grupos'][0]] and len(out['errores']) == 4
    assert out['grupos'][0]['datos'][0]['fecha'] == '2026-11-13' and previo == original


def test_actualizacion_consulta_cada_fuente_y_sincroniza_las_dos_pantallas(monkeypatch):
    banxico = [{'id': 'SF43718', 'grupo': 'mx', 'valor': 18.9, 'fecha': '2026-11-13', 'unidad': 'MXN por USD'}]
    monkeypatch.setattr(A.C, 'banxico', lambda token, ahora: banxico)
    consultas = []
    def bajar(url, **k):
        consultas.append(url)
        if url == A.COINBASE:
            return json.dumps({'data': {'currency': 'USD', 'rates': {'MXN': '19', 'EUR': '0.95'}}}).encode()
        if url == A.C.ECB:
            return b'<Envelope><Cube><Cube time="2026-11-13"><Cube currency="USD" rate="1.1"/></Cube></Cube></Envelope>'
        if url == A.C.KRAKEN:
            return b'{"result":{"XXBTZUSD":{"c":["70000"],"o":"69000"}}}'
        return b'Date,10 Yr\n11/13/2026,4.2\n11/12/2026,4.1\n'
    out = A.actualizar_cifras({}, AHORA, bajar=bajar, token='test')
    assert len(consultas) == 4 and not out['errores']
    ind = A.sincronizar_economia({'indicadores': [{'id': 'mx_fix', 'puntos': [['2026-11-12', 18.7]]}]}, out)
    assert ind['indicadores'][0]['puntos'][-1] == ('2026-11-13', 18.9)
    g = G.guion('2026-11-15', [], ind, cifras=out)
    escena = next(e for e in g['escenas'] if e['encabezado'] == 'Últimas cotizaciones disponibles')
    assert len(escena['filas']) == 3 and '2026-11-15 07:17 CDMX' in escena['filas'][0]['referencia']
    assert 'Coinbase' in escena['voz'] and 'no el fix' in escena['voz']
    oficial = G.datos_por_seccion(out)['forex']
    assert 'dato del 13 nov' in oficial['voz']
    assert 'referencia consultada el 2026-11-15' in oficial['voz']


def test_clima_actualizado_no_usa_snapshot_antiguo_si_falla_la_fuente():
    def falla(*a, **k):
        raise OSError('sin red')
    out = A.actualizar_clima('2026-11-15', AHORA, bajar=falla, ciudades=A.CIUDADES[:1])
    assert out['features'] == [] and len(out['errores']) == 1
    assert G.bloque_clima(out, {}, '2026-11-15') is None


def test_fix_del_primero_del_mes_conserva_dia_no_se_confunde_con_serie_mensual():
    filas = G.bloque_economia({'indicadores': [{'id': 'mx_fix', 'puntos': [['2026-10-01', 18.8]]},
                                               {'id': 'mx_inflacion', 'puntos': [['2026-10-01', 3.8]]}]})
    assert 'jueves 1 de octubre' in filas[0]['voz']
    assert 'dato de octubre de 2026' in filas[1]['voz']


def test_generacion_conecta_actualizacion_con_guion_y_artefactos(monkeypatch, tmp_path):
    import render as R
    from zoneinfo import ZoneInfo
    hoy = datetime.now(ZoneInfo('America/Mexico_City')).date().isoformat()
    elegidas = [{'seccion': 'economia', 'seccion_nombre': 'Economía', 'titulo': f'La empresa presenta nuevo proyecto de inversión número {i}',
                 'medio': 'Medio', 'url': f'https://ejemplo.mx/{i}', 'resumen': f'La empresa anunció un proyecto de inversión en México, caso {i}.'} for i in range(3)]
    nuevo = {'grupos': [A.divisas_indicativas({'data': {'currency': 'USD', 'rates': {'MXN': '19', 'EUR': '0.95'}}},
                                            datetime.now(timezone.utc))]}
    clima = {'features': [{'geometry': {'coordinates': [-99.13, 19.43]},
                           'properties': {'name': 'Ciudad de Mexico', 'serie': [[hoy, 25, 15]], 'parcial': True}}]}
    llamadas = []
    monkeypatch.setattr(R, 'leer_seguro', lambda *a: None)
    monkeypatch.setattr(R, 'elegir_y_redactar', lambda *a: elegidas)
    monkeypatch.setattr(R, 'redactar_dof', lambda *a: [])
    monkeypatch.setattr(R, 'actualizar_cifras', lambda previo: llamadas.append('cifras') or nuevo)
    monkeypatch.setattr(R, 'actualizar_clima', lambda fecha: llamadas.append(fecha) or clima)
    monkeypatch.setattr(R, 'frases_titulares', lambda *a: {})
    monkeypatch.setattr(R.patrocinio, 'aplicar', lambda g: g)
    monkeypatch.setattr(R, 'armar', lambda *a: 'video-prueba.mp4')
    monkeypatch.setattr(R, 'duracion', lambda *a: 1)
    monkeypatch.setattr(sys, 'argv', ['render.py', str(tmp_path)])
    R.main()
    g = json.loads((tmp_path / 'guion.json').read_text())
    assert llamadas == ['cifras', hoy]
    assert g['actualizacion']['fecha_publicacion'] == hoy
    assert next(e for e in g['escenas'] if e['tipo'] == 'clima')['mx'] == [['Ciudad de México', 25, 15]]
    assert any(e['encabezado'] == 'Últimas cotizaciones disponibles' for e in g['escenas'])
    assert 'Consulta de datos para esta generación' in (tmp_path / 'descripcion.txt').read_text()
