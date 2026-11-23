"""La nota solicitada debe llegar a voz, pantalla y fuentes, sin IA ni datos de prueba en producción."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools/noticiero_video'))
from prioridades import con_prioridades, CONFIG
from video_historial import clave_titular
from guion import guion

NOTA = json.loads(CONFIG.read_text())['notas'][0]


def test_incendio_incluido_aunque_la_ia_no_elija_ninguna_nota():
    elegidas = con_prioridades([], '2026-11-23')
    g = guion('2026-11-23', elegidas)
    escena = next(e for e in g['escenas'] if e.get('url') == NOTA['url'])
    assert 'Guadalajara' in escena['texto'] and 'Guadalajara' in escena['voz']
    assert '22 de noviembre' in escena['voz'] and 'normalidad' in escena['voz']
    assert 'no hubo personas lesionadas' in escena['texto']
    assert NOTA['url'] in g['descripcion'] and NOTA['url'] in g['usadas']


def test_no_se_filtra_a_ediciones_pasadas_ni_caducadas():
    assert con_prioridades([], '2026-11-21') == []
    assert con_prioridades([], '2026-11-24') == []


def test_no_repite_enlace_ni_el_mismo_evento_narrado_por_otro_medio():
    assert con_prioridades([], '2026-11-23', usadas={NOTA['url']}) == []
    assert con_prioridades([], '2026-11-23', titulares_usados={clave_titular('Humo por incendio en el aeropuerto de Guadalajara')}) == []


def test_sustituye_duplicados_sin_borrar_las_demas_noticias():
    otra = {'titulo': 'México anuncia un programa de salud', 'url': 'https://example.org/salud', 'seccion': 'salud'}
    duplicada = {'titulo': 'Evacúan el aeropuerto de Guadalajara por incendio', 'url': 'https://example.org/gdl', 'seccion': 'clima'}
    r = con_prioridades([otra, duplicada], '2026-11-23')
    assert len(r) == 2 and otra in r and duplicada not in r
    assert len(con_prioridades(r, '2026-11-23')) == 2
