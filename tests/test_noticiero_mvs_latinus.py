"""Mismos índices públicos en el mapa, Noticiero y candidatos de video; sin red."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools' / 'noticiero'))
sys.path.insert(0, str(ROOT / 'tools' / 'noticiero_video'))
import noticiero as N
import guion as G


def indice(host):
    return f'''<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:n="http://www.google.com/schemas/sitemap-news/0.9">
      <url><loc>https://{host}/reforma.html</loc><n:news>
        <n:title>Senado aprueba reforma electoral en México</n:title>
        <n:publication_date>2026-11-16T05:00:00-06:00</n:publication_date>
      </n:news></url>
      <url><loc>https://{host}/sin-fecha.html</loc><n:news><n:title>Sin fecha</n:title></n:news></url>
      <url><loc>https://otro.example/falso</loc><n:news><n:title>Otro sitio</n:title>
        <n:publication_date>2026-11-16T05:00:00-06:00</n:publication_date></n:news></url>
    </urlset>'''.encode()


def test_ambos_medios_llegan_del_indice_al_mapa_y_video(monkeypatch):
    cfg = json.loads((ROOT / 'config/noticiero.json').read_text())
    general = json.loads((ROOT / 'config/fuentes.json').read_text())
    nombres = {'MVS Noticias', 'Latinus'}
    cfg['secciones'] = [{**s, 'feeds': [f for f in s['feeds'] if f['nombre'] in nombres]}
                        for s in cfg['secciones']]
    feeds = [f for f in general['rss'] if f['nombre'] in nombres]
    assert len(feeds) == 2
    llamadas = []
    def get(url, **kwargs):
        llamadas.append(url)
        host = url.split('/')[2]
        return indice(host)
    monkeypatch.setattr(N.F, 'get', get)
    monkeypatch.setattr(N.F, 'permitido_por_robots', lambda url: True)
    for f in feeds:
        candidatos = N.F.rss(f)
        assert len(candidatos) == 1
        c = candidatos[0]
        assert c['fuente'] == f['nombre'] and c['fecha_utc'] == '2026-11-16T11:00:00Z'
        assert c['tipo_fuente'] == 'noticia' and c['pais_defecto'] == 'MEX'
        assert c['texto_clasificar'] == c['titulo'] and c['lat'] is None
    llamadas.clear()
    notas, errores, ok = N.de_rss(cfg, N.reglas_de(cfg))
    assert not errores and ok == 2 and len(llamadas) == 2  # una descarga por medio
    assert {n['m'] for n in notas} == nombres
    assert all('politica_mx' in n['s'] and 'oficial_mx' in n['s'] for n in notas)
    # Cada fuente puede aportar una nota; la unión del proyecto deduplica titulares iguales.
    for n in notas:
        candidatos = G.candidatos_seccion({'notas': [n]}, ahora_iso='2026-11-16T12:00:00Z')
        assert candidatos['politica_mx'][0]['medio'] == n['m']


def test_indices_no_se_descargan_si_robots_los_prohibe(monkeypatch):
    import pytest
    monkeypatch.setattr(N.F, 'permitido_por_robots', lambda url: False)
    monkeypatch.setattr(N.F, 'get', lambda *a, **k: pytest.fail('Descarga prohibida'))
    with pytest.raises(PermissionError):
        N.F.rss({'url': 'https://mvsnoticias.com/sitemaps/news.xml', 'formato': 'sitemap_noticias'})
