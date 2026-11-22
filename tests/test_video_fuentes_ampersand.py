"""Selección editorial del video y texto que reciben los motores de voz; sin publicar videos."""
import copy
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools/noticiero_video'))
import guion as G
import redactar as D
import render as R

AHORA = '2026-11-22T13:00:00Z'


def nota(medio, url, titulo, secs, fecha='2026-11-22T12:00:00Z'):
    return {'m': medio, 'u': url, 't': titulo, 's': secs, 'f': fecha}


@pytest.mark.parametrize('medio,url', [
    ('La Jornada (política)', 'https://example.org/a'),
    ('LA JORNADA · Cultura', ''),
    ('jornada.com.mx', 'https://www.jornada.com.mx/noticia/a'),
    ('', 'https://www.jornada.unam.mx/2026/11/22/politica/a'),
    ('', 'https://lajornada.com.mx/a'),
])
def test_jornada_solo_cultura_por_nombre_y_host(medio, url):
    for sec in G.ORDEN:
        assert G.fuente_video_permitida(medio, url, sec) == (sec == 'cultura')


def test_no_confunde_nombres_o_urls_ajenos_con_la_fuente():
    for medio, url in [('Jornada laboral', 'https://example.org/jornada.com.mx'),
                       ('Otro medio', 'https://jornada.com.mx.example.org/a')]:
        assert G.fuente_video_permitida(medio, url, 'politica_mx')


def fixture_notas():
    return [
        nota('La Jornada (política)', 'https://jornada.com.mx/politica/a',
             'El Senado aprueba la reforma electoral de México', ['politica_mx', 'oficial_mx']),
        nota('MVS Noticias', 'https://mvsnoticias.com/a',
             'El Senado aprueba la reforma electoral de México', ['politica_mx', 'oficial_mx'], '2026-11-22T10:00:00Z'),
        nota('latinus.us', 'https://latinus.us/b',
             'Investigan a funcionarios de Morena por desvío de recursos', ['politica_mx']),
        nota('Otro medio', 'https://example.org/c',
             'La jornada de votaciones reúne a representantes del congreso', ['politica_mx']),
        nota('La Jornada (cultura)', 'https://jornada.com.mx/cultura/d',
             'El museo presenta una exposición de pintura en la ciudad', ['cultura', 'infantil']),
        # Aunque se etiquete también Cultura, no puede volver por el bloque de críticas.
        nota('La Jornada', 'https://jornada.com.mx/cultura/e',
             'Investigan a funcionarios del gobierno federal por sobornos', ['cultura', 'politica_mx']),
        nota('La Jornada', 'https://jornada.com.mx/economia/f',
             'El peso cae ante el dólar tras el dato de inflación', ['economia', 'forex']),
    ]


def test_prioridad_antes_de_tope_deduplicacion_y_seleccion_sin_ia():
    entradas = fixture_notas()
    original = copy.deepcopy(entradas)
    c = G.candidatos_seccion({'notas': entradas}, ahora_iso=AHORA, maximo=2)
    assert entradas == original  # No cambia las noticias del mapa ni el Noticiero web.
    assert {n['medio'] for n in c['politica_mx']} == {'MVS Noticias', 'latinus.us'}
    assert c['oficial_mx'][0]['medio'] == 'MVS Noticias'
    assert 'infantil' not in c and 'forex' not in c and 'economia' not in c
    for sec, notas in c.items():
        assert all(G.fuente_video_permitida(n['medio'], n['url'], sec) for n in notas)
    assert all('jornada' not in n['url'] for n in c['politica_mx_critica'])
    elegidas = D.elegir_y_redactar(c)  # Camino sin IA.
    g = G.guion('2026-11-22', elegidas)
    escenas = [e for e in g['escenas'] if e['tipo'] == 'nota']
    assert any(e['medio'] == 'MVS Noticias' for e in escenas)
    assert any('jornada' in e['url'] and e['seccion'] == 'cultura' for e in escenas)
    voz = ' '.join(e['voz'] for e in g['escenas'])
    assert not any(t in voz.lower() for t in ['mvs', 'latinus', 'la jornada', 'sustituimos', 'cambiamos la fuente'])


def test_fuentes_permitidas_tambien_en_el_camino_con_ia():
    c = G.candidatos_seccion({'notas': fixture_notas()}, ahora_iso=AHORA)
    vistas = []
    def pedir(url, seccion, notas):
        vistas.extend(notas)
        return '{"elegida": 1, "resumen": "La propuesta legislativa recibió la aprobación de los representantes tras la sesión de votaciones."}'
    elegidas = D.elegir_y_redactar(c, url='https://ia.example', pedir_fn=pedir)
    assert vistas and elegidas
    assert all(G.fuente_video_permitida(n['medio'], n['url'], n['seccion']) for n in vistas + elegidas)


def test_guion_rechaza_entrada_preseleccionada_y_mercados_busca_alternativa():
    preseleccionadas = [{'medio': 'La Jornada', 'url': f'https://jornada.com.mx/{sec}',
                        'seccion': sec, 'seccion_nombre': G.CORTO[sec],
                        'titulo': 'El museo presenta una exposición de pintura en la ciudad'}
                       for sec in ['politica_mx', 'economia', 'cultura']]
    g = G.guion('2026-11-22', preseleccionadas)
    assert [e['seccion'] for e in g['escenas'] if e['tipo'] == 'nota'] == ['cultura']
    p = [{'ok': True, 'ticker': 'TEST', 'name': 'Test', 'current_price': 10,
          'sparkline_12m': [9, 10], 'currency': 'USD', 'news': [
              {'publisher': 'La Jornada', 'link': 'https://jornada.com.mx/m', 'title': 'Titular excluido', 'date': '2026-11-22T12:00:00Z'},
              {'publisher': 'MVS Noticias', 'link': 'https://mvsnoticias.com/m', 'title': 'Titular permitido', 'date': '2026-11-22T11:00:00Z'}]}]
    assert G.mercados(p, ahora_iso=AHORA)[0]['medio'] == 'MVS Noticias'


@pytest.mark.parametrize('texto', ['AT&T', 'Johnson & Johnson', 'R&D', 'H&amp;M', 'A &#38; B'])
def test_signo_se_envia_como_and_al_tramo_ingles_y_respaldo(texto):
    v = G.para_voz(texto)
    assert ('and', True) in R.tramos_voz(v)
    assert '&' not in v and 'ampersand' not in v.lower()
    assert 'and' in G.sin_marcas(v) and '⟪' not in G.sin_marcas(v)
    assert G.ampersands_voz(v) == v  # La normalización al sintetizar no anida marcas.


def test_nombres_ingleses_conservan_un_solo_tramo_y_texto_de_pantalla():
    assert R.tramos_voz(G.para_voz(G.nombre_para_voz('Vanguard S&P 500'))) == [('Vanguard S and P 500', True)]
    n = {'seccion': 'empresas', 'seccion_nombre': 'Empresas', 'medio': 'MVS Noticias', 'url': 'https://mvsnoticias.com/a',
         'titulo': 'La empresa Johnson & Johnson presenta un nuevo producto en México'}
    e = next(e for e in G.guion('2026-11-22', [n])['escenas'] if e['tipo'] == 'nota')
    assert 'Johnson & Johnson' in e['texto'] and '⟪and⟫' in e['voz']


def test_sintetizador_normaliza_texto_directo_de_otros_bloques(monkeypatch):
    recibidos = []
    monkeypatch.setenv('VOZ_MOTOR', 'kokoro:ef_dora')
    monkeypatch.setattr(R, 'voz_kokoro', lambda texto, *args: recibidos.append(texto) or True)
    assert R.voz('AT&T presenta su servicio.', 'sin-archivo.wav', None)
    assert '⟪and⟫' in recibidos[0] and '&' not in recibidos[0]
