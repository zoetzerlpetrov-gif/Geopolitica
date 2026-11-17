"""Preferencias de locución y selección de noticias familiares verificables."""
import json
import os
import re
import sys

sys.path[:0] = [os.path.join(os.path.dirname(__file__), '..', 'tools', 'noticiero_video'),
                os.path.join(os.path.dirname(__file__), '..', 'tools', 'noticiero')]
import guion as G
import noticiero as N


def test_romanos_como_ordinales_exclusivamente_en_contexto_legal():
    assert G.para_voz('Los artículos I, II, III, IV, V, VI y X de la Ley se reforman.') == (
        'Los artículos primero, segundo, tercero, cuarto, quinto, sexto y décimo de la Ley se reforman.')
    assert G.para_voz('Capítulo IX, fracciones XI y XXIV del reglamento.') == (
        'Capítulo noveno, fracciones décima primera y vigésima cuarta del reglamento.')
    assert G.para_voz('I, II y X.', legal=True) == 'primero, segundo y décimo.'
    assert G.para_voz('Rocky III, Super Bowl LX y León XIV.') == 'Rocky III, Super Bowl LX y León XIV.'
    assert G.para_voz('La Ley se publicó en X y el INE la revisó.') == 'La Ley se publicó en X y el ine la revisó.'
    assert G.para_voz('Ley IMSS, numeral IIII: siglas MXN.') == 'Ley IMSS, numeral IIII: siglas MXN.'


def test_siglas_y_nombre_musical_se_ajustan_solo_en_la_voz():
    texto = 'El INE, el PRI y el PAN mencionaron a Karol G.'
    assert G.para_voz(texto) == 'El ine, el pri y el pan mencionaron a Karol Yi.'
    n = {'seccion': 'dof', 'seccion_nombre': 'DOF', 'titulo': 'Decreto de reforma al artículo IV de la Ley Federal.',
         'medio': 'DOF', 'url': 'https://dof.gob.mx/nota', 'resumen': 'Se reforma el artículo IV y la fracción V de la Ley Federal.'}
    g = G.guion('2026-11-15', [n])
    e = next(e for e in g['escenas'] if e['tipo'] == 'nota')
    assert 'artículo IV' in e['texto'] and 'fracción V' in e['texto']
    assert 'artículo cuarto' in e['voz'] and 'fracción quinta' in e['voz']


def test_horas_de_consulta_en_pantalla_sin_leerse_en_las_cotizaciones():
    cifras = {'grupos': [{'id': 'video_divisas', 'datos': [
        {'id': 'USD_MXN_REF', 'valor': 18.5, 'unidad': 'MXN por USD', 'corto': 'USD/MXN indicativo', 'fecha': '2026-11-15T13:17:00Z'}]},
        {'id': 'cripto', 'datos': [{'id': 'XBT', 'valor': 70000, 'unidad': 'USD', 'corto': 'Bitcoin', 'fecha': '2026-11-15T13:18:00Z'}]}]}
    g = G.guion('2026-11-15', [], cifras=cifras)
    e = next(e for e in g['escenas'] if e.get('encabezado') == 'Últimas cotizaciones disponibles')
    assert '07:17 CDMX' in e['filas'][0]['referencia']
    assert '07:18 CDMX' in e['filas'][1]['referencia']
    voces = e['voz'] + ' '.join(x['voz'] for x in G.datos_por_seccion(cifras).values())
    assert not re.search(r'\d{1,2}:\d{2}|UTC|CDMX', voces)
    assert '15 de noviembre de 2026' in voces


def test_noticias_familiares_positivas_no_convierte_incidentes_o_consejos_en_hechos():
    assert G.noticia_familiar_positiva('Un matrimonio celebra sus bodas de oro junto a toda su familia')
    assert G.noticia_familiar_positiva('Retired Couple Surprised With New Heating System in Feel the Love Program')
    assert not G.noticia_familiar_positiva('Pareja celebra aniversario después de cometer un fraude')
    assert not G.noticia_familiar_positiva('El obispo se reencuentra con el padre Luis')
    assert not G.noticia_familiar_positiva('La bolsa celebra un aumento de precios')
    datos = {'generado_utc': '2026-11-15T13:00:00Z', 'notas': [
        {'t': 'Un matrimonio celebra sus bodas de oro junto a toda su familia', 'u': 'https://medio.mx/bodas', 'm': 'Medio', 'f': '2026-11-15T12:00:00Z', 's': ['familia']},
        {'t': 'Pareja celebra aniversario después de cometer un fraude', 'u': 'https://medio.mx/fraude', 'm': 'Medio', 'f': '2026-11-15T12:00:00Z', 's': ['familia']}]}
    c = G.candidatos_seccion(datos)
    assert [n['url'] for n in c['familia']] == ['https://medio.mx/bodas']
    g = G.guion('2026-11-15', G.elegir_sin_ia(c))
    assert any(e.get('seccion') == 'familia' for e in g['escenas'])
    assert 'https://medio.mx/bodas' in g['descripcion']


def test_colector_asigna_seccion_familia_con_palabras_positivas_y_fuentes_reales():
    cfg = json.load(open(N.CONF, encoding='utf-8'))
    seccion = next(s for s in cfg['secciones'] if s['id'] == 'familia')
    assert {'Aleteia Español', 'Latinus', 'MVS Noticias'} <= {f['nombre'] for f in seccion['feeds']}
    item = {'titulo': 'Un matrimonio celebra sus bodas de oro junto a toda su familia', 'url': 'https://ejemplo.mx/1',
            'fuente': 'Medio', 'tipo_fuente': 'Medio', 'fecha_utc': '2026-11-15T12:00:00Z'}
    assert N.notas_de_feed([item], ['familia'], N.reglas_de(cfg), filtrar=True)[0]['s'] == ['familia']
    item['titulo'] = 'El precio del petróleo sube por tercer día'
    assert N.notas_de_feed([item], ['familia'], N.reglas_de(cfg), filtrar=True) == []
