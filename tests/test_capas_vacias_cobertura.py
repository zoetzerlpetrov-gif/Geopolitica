"""Tres subtipos solicitados, sin inventar eventos o confundir descarga fallida con cero noticias."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools/crimen'))
import vial as V
import desaparecidos as D
import crimen as C


def test_variantes_de_titulares_y_casetas_ya_admitidas():
    for t in ['Asaltan a usuarios del transporte público en Ecatepec', 'Usuarios de autobús asaltados en Puebla', 'Bus passengers robbed in London']:
        assert V.clasificar(t) == 'robo_publico'
    assert V.clasificar('Normalistas toman la caseta de cobro de Palo Blanco en Guerrero') == 'caseta'
    for t in ['Identifican los restos humanos hallados en Jalisco', 'Identificó cinco cuerpos en el estado', 'Identificados 12 cuerpos en Veracruz']:
        assert D.clasificar(t) == 'identificacion'
    assert D.clasificar('Identifican una vulnerabilidad en un servidor') is None
    assert V.clasificar('Nueva caseta de vigilancia en un parque') is None


def test_mvs_y_latinus_entran_al_lector_sitemap_sin_alterar_ventanas(monkeypatch, tmp_path):
    originales = json.loads((ROOT / 'config/fuentes_mx.json').read_text())
    feeds = [f for f in originales['feeds'] if f['nombre'] in ['MVS Noticias', 'Latinus']]
    assert len(feeds) == 2 and all(f['formato'] == 'sitemap_noticias' for f in feeds)
    (tmp_path / 'config').mkdir()
    (tmp_path / 'config/fuentes_mx.json').write_text(json.dumps({'feeds': feeds}))
    monkeypatch.setattr(C, 'ROOT', str(tmp_path))
    monkeypatch.setattr(C.F, 'permitido_por_robots', lambda u: True)
    monkeypatch.setattr(C.time, 'sleep', lambda _: None)
    monkeypatch.setattr(C, 'ubicar', lambda *a: (-99.1, 19.5, 'Ecatepec', 'MEX', 'ciudad'))
    llamadas = []
    def leer(f):
        llamadas.append(f['url'])
        return [{'titulo': t, 'url': f['url'].replace('/sitemaps/news.xml', '/nota-' + str(i)), 'fecha_utc': '2026-11-22T13:00:00Z'}
                for i, t in enumerate(['Asaltan a pasajeros de combi en Ecatepec', 'Normalistas toman casetas en Guerrero', 'Identifican los restos en Jalisco'])]
    monkeypatch.setattr(C.F, 'rss', leer)
    salida, estado = C.rss_mexico([], None)
    assert len(llamadas) == 2 and len(estado) == 2
    assert {'robo_publico','caseta'} <= {f['properties']['st'] for f in salida['vial']}
    assert all(f['properties']['st'] == 'identificacion' for f in salida['desap'])
