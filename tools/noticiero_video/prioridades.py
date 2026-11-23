"""Notas verificadas por edición: sobreviven a la selección de IA, caducan y no se repiten."""
from pathlib import Path
import json
from guion import _clave, _propios, ORDEN
from video_historial import clave_url, ya_publicada

CONFIG = Path(__file__).resolve().parents[2] / 'config/noticiero_video_prioridades.json'


def con_prioridades(elegidas, fecha, usadas=frozenset(), titulares_usados=frozenset(), config=None):
    config = json.loads(CONFIG.read_text(encoding='utf-8')) if config is None else config
    resultado = list(elegidas)
    urls = {clave_url(u) for u in usadas}
    for n in config.get('notas', []):
        if not n['desde'] <= fecha <= n['hasta']:
            continue
        grupos = n.get('grupos_evento', [])

        def mismo_evento(titulo):
            palabras = _clave(titulo)
            return bool(grupos) and all(any(p in palabras for p in grupo) for grupo in grupos)

        # Las claves de titulares del historial siguen conservando estas palabras.
        if ya_publicada(n['url'], n['titulo'], urls, titulares_usados) or any(mismo_evento(t) for t in titulares_usados):
            continue
        # Una versión del mismo hecho elegida automáticamente se sustituye por el resumen verificado.
        resultado = [e for e in resultado if clave_url(e.get('url', '')) != clave_url(n['url'])
                     and not mismo_evento(e.get('titulo', ''))]
        resultado.append({**n, '_c': _clave(n['titulo']), '_p': _propios(n['titulo'])})
        urls.add(clave_url(n['url']))
    posicion = {s: i for i, s in enumerate(ORDEN)}
    posicion['emergencias'] = posicion['clima'] - 0.5
    return sorted(resultado, key=lambda n: posicion.get(n.get('seccion'), len(ORDEN)))
